(() => {
  const CONTRACT_VERSION = "provider-adapter-v1";
  const REQUIRED_METHODS = Object.freeze([
    "sendPrompt",
    "collectResponse",
    "newChat",
    "healthCheck"
  ]);

  const operations = Object.freeze({
    AI_PARALLEL_SEND: "sendPrompt",
    AI_PARALLEL_COLLECT_RESPONSE: "collectResponse",
    AI_PARALLEL_NEW_CHAT: "newChat"
  });

  function assertTransport(transport) {
    if (!transport || typeof transport.request !== "function" || typeof transport.healthCheck !== "function") {
      throw new TypeError("Provider adapter transport must implement request and healthCheck");
    }
  }

  function assertProvider(provider) {
    if (!provider || typeof provider.id !== "string" || !provider.id) {
      throw new TypeError("Provider adapter requires provider metadata");
    }
    if (typeof provider.adapter !== "string" || !provider.adapter) {
      throw new TypeError("Provider metadata requires an adapter identifier");
    }
    if (provider.adapterContract !== CONTRACT_VERSION) {
      throw new TypeError(`Provider ${provider.id} requires adapter contract ${CONTRACT_VERSION}`);
    }
    if (!provider.capabilities || typeof provider.capabilities !== "object") {
      throw new TypeError(`Provider ${provider.id} requires capability metadata`);
    }
  }

  function createProviderAdapter({ provider, transport } = {}) {
    assertProvider(provider);
    assertTransport(transport);

    const adapter = {
      id: provider.adapter,
      providerId: provider.id,
      contractVersion: CONTRACT_VERSION,
      mode: provider.mode,
      capabilities: provider.capabilities,
      async sendPrompt(prompt, context = {}) {
        const value = String(prompt || "").trim();
        if (!value) return { ok: false, error: "Prompt 不能为空", code: "INVALID_PROMPT", retryable: false };
        return transport.request(provider, "AI_PARALLEL_SEND", { prompt: value }, context);
      },
      collectResponse(context = {}) {
        return transport.request(provider, "AI_PARALLEL_COLLECT_RESPONSE", {}, context);
      },
      newChat(context = {}) {
        return transport.request(provider, "AI_PARALLEL_NEW_CHAT", {}, context);
      },
      healthCheck(context = {}) {
        return transport.healthCheck(provider, context);
      }
    };

    return Object.freeze(adapter);
  }

  function validateProviderAdapter(adapter, provider) {
    const validShape = Boolean(
      adapter
      && typeof adapter.id === "string"
      && typeof adapter.providerId === "string"
      && adapter.contractVersion === CONTRACT_VERSION
      && REQUIRED_METHODS.every((method) => typeof adapter[method] === "function")
    );
    if (!validShape || !provider) return validShape;
    return Boolean(
      adapter.id === provider.adapter
      && adapter.providerId === provider.id
      && provider.adapterContract === CONTRACT_VERSION
      && adapter.mode === provider.mode
      && adapter.capabilities === provider.capabilities
    );
  }

  globalThis.AIParallelProviderAdapterContract = Object.freeze({
    CONTRACT_VERSION,
    REQUIRED_METHODS,
    operations,
    createProviderAdapter,
    validateProviderAdapter
  });
})();
