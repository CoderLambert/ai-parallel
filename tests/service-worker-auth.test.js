const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadServiceWorker() {
  let messageListener;
  const openedUrls = [];
  const sentMessages = [];
  const context = {
    console,
    setTimeout,
    URL,
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: {
        getURL: (value) => `chrome-extension://test/${value}`,
        onMessage: { addListener(listener) { messageListener = listener; } }
      },
      storage: { local: { async get() { return {}; }, async set() {}, async remove() {} } },
      tabs: {
        async create({ url }) {
          openedUrls.push(url);
          return { id: openedUrls.length, url };
        },
        async query() { return [{ id: 42, url: "https://grok.com/", windowId: 7 }]; },
        async update() {},
        async reload() {},
        async sendMessage(tabId, message) {
          sentMessages.push({ tabId, message });
          return { ok: true, response: { provider: "grok", content: "answer" } };
        }
      },
      windows: { async update() {} }
    }
  };
  context.importScripts = (...files) => {
    for (const file of files) {
      vm.runInContext(
        fs.readFileSync(path.join(__dirname, "..", "apps", "browser-extension", file), "utf8"),
        context,
        { filename: file }
      );
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, "..", "apps", "browser-extension", "service-worker.js"),
    "utf8"
  );
  vm.runInContext(source, context, { filename: "service-worker.js" });
  return { messageListener, openedUrls, sentMessages };
}

function sendMessage(listener, message, sender = { url: "chrome-extension://test/workspace/index.html" }) {
  return new Promise((resolve) => {
    assert.equal(listener(message, sender, resolve), true);
  });
}

test("Grok authentication only opens allowlisted HTTPS URLs", async () => {
  const { messageListener, openedUrls } = loadServiceWorker();

  const allowed = await sendMessage(messageListener, {
    type: "OPEN_PROVIDER_AUTH",
    providerId: "grok",
    url: "https://accounts.x.ai/sign-in?returnTo=https%3A%2F%2Fgrok.com%2F"
  });
  assert.equal(allowed.ok, true);
  assert.deepEqual(openedUrls, ["https://accounts.x.ai/sign-in?returnTo=https%3A%2F%2Fgrok.com%2F"]);

  const wrongHost = await sendMessage(messageListener, {
    type: "OPEN_PROVIDER_AUTH",
    providerId: "grok",
    url: "https://example.com/sign-in"
  });
  assert.equal(wrongHost.ok, false);

  const insecure = await sendMessage(messageListener, {
    type: "OPEN_PROVIDER_AUTH",
    providerId: "grok",
    url: "http://accounts.x.ai/sign-in"
  });
  assert.equal(insecure.ok, false);
  assert.equal(openedUrls.length, 1);
});

test("provider content-script authentication requests are sender-scoped", async () => {
  const { messageListener, openedUrls } = loadServiceWorker();
  const fromGrok = await sendMessage(messageListener, {
    type: "OPEN_PROVIDER_AUTH",
    providerId: "grok",
    url: "https://accounts.x.ai/sign-in"
  }, {
    tab: { id: 7, url: "https://grok.com/" }
  });
  assert.equal(fromGrok.ok, true);

  const fromOtherProvider = await sendMessage(messageListener, {
    type: "OPEN_PROVIDER_AUTH",
    providerId: "grok",
    url: "https://accounts.x.ai/sign-in"
  }, {
    tab: { id: 8, url: "https://example.com/" }
  });
  assert.equal(fromOtherProvider.ok, false);
  assert.deepEqual(openedUrls, ["https://accounts.x.ai/sign-in"]);
});

test("Grok tab mode reuses the official top-level tab", async () => {
  const { messageListener, openedUrls, sentMessages } = loadServiceWorker();
  const result = await sendMessage(messageListener, {
    type: "PROVIDER_TAB_COMMAND",
    providerId: "grok",
    command: {
      type: "AI_PARALLEL_COLLECT_RESPONSE",
      requestId: "request-1"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(openedUrls.length, 0);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].tabId, 42);
  assert.equal(sentMessages[0].message.type, "AI_PARALLEL_TAB_COMMAND");
  assert.equal(sentMessages[0].message.providerId, "grok");
});
