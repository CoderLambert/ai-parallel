const PROVIDERS = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", default: true },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/", default: true },
  { id: "zhipu", name: "智谱清言", url: "https://chatglm.cn/", default: true },
  { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/", default: true },
  { id: "kimi", name: "Kimi", url: "https://www.kimi.com/", default: true },
  { id: "claude", name: "Claude", url: "https://claude.ai/new", default: false },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app", default: false }
];

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
let selected = new Set();
let currentLayout = "auto";

function providerById(id) {
  return PROVIDERS.find((provider) => provider.id === id);
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
    panel.querySelector(".provider-state").textContent = "页面已加载";
    setTimeout(refreshFrameStatus, 120);
  });

  panel.querySelector(".reload-btn").addEventListener("click", () => {
    panel.dataset.loaded = "false";
    panel.dataset.ready = "false";
    panel.querySelector(".provider-state").textContent = "重新加载";
    iframe.src = provider.url;
  });

  panel.querySelector(".open-btn").addEventListener("click", async () => {
    const response = await chrome.runtime.sendMessage({ type: "OPEN_PROVIDER_TAB", providerId: provider.id });
    if (!response?.ok) showError(response?.error || "无法打开模型页面");
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
    const panel = ensurePanel(provider);
    fragment.append(panel);
  }
  panelGrid.replaceChildren(fragment);
}

async function refreshFrameStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_FRAME_STATUS" });
    if (!response?.ok) return;
    const frames = response.frames || {};
    for (const [providerId, panel] of panels) {
      const ready = Boolean(frames[providerId]?.frameId);
      panel.dataset.ready = String(ready);
      const state = panel.querySelector(".provider-state");
      if (ready) state.textContent = "Ready";
      else if (panel.dataset.loaded === "true") state.textContent = "等待桥接";
    }
  } catch {
    // Service worker can restart; next poll recovers.
  }
}

async function dispatchPrompt() {
  const prompt = promptInput.value.trim();
  if (!prompt) return showError("请输入 Prompt");
  if (!selected.size) return showError("至少选择一个模型");

  showError();
  sendBtn.disabled = true;
  dispatchStatus.textContent = `正在发送到 ${selected.size} 个模型…`;
  for (const id of selected) {
    const panel = panels.get(id);
    if (panel) panel.querySelector(".provider-state").textContent = "Sending…";
  }

  try {
    await chrome.storage.local.set({ draftPrompt: promptInput.value });
    const response = await chrome.runtime.sendMessage({
      type: "DISPATCH_PROMPT",
      prompt,
      providerIds: [...selected]
    });
    if (!response?.ok) throw new Error(response?.error || "发送失败");

    let failures = 0;
    for (const [providerId, result] of Object.entries(response.results || {})) {
      const panel = panels.get(providerId);
      if (!panel) continue;
      if (result?.ok) {
        panel.querySelector(".provider-state").textContent = "Sent";
      } else {
        failures += 1;
        panel.querySelector(".provider-state").textContent = result?.error || "发送失败";
      }
    }
    dispatchStatus.textContent = failures
      ? `已发送；${failures} 个模型需要手动确认`
      : "已发送 · 回答直接由原站实时显示";
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
    dispatchStatus.textContent = "发送失败";
  } finally {
    updateMeta();
  }
}

function autosizeComposer() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 130)}px`;
}

promptInput.addEventListener("input", () => {
  chrome.storage.local.set({ draftPrompt: promptInput.value }).catch(() => {});
  showError();
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
  await refreshFrameStatus();
  setInterval(refreshFrameStatus, 900);
}

init().catch((error) => showError(error instanceof Error ? error.message : String(error)));
