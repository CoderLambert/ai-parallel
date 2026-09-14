(() => {
  const RESPONSE_PROTOCOL = {
    REQUEST: "AI_PARALLEL_COLLECT_RESPONSE",
    RESULT: "AI_PARALLEL_RESPONSE_RESULT"
  };

  function createResponsePayload({ provider, text = "", markdown = null }) {
    return {
      provider,
      text: String(text || "").trim(),
      markdown: markdown || String(text || "").trim(),
      timestamp: Date.now()
    };
  }

  function postResponse(parent, payload) {
    parent.postMessage({
      type: RESPONSE_PROTOCOL.RESULT,
      response: payload
    }, "*");
  }

  window.AI_PARALLEL_RESPONSE_PROTOCOL = RESPONSE_PROTOCOL;
  window.AI_PARALLEL_CREATE_RESPONSE = createResponsePayload;
  window.AI_PARALLEL_POST_RESPONSE = postResponse;
})();
