const PROVIDERS = {
  chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
  deepseek: { name: "DeepSeek", url: "https://chat.deepseek.com/" },
  zhipu: { name: "智谱清言", url: "https://chatglm.cn/" },
  qwen: { name: "Qwen", url: "https://chat.qwen.ai/" },
  kimi: { name: "Kimi", url: "https://www.kimi.com/" },
  claude: { name: "Claude", url: "https://claude.ai/new" },
  gemini: { name: "Gemini", url: "https://gemini.google.com/app" }
};

const PENDING_KEY = "pendingJobsByTab";
const RUN_KEY = "workspaceRun";
const WORKER_TABS_KEY = "workerTabs";
const WORKSPACE_PATH = "workspace/index.html";
const workspacePorts = new Set();
let runCache = null;
let persistTimer = null;

async function readPendingJobs() {
  const data = await chrome.storage.session.get(PENDING_KEY);
  return data[PENDING_KEY] || {};
}

async function writePendingJobs(jobs) {
  await chrome.storage.session.set({ [PENDING_KEY]: jobs });
}

async function setPendingJob(tabId, job) {
  const jobs = await readPendingJobs();
  jobs[String(tabId)] = job;
  await writePendingJobs(jobs);
}

async function getPendingJob(tabId) {
  const jobs = await readPendingJobs();
  return jobs[String(tabId)] || null;
}

async function deletePendingJob(tabId) {
  const jobs = await readPendingJobs();
  delete jobs[String(tabId)];
  await writePendingJobs(jobs);
}

async function readRun() {
  if (runCache) return runCache;
  const data = await chrome.storage.session.get(RUN_KEY);
  runCache = data[RUN_KEY] || null;
  return runCache;
}

function scheduleRunPersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (!runCache) return;
    try {
      await chrome.storage.session.set({ [RUN_KEY]: runCache });
    } catch (error) {
      console.warn("[AI Parallel] Failed to persist run", error);
    }
  }, 300);
}

async function writeRun(run, { immediate = false } = {}) {
  runCache = run;
  if (immediate) {
    clearTimeout(persistTimer);
    await chrome.storage.session.set({ [RUN_KEY]: runCache });
  } else {
    scheduleRunPersist();
  }
}

function broadcast(message) {
  for (const port of [...workspacePorts]) {
    try {
      port.postMessage(message);
    } catch {
      workspacePorts.delete(port);
    }
  }
}

async function patchProvider(providerId, patch, { persistImmediately = false } = {}) {
  const run = await readRun();
  if (!run?.providers?.[providerId]) return null;

  run.providers[providerId] = {
    ...run.providers[providerId],
    ...patch,
    updatedAt: Date.now()
  };
  await writeRun(run, { immediate: persistImmediately });
  broadcast({ type: "PROVIDER_PATCH", runId: run.runId, providerId, patch: run.providers[providerId] });
  return run.providers[providerId];
}

async function getWorkerTabs() {
  const data = await chrome.storage.session.get(WORKER_TABS_KEY);
  return data[WORKER_TABS_KEY] || {};
}

async function setWorkerTabs(map) {
  await chrome.storage.session.set({ [WORKER_TABS_KEY]: map });
}

async function closeOldWorkers() {
  const workers = await getWorkerTabs();
  const tabIds = Object.values(workers).filter(Number.isInteger);
  if (tabIds.length) {
    try {
      await chrome.tabs.remove(tabIds);
    } catch {
      // Some tabs may already have been closed manually.
    }
  }
  await setWorkerTabs({});
}

async function ensureWorkspace() {
  const workspaceUrl = chrome.runtime.getURL(WORKSPACE_PATH);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => typeof tab.url === "string" && tab.url.startsWith(workspaceUrl));
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    return existing;
  }
  return chrome.tabs.create({ url: workspaceUrl, active: true });
}

async function launchParallel(prompt, providerIds) {
  await closeOldWorkers();
  const workspace = await ensureWorkspace();
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const selected = providerIds.filter((id) => PROVIDERS[id]);
  const providers = {};

  for (const providerId of selected) {
    providers[providerId] = {
      name: PROVIDERS[providerId].name,
      state: "opening",
      message: "正在打开模型页面",
      tabId: null,
      response: { text: "", blocks: [], updatedAt: null },
      updatedAt: startedAt
    };
  }

  const run = { runId, startedAt, prompt, providerIds: selected, providers };
  await writeRun(run, { immediate: true });
  broadcast({ type: "RUN_REPLACED", run });

  const createdTabIds = [];
  const workerMap = {};

  for (const providerId of selected) {
    const provider = PROVIDERS[providerId];
    try {
      const tab = await chrome.tabs.create({
        url: provider.url,
        active: false,
        windowId: workspace.windowId
      });
      if (!tab.id) throw new Error("浏览器没有返回 tabId");

      createdTabIds.push(tab.id);
      workerMap[providerId] = tab.id;
      await setPendingJob(tab.id, {
        runId,
        providerId,
        prompt,
        createdAt: Date.now()
      });
      await patchProvider(providerId, {
        state: "waiting",
        message: "等待页面就绪",
        tabId: tab.id
      }, { persistImmediately: true });
    } catch (error) {
      await patchProvider(providerId, {
        state: "error",
        message: error instanceof Error ? error.message : String(error)
      }, { persistImmediately: true });
    }
  }

  await setWorkerTabs(workerMap);

  if (createdTabIds.length >= 1) {
    try {
      const groupId = await chrome.tabs.group({ tabIds: createdTabIds });
      await chrome.tabGroups.update(groupId, {
        title: `AI Workers · ${createdTabIds.length}`,
        collapsed: true
      });
    } catch {
      // Grouping is convenience only.
    }
  }

  if (workspace.id) {
    try { await chrome.tabs.update(workspace.id, { active: true }); } catch {}
  }

  return { runId, created: createdTabIds.length };
}

async function openProviderTab(providerId) {
  const run = await readRun();
  const tabId = run?.providers?.[providerId]?.tabId;
  if (!tabId) throw new Error("该模型没有活动页面");
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
}

chrome.action.onClicked.addListener(() => {
  ensureWorkspace().catch((error) => console.warn("[AI Parallel] Cannot open workspace", error));
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "workspace") return;
  workspacePorts.add(port);
  readRun().then((run) => port.postMessage({ type: "RUN_SNAPSHOT", run })).catch(() => {});
  port.onDisconnect.addListener(() => workspacePorts.delete(port));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== "string") {
      sendResponse({ ok: false, error: "Invalid message" });
      return;
    }

    if (message.type === "OPEN_WORKSPACE") {
      const tab = await ensureWorkspace();
      sendResponse({ ok: true, tabId: tab.id });
      return;
    }

    if (message.type === "LAUNCH_PARALLEL") {
      const prompt = String(message.prompt || "").trim();
      const providerIds = Array.isArray(message.providerIds) ? message.providerIds : [];
      if (!prompt) return sendResponse({ ok: false, error: "Prompt 不能为空" });
      if (!providerIds.length) return sendResponse({ ok: false, error: "至少选择一个模型" });
      sendResponse({ ok: true, ...(await launchParallel(prompt, providerIds)) });
      return;
    }

    if (message.type === "GET_PENDING_JOB") {
      if (!sender.tab?.id) return sendResponse({ ok: false, error: "Missing sender tab" });
      sendResponse({ ok: true, job: await getPendingJob(sender.tab.id) });
      return;
    }

    if (message.type === "JOB_PROGRESS") {
      const providerId = String(message.providerId || "");
      if (providerId) {
        await patchProvider(providerId, {
          state: String(message.state || "working"),
          message: String(message.message || "")
        });
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "JOB_RESULT") {
      const providerId = String(message.providerId || "");
      if (providerId) {
        await patchProvider(providerId, {
          state: message.ok ? "sent" : "error",
          message: message.ok ? "已发送，等待回答" : String(message.error || "自动发送失败")
        }, { persistImmediately: true });
      }
      if (message.ok && sender.tab?.id) await deletePendingJob(sender.tab.id);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "RESPONSE_UPDATE") {
      const providerId = String(message.providerId || "");
      const run = await readRun();
      if (!providerId || !run || message.runId !== run.runId) {
        sendResponse({ ok: false, error: "Stale response event" });
        return;
      }
      await patchProvider(providerId, {
        state: "streaming",
        message: "正在生成",
        response: {
          text: String(message.text || ""),
          blocks: Array.isArray(message.blocks) ? message.blocks : [],
          updatedAt: Date.now()
        }
      });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "RESPONSE_COMPLETE") {
      const providerId = String(message.providerId || "");
      const run = await readRun();
      if (!providerId || !run || message.runId !== run.runId) {
        sendResponse({ ok: false, error: "Stale response event" });
        return;
      }
      await patchProvider(providerId, {
        state: "completed",
        message: "完成",
        completedAt: Date.now(),
        response: {
          text: String(message.text || run.providers[providerId]?.response?.text || ""),
          blocks: Array.isArray(message.blocks) ? message.blocks : (run.providers[providerId]?.response?.blocks || []),
          updatedAt: Date.now()
        }
      }, { persistImmediately: true });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "GET_RUN") {
      sendResponse({ ok: true, run: await readRun() });
      return;
    }

    if (message.type === "GET_LAST_STATUS") {
      sendResponse({ ok: true, status: await readRun() });
      return;
    }

    if (message.type === "OPEN_PROVIDER_TAB") {
      await openProviderTab(String(message.providerId || ""));
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  deletePendingJob(tabId).catch(() => {});
  (async () => {
    const run = await readRun();
    if (!run) return;
    const entry = Object.entries(run.providers || {}).find(([, value]) => value.tabId === tabId);
    if (!entry) return;
    const [providerId] = entry;
    await patchProvider(providerId, { state: "closed", message: "模型页面已关闭", tabId: null }, { persistImmediately: true });
  })().catch(() => {});
});
