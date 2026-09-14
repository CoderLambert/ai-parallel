const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const file = path.join(
  __dirname,
  "..",
  "apps",
  "browser-extension",
  "shared",
  "provider-task-runtime.js"
);

function loadRuntime() {
  const context = { console, setTimeout, clearTimeout, AbortController, Date };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context.AIParallelProviderTaskRuntime;
}

function createRuntime(api, options = {}) {
  let sequence = 0;
  return new api.ProviderTaskRuntime({
    idFactory: () => `task-${++sequence}`,
    ...options
  });
}

test("provider tasks expose the complete lifecycle and response", async () => {
  const api = loadRuntime();
  const runtime = createRuntime(api);
  const states = [];
  runtime.subscribe((task) => states.push(task.status));

  const task = runtime.createTask({
    providerId: "chatgpt",
    operation: "AI_PARALLEL_SEND",
    execute: async () => ({ ok: true, response: "sent" })
  });

  assert.equal(task.status, api.STATUS.IDLE);
  const result = await task.run();

  assert.deepEqual(result, { ok: true, response: "sent" });
  assert.deepEqual(states, ["IDLE", "QUEUED", "RUNNING", "SUCCESS"]);
  assert.equal(task.status, api.STATUS.SUCCESS);
  assert.equal(task.attempt, 1);
  assert.equal(task.error, null);
  assert.equal(runtime.getTask(task.id).response.response, "sent");
});

test("retry is bounded and records the retry reason", async () => {
  const api = loadRuntime();
  const runtime = createRuntime(api);
  let attempts = 0;

  const task = runtime.createTask({
    providerId: "deepseek",
    operation: "AI_PARALLEL_COLLECT_RESPONSE",
    maxAttempts: 2,
    retryOn: (error) => error.retryable === true,
    execute: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("temporary transport failure");
        error.retryable = true;
        error.code = "TRANSPORT_ERROR";
        throw error;
      }
      return { ok: true, response: "collected" };
    }
  });

  const result = await task.run();

  assert.equal(attempts, 2);
  assert.equal(result.response, "collected");
  assert.equal(task.status, api.STATUS.SUCCESS);
  assert.equal(task.attempt, 2);
  assert.equal(task.retryReasons.length, 1);
  assert.equal(task.retryReasons[0].attempt, 1);
  assert.equal(task.retryReasons[0].reason, "temporary transport failure");
  assert.equal(task.retryReasons[0].code, "TRANSPORT_ERROR");
  assert.equal(typeof task.retryReasons[0].timestamp, "number");
});

test("deterministic provider failures do not retry or hide the failure", async () => {
  const api = loadRuntime();
  const runtime = createRuntime(api);
  let attempts = 0;

  const result = await runtime.run({
    providerId: "qwen",
    operation: "AI_PARALLEL_SEND",
    maxAttempts: 3,
    execute: async () => {
      attempts += 1;
      return { ok: false, error: "未找到输入框", retryable: false };
    }
  });

  assert.equal(attempts, 1);
  assert.equal(result.ok, false);
  assert.equal(result.status, api.STATUS.FAILED);
  assert.equal(result.error, "未找到输入框");
  assert.equal(result.attempt, 1);
  assert.equal(result.retryReasons.length, 0);
});

test("timeout is observable and aborts the attempt", async () => {
  const api = loadRuntime();
  const runtime = createRuntime(api);
  let aborted = false;

  const task = runtime.createTask({
    providerId: "grok",
    operation: "AI_PARALLEL_COLLECT_RESPONSE",
    timeoutMs: 10,
    execute: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      });
    })
  });

  const result = await task.run();

  assert.equal(aborted, true);
  assert.equal(task.status, api.STATUS.TIMEOUT);
  assert.equal(runtime.getTask(task.id).status, api.STATUS.TIMEOUT);
  assert.equal(result.status, api.STATUS.TIMEOUT);
});

test("cancellation settles only the cancelled task", async () => {
  const api = loadRuntime();
  const runtime = createRuntime(api);
  let cancelledSignal;
  const cancelledTask = runtime.createTask({
    providerId: "kimi",
    execute: ({ signal }) => new Promise((_resolve, reject) => {
      cancelledSignal = signal;
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    })
  });
  const successfulTask = runtime.createTask({
    providerId: "claude",
    execute: async () => "independent result"
  });

  const cancelledPromise = cancelledTask.run();
  const successfulPromise = successfulTask.run();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cancelledTask.cancel("user stopped"), true);

  const [cancelledResult, successfulResult] = await Promise.all([cancelledPromise, successfulPromise]);
  assert.equal(cancelledSignal.aborted, true);
  assert.equal(cancelledResult.status, api.STATUS.CANCELLED);
  assert.equal(cancelledTask.error, "user stopped");
  assert.equal(successfulResult, "independent result");
  assert.equal(successfulTask.status, api.STATUS.SUCCESS);
});
