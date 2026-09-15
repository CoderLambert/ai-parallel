const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");

function loadProviderRuntime() {
  const context = {};
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["provider-adapter-contract.js", "provider-catalog.js", "provider-registry.js"]) {
    vm.runInContext(
      fs.readFileSync(path.join(extensionRoot, "shared", file), "utf8"),
      context,
      { filename: `shared/${file}` }
    );
  }
  return context;
}

function createTransport() {
  return {
    request(provider, operation) {
      return Promise.resolve({ ok: true, providerId: provider.id, operation });
    },
    healthCheck(provider) {
      return Promise.resolve({ ok: true, providerId: provider.id });
    }
  };
}

test("provider registry binds every catalog provider to one validated adapter", () => {
  const context = loadProviderRuntime();
  const registry = context.AIParallelProviderRegistry.createProviderRegistry({
    catalog: context.AIParallelProviderCatalog,
    adapterContract: context.AIParallelProviderAdapterContract,
    transport: createTransport()
  });

  assert.equal(registry.version, "provider-registry-v1");
  assert.equal(registry.size, context.AIParallelProviderCatalog.length);
  for (const provider of context.AIParallelProviderCatalog) {
    assert.equal(registry.getProvider(provider.id), provider);
    const adapter = registry.getAdapterForProvider(provider.id);
    assert.equal(adapter.id, provider.adapter);
    assert.equal(adapter.providerId, provider.id);
    assert.equal(adapter.contractVersion, provider.adapterContract);
    assert.equal(registry.getAdapterById(provider.adapter), adapter);
  }
});

test("provider registry fails closed on duplicate provider or adapter identities", () => {
  const context = loadProviderRuntime();
  const base = context.AIParallelProviderCatalog[0];
  const duplicateProviderId = Object.freeze({ ...context.AIParallelProviderCatalog[1], id: base.id });
  const duplicateAdapterId = Object.freeze({ ...context.AIParallelProviderCatalog[1], adapter: base.adapter });

  assert.throws(() => context.AIParallelProviderRegistry.createProviderRegistry({
    catalog: [base, duplicateProviderId],
    adapterContract: context.AIParallelProviderAdapterContract,
    transport: createTransport()
  }), /Duplicate provider id/);

  assert.throws(() => context.AIParallelProviderRegistry.createProviderRegistry({
    catalog: [base, duplicateAdapterId],
    adapterContract: context.AIParallelProviderAdapterContract,
    transport: createTransport()
  }), /Duplicate provider adapter id/);
});

test("provider adapter contract rejects catalog contract drift", () => {
  const context = loadProviderRuntime();
  const provider = Object.freeze({
    ...context.AIParallelProviderCatalog[0],
    adapterContract: "provider-adapter-v2"
  });

  assert.throws(() => context.AIParallelProviderAdapterContract.createProviderAdapter({
    provider,
    transport: createTransport()
  }), /requires adapter contract provider-adapter-v1/);
});

test("provider registry lookup is read-only and returns no fallback for unknown identities", () => {
  const context = loadProviderRuntime();
  const registry = context.AIParallelProviderRegistry.createProviderRegistry({
    catalog: context.AIParallelProviderCatalog,
    adapterContract: context.AIParallelProviderAdapterContract,
    transport: createTransport()
  });

  assert.equal(registry.hasProvider("missing"), false);
  assert.equal(registry.getProvider("missing"), undefined);
  assert.equal(registry.getAdapterForProvider("missing"), undefined);
  assert.equal(registry.getAdapterById("missing"), undefined);
  assert.equal(Object.isFrozen(registry.listProviders()), true);
});
