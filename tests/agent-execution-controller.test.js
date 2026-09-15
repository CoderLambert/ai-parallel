const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");

function loadController() {
  const context = { console, setTimeout, clearTimeout, AbortController };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [
    "shared/provider-task-runtime.js",
    "shared/provider-adapter-contract.js",
    "shared/agent-execution-controller.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(extensionRoot, file), "utf8"), context, { filename: file });
  }
  return context;
}

function createAdapter(providerId, sendPrompt, { retry = false } = {}) {
  return {
    id: providerId,
    providerId,
    capabilities: { retry },
    sendPrompt,
    collectResponse() { return Promise.resolve({ ok: true }); },
    newChat() { return Promise.resolve({ ok: true }); },
    healthCheck() { return Promise.resolve({ ok: true }); }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("agent execution runs through provider runtime with bounded parallelism", async () => {
  const context = loadController();
  const runtime = context.AIParallelProviderTaskRuntime.createProviderTaskRuntime({
    defaultTimeoutMs: 1000,
    idFactory: (() => {
      let sequence = 0;
      return () => `provider-task-${++sequence}`;
    })()
  });
  let active = 0;
  let maxActive = 0;
  const calls = [];
  const adapters = {};
  for (const providerId of ["chatgpt", "claude", "gemini", "grok"]) {
    adapters[providerId] = createAdapter(providerId, (prompt, adapterContext) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      calls.push({ providerId, prompt, context: adapterContext });
      return new Promise((resolve) => setTimeout(() => {
        active -= 1;
        resolve({ ok: true, response: { content: `${providerId} result` } });
      }, 8));
    });
  }

  const controller = context.AIParallelAgentExecutionController.createAgentExecutionController({
    taskRuntime: runtime,
    adapters,
    maxConcurrency: 2,
    maxAgents: 8,
    idFactory: () => "execution-1"
  });
  const events = [];
  controller.subscribe((snapshot) => events.push(snapshot.status));

  const promise = controller.run({
    taskId: "research-task",
    prompt: "Compare the current approaches and identify the strongest result.",
    scope: { id: "research-scope", label: "bounded research" },
    agents: [
      { providerId: "chatgpt", role: "planner" },
      { providerId: "claude", role: "executor" },
      { providerId: "gemini", role: "executor" },
      { providerId: "grok", role: "reviewer" }
    ]
  });
  const result = await promise;

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.ok, true);
  assert.equal(result.strategy, "parallel");
  assert.equal(result.scope.id, "research-scope");
  assert.equal(result.maxConcurrency, 2);
  assert.equal(result.agents.length, 4);
  assert.ok(result.agents.every((agent) => agent.status === "SUCCESS"));
  assert.equal(result.responses.length, 4);
  assert.equal("prompt" in result, false);
  assert.equal(maxActive, 2);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ prompt }) => prompt.includes("Compare the current approaches")));
  assert.ok(calls.every(({ context: adapterContext }) => adapterContext.executionId === "research-task"));
  assert.ok(calls.every(({ context: adapterContext }) => adapterContext.scopeId === "research-scope"));
  assert.deepEqual(
    [...runtime.listTasks().map((task) => task.operation)].sort(),
    ["agent-executor", "agent-executor", "agent-planner", "agent-reviewer"]
  );
  assert.deepEqual(events.slice(0, 3), ["IDLE", "QUEUED", "RUNNING"]);
  assert.equal(events.at(-1), "SUCCESS");
});

test("one agent failure is isolated and produces a partial aggregate", async () => {
  const context = loadController();
  const runtime = context.AIParallelProviderTaskRuntime.createProviderTaskRuntime({
    defaultTimeoutMs: 1000,
    idFactory: (() => {
      let sequence = 0;
      return () => `provider-task-${++sequence}`;
    })()
  });
  const calls = [];
  const adapters = {
    chatgpt: createAdapter("chatgpt", () => Promise.resolve({
      ok: true,
      response: { content: "planned" }
    })),
    claude: createAdapter("claude", () => {
      calls.push("failed");
      return Promise.resolve({ ok: false, error: "provider unavailable", code: "UNAVAILABLE" });
    }),
    gemini: createAdapter("gemini", () => {
      calls.push("continued");
      return Promise.resolve({ ok: true, response: { content: "reviewed" } });
    })
  };
  const controller = context.AIParallelAgentExecutionController.createAgentExecutionController({
    taskRuntime: runtime,
    adapters,
    maxConcurrency: 1,
    idFactory: () => "execution-2"
  });

  const result = await controller.run({
    prompt: "Run each bounded role independently.",
    agents: [
      { providerId: "chatgpt", role: "planner" },
      { providerId: "claude", role: "executor" },
      { providerId: "gemini", role: "reviewer" }
    ]
  });

  assert.equal(result.status, "PARTIAL");
  assert.equal(result.agents.filter((agent) => agent.status === "SUCCESS").length, 2);
  assert.equal(result.agents.find((agent) => agent.providerId === "claude").status, "FAILED");
  assert.equal(result.agents.find((agent) => agent.providerId === "claude").error.message, "provider unavailable");
  assert.equal(result.responses.length, 2);
  assert.equal("prompt" in result, false);
  assert.deepEqual(calls, ["failed", "continued"]);
  assert.equal(runtime.listTasks({ includeFinished: false }).length, 0);
});

test("cancelling an execution cancels active and queued agents", async () => {
  const context = loadController();
  const runtime = context.AIParallelProviderTaskRuntime.createProviderTaskRuntime({
    defaultTimeoutMs: 1000,
    idFactory: () => "provider-task-cancel"
  });
  let providerStarted;
  const providerStartedPromise = new Promise((resolve) => { providerStarted = resolve; });
  const adapters = {
    chatgpt: createAdapter("chatgpt", (_prompt, { signal }) => new Promise((resolve) => {
      providerStarted();
      signal.addEventListener("abort", () => resolve({
        ok: false,
        error: "cancelled",
        code: "TASK_CANCELLED"
      }), { once: true });
    })),
    claude: createAdapter("claude", () => Promise.resolve({ ok: true }))
  };
  const controller = context.AIParallelAgentExecutionController.createAgentExecutionController({
    taskRuntime: runtime,
    adapters,
    maxConcurrency: 1,
    idFactory: () => "execution-3"
  });
  const promise = controller.run({
    prompt: "This execution should be cancelled.",
    agents: [
      { providerId: "chatgpt", role: "planner" },
      { providerId: "claude", role: "reviewer" }
    ]
  });

  await providerStartedPromise;
  assert.equal(promise.cancel("user stopped the run"), true);
  const result = await promise;

  assert.equal(result.status, "CANCELLED");
  assert.equal(result.error, "user stopped the run");
  assert.ok(result.agents.every((agent) => agent.status === "CANCELLED"));
  assert.equal(controller.cancel("execution-3"), false);
  await delay(0);
});

test("agent scope validation enforces bounded roles and agent count", () => {
  const context = loadController();
  const runtime = context.AIParallelProviderTaskRuntime.createProviderTaskRuntime();
  const adapter = createAdapter("chatgpt", () => Promise.resolve({ ok: true }));
  const controller = context.AIParallelAgentExecutionController.createAgentExecutionController({
    taskRuntime: runtime,
    adapters: { chatgpt: adapter },
    maxAgents: 2
  });

  assert.throws(() => controller.createExecution({
    prompt: "x",
    agents: [{ providerId: "chatgpt", role: "scheduler" }]
  }), /planner, executor, or reviewer/);
  assert.throws(() => controller.createExecution({
    prompt: "x",
    agents: [
      { providerId: "chatgpt", role: "planner" },
      { providerId: "chatgpt", role: "executor" },
      { providerId: "chatgpt", role: "reviewer" }
    ]
  }), /limited to 2 agents/);
  assert.throws(() => controller.createExecution({
    strategy: "sequential",
    prompt: "x",
    agents: [{ providerId: "chatgpt", role: "planner" }]
  }), /parallel/);
});
