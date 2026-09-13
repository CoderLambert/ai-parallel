const PROVIDERS = [
  { id: "chatgpt", name: "ChatGPT", default: true },
  { id: "deepseek", name: "DeepSeek", default: true },
  { id: "zhipu", name: "智谱清言", default: true },
  { id: "qwen", name: "Qwen", default: true },
  { id: "kimi", name: "Kimi", default: true },
  { id: "claude", name: "Claude", default: false },
  { id: "gemini", name: "Gemini", default: false }
];

const $ = (selector) => document.querySelector(selector);
const providerRow = $("#providerRow");
const promptInput = $("#promptInput");
const sendBtn = $("#sendBtn");
const selectionMeta = $("#selectionMeta");
const charMeta = $("#charMeta");
const errorText = $("#errorText");
const grid = $("#workspaceGrid");
const emptyState = $("#emptyState");
const runIndicator = $("#runIndicator");
const panelTemplate = $("#panelTemplate");
const panels = new Map();
let selected = new Set();
let currentRun = null;
let currentLayout = "auto";
let port = null;

function showError(message = "") {
  errorText.textContent = message;
  errorText.hidden = !message;
}

function updateComposerMeta() {
  selectionMeta.textContent = `${selected.size} 个模型`;
  charMeta.textContent = `${promptInput.value.length} 字符`;
  sendBtn.disabled = selected.size === 0 || !promptInput.value.trim();
}

function renderProviderChips() {
  providerRow.replaceChildren();
  for (const provider of PROVIDERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "provider-chip";
    button.dataset.selected = String(selected.has(provider.id));
    button.textContent = provider.name;
    button.addEventListener("click", async () => {
      if (selected.has(provider.id)) selected.delete(provider.id);
      else selected.add(provider.id);
      button.dataset.selected = String(selected.has(provider.id));
      await chrome.storage.local.set({ selectedProviders: [...selected] });
      updateComposerMeta();
    });
    providerRow.append(button);
  }
}

function stateLabel(entry) {
  const state = entry?.state || "waiting";
  const labels = {
    opening: "正在打开",
    waiting: "等待页面就绪",
    working: entry?.message || "准备中",
    sent: "已发送，等待回答",
    streaming: "正在生成",
    completed: "完成",
    error: entry?.message || "失败",
    closed: "页面已关闭"
  };
  return labels[state] || entry?.message || state;
}

function renderBlocks(container, response) {
  container.replaceChildren();
  const blocks = Array.isArray(response?.blocks) ? response.blocks : [];
  if (!blocks.length && response?.text) {
    const p = document.createElement("p");
    p.textContent = response.text;
    container.append(p);
    return;
  }

  for (const block of blocks) {
    const text = String(block?.text || "");
    if (!text) continue;
    let element;
    if (block.type === "heading") {
      const level = Math.min(6, Math.max(1, Number(block.level) || 3));
      element = document.createElement(`h${level}`);
    } else if (block.type === "code") {
      element = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = text;
      element.append(code);
      container.append(element);
      continue;
    } else if (block.type === "list-item") {
      element = document.createElement("div");
      element.className = "list-item";
    } else if (block.type === "quote") {
      element = document.createElement("blockquote");
    } else if (block.type === "table") {
      element = document.createElement("div");
      element.className = "table-block";
    } else {
      element = document.createElement("p");
    }
    element.textContent = text;
    container.append(element);
  }
}

function ensurePanel(providerId, entry) {
  if (panels.has(providerId)) return panels.get(providerId);
  const fragment = panelTemplate.content.cloneNode(true);
  const panel = fragment.querySelector(".model-panel");
  panel.dataset.providerId = providerId;
  panel.querySelector(".model-name").textContent = entry?.name || PROVIDERS.find((p) => p.id === providerId)?.name || providerId;

  panel.querySelector(".open-btn").addEventListener("click", async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "OPEN_PROVIDER_TAB", providerId });
      if (!response?.ok) throw new Error(response?.error || "无法打开模型页面");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  });

  panel.querySelector(".expand-btn").addEventListener("click", () => {
    const expanded = panel.classList.toggle("expanded");
    panel.querySelector(".expand-btn").textContent = expanded ? "×" : "⤢";
    document.body.style.overflow = expanded ? "hidden" : "";
  });

  panels.set(providerId, panel);
  grid.append(panel);
  return panel;
}

function updatePanel(providerId, entry) {
  const panel = ensurePanel(providerId, entry);
  panel.dataset.state = entry?.state || "waiting";
  panel.querySelector(".model-status").textContent = stateLabel(entry);
  const placeholder = panel.querySelector(".response-placeholder");
  const content = panel.querySelector(".response-content");
  const hasResponse = Boolean(entry?.response?.text);
  placeholder.hidden = hasResponse;
  if (!hasResponse) {
    placeholder.textContent = entry?.state === "error" ? entry.message : stateLabel(entry);
    content.replaceChildren();
  } else {
    renderBlocks(content, entry.response);
    const body = panel.querySelector(".response-body");
    if (entry.state === "streaming") body.scrollTop = body.scrollHeight;
  }
}

function renderRun(run) {
  currentRun = run;
  const ids = run?.providerIds || Object.keys(run?.providers || {});
  emptyState.hidden = ids.length > 0;
  grid.dataset.count = String(ids.length);

  for (const [id, panel] of [...panels]) {
    if (!ids.includes(id)) {
      panel.remove();
      panels.delete(id);
    }
  }

  for (const providerId of ids) {
    updatePanel(providerId, run.providers?.[providerId] || { name: providerId, state: "waiting" });
  }

  if (!run) {
    runIndicator.textContent = "Ready";
    return;
  }
  const states = Object.values(run.providers || {}).map((entry) => entry.state);
  const completed = states.filter((state) => state === "completed").length;
  const errors = states.filter((state) => state === "error").length;
  runIndicator.textContent = errors
    ? `${completed}/${states.length} complete · ${errors} error`
    : `${completed}/${states.length} complete`;
}

function applyProviderPatch(providerId, patch) {
  if (!currentRun) return;
  currentRun.providers ||= {};
  currentRun.providers[providerId] = { ...(currentRun.providers[providerId] || {}), ...patch };
  if (!currentRun.providerIds?.includes(providerId)) currentRun.providerIds = [...(currentRun.providerIds || []), providerId];
  updatePanel(providerId, currentRun.providers[providerId]);
  renderRun(currentRun);
}

async function launch() {
  const prompt = promptInput.value.trim();
  if (!prompt) return showError("请输入 Prompt");
  if (!selected.size) return showError("至少选择一个模型");

  showError();
  sendBtn.disabled = true;
  sendBtn.querySelector("span").textContent = "启动中…";
  try {
    await chrome.storage.local.set({ draftPrompt: promptInput.value });
    const response = await chrome.runtime.sendMessage({
      type: "LAUNCH_PARALLEL",
      prompt,
      providerIds: [...selected]
    });
    if (!response?.ok) throw new Error(response?.error || "启动失败");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    sendBtn.querySelector("span").textContent = "并行发送";
    updateComposerMeta();
  }
}

async function loadPreferences() {
  const data = await chrome.storage.local.get(["selectedProviders", "draftPrompt", "workspaceLayout"]);
  selected = new Set(Array.isArray(data.selectedProviders)
    ? data.selectedProviders
    : PROVIDERS.filter((p) => p.default).map((p) => p.id));
  promptInput.value = typeof data.draftPrompt === "string" ? data.draftPrompt : "";
  currentLayout = ["auto", "1", "2", "3"].includes(data.workspaceLayout) ? data.workspaceLayout : "auto";
  grid.dataset.layout = currentLayout;
  document.querySelectorAll(".layout-switch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.layout === currentLayout);
  });
  renderProviderChips();
  updateComposerMeta();
}

function connectWorkspace() {
  port = chrome.runtime.connect({ name: "workspace" });
  port.onMessage.addListener((message) => {
    if (message.type === "RUN_SNAPSHOT" || message.type === "RUN_REPLACED") {
      renderRun(message.run);
    } else if (message.type === "PROVIDER_PATCH") {
      if (!currentRun || message.runId === currentRun.runId) applyProviderPatch(message.providerId, message.patch);
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connectWorkspace, 500);
  });
}

promptInput.addEventListener("input", () => {
  chrome.storage.local.set({ draftPrompt: promptInput.value }).catch(() => {});
  showError();
  updateComposerMeta();
});
promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    launch();
  }
});
sendBtn.addEventListener("click", launch);

document.querySelectorAll(".layout-switch button").forEach((button) => {
  button.addEventListener("click", async () => {
    currentLayout = button.dataset.layout;
    grid.dataset.layout = currentLayout;
    document.querySelectorAll(".layout-switch button").forEach((item) => item.classList.toggle("active", item === button));
    await chrome.storage.local.set({ workspaceLayout: currentLayout });
  });
});

setInterval(() => {
  if (!currentRun?.startedAt) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - currentRun.startedAt) / 1000));
  for (const providerId of currentRun.providerIds || []) {
    const panel = panels.get(providerId);
    if (!panel) continue;
    const entry = currentRun.providers?.[providerId];
    const end = entry?.completedAt ? Math.floor((entry.completedAt - currentRun.startedAt) / 1000) : elapsed;
    panel.querySelector(".elapsed").textContent = `${end}s`;
  }
}, 1000);

loadPreferences().then(async () => {
  connectWorkspace();
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_RUN" });
    if (response?.ok) renderRun(response.run);
  } catch {}
});
