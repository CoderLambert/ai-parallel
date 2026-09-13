const PROVIDERS = {
  chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
  deepseek: { name: "DeepSeek", url: "https://chat.deepseek.com/" },
  zhipu: { name: "智谱清言", url: "https://chatglm.cn/" },
  qwen: { name: "Qwen", url: "https://chat.qwen.ai/" },
  kimi: { name: "Kimi", url: "https://www.kimi.com/" },
  claude: { name: "Claude", url: "https://claude.ai/new" },
  gemini: { name: "Gemini", url: "https://gemini.google.com/app" }
};

const WORKSPACE_PATH = "workspace/index.html";
const FRAME_REGISTRY_KEY = "iframeRegistryByTab";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function readRegistry() {
  const data = await chrome.storage.session.get(FRAME_REGISTRY_KEY);
  return data[FRAME_REGISTRY_KEY] || {};
}

async function writeRegistry(registry) {
  await chrome.storage.session.set({ [FRAME_REGISTRY_KEY]: registry });
}

async function registerFrame(tabId, providerId, frameId, href) {
  const registry = await readRegistry();
  registry[String(tabId)] ||= {};
  registry[String(tabId)][providerId] = { frameId, href, readyAt: Date.now() };
  await writeRegistry(registry);
}

async function clearFrame(tabId, providerId, expectedFrameId) {
  const registry = await readRegistry();
  const tabFrames = registry[String(tabId)];
  if (!tabFrames?.[providerId]) return;
  if (expectedFrameId != null && tabFrames[providerId].frameId !== expectedFrameId) return;
  delete tabFrames[providerId];
  if (!Object.keys(tabFrames).length) delete registry[String(tabId)];
  await writeRegistry(registry);
}

async function getFrame(tabId, providerId) {
  const registry = await readRegistry();
  return registry[String(tabId)]?.[providerId] || null;
}

async function sendToProviderFrame(tabId, providerId, prompt, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const entry = await getFrame(tabId, providerId);
    if (!entry?.frameId) {
      await sleep(140);
      continue;
    }

    try {
      const response = await chrome.tabs.sendMessage(
        tabId,
        { type: "AI_PARALLEL_SEND", providerId, prompt },
        { frameId: entry.frameId }
      );
      if (response?.ok) return { ok: true };
      lastError = new Error(response?.error || "Provider frame rejected the prompt");
    } catch (error) {
      lastError = error;
      await clearFrame(tabId, providerId, entry.frameId);
    }
    await sleep(160);
  }

  return {
    ok: false,
    error: lastError instanceof Error ? lastError.message : "模型 iframe 尚未就绪"
  };
}

chrome.action.onClicked.addListener(() => {
  ensureWorkspace().catch((error) => console.warn("[AI Parallel] Cannot open workspace", error));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    const registry = await readRegistry();
    if (!registry[String(tabId)]) return;
    delete registry[String(tabId)];
    await writeRegistry(registry);
  })().catch(() => {});
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

    if (message.type === "FRAME_READY") {
      if (!sender.tab?.id || !Number.isInteger(sender.frameId) || sender.frameId === 0) {
        sendResponse({ ok: false, error: "Invalid iframe sender" });
        return;
      }
      const providerId = String(message.providerId || "");
      if (!PROVIDERS[providerId]) {
        sendResponse({ ok: false, error: "Unknown provider" });
        return;
      }
      await registerFrame(sender.tab.id, providerId, sender.frameId, String(message.href || sender.url || ""));
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "GET_FRAME_STATUS") {
      if (!sender.tab?.id) return sendResponse({ ok: false, error: "Missing workspace tab" });
      const registry = await readRegistry();
      sendResponse({ ok: true, frames: registry[String(sender.tab.id)] || {} });
      return;
    }

    if (message.type === "DISPATCH_PROMPT") {
      if (!sender.tab?.id) return sendResponse({ ok: false, error: "Missing workspace tab" });
      const prompt = String(message.prompt || "").trim();
      const providerIds = Array.isArray(message.providerIds)
        ? message.providerIds.filter((id) => PROVIDERS[id])
        : [];
      if (!prompt) return sendResponse({ ok: false, error: "Prompt 不能为空" });
      if (!providerIds.length) return sendResponse({ ok: false, error: "至少选择一个模型" });

      const pairs = await Promise.all(providerIds.map(async (providerId) => [
        providerId,
        await sendToProviderFrame(sender.tab.id, providerId, prompt)
      ]));
      const results = Object.fromEntries(pairs);
      sendResponse({ ok: true, results });
      return;
    }

    if (message.type === "OPEN_PROVIDER_TAB") {
      const providerId = String(message.providerId || "");
      const provider = PROVIDERS[providerId];
      if (!provider) return sendResponse({ ok: false, error: "Unknown provider" });
      const tab = await chrome.tabs.create({ url: provider.url, active: true });
      sendResponse({ ok: true, tabId: tab.id });
      return;
    }

    sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
  })().catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});
