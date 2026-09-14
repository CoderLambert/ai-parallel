const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");

function loadContract() {
  const context = {};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(extensionRoot, "shared", "provider-adapter-contract.js"), "utf8"),
    context,
    { filename: "shared/provider-adapter-contract.js" }
  );
  vm.runInContext(
    fs.readFileSync(path.join(extensionRoot, "shared", "provider-catalog.js"), "utf8"),
    context,
    { filename: "shared/provider-catalog.js" }
  );
  return {
    contract: context.AIParallelProviderAdapterContract,
    catalog: context.AIParallelProviderCatalog
  };
}

test("provider adapter contract exposes the required capability methods", () => {
  const { contract } = loadContract();
  assert.equal(contract.CONTRACT_VERSION, "provider-adapter-v1");
  assert.deepEqual([...contract.REQUIRED_METHODS], [
    "sendPrompt",
    "collectResponse",
    "newChat",
    "healthCheck"
  ]);
});

test("catalog adapters route every operation through the shared transport", async () => {
  const { contract, catalog } = loadContract();
  const calls = [];
  const transport = {
    request(provider, operation, payload, context) {
      calls.push({ providerId: provider.id, operation, payload, context });
      return Promise.resolve({ ok: true, operation });
    },
    healthCheck(provider, context) {
      calls.push({ providerId: provider.id, operation: "healthCheck", context });
      return Promise.resolve({ ok: true, providerId: provider.id });
    }
  };

  for (const provider of catalog) {
    const adapter = contract.createProviderAdapter({ provider, transport });
    assert.equal(adapter.id, provider.adapter);
    assert.equal(adapter.providerId, provider.id);
    assert.equal(contract.validateProviderAdapter(adapter), true);
    await adapter.sendPrompt("  hello  ", { attempt: 1 });
    await adapter.collectResponse({ attempt: 1 });
    await adapter.newChat({ attempt: 1 });
    await adapter.healthCheck({ attempt: 1 });
  }

  assert.equal(calls.length, catalog.length * 4);
  assert.equal(calls.filter(({ operation }) => operation === "AI_PARALLEL_SEND").length, catalog.length);
  assert.equal(calls.filter(({ operation }) => operation === "AI_PARALLEL_COLLECT_RESPONSE").length, catalog.length);
  assert.equal(calls.filter(({ operation }) => operation === "AI_PARALLEL_NEW_CHAT").length, catalog.length);
  assert.equal(calls.filter(({ operation }) => operation === "healthCheck").length, catalog.length);
  assert.equal(calls[0].payload.prompt, "hello");
});

test("provider adapter rejects an empty prompt without invoking transport", async () => {
  const { contract, catalog } = loadContract();
  let called = false;
  const adapter = contract.createProviderAdapter({
    provider: catalog[0],
    transport: {
      request() {
        called = true;
        return Promise.resolve({ ok: true });
      },
      healthCheck() {
        return Promise.resolve({ ok: true });
      }
    }
  });

  const result = await adapter.sendPrompt(" \n ");

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_PROMPT");
  assert.equal(called, false);
});
