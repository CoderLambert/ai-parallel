// @ts-check

/**
 * @typedef {import("../contracts/provider").ProviderDescriptor} ProviderDescriptor
 * @typedef {import("../contracts/provider").ProviderAdapter} ProviderAdapter
 * @typedef {import("../contracts/provider").ProviderRequestContext} ProviderRequestContext
 * @typedef {import("../contracts/provider").ProviderResult} ProviderResult
 * @typedef {import("../contracts/provider").ProviderResponseSnapshot} ProviderResponseSnapshot
 * @typedef {import("../contracts/provider").ProviderResult<ProviderResponseSnapshot>} ProviderSnapshotResult
 * @typedef {import("../contracts/provider").ProviderHealthResult} ProviderHealthResult
 * @typedef {import("../contracts/provider").ProviderOperation} ProviderOperation
 * @typedef {{
 *   request(provider: ProviderDescriptor, operation: ProviderOperation, payload: Record<string, unknown>, context?: ProviderRequestContext): Promise<ProviderSnapshotResult>;
 *   healthCheck(provider: ProviderDescriptor, context?: ProviderRequestContext): Promise<ProviderHealthResult>;
 * }} ProviderTransport
 */

(() => {
  const CONTRACT_VERSION = "provider-adapter-v1";
  const REQUIRED_METHODS = Object.freeze([
    "sendPrompt",
    "collectResponse",
    "newChat",
    "healthCheck"
  ]);

  /** @type {Readonly<Record<ProviderOperation, string>>} */
  const operations = Object.freeze({
    AI_PARALLEL_SEND: "sendPrompt",
    AI_PARALLEL_COLLECT_RESPONSE: "collectResponse",
    AI_PARALLEL_NEW_CHAT: "newChat"
  });

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  /** @param {unknown} transport @returns {asserts transport is ProviderTransport} */
  function assertTransport(transport) {
    if (!isRecord(transport)
      || typeof transport.request !== "function"
      || typeof transport.healthCheck !== "function") {
      throw new TypeError("Provider adapter transport must implement request and healthCheck");
    }
  }

  /**
   * @param {{ provider?: ProviderDescriptor, transport?: ProviderTransport }} [options]
   * @returns {ProviderAdapter}
   */
  function createProviderAdapter({ provider, transport } = {}) {
    if (!provider || typeof provider.id !== "string" || !provider.id) {
      throw new TypeError("Provider adapter requires provider metadata");
    }
    if (typeof provider.adapter !== "string" || !provider.adapter) {
      throw new TypeError("Provider metadata requires an adapter identifier");
    }
    assertTransport(transport);

    const adapter = {
      id: provider.adapter,
      providerId: provider.id,
      mode: provider.mode,
      capabilities: provider.capabilities,
      /** @param {string} prompt @param {ProviderRequestContext} [context] */
      async sendPrompt(prompt, context = {}) {
        const value = String(prompt || "").trim();
        if (!value) return { ok: false, error: "Prompt 不能为空", code: "INVALID_PROMPT", retryable: false };
        return transport.request(provider, "AI_PARALLEL_SEND", { prompt: value }, context);
      },
      /** @param {ProviderRequestContext} [context] */
      collectResponse(context = {}) {
        return transport.request(provider, "AI_PARALLEL_COLLECT_RESPONSE", {}, context);
      },
      /** @param {ProviderRequestContext} [context] */
      newChat(context = {}) {
        return transport.request(provider, "AI_PARALLEL_NEW_CHAT", {}, context);
      },
      /** @param {ProviderRequestContext} [context] */
      healthCheck(context = {}) {
        return transport.healthCheck(provider, context);
      }
    };

    return Object.freeze(adapter);
  }

  /** @param {unknown} adapter @returns {boolean} */
  function validateProviderAdapter(adapter) {
    return Boolean(
      isRecord(adapter)
      && typeof adapter.id === "string"
      && typeof adapter.providerId === "string"
      && REQUIRED_METHODS.every((method) => typeof adapter[method] === "function")
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
