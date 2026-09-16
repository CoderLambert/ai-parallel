const fs = require("node:fs");
const path = require("node:path");

const SAFE_CODES = new Set([
  "BROWSER_TIMEOUT",
  "ASSERTION_FAILED",
  "UNSUPPORTED_EXTENSION_ROOT",
  "E2E_FAILED"
]);
const SAFE_STAGES = new Set([
  "setup",
  "browser-launch",
  "extension-load",
  "workspace-load",
  "workspace-ui",
  "popup-flow",
  "template-library-flow",
  "complete"
]);

function diagnosticCode(error) {
  if (error?.name === "TimeoutError") return "BROWSER_TIMEOUT";
  if (error?.name === "AssertionError") return "ASSERTION_FAILED";
  if (typeof error?.message === "string" && error.message.includes("generated Chrome artifact")) {
    return "UNSUPPORTED_EXTENSION_ROOT";
  }
  return "E2E_FAILED";
}

function writeDiagnostics(directory, entry) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(directory, "diagnostics.json"), JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: entry?.status === "passed" ? "passed" : "failed",
    stage: SAFE_STAGES.has(entry?.stage) ? entry.stage : "unknown",
    code: entry?.status === "passed"
      ? null
      : SAFE_CODES.has(entry?.code) ? entry.code : "E2E_FAILED"
  }, null, 2), { encoding: "utf8", mode: 0o600 });
}

module.exports = Object.freeze({ diagnosticCode, writeDiagnostics });
