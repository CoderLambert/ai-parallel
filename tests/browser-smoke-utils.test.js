const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { diagnosticCode, writeDiagnostics } = require("./browser-smoke-utils.cjs");

test("browser diagnostics reduce failures to bounded safe codes", () => {
  assert.equal(diagnosticCode({ name: "TimeoutError", message: "secret prompt" }), "BROWSER_TIMEOUT");
  assert.equal(diagnosticCode({ name: "AssertionError", message: "response content" }), "ASSERTION_FAILED");
  assert.equal(diagnosticCode(new Error("Browser smoke requires a generated Chrome artifact")), "UNSUPPORTED_EXTENSION_ROOT");
  assert.equal(diagnosticCode(new Error("provider response and password")), "E2E_FAILED");
});

test("browser diagnostics never write the raw error", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-parallel-diagnostics-test-"));
  try {
    writeDiagnostics(directory, {
      status: "failed",
      stage: "secret prompt",
      code: "password leaked",
      error: "raw provider response",
      message: "raw prompt"
    });
    const diagnostics = JSON.parse(fs.readFileSync(path.join(directory, "diagnostics.json"), "utf8"));
    assert.deepEqual(diagnostics.status, "failed");
    assert.deepEqual(diagnostics.stage, "unknown");
    assert.deepEqual(diagnostics.code, "E2E_FAILED");
    assert.equal("error" in diagnostics, false);
    assert.equal("message" in diagnostics, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
