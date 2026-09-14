const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");

function loadCatalog() {
  const context = { URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(extensionRoot, "shared", "provider-catalog.js"), "utf8"), context, {
    filename: "shared/provider-catalog.js"
  });
  return context.AIParallelProviderCatalog;
}

test("shared provider catalog matches manifest host coverage", () => {
  const catalog = loadCatalog();
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
  const permissionHosts = new Set(manifest.host_permissions);
  const contentScriptMatches = new Set(manifest.content_scripts[0].matches);

  assert.deepEqual(Array.from(catalog, (provider) => provider.id), [
    "chatgpt",
    "deepseek",
    "zhipu",
    "qwen",
    "kimi",
    "claude",
    "gemini",
    "grok"
  ]);

  for (const provider of catalog) {
    for (const host of provider.hosts) {
      const match = `https://${host}/*`;
      assert.ok(permissionHosts.has(match), `${provider.id} missing host permission ${match}`);
      assert.ok(contentScriptMatches.has(match), `${provider.id} missing content-script match ${match}`);
    }
    assert.equal(new URL(provider.url).origin, provider.origins[0]);
    assert.equal(provider.adapter.type, "dom");
    assert.equal(provider.adapter.contract, "provider-adapter-v1");
    assert.equal(provider.capabilities.send, true);
    assert.equal(provider.capabilities.collect, true);
    assert.equal(provider.capabilities.newChat, true);
    assert.equal(provider.capabilities.retry, true);
    assert.equal(provider.capabilities.streaming, false);
    assert.equal(provider.capabilities.timeout, true);
    assert.equal(provider.capabilities.cancel, true);
  }
});

test("shared provider catalog protects metadata arrays from mutation", () => {
  const catalog = loadCatalog();
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog[0]), true);
  assert.equal(Object.isFrozen(catalog[0].hosts), true);
  assert.equal(Object.isFrozen(catalog[0].origins), true);
  assert.equal(Object.isFrozen(catalog[0].adapter), true);
  assert.equal(Object.isFrozen(catalog[0].capabilities), true);
});

test("extension entry points load the catalog before consuming it", () => {
  const popupHtml = fs.readFileSync(path.join(extensionRoot, "popup.html"), "utf8");
  const workspaceHtml = fs.readFileSync(path.join(extensionRoot, "workspace", "index.html"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(extensionRoot, "service-worker.js"), "utf8");

  assert.match(popupHtml, /shared\/provider-catalog\.js[\s\S]*popup\.js/);
  assert.match(workspaceHtml, /\.\.\/shared\/provider-catalog\.js[\s\S]*workspace\.js/);
  assert.match(workspaceHtml, /\.\.\/shared\/provider-task-runtime\.js[\s\S]*workspace\.js/);
  assert.match(serviceWorker, /^importScripts\("shared\/provider-catalog\.js"\);/);
});
