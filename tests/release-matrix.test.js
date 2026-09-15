const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..");

function read(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("release matrix defines explicit Chrome, Edge, and Firefox build/package targets", () => {
  const packageJson = JSON.parse(read("package.json"));
  const scripts = packageJson.scripts;
  for (const target of ["chrome", "edge", "firefox"]) {
    assert.equal(typeof scripts[`build:${target}`], "string");
    assert.match(scripts[`build:${target}`], new RegExp(`dist/${target}-mv3`));
  }
  assert.match(scripts["build:matrix"], /build:chrome/);
  assert.match(scripts["build:matrix"], /build:edge/);
  assert.match(scripts["build:matrix"], /build:firefox/);
  assert.match(scripts["package:extension:edge"], /EXTENSION_TARGET=edge/);
  assert.match(scripts["package:extension:firefox"], /EXTENSION_TARGET=firefox/);
  assert.match(read("scripts", "package-extension.sh"), /Unsupported extension target/);
});

test("WXT release configuration keeps the Firefox identity and data boundary explicit", () => {
  const wxtConfig = read("wxt.config.ts");
  assert.match(wxtConfig, /targetBrowsers: \["chrome", "edge", "firefox"\]/);
  assert.match(wxtConfig, /id: "@ai-parallel"/);
  assert.match(wxtConfig, /required: \["none"\]/);
  const verifier = read("scripts", "verify-built-extension.mjs");
  assert.match(verifier, /isFirefox/);
  assert.match(verifier, /background\?\.scripts/);
  assert.match(verifier, /Firefox data collection permissions/);
});

test("release workflow builds only credential-free artifacts for the browser matrix", () => {
  const workflow = read(".github", "workflows", "release-matrix.yml");
  assert.match(workflow, /browser: \[chrome, edge, firefox\]/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm run build:\$\{\{ matrix\.browser \}\}/);
  assert.match(workflow, /sha256sum -c/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /AI_PARALLEL_SMOKE_|password|storageState|credentials/i);
});

test("browser smoke is an explicit final check against the generated Chrome artifact", () => {
  const workflow = read(".github", "workflows", "browser-smoke.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request):/m);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm build:chrome/);
  assert.match(workflow, /AI_PARALLEL_EXTENSION_ROOT: dist\/chrome-mv3/);
  assert.match(workflow, /AI_PARALLEL_BROWSER_HEADLESS: "true"/);
});
