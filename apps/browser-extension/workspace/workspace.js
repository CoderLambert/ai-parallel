const PROVIDERS = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", origins: ["https://chatgpt.com", "https://chat.openai.com"], default: true },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/", default: true },
  { id: "zhipu", name: "智谱清言", url: "https://chatglm.cn/", default: true },
  { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/", default: true },
  { id: "kimi", name: "Kimi", url: "https://www.kimi.com/", origins: ["https://www.kimi.com", "https://kimi.com"], default: true },
  { id: "claude", name: "Claude", url: "https://claude.ai/new", default: false },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app", default: false },
  { id: "grok", name: "Grok", url: "https://grok.com/", default: false }
];

const MESSAGE_CONTEXT = "ai-parallel-workspace";
const PROMPT_LIBRARY_KEY = "promptLibrary";
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
const compareBtn = $("#compareBtn");
const compareDrawer = $("#compareDrawer");
const closeCompareBtn = $("#closeCompareBtn");
const compareStatus = $("#compareStatus");
const responseList = $("#responseList");
const copyMarkdownBtn = $("#copyMarkdownBtn");
const copyJsonBtn = $("#copyJsonBtn");
const downloadMarkdownBtn = $("#downloadMarkdownBtn");
const handoffTarget = $("#handoffTarget");
const sendAgentBtn = $("#sendAgentBtn");
const promptLibraryBtn = $("#promptLibraryBtn");
const promptLibraryDrawer = $("#promptLibraryDrawer");
const closePromptLibraryBtn = $("#closePromptLibraryBtn");
const promptLibraryStatus = $("#promptLibraryStatus");
const promptTitleInput = $("#promptTitleInput");
const savePromptBtn = $("#savePromptBtn");
const promptList = $("#promptList");
const workspaceUtils = globalThis.AIParallelWorkspaceUtils;
const panels = new Map();
const pendingRequests = new Map();
const responseBundles = new Map();
let promptLibraryEntries = [];
let selected = new Set();
let currentLayout = "auto";
let runtimeUpgradeWarning = "";
let pendingLaunchRunning = false;

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
      if (!selected.has(provider.id)) responseBundles.delete(provider.id);
      await chrome.storage.local.set({ selectedProviders: [...selected] });
      renderProviderBar();
      renderPanels();
      renderResponses();
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
      cancelPendingRequests(providerId, "模型面板已关闭");
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

function cancelPendingRequests(providerId, error) {
  for (const [requestId, pending] of pendingRequests) {
    if (pending.providerId !== providerId) continue;
    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.resolve({ ok: false, error });
  }
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
    return;
  }

  if (event.data.type === "AI_PARALLEL_RESPONSE_RESULT") {
    const requestId = String(event.data.requestId || "");
    const pending = pendingRequests.get(requestId);
    if (!pending || pending.providerId !== providerId) return;
    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.resolve({
      ok: event.data.ok === true,
      response: event.data.ok === true ? event.data.response : null,
      error: event.data.ok === true ? "" : String(event.data.error || "未找到模型回答")
    });
    return;
  }

  if (event.data.type === "AI_PARALLEL_NEW_CHAT_RESULT") {
    const requestId = String(event.data.requestId || "");
    const pending = pendingRequests.get(requestId);
    if (!pending || pending.providerId !== providerId) return;
    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.resolve({
      ok: event.data.ok === true,
      error: event.data.ok === true ? "" : String(event.data.error || "无法新建对话")
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

async function requestFrameMessage(providerId, type, payload = {}, timeoutMs = 30000) {
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
      resolve({ ok: false, error: type === "AI_PARALLEL_SEND" ? "发送超时；请在该面板中手动确认" : "请求超时" });
    }, timeoutMs);

    pendingRequests.set(requestId, { providerId, resolve, timer });
    const posted = postToFrame(providerId, {
      type,
      requestId,
      ...payload
    });

    if (!posted) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      resolve({ ok: false, error: "模型 iframe 不存在" });
    }
  });
}

function sendPromptToFrame(providerId, prompt) {
  return requestFrameMessage(providerId, "AI_PARALLEL_SEND", { prompt });
}

function collectResponseFromFrame(providerId) {
  return requestFrameMessage(providerId, "AI_PARALLEL_COLLECT_RESPONSE", {}, 12000);
}

async function dispatchPrompt() {
  const prompt = promptInput.value.trim();
  if (!prompt) return showError("请输入 Prompt");
  if (!selected.size) return showError("至少选择一个模型");

  responseBundles.clear();
  renderResponses();
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

function providerName(providerId) {
  return providerById(providerId)?.name || providerId;
}

function formatResponseTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderResponses() {
  responseList.replaceChildren();
  const selectedIds = PROVIDERS.map((provider) => provider.id).filter((id) => selected.has(id));
  if (!selectedIds.length) {
    responseList.innerHTML = '<div class="response-empty">请先选择模型</div>';
    return;
  }

  if (!responseBundles.size) {
    responseList.innerHTML = '<div class="response-empty">点击 Compare 收集当前回答</div>';
    return;
  }

  for (const providerId of selectedIds) {
    const result = responseBundles.get(providerId);
    const card = document.createElement("article");
    card.className = "response-card";

    const header = document.createElement("header");
    header.className = "response-card-header";
    const title = document.createElement("span");
    title.className = "response-card-title";
    title.textContent = providerName(providerId);
    const time = document.createElement("span");
    time.className = "response-card-time";
    time.textContent = formatResponseTime(result?.response?.timestamp);
    header.append(title, time);
    card.append(header);

    if (result?.ok && result.response) {
      const content = document.createElement("pre");
      content.className = "response-card-content";
      content.textContent = result.response.content || result.response.markdown || "";
      card.append(content);
    } else {
      const error = document.createElement("div");
      error.className = "response-card-error";
      error.textContent = result?.error || "未收集到回答";
      card.append(error);
    }
    responseList.append(card);
  }
}

async function collectResponses() {
  if (!selected.size) {
    showError("至少选择一个模型");
    return;
  }

  compareBtn.disabled = true;
  compareStatus.textContent = `正在收集 ${selected.size} 个模型的回答…`;
  responseBundles.clear();
  renderResponses();

  try {
    const pairs = await Promise.all([...selected].map(async (providerId) => [
      providerId,
      await collectResponseFromFrame(providerId)
    ]));
    for (const [providerId, result] of pairs) responseBundles.set(providerId, result);
    const count = pairs.filter(([, result]) => result.ok).length;
    compareStatus.textContent = count
      ? `已收集 ${count}/${pairs.length} 个回答 · ${new Date().toLocaleTimeString()}`
      : "暂未找到回答；请等待模型生成完成后重试";
    renderResponses();
  } finally {
    compareBtn.disabled = false;
  }
}

function openCompareDrawer() {
  closePromptLibraryDrawer();
  compareDrawer.dataset.open = "true";
  compareDrawer.setAttribute("aria-hidden", "false");
  collectResponses().catch((error) => {
    compareStatus.textContent = error instanceof Error ? error.message : String(error);
  });
}

function closeCompareDrawer() {
  compareDrawer.dataset.open = "false";
  compareDrawer.setAttribute("aria-hidden", "true");
}

function promptTitleFromContent(content) {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return (firstLine || "Untitled Prompt").slice(0, 80);
}

function formatPromptDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderPromptLibrary() {
  promptList.replaceChildren();
  if (!promptLibraryEntries.length) {
    promptList.innerHTML = '<div class="prompt-empty">还没有保存的 Prompt</div>';
    return;
  }

  for (const entry of promptLibraryEntries) {
    const card = document.createElement("article");
    card.className = "prompt-card";

    const header = document.createElement("header");
    header.className = "prompt-card-header";
    const title = document.createElement("div");
    title.className = "prompt-card-title";
    title.textContent = entry.title;
    const date = document.createElement("span");
    date.className = "prompt-card-date";
    date.textContent = formatPromptDate(entry.updatedAt || entry.createdAt);
    header.append(title, date);

    const content = document.createElement("div");
    content.className = "prompt-card-content";
    content.textContent = entry.content;

    const actions = document.createElement("div");
    actions.className = "prompt-card-actions";
    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.textContent = "使用";
    useButton.addEventListener("click", () => usePrompt(entry));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", () => deletePrompt(entry.id));
    actions.append(useButton, deleteButton);

    card.append(header, content, actions);
    promptList.append(card);
  }
}

async function loadPromptLibrary() {
  const data = await chrome.storage.local.get(PROMPT_LIBRARY_KEY);
  promptLibraryEntries = Array.isArray(data[PROMPT_LIBRARY_KEY])
    ? data[PROMPT_LIBRARY_KEY].filter((entry) => entry && typeof entry.content === "string").slice(0, 50)
    : [];
  renderPromptLibrary();
}

function openPromptLibraryDrawer() {
  closeCompareDrawer();
  promptLibraryDrawer.dataset.open = "true";
  promptLibraryDrawer.setAttribute("aria-hidden", "false");
  loadPromptLibrary().catch((error) => {
    promptLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
  });
}

function closePromptLibraryDrawer() {
  promptLibraryDrawer.dataset.open = "false";
  promptLibraryDrawer.setAttribute("aria-hidden", "true");
}

async function saveCurrentPrompt() {
  const content = promptInput.value.trim();
  if (!content) {
    promptLibraryStatus.textContent = "当前没有可保存的 Prompt";
    return;
  }

  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    title: promptTitleInput.value.trim() || promptTitleFromContent(content),
    content,
    createdAt: now,
    updatedAt: now
  };
  promptLibraryEntries = [entry, ...promptLibraryEntries].slice(0, 50);
  await chrome.storage.local.set({ [PROMPT_LIBRARY_KEY]: promptLibraryEntries });
  promptTitleInput.value = "";
  renderPromptLibrary();
  promptLibraryStatus.textContent = "Prompt 已保存";
}

async function deletePrompt(id) {
  promptLibraryEntries = promptLibraryEntries.filter((entry) => entry.id !== id);
  await chrome.storage.local.set({ [PROMPT_LIBRARY_KEY]: promptLibraryEntries });
  renderPromptLibrary();
  promptLibraryStatus.textContent = "Prompt 已删除";
}

function usePrompt(entry) {
  promptInput.value = entry.content;
  chrome.storage.local.set({ draftPrompt: promptInput.value }).catch(() => {});
  autosizeComposer();
  updateMeta();
  showError("");
  closePromptLibraryDrawer();
}

function buildComparisonMarkdown() {
  const providers = PROVIDERS.filter((provider) => selected.has(provider.id));
  return workspaceUtils.buildComparisonMarkdown(promptInput.value.trim(), providers, responseBundles);
}

function buildComparisonJson() {
  const providers = PROVIDERS.filter((provider) => selected.has(provider.id));
  return workspaceUtils.buildComparisonJson(promptInput.value.trim(), providers, responseBundles);
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  compareStatus.textContent = successMessage;
}

function downloadMarkdown() {
  const blob = new Blob([buildComparisonMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ai-parallel-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  compareStatus.textContent = "Markdown 已下载";
}

function buildHandoffPrompt() {
  const providers = PROVIDERS.filter((provider) => selected.has(provider.id));
  return workspaceUtils.buildHandoffPrompt(promptInput.value.trim(), providers, responseBundles);
}

async function sendToAgent() {
  const target = handoffTarget.value;
  if (!selected.has(target)) {
    selected.add(target);
    await chrome.storage.local.set({ selectedProviders: [...selected] });
    renderProviderBar();
    renderPanels();
    updateMeta();
    compareStatus.textContent = `正在打开 ${providerName(target)} iframe…`;
  }

  sendAgentBtn.disabled = true;
  compareStatus.textContent = `正在发送上下文到 ${providerName(target)}…`;
  try {
    const result = await sendPromptToFrame(target, buildHandoffPrompt());
    compareStatus.textContent = result.ok
      ? `上下文已发送到 ${providerName(target)}`
      : result.error || "Agent handoff 失败";
  } finally {
    sendAgentBtn.disabled = false;
  }
}

async function runPendingLaunch(pending) {
  if (pendingLaunchRunning || !pending || typeof pending.prompt !== "string" || !pending.prompt.trim()) return false;
  const providerIds = Array.isArray(pending.providerIds)
    ? pending.providerIds.filter((id) => providerById(id))
    : [];
  if (!providerIds.length) return false;

  pendingLaunchRunning = true;
  try {
    selected = new Set(providerIds);
    promptInput.value = pending.prompt;
    await chrome.storage.local.set({
      draftPrompt: promptInput.value,
      selectedProviders: providerIds
    });
    await chrome.storage.local.remove("pendingLaunch");
    renderProviderBar();
    renderPanels();
    renderResponses();
    autosizeComposer();
    updateMeta();
    await dispatchPrompt();
    return true;
  } finally {
    pendingLaunchRunning = false;
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
promptLibraryBtn.addEventListener("click", openPromptLibraryDrawer);
closePromptLibraryBtn.addEventListener("click", closePromptLibraryDrawer);
savePromptBtn.addEventListener("click", () => saveCurrentPrompt().catch((error) => {
  promptLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
}));
compareBtn.addEventListener("click", openCompareDrawer);
closeCompareBtn.addEventListener("click", closeCompareDrawer);
copyMarkdownBtn.addEventListener("click", () => copyText(buildComparisonMarkdown(), "Markdown 已复制"));
copyJsonBtn.addEventListener("click", () => copyText(buildComparisonJson(), "JSON 已复制"));
downloadMarkdownBtn.addEventListener("click", downloadMarkdown);
sendAgentBtn.addEventListener("click", () => sendToAgent().catch((error) => {
  compareStatus.textContent = error instanceof Error ? error.message : String(error);
}));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "RUN_PENDING_LAUNCH") return;
  runPendingLaunch(message.pending)
    .then((ok) => sendResponse({ ok }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

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
  const data = await chrome.storage.local.get(["selectedProviders", "draftPrompt", "workspaceLayout", "pendingLaunch"]);
  const pendingLaunch = data.pendingLaunch && typeof data.pendingLaunch === "object" ? data.pendingLaunch : null;
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
  renderResponses();
  loadPromptLibrary().catch((error) => {
    promptLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
  });
  autosizeComposer();
  updateMeta();
  if (pendingLaunch) runPendingLaunch(pendingLaunch).catch((error) => showError(error instanceof Error ? error.message : String(error)));
  setInterval(() => {
    for (const id of selected) {
      const panel = panels.get(id);
      if (panel?.dataset.ready !== "true") pingFrame(id);
    }
  }, 1200);
}

init().catch((error) => showError(error instanceof Error ? error.message : String(error)));
