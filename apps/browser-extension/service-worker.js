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

async function forwardPendingLaunch(tab) {
  if (!tab?.id) return;
  const data = await chrome.storage.local.get("pendingLaunch");
  if (!data.pendingLaunch) return;
  chrome.tabs.sendMessage(tab.id, { type: "RUN_PENDING_LAUNCH", pending: data.pendingLaunch }).catch(() => {
    // A newly created workspace may not have loaded its listener yet. It will
    // consume pendingLaunch during its own initialization.
  });
}

chrome.action.onClicked.addListener(() => {
  ensureWorkspace().catch((error) => console.warn("[AI Parallel] Cannot open workspace", error));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== "string") {
      sendResponse({ ok: false, error: "Invalid message" });
      return;
    }

    if (message.type === "OPEN_WORKSPACE") {
      const tab = await ensureWorkspace();
      await forwardPendingLaunch(tab);
      sendResponse({ ok: true, tabId: tab.id });
      return;
    }

    if (message.type === "OPEN_PROVIDER_TAB") {
      const providerId = String(message.providerId || "");
      const provider = PROVIDERS[providerId];
      if (!provider) {
        sendResponse({ ok: false, error: "Unknown provider" });
        return;
      }
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
