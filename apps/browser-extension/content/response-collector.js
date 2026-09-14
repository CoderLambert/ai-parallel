export const COLLECT_MESSAGE = "AI_PARALLEL_COLLECT_RESPONSE";
export const RESPONSE_MESSAGE = "AI_PARALLEL_RESPONSE_RESULT";

export function createResponsePayload({ providerId, text = "" }) {
  return {
    type: RESPONSE_MESSAGE,
    providerId,
    response: {
      provider: providerId,
      text,
      markdown: text,
      timestamp: Date.now()
    }
  };
}
