export function createResponsePayload({ providerId, text = "" }) {
  return {
    provider: providerId,
    text,
    markdown: text,
    timestamp: Date.now()
  };
}

export function postCollectedResponse(postParent, payload) {
  postParent({
    type: "AI_PARALLEL_RESPONSE_RESULT",
    response: payload
  });
}
