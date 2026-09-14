const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");

function loadAdapters() {
  const context = { console, setTimeout, clearTimeout };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [
    "content/providers/core.js",
    "content/providers/chatgpt.js",
    "content/providers/deepseek.js",
    "content/providers/qwen.js",
    "content/providers/kimi.js",
    "content/providers/zhipu.js",
    "content/providers/claude.js",
    "content/providers/gemini.js",
    "content/providers/grok.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(extensionRoot, file), "utf8"), context, { filename: file });
  }
  return context.AIParallelProviderAdapters;
}

test("all supported providers expose the adapter contract", () => {
  const adapters = loadAdapters();
  const ids = ["chatgpt", "deepseek", "qwen", "kimi", "zhipu", "claude", "gemini", "grok"];
  assert.deepEqual(Object.keys(adapters).sort(), ids.slice().sort());
  for (const id of ids) {
    assert.equal(adapters[id].id, id);
    assert.ok(adapters[id].hosts.length);
    assert.ok(adapters[id].editorSelectors.length);
    assert.ok(adapters[id].sendSelectors.length);
    assert.equal(typeof adapters[id].sendPrompt, "function");
    assert.equal(typeof adapters[id].collectResponse, "function");
    assert.equal(typeof adapters[id].newChat, "function");
  }
});
