const PROVIDERS = {
  chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
  deepseek: { name: "DeepSeek", url: "https://chat.deepseek.com/" },
  zhipu: { name: "智谱清言", url: "https://chatglm.cn/" },
  qwen: { name: "Qwen", url: "https://chat.qwen.ai/" },
  kimi: { name: "Kimi", url: "https://www.kimi.com/" },
  claude: { name: "Claude", url: "https://claude.ai/new" },
  gemini: { name: "Gemini", url: "https://gemini.google.com/app" }
};

const SESSION_KEY = "pendingJobsByTab";
const STATUS_KEY = "lastRunStatus";

async function readPendingJobs() {
  const data = await chrome.storage.session.get(SESSION_KEY);
  return data[SESSION_KEY] || {};
}

async function writePendingJobs(jobs) {
  await chrome.storage.session.set({ [SESSION_KEY]: jobs });
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

async function readStatus() {
  const data = await chrome.storage.session.get(STATUS_KEY);
  return data[STATUS_KEY] || null;
}

async function updateStatus(providerId, patch) {
  const current = (await readStatus()) || { runId: null, startedAt: Date.now(), providers: {} };
  current.providers[providerId] = {
    ...(current.providers[providerId] || {}),
    ...patch,
    updatedAt: Date.now()
  };
  await chrome.storage.session.set({ [STATUS_KEY]: current });
}

async function launchParallel(prompt, providerIds) {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const initialStatus = { runId, startedAt, promptPreview: prompt.slice(0, 100), providers: {} };
  const createdTabIds = [];

  for (const providerId of providerIds) {
    const provider = PROVIDERS[providerId];
    if (!provider) continue;
    initialStatus.providers[providerId] = {
      name: provider.name,
      state: "opening",
      message: "等待启动",
      updatedAt: Date.now()
    };
  }
  // Write the run record before opening tabs. Content scripts may become ready very quickly,
  // so later status updates must merge into an existing record rather than race an old run.
  await chrome.storage.session.set({ [STATUS_KEY]: initialStatus });

  for (const providerId of providerIds) {
    const provider = PROVIDERS[providerId];
    if (!provider) continue;

    await updateStatus(providerId, {
      name: provider.name,
      state: "opening",
      message: "正在打开"
    });

    try {
      const tab = await chrome.tabs.create({ url: provider.url, active: false });
      if (!tab.id) throw new Error("浏览器没有返回 tabId");

      createdTabIds.push(tab.id);
      await setPendingJob(tab.id, {
        runId,
        providerId,
        prompt,
        createdAt: Date.now(),
        attempts: 0
      });

      await updateStatus(providerId, {
        name: provider.name,
        state: "waiting",
        message: "等待页面就绪",
        tabId: tab.id
      });
    } catch (error) {
      await updateStatus(providerId, {
        name: provider.name,
        state: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (createdTabIds.length >= 2) {
    try {
      const groupId = await chrome.tabs.group({ tabIds: createdTabIds });
      await chrome.tabGroups.update(groupId, {
        title: `AI Compare · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        collapsed: false
      });
    } catch {
      // Tab grouping is a convenience only. Launching must still succeed without it.
    }
  }

  if (createdTabIds.length > 0) {
    try {
      await chrome.tabs.update(createdTabIds[0], { active: true });
    } catch {
      // Ignore activation failure.
    }
  }

  return { runId, created: createdTabIds.length };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== "string") {
      sendResponse({ ok: false, error: "Invalid message" });
      return;
    }

    if (message.type === "LAUNCH_PARALLEL") {
      const prompt = String(message.prompt || "").trim();
      const providerIds = Array.isArray(message.providerIds) ? message.providerIds : [];

      if (!prompt) {
        sendResponse({ ok: false, error: "Prompt 不能为空" });
        return;
      }
      if (providerIds.length === 0) {
        sendResponse({ ok: false, error: "至少选择一个模型" });
        return;
      }

      try {
        const result = await launchParallel(prompt, providerIds);
        sendResponse({ ok: true, ...result });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (message.type === "GET_PENDING_JOB") {
      if (!sender.tab?.id) {
        sendResponse({ ok: false, error: "Missing sender tab" });
        return;
      }
      const job = await getPendingJob(sender.tab.id);
      sendResponse({ ok: true, job });
      return;
    }

    if (message.type === "JOB_PROGRESS") {
      const providerId = String(message.providerId || "");
      if (providerId) {
        await updateStatus(providerId, {
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
        await updateStatus(providerId, {
          state: message.ok ? "sent" : "error",
          message: message.ok ? "已发送" : String(message.error || "自动发送失败")
        });
      }
      if (message.ok && sender.tab?.id) {
        await deletePendingJob(sender.tab.id);
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "GET_LAST_STATUS") {
      sendResponse({ ok: true, status: await readStatus() });
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
});
