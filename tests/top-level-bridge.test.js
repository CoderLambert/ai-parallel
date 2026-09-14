const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");

test("Grok top-level page exposes the provider command bridge", async () => {
  let messageListener;
  const context = {
    console,
    clearTimeout,
    setTimeout,
    URL,
    location: { hostname: "grok.com" },
    document: { querySelectorAll() { return []; } },
    chrome: {
      runtime: {
        getURL: (value) => `chrome-extension://test/${value}`,
        onMessage: { addListener(listener) { messageListener = listener; } }
      }
    }
  };
  context.globalThis = context;
  context.window = context;
  context.top = context;
  context.parent = context;
  vm.createContext(context);

  for (const file of [
    "content/providers/core.js",
    "content/providers/grok.js",
    "content/frame-bridge.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(extensionRoot, file), "utf8"), context, { filename: file });
  }

  assert.equal(typeof messageListener, "function");
  const result = await new Promise((resolve) => {
    const asynchronous = messageListener({
      type: "AI_PARALLEL_TAB_COMMAND",
      providerId: "grok",
      command: { type: "AI_PARALLEL_COLLECT_RESPONSE", requestId: "request-1" }
    }, {}, resolve);
    assert.equal(asynchronous, true);
  });

  assert.equal(result.type, "AI_PARALLEL_RESPONSE_RESULT");
  assert.equal(result.requestId, "request-1");
  assert.equal(result.ok, false);
});
