(() => {
  if (window.top === window) return;
  try {
    if (window.parent !== window.top) return;
  } catch {
    return;
  }

  const MESSAGE_CONTEXT = "ai-parallel-workspace";
  const PARENT_ORIGIN = new URL(chrome.runtime.getURL("/")).origin;
  const adapters = globalThis.AIParallelProviderAdapters || {};
  const providerId = Object.entries(adapters)
    .find(([, adapter]) => adapter.hosts.includes(location.hostname))?.[0];
  if (!providerId) return;

  const adapter = adapters[providerId];

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
    if (!event.data || event.data.context !== MESSAGE_CONTEXT) return;
    if (event.data.providerId !== providerId) return;

    if (event.data.type === "AI_PARALLEL_PING") {
      announceReady();
      return;
    }

    const messageType = event.data.type;
    if (!["AI_PARALLEL_SEND", "AI_PARALLEL_COLLECT_RESPONSE", "AI_PARALLEL_NEW_CHAT"].includes(messageType)) return;
    const requestId = String(event.data.requestId || "");
    if (!requestId) return;

    if (messageType === "AI_PARALLEL_COLLECT_RESPONSE") {
      const response = adapter.collectResponse();
      postParent({
        type: "AI_PARALLEL_RESPONSE_RESULT",
        requestId,
        ok: Boolean(response),
        response: response
          ? { provider: providerId, ...response, timestamp: new Date().toISOString() }
          : null,
        error: response ? "" : "尚未找到可收集的模型回答"
      });
      return;
    }

    if (messageType === "AI_PARALLEL_NEW_CHAT") {
      const ok = adapter.newChat();
      postParent({
        type: "AI_PARALLEL_NEW_CHAT_RESULT",
        requestId,
        ok,
        error: ok ? "" : "未找到新建对话按钮"
      });
      return;
    }

    const prompt = String(event.data.prompt || "").trim();

    if (!prompt) {
      postParent({ type: "AI_PARALLEL_SEND_RESULT", requestId, ok: false, error: "Prompt 不能为空" });
      return;
    }

    adapter.sendPrompt(prompt)
      .then(() => postParent({ type: "AI_PARALLEL_SEND_RESULT", requestId, ok: true }))
      .catch((error) => postParent({
        type: "AI_PARALLEL_SEND_RESULT",
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }));
  });

  announceReady();
})();
