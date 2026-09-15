const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");

function loadRuntime(withStorage = false) {
  const store = {
    selectedProviders: ["chatgpt"],
    draftPrompt: "stored prompt"
  };
  const calls = [];
  const context = {
    console,
    chrome: {
      storage: {
        local: {
          async get(keys) {
            calls.push({ operation: "get", keys });
            const requested = keys === undefined ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.filter((key) => key in store).map((key) => [key, store[key]]));
          },
          async set(patch) {
            calls.push({ operation: "set", patch });
            Object.assign(store, patch);
          },
          async remove(keys) {
            calls.push({ operation: "remove", keys });
            for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
          }
        }
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["shared/contract-runtime.js", ...(withStorage ? ["shared/storage-contract.js"] : [])]) {
    vm.runInContext(fs.readFileSync(path.join(extensionRoot, file), "utf8"), context, { filename: file });
  }
  return { runtime: context.AIParallelContractRuntime, storage: context.AIParallelStorageContract, calls };
}

test("message contract accepts valid commands and rejects malformed boundaries", () => {
  const { runtime } = loadRuntime();
  assert.equal(runtime.isProviderCommand({
    type: "AI_PARALLEL_SEND",
    requestId: "request-1",
    prompt: "hello"
  }), true);
  assert.equal(runtime.isProviderCommand({
    type: "AI_PARALLEL_SEND",
    requestId: "request-1",
    prompt: ""
  }), false);
  assert.equal(runtime.isFrameCommandMessage({
    context: "ai-parallel-workspace",
    providerId: "grok",
    type: "AI_PARALLEL_COLLECT_RESPONSE",
    requestId: "request-2"
  }, "grok"), true);
  assert.equal(runtime.isFrameCommandMessage({
    context: "wrong-context",
    providerId: "grok",
    type: "AI_PARALLEL_COLLECT_RESPONSE",
    requestId: "request-2"
  }, "grok"), false);
});

test("service-worker and frame result contracts require provider-scoped data", () => {
  const { runtime } = loadRuntime();
  assert.equal(runtime.isServiceWorkerRequest({ type: "OPEN_WORKSPACE" }), true);
  assert.equal(runtime.isServiceWorkerRequest({
    type: "PROVIDER_TAB_COMMAND",
    providerId: "grok",
    command: { type: "AI_PARALLEL_NEW_CHAT", requestId: "request-3" }
  }), true);
  assert.equal(runtime.isServiceWorkerRequest({
    type: "OPEN_PROVIDER_AUTH",
    providerId: "grok",
    url: "javascript:alert(1)"
  }), true);
  assert.equal(runtime.isFrameToWorkspaceMessage({
    context: "ai-parallel-workspace",
    providerId: "chatgpt",
    type: "AI_PARALLEL_RESPONSE_RESULT",
    requestId: "request-4",
    ok: true,
    response: {
      provider: "chatgpt",
      content: "answer",
      markdown: "answer",
      timestamp: new Date().toISOString()
    }
  }, "chatgpt"), true);
  assert.equal(runtime.isFrameToWorkspaceMessage({
    context: "ai-parallel-workspace",
    providerId: "chatgpt",
    type: "AI_PARALLEL_RESPONSE_RESULT",
    requestId: "request-4",
    ok: true,
    response: { provider: "chatgpt", content: "answer" }
  }, "chatgpt"), false);
});

test("storage contract validates typed patches and filters invalid reads", async () => {
  const { runtime, storage, calls } = loadRuntime(true);
  assert.equal(runtime.isPendingLaunch({
    prompt: "hello",
    providerIds: ["chatgpt"],
    queuedAt: new Date().toISOString()
  }), true);
  assert.equal(runtime.isStoragePatch({ selectedProviders: ["chatgpt"], draftPrompt: "hello" }), true);
  assert.equal(runtime.isStoragePatch({ selectedProviders: ["unknown provider"] }), false);

  const localStorage = storage.createLocalStorage();
  const values = await localStorage.get(["selectedProviders", "draftPrompt"]);
  assert.deepEqual(JSON.parse(JSON.stringify(values)), {
    selectedProviders: ["chatgpt"],
    draftPrompt: "stored prompt",
    schemaVersion: 1
  });
  await localStorage.set({ workspaceLayout: "auto" });
  await localStorage.remove("draftPrompt");
  await assert.rejects(() => localStorage.set({ workspaceLayout: "invalid" }), /Invalid AI Parallel storage patch/);
  assert.deepEqual(JSON.parse(JSON.stringify(storage.migrateStorageRecord({ draftPrompt: "legacy" }))), {
    draftPrompt: "legacy",
    schemaVersion: 1
  });
  assert.deepEqual(calls.map((call) => call.operation), ["get", "set", "remove"]);
});
