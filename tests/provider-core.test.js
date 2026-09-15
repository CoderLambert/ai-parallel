const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const corePath = path.join(__dirname, "..", "apps", "browser-extension", "content", "providers", "core.js");

class FakeElement {
  constructor({ parent = null, onClick = null } = {}) {
    this.parentElement = parent;
    this.onClick = onClick;
    this.disabled = false;
    this.readOnly = false;
    this.attributes = {};
    this.style = {};
    this.connected = true;
    this.clickCount = 0;
    this.events = [];
    this.queryMap = new Map();
  }

  get isConnected() {
    return this.connected;
  }

  get textContent() {
    return this._textContent || "";
  }

  set textContent(value) {
    this._textContent = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  closest(selector) {
    if (selector === "form") return this.form || null;
    return null;
  }

  querySelectorAll(selector) {
    return this.queryMap.get(selector) || [];
  }

  getBoundingClientRect() {
    return { width: 100, height: 20 };
  }

  compareDocumentPosition() {
    return 0;
  }

  focus() {}

  click() {
    this.clickCount += 1;
    this.onClick?.();
  }

  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }
}

class FakeTextArea extends FakeElement {
  constructor(options) {
    super(options);
    this._value = "";
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = String(value);
  }
}

function loadCore({ withButton = true, confirmOn = "button" } = {}) {
  const body = new FakeElement();
  const form = new FakeElement();
  const editor = new FakeTextArea({ parent: form });
  editor.form = form;
  form.form = form;
  const button = withButton ? new FakeElement({ parent: form }) : null;
  if (button) {
    button.attributes.type = "submit";
    button.onClick = () => {
      if (confirmOn === "button") {
        editor.value = "";
        button.disabled = true;
      }
    };
  }
  let requestSubmitCount = 0;
  form.requestSubmit = () => {
    requestSubmitCount += 1;
    if (confirmOn === "form") {
      editor.value = "";
      if (button) button.disabled = true;
    }
  };
  form.queryMap.set("button", button ? [button] : []);
  form.queryMap.set("button[type='submit']", button ? [button] : []);
  body.queryMap.set("button[type='submit']", [new FakeElement({ parent: body })]);

  const document = {
    body,
    querySelectorAll(selector) {
      if (selector === "textarea") return [editor];
      if (selector === "button[type='submit']") return body.querySelectorAll(selector);
      return [];
    },
    createRange() {
      return { selectNodeContents() {} };
    }
  };
  const context = {
    console,
    document,
    Element: FakeElement,
    HTMLTextAreaElement: FakeTextArea,
    HTMLInputElement: class extends FakeElement {},
    InputEvent: class { constructor(type) { this.type = type; } },
    Event: class { constructor(type) { this.type = type; } },
    KeyboardEvent: class { constructor(type) { this.type = type; } },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(corePath, "utf8"), context, { filename: corePath });

  return {
    core: context.AIParallelProviderCore,
    editor,
    button,
    form,
    get requestSubmitCount() { return requestSubmitCount; }
  };
}

test("provider submission scopes the send button and confirms the UI transition", async () => {
  const fixture = loadCore({ withButton: true, confirmOn: "button" });
  const adapter = fixture.core.createProviderAdapter({
    id: "fixture",
    hosts: ["fixture.test"],
    editorSelectors: ["textarea"],
    sendSelectors: ["button[type='submit']"],
    responseSelectors: [],
    submitConfirmationTimeoutMs: 50
  });

  const result = await adapter.sendPrompt("hello provider");

  assert.equal(result, true);
  assert.equal(fixture.button.clickCount, 1);
  assert.equal(fixture.form.querySelectorAll("button[type='submit']").length, 1);
  assert.equal(fixture.editor.value, "");
});

test("provider submission uses native form submission before synthetic Enter", async () => {
  const fixture = loadCore({ withButton: false, confirmOn: "form" });
  const adapter = fixture.core.createProviderAdapter({
    id: "fixture",
    hosts: ["fixture.test"],
    editorSelectors: ["textarea"],
    sendSelectors: [],
    responseSelectors: [],
    submitConfirmationTimeoutMs: 50
  });

  await adapter.sendPrompt("submit through form");

  assert.equal(fixture.requestSubmitCount, 1);
  assert.equal(fixture.editor.value, "");
});

test("provider submission reports deterministic failure when no UI confirmation occurs", async () => {
  const fixture = loadCore({ withButton: true, confirmOn: "never" });
  const adapter = fixture.core.createProviderAdapter({
    id: "fixture",
    hosts: ["fixture.test"],
    editorSelectors: ["textarea"],
    sendSelectors: ["button[type='submit']"],
    responseSelectors: [],
    sendReadyTimeoutMs: 50,
    submitConfirmationTimeoutMs: 20
  });

  await assert.rejects(
    adapter.sendPrompt("never submitted"),
    /无法确认 Prompt 已发送/
  );
  assert.equal(fixture.button.clickCount, 1);
  assert.equal(fixture.requestSubmitCount, 1);
  assert.equal(fixture.editor.value, "never submitted");
});
