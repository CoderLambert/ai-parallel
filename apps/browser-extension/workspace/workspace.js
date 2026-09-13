const PROVIDERS = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", origins: ["https://chatgpt.com", "https://chat.openai.com"], default: true },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/", default: true },
  { id: "zhipu", name: "智谱清言", url: "https://chatglm.cn/", default: true },
  { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/", default: true },
  { id: "kimi", name: "Kimi", url: "https://www.kimi.com/", origins: ["https://www.kimi.com", "https://kimi.com"], default: true },
  { id: "claude", name: "Claude", url: "https://claude.ai/new", default: false },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app", default: false }
];

const MESSAGE_CONTEXT = "ai-parallel-workspace";
const $ = (selector) => document.querySelector(selector);
const providerBar = $("#providerBar");
const panelGrid = $("#panelGrid");
const panelTemplate = $("#panelTemplate");
const promptInput = $("#promptInput");
const sendBtn = $("#sendBtn");
const selectionMeta = $("#selectionMeta");
const charMeta = $("#charMeta");
const errorText = $("#errorText");
const dispatchStatus = $("#dispatchStatus");
const panels = new Map();
const pendingRequests = new Map();
let selected = new Set();
let currentLayout = "auto";
let runtimeUpgradeWarning = "";

function providerById(id) {
  return PROVIDERS.find((provider) => provider.id === id);
}

function providerOrigins(provider) {
  return provider.origins || [new URL(provider.url).origin];
}

function showError(message = "") {
  errorText.textContent = message;
  errorText.hidden = !message;
}

function updateMeta() {
  selectionMeta.textContent = `${selected.size} 个模型`;
  charMeta.textContent = `${promptInput.value.length} 字符`;
  sendBtn.disabled = selected.size === 0 || !promptInput.value.trim();
}

function setPanelState(providerId, state, { ready } = {}) {
  const panel = panels.get(providerId);
  if (!panel) return;
  if (typeof ready === "boolean") panel.dataset.ready = String(ready);
  panel.querySelector(".provider-state").textContent = state;
}

function renderProviderBar() {
  providerBar.replaceChildren();
  for (const provider of PROVIDERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "provider-chip";
    button.dataset.selected = String(selected.has(provider.id));
    button.textContent = provider.name;
    button.addEventListener("click", async () => {
      if (selected.has(provider.id)) selected.delete(provider.id);
      else selected.add(provider.id);
      await chrome.storage.local.set({ selectedProviders: [...selected] });
      renderProviderBar();
      renderPanels();
      updateMeta();
    });
    providerBar.append(button);
  }
}

function postToFrame(providerId, payload) {
  const provider = providerById(providerId);
  const panel = panels.get(providerId);
  const iframe = panel?.querySelector("iframe");
  if (!provider || !iframe?.contentWindow) return false;
  const message = { ...payload, context: MESSAGE_CONTEXT, providerId };
  for (const origin of providerOrigins(provider)) {
    iframe.contentWindow.postMessage(message, origin);
  }
  return true;
}

function pingFrame(providerId) {
  postToFrame(providerId, { type: "AI_PARALLEL_PING" });
}

function ensurePanel(provider) {
  if (panels.has(provider.id)) return panels.get(provider.id);
  const fragment = panelTemplate.content.cloneNode(true);
  const panel = fragment.querySelector(".provider-panel");
  const iframe = fragment.querySelector("iframe");
  panel.dataset.providerId = provider.id;
  panel.dataset.ready = "false";
  panel.dataset.loaded = "false";
  panel.querySelector(".provider-name").textContent = provider.name;
  iframe.src = provider.url;
  iframe.title = provider.name;

  iframe.addEventListener("load", () => {
    panel.dataset.loaded = "true";
    panel.dataset.ready = "false";
    panel.querySelector(".provider-state").textContent = "等待桥接";
    for (const delay of [80, 400, 1200, 2500]) {
      setTimeout(() => pingFrame(provider.id), delay);
    }
  });

  panel.querySelector(".reload-btn").addEventListener("click", () => {
    panel.dataset.loaded = "false";
    panel.dataset.ready = "false";
    panel.querySelector(".provider-state").textContent = "重新加载";
    iframe.src = provider.url;
  });

  panel.querySelector(".open-btn").addEventListener("click", async () => {
    try {
      await chrome.tabs.create({ url: provider.url, active: true });
    } catch (error) {
      showError(error instanceof Error ? error.message : "无法打开模型页面");
    }
  });

  panels.set(provider.id, panel);
  return panel;
}

function renderPanels() {
  const selectedIds = PROVIDERS.map((p) => p.id).filter((id) => selected.has(id));
  panelGrid.dataset.count = String(selectedIds.length);

  for (const [providerId, panel] of [...panels]) {
    if (!selected.has(providerId)) {
      panel.remove();
      panels.delete(providerId);
    }
  }

  const fragment = document.createDocumentFragment();
  for (const providerId of selectedIds) {
    const provider = providerById(providerId);
    fragment.append(ensurePanel(provider));
  }
  panelGrid.replaceChildren(fragment);
}

function findProviderForMessage(event) {
  for (const [providerId, panel] of panels) {
    const provider = providerById(providerId);
    const iframe = panel.querySelector("iframe");
    if (!provider || event.source !== iframe.contentWindow) continue;
    if (!providerOrigins(provider).includes(event.origin)) continue;
    return providerId;
  }
  return null;
}

window.addEventListener("message", (event) => {
  if (!event.data || event.data.context !== MESSAGE_CONTEXT) return;
  const providerId = findProviderForMessage(event);
  if (!providerId || event.data.providerId !== providerId) return;

  if (event.data.type === "AI_PARALLEL_FRAME_READY") {
    setPanelState(providerId, "Ready", { ready: true });
    return;
  }

  if (event.data.type === "AI_PARALLEL_SEND_RESULT") {
    const requestId = String(event.data.requestId || "");
    const pending = pendingRequests.get(requestId);
    if (!pending || pending.providerId !== providerId) return;
    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.resolve({
      ok: event.data.ok === true,
      error: event.data.ok === true ? "" : String(event.data.error || "发送失败")
    });
  }
});

function waitForFrameReady(providerId, timeoutMs = 10000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const poll = () => {
      const panel = panels.get(providerId);
      if (!panel) return resolve(false);
      if (panel.dataset.ready === "true") return resolve(true);
      if (Date.now() - started >= timeoutMs) return resolve(false);
      pingFrame(providerId);
      setTimeout(poll, 250);
    };
    poll();
  });
}

async function sendPromptToFrame(providerId, prompt) {
  const ready = await waitForFrameReady(providerId);
  if (!ready) {
    return {
      ok: false,
      error: runtimeUpgradeWarning || "模型 iframe 未就绪；如果刚升级扩展，请先在 chrome://extensions 点击 Reload"
    };
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ ok: false, error: "发送超时；请在该面板中手动确认" });
    }, 30000);

    pendingRequests.set(requestId, { providerId, resolve, timer });
    const posted = postToFrame(providerId, {
      type: "AI_PARALLEL_SEND",
      requestId,
      prompt
    });

    if (!posted) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      resolve({ ok: false, error: "模型 iframe 不存在" });
    }
  });
}

async function dispatchPrompt() {
  const prompt = promptInput.value.trim();
  if (!prompt) return showError("请输入 Prompt");
  if (!selected.size) return showError("至少选择一个模型");

  showError(runtimeUpgradeWarning);
  sendBtn.disabled = true;
  dispatchStatus.textContent = `正在发送到 ${selected.size} 个模型…`;
  for (const id of selected) setPanelState(id, "Sending…");

  try {
    await chrome.storage.local.set({ draftPrompt: promptInput.value });
    const pairs = await Promise.all([...selected].map(async (providerId) => [
      providerId,
      await sendPromptToFrame(providerId, prompt)
    ]));
    const results = Object.fromEntries(pairs);

    let failures = 0;
    for (const [providerId, result] of Object.entries(results)) {
      if (result.ok) {
        setPanelState(providerId, "Sent", { ready: true });
      } else {
        failures += 1;
        setPanelState(providerId, result.error || "发送失败");
      }
    }

    dispatchStatus.textContent = failures
      ? `已发送；${failures} 个模型需要处理`
      : "已发送 · 回答直接由原站实时显示";
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
    dispatchStatus.textContent = "发送失败";
  } finally {
    updateMeta();
  }
}

async function ensureFramingRules() {
  const dnr = chrome.declarativeNetRequest;
  if (!dnr?.getEnabledRulesets) {
    runtimeUpgradeWarning = "检测到旧版扩展运行时：请打开 chrome://extensions，对 AI Parallel 点击 Reload，然后重新打开 Workspace";
    showError(runtimeUpgradeWarning);
    return;
  }

  try {
    let enabled = await dnr.getEnabledRulesets();
    if (!enabled.includes("bypass_headers") && dnr.updateEnabledRulesets) {
      await dnr.updateEnabledRulesets({ enableRulesetIds: ["bypass_headers"] });
      enabled = await dnr.getEnabledRulesets();
    }
    if (!enabled.includes("bypass_headers")) {
      runtimeUpgradeWarning = "iframe 解锁规则未启用，请在 chrome://extensions Reload AI Parallel";
      showError(runtimeUpgradeWarning);
    }
  } catch (error) {
    runtimeUpgradeWarning = `无法确认 iframe 解锁规则：${error instanceof Error ? error.message : String(error)}`;
    showError(runtimeUpgradeWarning);
  }
}

function autosizeComposer() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 130)}px`;
}

promptInput.addEventListener("input", () => {
  chrome.storage.local.set({ draftPrompt: promptInput.value }).catch(() => {});
  showError(runtimeUpgradeWarning);
  autosizeComposer();
  updateMeta();
});
promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    dispatchPrompt();
  }
});
sendBtn.addEventListener("click", dispatchPrompt);

document.querySelectorAll(".layout-switch button").forEach((button) => {
  button.addEventListener("click", async () => {
    currentLayout = button.dataset.layout;
    panelGrid.dataset.layout = currentLayout;
    document.querySelectorAll(".layout-switch button").forEach((item) => item.classList.toggle("active", item === button));
    await chrome.storage.local.set({ workspaceLayout: currentLayout });
  });
});

async function init() {
  await ensureFramingRules();
  const data = await chrome.storage.local.get(["selectedProviders", "draftPrompt", "workspaceLayout"]);
  selected = new Set(Array.isArray(data.selectedProviders)
    ? data.selectedProviders.filter((id) => providerById(id))
    : PROVIDERS.filter((p) => p.default).map((p) => p.id));
  promptInput.value = typeof data.draftPrompt === "string" ? data.draftPrompt : "";
  currentLayout = ["auto", "1", "2", "3"].includes(data.workspaceLayout) ? data.workspaceLayout : "auto";
  panelGrid.dataset.layout = currentLayout;
  document.querySelectorAll(".layout-switch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.layout === currentLayout);
  });
  renderProviderBar();
  renderPanels();
  autosizeComposer();
  updateMeta();
  setInterval(() => {
    for (const id of selected) {
      const panel = panels.get(id);
      if (panel?.dataset.ready !== "true") pingFrame(id);
    }
  }, 1200);
}

init().catch((error) => showError(error instanceof Error ? error.message : String(error)));
