(() => {
  const isTopLevel = window.top === window;
  if (!isTopLevel) {
    try {
      if (window.parent !== window.top) return;
    } catch {
      return;
    }
  }
  const MESSAGE_CONTEXT = "ai-parallel-workspace";
  const contractRuntime = globalThis.AIParallelContractRuntime;
  const adapters = globalThis.AIParallelProviderAdapters || {};
  const providerId = Object.entries(adapters)
    .find(([, adapter]) => adapter.hosts.includes(location.hostname))?.[0];
  if (!providerId) return;

  const adapter = adapters[providerId];

  async function executeCommand(message) {
    if (!contractRuntime?.isProviderCommand(message)) {
      return contractRuntime?.invalidMessage("Invalid provider command") || { ok: false, error: "Invalid provider command" };
    }
    const messageType = message.type;
    const requestId = String(message.requestId || "");
    if (!requestId) return { ok: false, error: "Missing request ID" };

    if (messageType === "AI_PARALLEL_COLLECT_RESPONSE") {
      const response = adapter.collectResponse();
      return {
        type: "AI_PARALLEL_RESPONSE_RESULT",
        requestId,
        ok: Boolean(response),
        response: response
          ? { provider: providerId, ...response, timestamp: new Date().toISOString() }
          : null,
        error: response ? "" : "尚未找到可收集的模型回答"
      };
    }

    if (messageType === "AI_PARALLEL_NEW_CHAT") {
      const ok = adapter.newChat();
      return {
        type: "AI_PARALLEL_NEW_CHAT_RESULT",
        requestId,
        ok,
        error: ok ? "" : "未找到新建对话按钮"
      };
    }

    if (messageType !== "AI_PARALLEL_SEND") return { ok: false, error: "Unknown provider command" };
    const prompt = String(message.prompt || "").trim();
    if (!prompt) return { type: "AI_PARALLEL_SEND_RESULT", requestId, ok: false, error: "Prompt 不能为空" };

    try {
      await adapter.sendPrompt(prompt);
      return { type: "AI_PARALLEL_SEND_RESULT", requestId, ok: true };
    } catch (error) {
      return {
        type: "AI_PARALLEL_SEND_RESULT",
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  if (isTopLevel) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "AI_PARALLEL_TAB_COMMAND" || message.providerId !== providerId) return false;
      if (!contractRuntime?.isProviderId(message.providerId) || !contractRuntime.isProviderCommand(message.command)) {
        sendResponse(contractRuntime?.invalidMessage("Invalid provider command") || { ok: false, error: "Invalid provider command" });
        return true;
      }
      executeCommand(message.command || {}).then(sendResponse);
      return true;
    });
    return;
  }

  const PARENT_ORIGIN = new URL(chrome.runtime.getURL("/")).origin;

  function postParent(payload) {
    window.parent.postMessage(
      { ...payload, context: MESSAGE_CONTEXT, providerId },
      PARENT_ORIGIN
    );
  }

  function announceReady() {
    postParent({ type: "AI_PARALLEL_FRAME_READY", href: location.href });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== PARENT_ORIGIN) return;
    if (!contractRuntime?.isFrameCommandMessage(event.data, providerId)) return;

    if (event.data.type === "AI_PARALLEL_PING") {
      announceReady();
      return;
    }

    if (!["AI_PARALLEL_SEND", "AI_PARALLEL_COLLECT_RESPONSE", "AI_PARALLEL_NEW_CHAT"].includes(event.data.type)) return;
    executeCommand(event.data).then(postParent);
  });

  announceReady();
})();
