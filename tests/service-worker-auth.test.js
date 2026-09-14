const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadServiceWorker() {
  let messageListener;
  const openedUrls = [];
  const context = {
    console,
    URL,
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: {
        getURL: (value) => `chrome-extension://test/${value}`,
        onMessage: { addListener(listener) { messageListener = listener; } }
      },
      storage: { local: { async get() { return {}; } } },
      tabs: {
        async create({ url }) {
          openedUrls.push(url);
          return { id: openedUrls.length, url };
        },
        async query() { return []; },
        async sendMessage() {}
      },
      windows: { async update() {} }
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, "..", "apps", "browser-extension", "service-worker.js"),
    "utf8"
  );
  vm.runInContext(source, context, { filename: "service-worker.js" });
  return { messageListener, openedUrls };
}

function sendMessage(listener, message) {
  return new Promise((resolve) => {
    assert.equal(listener(message, {}, resolve), true);
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
