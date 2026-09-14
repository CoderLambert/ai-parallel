const pendingCollections = new Map();

export function collectFromProviders({ providers, postToFrame }) {
  const requestId = crypto.randomUUID();

  const promise = Promise.all(
    providers.map((providerId) => new Promise((resolve) => {
      pendingCollections.set(`${requestId}:${providerId}`, resolve);
      postToFrame(providerId, {
        type: "AI_PARALLEL_COLLECT_RESPONSE",
        requestId
      });
    }))
  );

  return promise;
}

export function resolveCollectedResponse(message) {
  const key = `${message.requestId}:${message.providerId}`;
  const resolve = pendingCollections.get(key);
  if (!resolve) return false;
  pendingCollections.delete(key);
  resolve(message.response || null);
  return true;
}
