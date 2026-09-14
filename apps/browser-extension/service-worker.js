importScripts("shared/provider-catalog.js");

const PROVIDERS = {
  ...Object.fromEntries(globalThis.AIParallelProviderCatalog.map((provider) => [
    provider.id,
    { ...provider, tabMode: provider.mode === "tab" }
  ]))
};

const PROVIDER_AUTH_HOSTS = {
  grok: new Set(["grok.com", "www.grok.com", "accounts.x.ai"])
};

const WORKSPACE_PATH = "workspace/index.html";
const PROVIDER_COMMANDS = new Set([
  "AI_PARALLEL_SEND",
  "AI_PARALLEL_COLLECT_RESPONSE",
  "AI_PARALLEL_NEW_CHAT"
]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function matchesProviderTab(tab, provider) {
  if (!tab?.id || typeof tab.url !== "string") return false;
  try {
    return provider.hosts?.includes(new URL(tab.url).hostname) || false;
  } catch {
    return false;
  }
}

async function ensureProviderTab(providerId, { active = false } = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error("Unknown provider");
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => matchesProviderTab(tab, provider));
  if (existing) {
    if (active) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    }
    return { tab: existing, created: false };
  }
  const tab = await chrome.tabs.create({ url: provider.url, active: true });
  return { tab, created: true };
}

async function deliverProviderCommand(tabId, message, attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError || new Error("Provider tab is not ready");
}

async function sendProviderTabCommand(providerId, command) {
  const provider = PROVIDERS[providerId];
  if (!provider?.tabMode) throw new Error("Provider does not support tab mode");
  if (!PROVIDER_COMMANDS.has(command?.type)) throw new Error("Unknown provider command");

  const { tab, created } = await ensureProviderTab(providerId);
  const message = { type: "AI_PARALLEL_TAB_COMMAND", providerId, command };
  try {
    return await deliverProviderCommand(tab.id, message, created ? 40 : 4);
  } catch (error) {
    if (created) throw error;
    await chrome.tabs.reload(tab.id);
    return deliverProviderCommand(tab.id, message, 40);
  }
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
      const { tab } = await ensureProviderTab(providerId, { active: true });
      sendResponse({ ok: true, tabId: tab.id });
      return;
    }

    if (message.type === "PROVIDER_TAB_COMMAND") {
      const providerId = String(message.providerId || "");
      const result = await sendProviderTabCommand(providerId, message.command);
      sendResponse(result || { ok: false, error: "Provider did not return a result" });
      return;
    }

    if (message.type === "OPEN_PROVIDER_AUTH") {
      const providerId = String(message.providerId || "");
      const allowedHosts = PROVIDER_AUTH_HOSTS[providerId];
      let authUrl;
      try {
        authUrl = new URL(String(message.url || ""));
      } catch {
        sendResponse({ ok: false, error: "Invalid authentication URL" });
        return;
      }
      if (authUrl.protocol !== "https:" || !allowedHosts?.has(authUrl.hostname)) {
        sendResponse({ ok: false, error: "Authentication URL is not allowed" });
        return;
      }
      const tab = await chrome.tabs.create({ url: authUrl.href, active: true });
      sendResponse({ ok: true, tabId: tab.id });
      return;
    }

    sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
  })().catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});
