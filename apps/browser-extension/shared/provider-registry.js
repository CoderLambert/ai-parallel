(() => {
  const REGISTRY_VERSION = "provider-registry-v1";

  function assertCatalog(catalog) {
    if (!Array.isArray(catalog) || catalog.length === 0) {
      throw new TypeError("Provider registry requires a non-empty catalog");
    }
  }

  function createProviderRegistry({ catalog, adapterContract, transport } = {}) {
    assertCatalog(catalog);
    if (!adapterContract || typeof adapterContract.createProviderAdapter !== "function" || typeof adapterContract.validateProviderAdapter !== "function") {
      throw new TypeError("Provider registry requires a Provider Adapter contract");
    }

    const providersById = new Map();
    const adaptersById = new Map();

    for (const provider of catalog) {
      if (!provider || typeof provider.id !== "string" || !provider.id) {
        throw new TypeError("Provider registry received invalid provider metadata");
      }
      if (providersById.has(provider.id)) {
        throw new Error(`Duplicate provider id: ${provider.id}`);
      }
      if (typeof provider.adapter !== "string" || !provider.adapter) {
        throw new TypeError(`Provider ${provider.id} requires an adapter identifier`);
      }
      if (adaptersById.has(provider.adapter)) {
        throw new Error(`Duplicate provider adapter id: ${provider.adapter}`);
      }

      const adapter = adapterContract.createProviderAdapter({ provider, transport });
      if (!adapterContract.validateProviderAdapter(adapter, provider)) {
        throw new Error(`Provider adapter contract invalid: ${provider.id}`);
      }

      providersById.set(provider.id, provider);
      adaptersById.set(provider.adapter, adapter);
    }

    return Object.freeze({
      version: REGISTRY_VERSION,
      size: providersById.size,
      getProvider(providerId) {
        return providersById.get(providerId);
      },
      getAdapterById(adapterId) {
        return adaptersById.get(adapterId);
      },
      getAdapterForProvider(providerId) {
        const provider = providersById.get(providerId);
        return provider ? adaptersById.get(provider.adapter) : undefined;
      },
      hasProvider(providerId) {
        return providersById.has(providerId);
      },
      listProviders() {
        return Object.freeze([...providersById.values()]);
      }
    });
  }

  globalThis.AIParallelProviderRegistry = Object.freeze({
    REGISTRY_VERSION,
    createProviderRegistry
  });
})();
