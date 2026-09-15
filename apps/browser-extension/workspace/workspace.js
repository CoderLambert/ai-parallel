const PROVIDERS = globalThis.AIParallelProviderCatalog;
const PROMPT_TEMPLATES = globalThis.AIParallelPromptTemplateCatalog;
const promptTemplateUtils = globalThis.AIParallelPromptTemplateUtils;
const contractRuntime = globalThis.AIParallelContractRuntime;
const storage = globalThis.AIParallelStorageContract.createLocalStorage();

const MESSAGE_CONTEXT = "ai-parallel-workspace";
const providerAdapterContract = globalThis.AIParallelProviderAdapterContract;
const PROMPT_LIBRARY_KEY = "promptLibrary";
const PROMPT_TEMPLATES_KEY = "promptTemplatesV1";
const SESSION_KEY = "workspaceSessions";
const MAX_SESSIONS = 20;
const MAX_USER_TEMPLATES = 100;
const providerTaskRuntime = globalThis.AIParallelProviderTaskRuntime.createProviderTaskRuntime({
  defaultTimeoutMs: 30000,
  defaultMaxAttempts: 1
});
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
const sessionBtn = $("#sessionBtn");
const sessionDrawer = $("#sessionDrawer");
const closeSessionBtn = $("#closeSessionBtn");
const sessionStatus = $("#sessionStatus");
const sessionTitleInput = $("#sessionTitleInput");
const saveSessionBtn = $("#saveSessionBtn");
const sessionList = $("#sessionList");
const promptLibraryBtn = $("#promptLibraryBtn");
const promptLibraryDrawer = $("#promptLibraryDrawer");
const closePromptLibraryBtn = $("#closePromptLibraryBtn");
const promptLibraryStatus = $("#promptLibraryStatus");
const promptTitleInput = $("#promptTitleInput");
const savePromptBtn = $("#savePromptBtn");
const promptList = $("#promptList");
const templateLibraryBtn = $("#templateLibraryBtn");
const templateLibraryDrawer = $("#templateLibraryDrawer");
const closeTemplateLibraryBtn = $("#closeTemplateLibraryBtn");
const templateLibraryStatus = $("#templateLibraryStatus");
const templateCategorySelect = $("#templateCategorySelect");
const templateSearchInput = $("#templateSearchInput");
const templateList = $("#templateList");
const importTemplateBtn = $("#importTemplateBtn");
const copyTemplateSchemaBtn = $("#copyTemplateSchemaBtn");
const exportTemplatesBtn = $("#exportTemplatesBtn");
const templateImportInput = $("#templateImportInput");
const templateFormDialog = $("#templateFormDialog");
const templateForm = $("#templateForm");
const templateFormTitle = $("#templateFormTitle");
const templateFormDescription = $("#templateFormDescription");
const templateFormFields = $("#templateFormFields");
const templateFormError = $("#templateFormError");
const templatePromptPreview = $("#templatePromptPreview");
const closeTemplateFormBtn = $("#closeTemplateFormBtn");
const insertTemplateBtn = $("#insertTemplateBtn");
const runTemplateBtn = $("#runTemplateBtn");
const workspaceUtils = globalThis.AIParallelWorkspaceUtils;
const panels = new Map();
const providerAdapters = new Map();
const pendingRequests = new Map();
const responseBundles = new Map();
const pendingCollections = new Set();
let promptLibraryEntries = [];
let userTemplateEntries = [];
let sessionEntries = [];
let selected = new Set();
let currentLayout = "auto";
let runtimeUpgradeWarning = "";
let pendingLaunchRunning = false;
let dispatchInFlight = false;
let activeTemplate = null;
let templateFormTemplate = null;
let templateFormValues = {};
let applyingTemplatePrompt = false;

function providerById(id) {
  return PROVIDERS.find((provider) => provider.id === id);
}

function schemaProperties(schema) {
  return schema && typeof schema === "object" && schema.properties && typeof schema.properties === "object"
    ? schema.properties
    : {};
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

function workspaceProviderStates() {
  return PROVIDERS.map((provider) => {
    const panel = panels.get(provider.id);
    return {
      providerId: provider.id,
      loaded: panel?.dataset.loaded === "true",
      ready: panel?.dataset.ready === "true",
      status: panel?.querySelector(".provider-state")?.textContent || (selected.has(provider.id) ? "未加载" : "未选择")
    };
  });
}

function workspaceCompareState() {
  return {
    open: compareDrawer.dataset.open === "true",
    responseCount: responseBundles.size,
    pendingCount: pendingCollections.size,
    status: compareStatus.textContent || ""
  };
}

function workspaceLibraryState() {
  return {
    sessions: sessionEntries.length,
    prompts: promptLibraryEntries.length,
    templates: allPromptTemplates().length
  };
}

function workspaceSessionState() {
  return sessionEntries
    .filter((entry) => entry && typeof entry.id === "string" && entry.id)
    .map((entry) => ({
      id: entry.id,
      title: typeof entry.title === "string" ? entry.title : "Untitled Session",
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : (typeof entry.createdAt === "string" ? entry.createdAt : ""),
      providerCount: Array.isArray(entry.selectedProviders) ? entry.selectedProviders.length : 0,
      promptLength: typeof entry.prompt === "string" ? entry.prompt.length : 0
    }));
}

function workspacePromptState() {
  return promptLibraryEntries
    .filter((entry) => entry && typeof entry.id === "string" && entry.id)
    .map((entry) => ({
      id: entry.id,
      title: typeof entry.title === "string" ? entry.title : "Untitled Prompt",
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : (typeof entry.createdAt === "string" ? entry.createdAt : ""),
      contentLength: typeof entry.content === "string" ? entry.content.length : 0,
      content: typeof entry.content === "string" ? entry.content : ""
    }));
}

function workspaceTemplateState() {
  return allPromptTemplates()
    .filter((template) => template && typeof template.id === "string" && template.id)
    .map((template) => ({
      id: template.id,
      name: typeof template.name === "string" ? template.name : "Untitled Template",
      category: templateCategoryName(template.categoryId),
      outputMode: template.output?.mode === "json" ? "json" : "text",
      version: Number.isFinite(template.version) ? Math.max(1, Math.floor(template.version)) : 1,
      source: template.metadata?.source === "builtin" ? "builtin" : "user"
    }));
}

function notifyWorkspaceShell() {
  window.dispatchEvent(new CustomEvent("ai-parallel:workspace-state", {
    detail: {
      selectedProviders: [...selected],
      workspaceLayout: currentLayout,
      providerStates: workspaceProviderStates(),
      compare: workspaceCompareState(),
      libraries: workspaceLibraryState(),
      sessions: workspaceSessionState(),
      prompts: workspacePromptState(),
      templates: workspaceTemplateState()
    }
  }));
}

window.addEventListener("ai-parallel:workspace-state-request", notifyWorkspaceShell);

function setCompareStatus(message) {
  compareStatus.textContent = message;
  notifyWorkspaceShell();
}

function setPanelState(providerId, state, { ready } = {}) {
  const panel = panels.get(providerId);
  if (!panel) return;
  if (typeof ready === "boolean") panel.dataset.ready = String(ready);
  panel.querySelector(".provider-state").textContent = state;
  notifyWorkspaceShell();
}

providerTaskRuntime.subscribe((task) => {
  if (!panels.has(task.providerId)) return;
  if (task.status === "QUEUED") {
    setPanelState(task.providerId, `Queued… (${Math.min(task.attempt + 1, task.maxAttempts)}/${task.maxAttempts})`);
  } else if (task.status === "RUNNING") {
    setPanelState(task.providerId, `Running… (${task.attempt}/${task.maxAttempts})`);
  } else if (task.status === "TIMEOUT") {
    setPanelState(task.providerId, "Timeout");
  } else if (task.status === "CANCELLED") {
    setPanelState(task.providerId, "Cancelled");
  }
});

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
      await storage.set({ selectedProviders: [...selected] });
      renderProviderBar();
      renderPanels();
      renderResponses();
      updateMeta();
    });
    providerBar.append(button);
  }
  notifyWorkspaceShell();
}

function postToFrame(providerId, payload) {
  const provider = providerById(providerId);
  const panel = panels.get(providerId);
  const iframe = panel?.querySelector("iframe");
  if (!provider || !iframe?.contentWindow) return false;
  const message = { ...payload, context: MESSAGE_CONTEXT, providerId };
  if (!contractRuntime.isFrameCommandMessage(message, providerId)) return false;
  for (const origin of providerOrigins(provider)) {
    iframe.contentWindow.postMessage(message, origin);
  }
  return true;
}

function pingFrame(providerId) {
  postToFrame(providerId, { type: "AI_PARALLEL_PING" });
}

async function openProviderTab(provider) {
  const request = {
    type: "OPEN_PROVIDER_TAB",
    providerId: provider.id
  };
  if (!contractRuntime.isServiceWorkerRequest(request)) throw new Error("Invalid provider request");
  const result = await chrome.runtime.sendMessage(request);
  if (!contractRuntime.isServiceWorkerResponse(result)) throw new Error("Invalid provider response");
  if (!result?.ok) throw new Error(result?.error || "无法打开模型页面");
  return result;
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
  iframe.title = provider.name;

  if (provider.mode === "tab") {
    const externalProvider = panel.querySelector(".external-provider");
    iframe.hidden = true;
    externalProvider.hidden = false;
    panel.dataset.loaded = "true";
    panel.dataset.ready = "true";
    panel.querySelector(".provider-state").textContent = "受控标签页";
    panel.querySelector(".reload-btn").title = "打开或聚焦独立标签页";
    panel.querySelector(".reload-btn").addEventListener("click", () => {
      openProviderTab(provider).catch((error) => showError(error.message));
    });
    externalProvider.querySelector(".external-open-btn").addEventListener("click", () => {
      openProviderTab(provider).catch((error) => showError(error.message));
    });
  } else {
    iframe.src = provider.url;

    iframe.addEventListener("load", () => {
      panel.dataset.loaded = "true";
      panel.dataset.ready = "false";
      panel.querySelector(".provider-state").textContent = "等待桥接";
      notifyWorkspaceShell();
      for (const delay of [80, 400, 1200, 2500]) {
        setTimeout(() => pingFrame(provider.id), delay);
      }
    });

    panel.querySelector(".reload-btn").addEventListener("click", () => {
      panel.dataset.loaded = "false";
      panel.dataset.ready = "false";
      panel.querySelector(".provider-state").textContent = "重新加载";
      notifyWorkspaceShell();
      iframe.src = provider.url;
    });
  }

  const authButton = panel.querySelector(".auth-btn");
  if (provider.loginUrl) {
    authButton.hidden = false;
    authButton.title = `在独立标签页登录 ${provider.name}`;
    authButton.addEventListener("click", async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: "OPEN_PROVIDER_AUTH",
          providerId: provider.id,
          url: provider.loginUrl
        });
        if (!result?.ok) throw new Error(result?.error || "无法打开登录页面");
        setPanelState(provider.id, "登录完成后点击 ↻ 重新加载", { ready: false });
      } catch (error) {
        showError(error instanceof Error ? error.message : "无法打开登录页面");
      }
    });
  }

  panel.querySelector(".open-btn").addEventListener("click", async () => {
    try {
      await openProviderTab(provider);
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
  notifyWorkspaceShell();
}

function cancelPendingRequests(providerId, error) {
  for (const [requestId, pending] of pendingRequests) {
    if (pending.providerId !== providerId) continue;
    settlePendingRequest(requestId, { ok: false, error, code: "PANEL_CLOSED", retryable: false });
  }
}

function settlePendingRequest(requestId, result) {
  const pending = pendingRequests.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingRequests.delete(requestId);
  pending.cleanup?.();
  pending.resolve(result);
  return true;
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
  if (!contractRuntime.isFrameToWorkspaceMessage(event.data, providerId)) return;

  if (event.data.type === "AI_PARALLEL_FRAME_READY") {
    setPanelState(providerId, "Ready", { ready: true });
    return;
  }

  if (event.data.type === "AI_PARALLEL_AUTH_REQUIRED") {
    setPanelState(providerId, "已在新标签页打开登录；完成后点击 ↻", { ready: false });
    return;
  }

  if (event.data.type === "AI_PARALLEL_SEND_RESULT") {
    const requestId = String(event.data.requestId || "");
    const pending = pendingRequests.get(requestId);
    if (!pending || pending.providerId !== providerId) return;
    settlePendingRequest(requestId, {
      ok: event.data.ok === true,
      error: event.data.ok === true ? "" : String(event.data.error || "发送失败"),
      code: event.data.ok === true ? undefined : "PROVIDER_FAILURE",
      retryable: false
    });
    return;
  }

  if (event.data.type === "AI_PARALLEL_RESPONSE_RESULT") {
    const requestId = String(event.data.requestId || "");
    const pending = pendingRequests.get(requestId);
    if (!pending || pending.providerId !== providerId) return;
    settlePendingRequest(requestId, {
      ok: event.data.ok === true,
      response: event.data.ok === true ? event.data.response : null,
      error: event.data.ok === true ? "" : String(event.data.error || "未找到模型回答"),
      code: event.data.ok === true ? undefined : "PROVIDER_FAILURE",
      retryable: false
    });
    return;
  }

  if (event.data.type === "AI_PARALLEL_NEW_CHAT_RESULT") {
    const requestId = String(event.data.requestId || "");
    const pending = pendingRequests.get(requestId);
    if (!pending || pending.providerId !== providerId) return;
    settlePendingRequest(requestId, {
      ok: event.data.ok === true,
      error: event.data.ok === true ? "" : String(event.data.error || "无法新建对话"),
      code: event.data.ok === true ? undefined : "PROVIDER_FAILURE",
      retryable: false
    });
  }
});

function createRequestAbortError(reason = "Provider task cancelled") {
  const error = new Error(reason);
  error.name = "AbortError";
  error.code = "TASK_CANCELLED";
  return error;
}

function waitForFrameReady(providerId, timeoutMs = 10000, signal) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let pollTimer;
    let settled = false;
    const cleanup = () => {
      clearTimeout(pollTimer);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(createRequestAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) return onAbort();

    const poll = () => {
      const panel = panels.get(providerId);
      if (!panel) return finish(false);
      if (panel.dataset.ready === "true") return finish(true);
      if (Date.now() - started >= timeoutMs) return finish(false);
      pingFrame(providerId);
      pollTimer = setTimeout(poll, 250);
    };
    poll();
  });
}

async function requestFrameMessage(providerId, type, payload = {}, timeoutMs = 30000, signal) {
  const ready = await waitForFrameReady(providerId, Math.min(timeoutMs, 10000), signal);
  if (!ready) {
    return {
      ok: false,
      error: runtimeUpgradeWarning || "模型 iframe 未就绪；如果刚升级扩展，请先在 chrome://extensions 点击 Reload",
      code: "PROVIDER_NOT_READY",
      retryable: false
    };
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      cleanup();
      reject(createRequestAbortError());
    };
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const timer = setTimeout(() => finish({
      ok: false,
      error: type === "AI_PARALLEL_SEND" ? "发送超时；请在该面板中手动确认" : "请求超时",
      code: "REQUEST_TIMEOUT",
      retryable: true
    }), timeoutMs + 250);

    pendingRequests.set(requestId, { providerId, resolve: finish, timer, cleanup });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) return onAbort();

    try {
      const posted = postToFrame(providerId, {
        type,
        requestId,
        ...payload
      });

      if (!posted) finish({ ok: false, error: "模型 iframe 不存在", code: "FRAME_MISSING", retryable: false });
    } catch (error) {
      finish({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        code: "FRAME_DISPATCH_FAILED",
        retryable: true
      });
    }
  });
}

async function requestProviderMessage(providerId, type, payload = {}, timeoutMs = 30000, signal) {
  const provider = providerById(providerId);
  if (provider?.mode !== "tab") return requestFrameMessage(providerId, type, payload, timeoutMs, signal);

  const requestId = crypto.randomUUID();
  const request = {
    type: "PROVIDER_TAB_COMMAND",
    providerId,
    command: { type, requestId, ...payload }
  };
  if (!contractRuntime.isServiceWorkerRequest(request)) {
    return { ok: false, error: "Invalid provider command", code: "INVALID_MESSAGE", retryable: false };
  }
  const timeoutMarker = Symbol("provider-request-timeout");
  const abortMarker = Symbol("provider-request-abort");
  let timer;
  let abortListener;
  try {
    const result = await Promise.race([
      chrome.runtime.sendMessage(request),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(timeoutMarker), timeoutMs + 250);
      }),
      new Promise((resolve) => {
        abortListener = () => resolve(abortMarker);
        signal?.addEventListener("abort", abortListener, { once: true });
        if (signal?.aborted) resolve(abortMarker);
      })
    ]);
    if (result === abortMarker) throw createRequestAbortError();
    if (result === timeoutMarker) {
      return {
        ok: false,
        error: type === "AI_PARALLEL_SEND" ? "发送超时；请在该面板中手动确认" : "请求超时",
        code: "REQUEST_TIMEOUT",
        retryable: true
      };
    }
    if (!contractRuntime.isServiceWorkerResponse(result)) {
      return { ok: false, error: "Invalid provider response", code: "INVALID_MESSAGE", retryable: false };
    }
    return result?.ok === true
      ? result
      : {
          ok: false,
          error: result?.error || "独立标签页命令执行失败",
          code: "PROVIDER_FAILURE",
          retryable: false
        };
  } catch (error) {
    if (error?.code === "TASK_CANCELLED") throw error;
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: "TRANSPORT_ERROR",
      retryable: true
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortListener);
  }
}

const providerTransport = Object.freeze({
  request(provider, type, payload, { timeoutMs = 30000, signal } = {}) {
    return requestProviderMessage(provider.id, type, payload, timeoutMs, signal);
  },
  async healthCheck(provider, { timeoutMs = 10000, signal } = {}) {
    if (provider.mode === "tab") {
      if (signal?.aborted) throw createRequestAbortError();
      return { ok: true, providerId: provider.id, mode: provider.mode };
    }

    const ready = await waitForFrameReady(provider.id, Math.min(timeoutMs, 10000), signal);
    return ready
      ? { ok: true, providerId: provider.id, mode: provider.mode }
      : {
          ok: false,
          error: "模型 iframe 未就绪",
          code: "PROVIDER_NOT_READY",
          retryable: false
        };
  }
});

function initializeProviderAdapters() {
  providerAdapters.clear();
  for (const provider of PROVIDERS) {
    const adapter = providerAdapterContract.createProviderAdapter({
      provider,
      transport: providerTransport
    });
    if (!providerAdapterContract.validateProviderAdapter(adapter)) {
      throw new Error(`Provider adapter contract invalid: ${provider.id}`);
    }
    providerAdapters.set(adapter.id, adapter);
  }
}

initializeProviderAdapters();

function runProviderTask(providerId, type, payload = {}, timeoutMs = 30000) {
  const provider = providerById(providerId);
  const method = providerAdapterContract.operations[type];
  const adapter = providerAdapters.get(provider?.adapter);
  return providerTaskRuntime.run({
    providerId,
    operation: type,
    timeoutMs,
    maxAttempts: provider?.capabilities?.retry === true ? 2 : 1,
    retryOn: (error) => error?.retryable === true,
    execute: ({ signal, attempt }) => {
      if (!adapter || !method) {
        return {
          ok: false,
          error: `未找到 ${providerId} 的 Provider Adapter`,
          code: "ADAPTER_MISSING",
          retryable: false
        };
      }
      const context = { signal, attempt, timeoutMs };
      return method === "sendPrompt"
        ? adapter[method](payload.prompt, context)
        : adapter[method](context);
    }
  });
}

function sendPromptToProvider(providerId, prompt) {
  return runProviderTask(providerId, "AI_PARALLEL_SEND", { prompt });
}

function collectResponseFromProvider(providerId) {
  return runProviderTask(providerId, "AI_PARALLEL_COLLECT_RESPONSE", {}, 12000);
}

async function dispatchPrompt() {
  if (dispatchInFlight) return;
  const prompt = promptInput.value.trim();
  if (!prompt) return showError("请输入 Prompt");
  if (!selected.size) return showError("至少选择一个模型");

  dispatchInFlight = true;
  responseBundles.clear();
  renderResponses();
  showError(runtimeUpgradeWarning);
  sendBtn.disabled = true;
  dispatchStatus.textContent = `正在发送到 ${selected.size} 个模型…`;
  for (const id of selected) setPanelState(id, "Sending…");

  try {
    await storage.set({ draftPrompt: promptInput.value });
    const pairs = await Promise.all([...selected].map(async (providerId) => [
      providerId,
      await sendPromptToProvider(providerId, prompt)
    ]));
    const results = Object.fromEntries(pairs);

    let failures = 0;
    for (const [providerId, result] of Object.entries(results)) {
      if (result.ok) {
        setPanelState(providerId, "Sent", { ready: true });
      } else {
        failures += 1;
        setPanelState(providerId, providerTaskState(result, "发送失败"));
      }
    }

    dispatchStatus.textContent = failures
      ? `已发送；${failures} 个模型需要处理`
      : "已发送 · 回答直接由原站实时显示";
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
    dispatchStatus.textContent = "发送失败";
  } finally {
    dispatchInFlight = false;
    updateMeta();
  }
}

function providerName(providerId) {
  return providerById(providerId)?.name || providerId;
}

function providerTaskState(result, fallback) {
  if (result?.status === "TIMEOUT") return `Timeout · ${result.error || fallback}`;
  if (result?.status === "CANCELLED") return `Cancelled · ${result.error || fallback}`;
  return result?.error || fallback;
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
    notifyWorkspaceShell();
    return;
  }

  if (!responseBundles.size) {
    responseList.innerHTML = '<div class="response-empty">点击 Compare 收集当前回答</div>';
    notifyWorkspaceShell();
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
    const validation = result?.ok && activeTemplate?.output?.mode === "json"
      ? promptTemplateUtils.validateTemplateResponse(activeTemplate, result.response.content || result.response.markdown || "")
      : null;
    if (validation) {
      const validationStatus = document.createElement("span");
      validationStatus.className = `response-card-schema-status ${validation.ok ? "is-valid" : "is-invalid"}`;
      validationStatus.textContent = validation.ok ? "Schema 通过" : "Schema 未通过";
      header.append(title, validationStatus);
    } else {
      header.append(title);
    }
    const time = document.createElement("span");
    time.className = "response-card-time";
    time.textContent = formatResponseTime(result?.response?.timestamp);
    header.append(time);
    card.append(header);

    if (result?.ok && result.response) {
      const content = document.createElement("pre");
      content.className = "response-card-content";
      const rawContent = result.response.content || result.response.markdown || "";
      content.textContent = rawContent;
      card.append(content);

      if (validation?.mode === "json") {
        const structured = document.createElement("details");
        structured.className = "response-structured-details";
        const summary = document.createElement("summary");
        summary.textContent = validation.ok ? "查看结构化 JSON" : "查看校验详情";
        structured.append(summary);
        const structuredContent = document.createElement("pre");
        structuredContent.className = "response-card-structured";
        structuredContent.textContent = validation.ok
          ? JSON.stringify(validation.value, null, 2)
          : formatTemplateErrors(validation.errors || [{ path: "$", message: validation.error || "JSON 校验失败" }]);
        structured.append(structuredContent);
        card.append(structured);
      }

      const actions = document.createElement("div");
      actions.className = "response-card-actions";
      actions.append(createTemplateButton("尝试导入模板", () => importResponseAsTemplate(providerId).catch((error) => {
        setCompareStatus(error instanceof Error ? error.message : String(error));
      })));
      card.append(actions);
    } else {
      const error = document.createElement("div");
      error.className = "response-card-error";
      const message = document.createElement("span");
      message.textContent = result?.error || "未收集到回答";
      error.append(message);

      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "drawer-btn response-retry-btn";
      retryButton.textContent = pendingCollections.has(providerId) ? "重试中…" : "重试";
      retryButton.disabled = pendingCollections.has(providerId);
      retryButton.setAttribute("aria-label", `重试收集 ${providerName(providerId)} 回答`);
      retryButton.addEventListener("click", () => retryResponse(providerId));
      error.append(retryButton);
      card.append(error);
    }
    responseList.append(card);
  }
  notifyWorkspaceShell();
}

async function importResponseAsTemplate(providerId) {
  const result = responseBundles.get(providerId);
  const content = result?.response?.content || result?.response?.markdown || "";
  if (!content.trim()) {
    setCompareStatus("当前回答为空，无法导入模板");
    return;
  }
  const imported = await importTemplateText(content, "response");
  if (imported) {
    setCompareStatus(`${providerName(providerId)} 的回答已导入模板库`);
    openTemplateLibraryDrawer();
  }
}

async function collectResponseSafely(providerId) {
  pendingCollections.add(providerId);
  try {
    return await collectResponseFromProvider(providerId);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    pendingCollections.delete(providerId);
  }
}

async function retryResponse(providerId) {
  if (!selected.has(providerId) || pendingCollections.has(providerId)) return;

  responseBundles.set(providerId, { ok: false, error: "正在重试…" });
  renderResponses();
  setCompareStatus(`正在重试收集 ${providerName(providerId)}…`);

  const result = await collectResponseSafely(providerId);
  if (!selected.has(providerId)) return;

  responseBundles.set(providerId, result);
  setCompareStatus(result.ok
    ? `${providerName(providerId)} 已重新收集`
    : `${providerName(providerId)} 重试失败，可再次尝试`);
  renderResponses();
}

async function collectResponses() {
  if (!selected.size) {
    showError("至少选择一个模型");
    return;
  }

  compareBtn.disabled = true;
  setCompareStatus(`正在收集 ${selected.size} 个模型的回答…`);
  responseBundles.clear();
  renderResponses();

  try {
    const pairs = await Promise.all([...selected].map(async (providerId) => [
      providerId,
      await collectResponseSafely(providerId)
    ]));
    for (const [providerId, result] of pairs) responseBundles.set(providerId, result);
    const count = pairs.filter(([, result]) => result.ok).length;
    setCompareStatus(count
      ? `已收集 ${count}/${pairs.length} 个回答 · ${new Date().toLocaleTimeString()}`
      : "暂未找到回答；请等待模型生成完成后重试");
    renderResponses();
  } finally {
    compareBtn.disabled = false;
  }
}

function openCompareDrawer() {
  closePromptLibraryDrawer();
  closeSessionDrawer();
  closeTemplateLibraryDrawer();
  compareDrawer.dataset.open = "true";
  compareDrawer.setAttribute("aria-hidden", "false");
  notifyWorkspaceShell();
  collectResponses().catch((error) => {
    setCompareStatus(error instanceof Error ? error.message : String(error));
  });
}

function closeCompareDrawer() {
  compareDrawer.dataset.open = "false";
  compareDrawer.setAttribute("aria-hidden", "true");
  notifyWorkspaceShell();
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
    notifyWorkspaceShell();
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
  notifyWorkspaceShell();
}

async function loadPromptLibrary() {
  const data = await storage.get(PROMPT_LIBRARY_KEY);
  promptLibraryEntries = Array.isArray(data[PROMPT_LIBRARY_KEY])
    ? data[PROMPT_LIBRARY_KEY].filter((entry) => entry && typeof entry.content === "string").slice(0, 50)
    : [];
  renderPromptLibrary();
}

function openPromptLibraryDrawer() {
  closeCompareDrawer();
  closeSessionDrawer();
  closeTemplateLibraryDrawer();
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

function templateCategoryName(categoryId) {
  return PROMPT_TEMPLATES.categories.find((category) => category.id === categoryId)?.name || "自定义";
}

function allPromptTemplates() {
  return [...PROMPT_TEMPLATES.templates, ...userTemplateEntries];
}

function templateIdExists(id, entries = allPromptTemplates()) {
  return entries.some((entry) => entry.id === id);
}

function userTemplateId() {
  return `user.imported.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`.slice(0, 96);
}

function formatTemplateErrors(errors = []) {
  return errors.slice(0, 3).map((error) => `${error.path}: ${error.message}`).join("；");
}

function normalizeStoredTemplates(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => promptTemplateUtils.normalizeTemplate(entry, { source: "user" }))
    .filter((entry) => promptTemplateUtils.validateTemplateDefinition(entry).ok)
    .slice(0, MAX_USER_TEMPLATES);
}

async function persistUserTemplates() {
  await storage.set({ [PROMPT_TEMPLATES_KEY]: userTemplateEntries.slice(0, MAX_USER_TEMPLATES) });
}

function populateTemplateCategories() {
  templateCategorySelect.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "全部分类";
  templateCategorySelect.append(allOption);
  for (const category of PROMPT_TEMPLATES.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    templateCategorySelect.append(option);
  }
}

function createTemplateButton(label, onClick, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `drawer-btn${primary ? " drawer-btn-primary" : ""}`;
  button.textContent = label;
  button.addEventListener("click", () => {
    try {
      Promise.resolve(onClick()).catch((error) => {
        templateLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
      });
    } catch (error) {
      templateLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  return button;
}

function renderTemplateLibrary() {
  const categoryId = templateCategorySelect.value || "all";
  const query = templateSearchInput.value.trim().toLocaleLowerCase();
  const templates = allPromptTemplates().filter((template) => {
    if (categoryId !== "all" && template.categoryId !== categoryId) return false;
    if (!query) return true;
    return [template.name, template.description, template.categoryId, ...(template.tags || [])]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });

  templateList.replaceChildren();
  if (!templates.length) {
    const empty = document.createElement("div");
    empty.className = "prompt-empty";
    empty.textContent = "没有匹配的模板；可以导入其他模型生成的 JSON。";
    templateList.append(empty);
    notifyWorkspaceShell();
    return;
  }

  for (const template of templates) {
    const card = document.createElement("article");
    card.className = "prompt-card template-card";

    const header = document.createElement("header");
    header.className = "prompt-card-header";
    const title = document.createElement("div");
    title.className = "prompt-card-title";
    title.textContent = template.name;
    const source = document.createElement("span");
    source.className = "template-card-badge";
    source.textContent = template.metadata?.source === "builtin" ? "内置" : "自定义";
    header.append(title, source);

    const meta = document.createElement("div");
    meta.className = "template-card-meta";
    meta.textContent = `${templateCategoryName(template.categoryId)} · ${template.output?.mode === "json" ? "JSON 输出" : "文本输出"} · v${template.version}`;

    const content = document.createElement("div");
    content.className = "prompt-card-content";
    content.textContent = template.description;

    const actions = document.createElement("div");
    actions.className = "prompt-card-actions";
    actions.append(
      createTemplateButton("使用", () => openTemplateForm(template), true),
      createTemplateButton("复制", () => duplicateTemplate(template)),
      createTemplateButton("导出", () => downloadTemplateJson(template))
    );
    if (template.metadata?.source !== "builtin") {
      actions.append(createTemplateButton("删除", () => deleteUserTemplate(template.id)));
    }

    card.append(header, meta, content, actions);
    templateList.append(card);
  }
  notifyWorkspaceShell();
}

async function loadTemplateLibrary() {
  const data = await storage.get(PROMPT_TEMPLATES_KEY);
  userTemplateEntries = normalizeStoredTemplates(data[PROMPT_TEMPLATES_KEY]);
  populateTemplateCategories();
  renderTemplateLibrary();
}

function closeTemplateLibraryDrawer() {
  templateLibraryDrawer.dataset.open = "false";
  templateLibraryDrawer.setAttribute("aria-hidden", "true");
}

function openTemplateLibraryDrawer() {
  closeCompareDrawer();
  closeSessionDrawer();
  closePromptLibraryDrawer();
  templateLibraryDrawer.dataset.open = "true";
  templateLibraryDrawer.setAttribute("aria-hidden", "false");
  loadTemplateLibrary().catch((error) => {
    templateLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
  });
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTemplateJson(template) {
  downloadJson(template, `${template.id.replace(/[^a-z0-9._-]/gi, "-")}.json`);
  templateLibraryStatus.textContent = `${template.name} 已导出`;
}

async function duplicateTemplate(template) {
  const copy = promptTemplateUtils.clone(template);
  copy.id = userTemplateId();
  copy.name = `${template.name} 副本`;
  copy.version = 1;
  copy.metadata = { ...(copy.metadata || {}), source: "user", copiedFrom: template.id };
  userTemplateEntries = [copy, ...userTemplateEntries].slice(0, MAX_USER_TEMPLATES);
  await persistUserTemplates();
  renderTemplateLibrary();
  templateLibraryStatus.textContent = `${copy.name} 已创建，可以继续导出或使用`;
}

async function deleteUserTemplate(id) {
  userTemplateEntries = userTemplateEntries.filter((entry) => entry.id !== id);
  await persistUserTemplates();
  renderTemplateLibrary();
  templateLibraryStatus.textContent = "模板已删除";
}

async function importTemplateText(text, source = "imported") {
  const result = promptTemplateUtils.parseTemplateImport(text, { source });
  if (!result.ok) {
    templateLibraryStatus.textContent = `导入失败：${formatTemplateErrors(result.errors)}`;
    return false;
  }

  const imported = [];
  for (const rawTemplate of result.templates) {
    const template = promptTemplateUtils.clone(rawTemplate);
    if (templateIdExists(template.id, [...allPromptTemplates(), ...imported])) {
      template.id = userTemplateId();
      template.name = `${template.name}（导入副本）`;
    }
    template.metadata = { ...(template.metadata || {}), source: "user", importedAt: new Date().toISOString() };
    imported.push(template);
  }
  userTemplateEntries = [...imported, ...userTemplateEntries].slice(0, MAX_USER_TEMPLATES);
  await persistUserTemplates();
  renderTemplateLibrary();
  templateLibraryStatus.textContent = `已导入 ${imported.length} 个模板${result.warnings.length ? " · 有可选警告" : ""}`;
  return true;
}

function getTemplateInputDefaults(schema) {
  const values = {};
  for (const [name, definition] of Object.entries(schemaProperties(schema))) {
    if (Object.prototype.hasOwnProperty.call(definition, "default")) values[name] = promptTemplateUtils.clone(definition.default);
    else if (Array.isArray(definition.enum) && definition.enum.length === 1) values[name] = definition.enum[0];
    else if (definition.type === "boolean") values[name] = false;
    else if (definition.type === "array") values[name] = [];
    else if (definition.type === "object") values[name] = {};
    else values[name] = "";
  }
  return values;
}

function templateFieldValue(definition, rawValue) {
  if (definition.type === "boolean") return rawValue === "true";
  if (definition.type === "number" || definition.type === "integer") {
    if (rawValue === "") return "";
    return Number(rawValue);
  }
  if (definition.type === "array" || definition.type === "object") {
    if (!String(rawValue).trim()) return definition.type === "array" ? [] : {};
    try {
      return JSON.parse(rawValue);
    } catch {
      throw new Error("请输入合法 JSON");
    }
  }
  return rawValue;
}

function readTemplateFormValues() {
  const values = {};
  for (const control of templateFormFields.querySelectorAll("[data-template-field]")) {
    values[control.name] = templateFieldValue(control.dataset.templateDefinition ? JSON.parse(control.dataset.templateDefinition) : {}, control.value);
  }
  return values;
}

function showTemplateFormError(message = "") {
  templateFormError.textContent = message;
  templateFormError.hidden = !message;
}

function updateTemplatePromptPreview() {
  if (!templateFormTemplate) return null;
  let values;
  try {
    values = readTemplateFormValues();
  } catch (error) {
    showTemplateFormError(error instanceof Error ? error.message : String(error));
    templatePromptPreview.textContent = "";
    return null;
  }
  templateFormValues = values;
  const result = promptTemplateUtils.renderPromptTemplate(templateFormTemplate, values);
  if (!result.ok) {
    showTemplateFormError(formatTemplateErrors(result.errors));
    templatePromptPreview.textContent = "";
    return result;
  }
  showTemplateFormError("");
  templatePromptPreview.textContent = result.prompt;
  return result;
}

function createTemplateField(name, definition, value) {
  const wrapper = document.createElement("label");
  wrapper.className = "template-form-field";
  const title = document.createElement("span");
  title.className = "template-form-label";
  title.textContent = `${definition.title || name}${definition.required ? "" : ""}`;
  const description = document.createElement("small");
  description.textContent = definition.description || name;
  wrapper.append(title, description);

  let control;
  if (Array.isArray(definition.enum)) {
    control = document.createElement("select");
    for (const optionValue of definition.enum) {
      const option = document.createElement("option");
      option.value = String(optionValue);
      option.textContent = String(optionValue);
      option.selected = sameValue(optionValue, value);
      control.append(option);
    }
  } else if (definition.type === "boolean") {
    control = document.createElement("select");
    for (const optionValue of [true, false]) {
      const option = document.createElement("option");
      option.value = String(optionValue);
      option.textContent = optionValue ? "是" : "否";
      option.selected = optionValue === value;
      control.append(option);
    }
  } else if (definition.type === "array" || definition.type === "object" || String(value).includes("\n") || name.toLowerCase().includes("code") || name.toLowerCase().includes("text")) {
    control = document.createElement("textarea");
    control.rows = definition.type === "array" || definition.type === "object" ? 4 : 6;
    control.value = definition.type === "array" || definition.type === "object"
      ? JSON.stringify(value, null, 2)
      : String(value ?? "");
  } else {
    control = document.createElement("input");
    control.type = definition.type === "number" || definition.type === "integer" ? "number" : "text";
    control.value = String(value ?? "");
  }
  control.name = name;
  control.dataset.templateField = "true";
  control.dataset.templateDefinition = JSON.stringify(definition);
  control.addEventListener("input", updateTemplatePromptPreview);
  control.addEventListener("change", updateTemplatePromptPreview);
  wrapper.append(control);
  return wrapper;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function renderTemplateForm() {
  templateFormFields.replaceChildren();
  const schema = templateFormTemplate?.inputSchema || { type: "object", properties: {} };
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  for (const [name, definition] of Object.entries(schemaProperties(schema))) {
    const fieldDefinition = { ...definition, required: required.has(name) };
    templateFormFields.append(createTemplateField(name, fieldDefinition, templateFormValues[name]));
  }
  if (!Object.keys(schemaProperties(schema)).length) {
    const empty = document.createElement("div");
    empty.className = "template-form-empty";
    empty.textContent = "此模板不需要额外输入。";
    templateFormFields.append(empty);
  }
  updateTemplatePromptPreview();
}

function openTemplateForm(template) {
  templateFormTemplate = template;
  templateFormValues = getTemplateInputDefaults(template.inputSchema);
  templateFormTitle.textContent = template.name;
  templateFormDescription.textContent = `${templateCategoryName(template.categoryId)} · ${template.description}`;
  showTemplateFormError("");
  renderTemplateForm();
  if (typeof templateFormDialog.showModal === "function") templateFormDialog.showModal();
  else templateFormDialog.setAttribute("open", "true");
}

function closeTemplateForm() {
  if (typeof templateFormDialog.close === "function" && templateFormDialog.open) templateFormDialog.close();
  else templateFormDialog.removeAttribute("open");
  templateFormTemplate = null;
  templateFormValues = {};
}

async function applyTemplateForm(runImmediately = false) {
  const result = updateTemplatePromptPreview();
  if (!result?.ok) return;
  activeTemplate = templateFormTemplate;
  applyingTemplatePrompt = true;
  promptInput.value = result.prompt;
  applyingTemplatePrompt = false;
  await storage.set({ draftPrompt: promptInput.value });
  autosizeComposer();
  updateMeta();
  showError("");
  closeTemplateForm();
  dispatchStatus.textContent = `${activeTemplate.name} 已填入 · Compare 可按需收集并校验 JSON`;
  if (runImmediately) await dispatchPrompt();
}

function renderSessions() {
  sessionList.replaceChildren();
  if (!sessionEntries.length) {
    sessionList.innerHTML = '<div class="prompt-empty">还没有保存的 Session</div>';
    notifyWorkspaceShell();
    return;
  }

  for (const entry of sessionEntries) {
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
    content.className = "prompt-card-content session-card-content";
    const providerNames = entry.selectedProviders.map(providerName).join(" · ");
    content.textContent = `${providerNames || "未选择模型"}\n${entry.prompt}`;

    const actions = document.createElement("div");
    actions.className = "prompt-card-actions";
    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "加载";
    loadButton.addEventListener("click", () => loadSession(entry));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", () => deleteSession(entry.id));
    actions.append(loadButton, deleteButton);

    card.append(header, content, actions);
    sessionList.append(card);
  }
  notifyWorkspaceShell();
}

async function loadSessions() {
  const data = await storage.get(SESSION_KEY);
  sessionEntries = Array.isArray(data[SESSION_KEY])
    ? data[SESSION_KEY].filter((entry) => (
      entry
      && typeof entry.id === "string"
      && typeof entry.prompt === "string"
      && entry.prompt.trim()
      && Array.isArray(entry.selectedProviders)
    )).map((entry) => ({
      ...entry,
      title: typeof entry.title === "string" && entry.title.trim() ? entry.title : promptTitleFromContent(entry.prompt),
      prompt: entry.prompt.trim(),
      selectedProviders: entry.selectedProviders.filter((id) => providerById(id))
    })).filter((entry) => entry.selectedProviders.length).slice(0, MAX_SESSIONS)
    : [];
  renderSessions();
}

function openSessionDrawer() {
  closeCompareDrawer();
  closePromptLibraryDrawer();
  closeTemplateLibraryDrawer();
  sessionDrawer.dataset.open = "true";
  sessionDrawer.setAttribute("aria-hidden", "false");
  loadSessions().catch((error) => {
    sessionStatus.textContent = error instanceof Error ? error.message : String(error);
  });
}

function closeSessionDrawer() {
  sessionDrawer.dataset.open = "false";
  sessionDrawer.setAttribute("aria-hidden", "true");
}

async function saveCurrentSession() {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    sessionStatus.textContent = "当前没有可保存的 Prompt";
    return;
  }
  if (!selected.size) {
    sessionStatus.textContent = "至少选择一个模型后才能保存 Session";
    return;
  }

  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    title: sessionTitleInput.value.trim() || promptTitleFromContent(prompt),
    prompt,
    selectedProviders: PROVIDERS.map((provider) => provider.id).filter((id) => selected.has(id)),
    workspaceLayout: currentLayout,
    createdAt: now,
    updatedAt: now
  };
  sessionEntries = [entry, ...sessionEntries].slice(0, MAX_SESSIONS);
  await storage.set({ [SESSION_KEY]: sessionEntries });
  sessionTitleInput.value = "";
  renderSessions();
  sessionStatus.textContent = "Session 已保存；回答不会随 Session 保存";
}

async function deleteSession(id) {
  sessionEntries = sessionEntries.filter((entry) => entry.id !== id);
  await storage.set({ [SESSION_KEY]: sessionEntries });
  renderSessions();
  sessionStatus.textContent = "Session 已删除";
}

async function loadSession(entry) {
  const providerIds = entry.selectedProviders.filter((id) => providerById(id));
  if (!providerIds.length) {
    sessionStatus.textContent = "Session 没有可用的模型选择";
    return;
  }

  selected = new Set(providerIds);
  activeTemplate = null;
  promptInput.value = entry.prompt;
  currentLayout = ["auto", "1", "2", "3"].includes(entry.workspaceLayout) ? entry.workspaceLayout : "auto";
  responseBundles.clear();
  await storage.set({
    draftPrompt: promptInput.value,
    selectedProviders: providerIds,
    workspaceLayout: currentLayout
  });
  renderProviderBar();
  renderPanels();
  renderResponses();
  panelGrid.dataset.layout = currentLayout;
  document.querySelectorAll(".layout-switch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.layout === currentLayout);
  });
  autosizeComposer();
  updateMeta();
  dispatchStatus.textContent = "Session 已恢复 · Compare 可重新收集回答";
  showError(runtimeUpgradeWarning);
  closeSessionDrawer();
}

async function saveCurrentPrompt(titleOverride) {
  const content = promptInput.value.trim();
  if (!content) {
    promptLibraryStatus.textContent = "当前没有可保存的 Prompt";
    return promptLibraryStatus.textContent;
  }

  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    title: (typeof titleOverride === "string" ? titleOverride.trim() : promptTitleInput.value.trim()) || promptTitleFromContent(content),
    content,
    createdAt: now,
    updatedAt: now
  };
  promptLibraryEntries = [entry, ...promptLibraryEntries].slice(0, 50);
  await storage.set({ [PROMPT_LIBRARY_KEY]: promptLibraryEntries });
  promptTitleInput.value = "";
  renderPromptLibrary();
  promptLibraryStatus.textContent = "Prompt 已保存";
  return promptLibraryStatus.textContent;
}

async function deletePrompt(id) {
  promptLibraryEntries = promptLibraryEntries.filter((entry) => entry.id !== id);
  await storage.set({ [PROMPT_LIBRARY_KEY]: promptLibraryEntries });
  renderPromptLibrary();
  promptLibraryStatus.textContent = "Prompt 已删除";
  return promptLibraryStatus.textContent;
}

function usePrompt(entry) {
  activeTemplate = null;
  promptInput.value = entry.content;
  storage.set({ draftPrompt: promptInput.value }).catch(() => {});
  autosizeComposer();
  updateMeta();
  showError("");
  closePromptLibraryDrawer();
  return "Prompt 已填入编辑器";
}

function buildComparisonMarkdown() {
  const providers = PROVIDERS.filter((provider) => selected.has(provider.id));
  return workspaceUtils.buildComparisonMarkdown(promptInput.value.trim(), providers, responseBundles);
}

function buildComparisonJson() {
  const providers = PROVIDERS.filter((provider) => selected.has(provider.id));
  return workspaceUtils.buildComparisonJson(promptInput.value.trim(), providers, responseBundles);
}

async function copyValue(value) {
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
}

async function copyText(value, successMessage) {
  await copyValue(value);
  setCompareStatus(successMessage);
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
  setCompareStatus("Markdown 已下载");
}

function buildHandoffPrompt() {
  const providers = PROVIDERS.filter((provider) => selected.has(provider.id));
  return workspaceUtils.buildHandoffPrompt(promptInput.value.trim(), providers, responseBundles);
}

function hasSuccessfulResponseSnapshot() {
  return [...selected].some((providerId) => {
    const result = responseBundles.get(providerId);
    const content = result?.response?.content || result?.response?.markdown;
    return result?.ok === true && typeof content === "string" && content.trim().length > 0;
  });
}

async function sendToAgent() {
  if (!selected.size) {
    setCompareStatus("至少选择一个模型");
    return;
  }
  if (!hasSuccessfulResponseSnapshot()) {
    setCompareStatus("请先点击 Compare 收集至少一个回答");
    return;
  }

  const target = handoffTarget.value;
  if (!selected.has(target)) {
    selected.add(target);
    await storage.set({ selectedProviders: [...selected] });
    renderProviderBar();
    renderPanels();
    updateMeta();
    setCompareStatus(`正在打开 ${providerName(target)}…`);
  }

  sendAgentBtn.disabled = true;
  setCompareStatus(`正在发送上下文到 ${providerName(target)}…`);
  try {
    const result = await sendPromptToProvider(target, buildHandoffPrompt());
    setCompareStatus(result.ok
      ? `上下文已发送到 ${providerName(target)}`
      : result.error || "Agent handoff 失败");
  } finally {
    sendAgentBtn.disabled = false;
  }
}

async function runPendingLaunch(pending) {
  if (pendingLaunchRunning || !contractRuntime.isPendingLaunch(pending)) return false;
  const providerIds = Array.isArray(pending.providerIds)
    ? pending.providerIds.filter((id) => providerById(id))
    : [];
  if (!providerIds.length) return false;

  pendingLaunchRunning = true;
  try {
    selected = new Set(providerIds);
    activeTemplate = null;
    promptInput.value = pending.prompt;
    await storage.set({
      draftPrompt: promptInput.value,
      selectedProviders: providerIds
    });
    await storage.remove("pendingLaunch");
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
  if (!applyingTemplatePrompt) activeTemplate = null;
  storage.set({ draftPrompt: promptInput.value }).catch(() => {});
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
sessionBtn.addEventListener("click", openSessionDrawer);
closeSessionBtn.addEventListener("click", closeSessionDrawer);
saveSessionBtn.addEventListener("click", () => saveCurrentSession().catch((error) => {
  sessionStatus.textContent = error instanceof Error ? error.message : String(error);
}));
promptLibraryBtn.addEventListener("click", openPromptLibraryDrawer);
closePromptLibraryBtn.addEventListener("click", closePromptLibraryDrawer);
savePromptBtn.addEventListener("click", () => saveCurrentPrompt().catch((error) => {
  promptLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
}));
window.addEventListener("ai-parallel:workspace-prompt-action", (event) => {
  const detail = event instanceof CustomEvent ? event.detail : null;
  if (!detail || typeof detail !== "object" || typeof detail.type !== "string") return;

  let operation;
  if (detail.type === "save") {
    operation = saveCurrentPrompt(typeof detail.title === "string" ? detail.title : "");
  } else if (detail.type === "use" || detail.type === "delete") {
    if (typeof detail.id !== "string" || !detail.id.trim()) return;
    const entry = promptLibraryEntries.find((candidate) => candidate.id === detail.id);
    if (!entry) {
      window.dispatchEvent(new CustomEvent("ai-parallel:workspace-prompt-action-result", {
        detail: { ok: false, error: "Prompt 不存在或已被删除" }
      }));
      return;
    }
    operation = detail.type === "use" ? usePrompt(entry) : deletePrompt(entry.id);
  } else {
    return;
  }

  Promise.resolve(operation).then((message) => {
    window.dispatchEvent(new CustomEvent("ai-parallel:workspace-prompt-action-result", {
      detail: { ok: true, message: typeof message === "string" ? message : "Prompt 操作已完成" }
    }));
  }).catch((error) => {
    window.dispatchEvent(new CustomEvent("ai-parallel:workspace-prompt-action-result", {
      detail: { ok: false, error: error instanceof Error ? error.message : String(error) }
    }));
  });
});
templateLibraryBtn.addEventListener("click", openTemplateLibraryDrawer);
closeTemplateLibraryBtn.addEventListener("click", closeTemplateLibraryDrawer);
templateCategorySelect.addEventListener("change", renderTemplateLibrary);
templateSearchInput.addEventListener("input", renderTemplateLibrary);
importTemplateBtn.addEventListener("click", () => templateImportInput.click());
templateImportInput.addEventListener("change", async () => {
  const file = templateImportInput.files?.[0];
  templateImportInput.value = "";
  if (!file) return;
  try {
    await importTemplateText(await file.text(), "file");
  } catch (error) {
    templateLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});
copyTemplateSchemaBtn.addEventListener("click", async () => {
  try {
    await copyValue(promptTemplateUtils.buildTemplateGenerationPrompt());
    templateLibraryStatus.textContent = "模板生成规范已复制，可粘贴给其他模型";
  } catch (error) {
    templateLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});
exportTemplatesBtn.addEventListener("click", () => {
  downloadJson(promptTemplateUtils.toPackage(allPromptTemplates()), `ai-parallel-prompt-templates-${new Date().toISOString().slice(0, 10)}.json`);
  templateLibraryStatus.textContent = "模板包已导出";
});
closeTemplateFormBtn.addEventListener("click", closeTemplateForm);
insertTemplateBtn.addEventListener("click", () => applyTemplateForm(false).catch((error) => showTemplateFormError(error instanceof Error ? error.message : String(error))));
runTemplateBtn.addEventListener("click", () => applyTemplateForm(true).catch((error) => showTemplateFormError(error instanceof Error ? error.message : String(error))));
templateForm.addEventListener("submit", (event) => event.preventDefault());
templateFormDialog.addEventListener("cancel", () => closeTemplateForm());

window.addEventListener("ai-parallel:workspace-set-selection", (event) => {
  const detail = event instanceof CustomEvent ? event.detail : null;
  if (!Array.isArray(detail?.providerIds)) return;
  const providerIds = detail.providerIds.filter((id) => providerById(id));
  selected = new Set(providerIds);
  for (const providerId of PROVIDERS.map((provider) => provider.id)) {
    if (!selected.has(providerId)) responseBundles.delete(providerId);
  }
  storage.set({ selectedProviders: providerIds }).catch(() => {});
  renderProviderBar();
  renderPanels();
  renderResponses();
  updateMeta();
});

compareBtn.addEventListener("click", openCompareDrawer);
closeCompareBtn.addEventListener("click", closeCompareDrawer);
copyMarkdownBtn.addEventListener("click", () => copyText(buildComparisonMarkdown(), "Markdown 已复制"));
copyJsonBtn.addEventListener("click", () => copyText(buildComparisonJson(), "JSON 已复制"));
downloadMarkdownBtn.addEventListener("click", downloadMarkdown);
sendAgentBtn.addEventListener("click", () => sendToAgent().catch((error) => {
  setCompareStatus(error instanceof Error ? error.message : String(error));
}));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!contractRuntime.isRunPendingLaunchMessage(message)) return;
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
    await storage.set({ workspaceLayout: currentLayout });
    notifyWorkspaceShell();
  });
});

async function init() {
  await ensureFramingRules();
  const data = await storage.get(["selectedProviders", "draftPrompt", "workspaceLayout", "pendingLaunch"]);
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
  loadTemplateLibrary().catch((error) => {
    templateLibraryStatus.textContent = error instanceof Error ? error.message : String(error);
  });
  loadSessions().catch((error) => {
    sessionStatus.textContent = error instanceof Error ? error.message : String(error);
  });
  autosizeComposer();
  updateMeta();
  notifyWorkspaceShell();
  if (pendingLaunch) runPendingLaunch(pendingLaunch).catch((error) => showError(error instanceof Error ? error.message : String(error)));
  setInterval(() => {
    for (const id of selected) {
      const panel = panels.get(id);
      if (panel?.dataset.ready !== "true") pingFrame(id);
    }
  }, 1200);
}

init().catch((error) => showError(error instanceof Error ? error.message : String(error)));
