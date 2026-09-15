import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repoDir = resolve(scriptDir, "..");
const buildRoot = resolve(repoDir, process.argv[2] ?? "dist/chrome-mv3");
const sourceManifestPath = resolve(repoDir, "apps/browser-extension/manifest.json");
const builtManifestPath = resolve(buildRoot, "manifest.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} differs from the source manifest`);
  }
}

if (!existsSync(builtManifestPath)) {
  throw new Error(`Built manifest not found: ${builtManifestPath}`);
}

const source = readJson(sourceManifestPath);
const built = readJson(builtManifestPath);

assertEqual(built.manifest_version, 3, "manifest_version");
assertEqual(built.name, source.name, "name");
assertEqual(built.version, source.version, "version");
assertEqual(built.permissions, source.permissions, "permissions");
assertEqual(built.host_permissions, source.host_permissions, "host_permissions");
assertEqual(built.action, source.action, "action");
assertEqual(built.icons, source.icons, "icons");
assertEqual(built.declarative_net_request, source.declarative_net_request, "declarative_net_request");
assertEqual(built.content_security_policy, source.content_security_policy, "content_security_policy");

if (typeof built.background?.service_worker !== "string") {
  throw new Error("Generated manifest is missing a background service worker");
}
if (built.background.service_worker === source.background.service_worker) {
  throw new Error("Generated manifest still points at the source compatibility service worker");
}

if (!Array.isArray(built.content_scripts) || built.content_scripts.length !== source.content_scripts.length) {
  throw new Error("Generated content-script registration count differs from the source manifest");
}

for (const [index, sourceEntry] of source.content_scripts.entries()) {
  const builtEntry = built.content_scripts[index];
  assertEqual(
    [...builtEntry.matches].sort(),
    [...sourceEntry.matches].sort(),
    `content_scripts[${index}].matches`
  );
  assertEqual(builtEntry.run_at, sourceEntry.run_at, `content_scripts[${index}].run_at`);
  assertEqual(builtEntry.all_frames, sourceEntry.all_frames, `content_scripts[${index}].all_frames`);
  if (!Array.isArray(builtEntry.js) || builtEntry.js.length !== 1) {
    throw new Error(`Generated content_scripts[${index}] must contain one bundled entrypoint`);
  }
  if (builtEntry.js[0] === sourceEntry.js?.[0]) {
    throw new Error(`Generated content_scripts[${index}] still points at a legacy source script`);
  }
}

const referencedFiles = new Set([
  built.background.service_worker,
  built.action.default_popup,
  ...built.declarative_net_request.rule_resources.flatMap((resource) => resource.path ? [resource.path] : []),
  ...built.content_scripts.flatMap((entry) => entry.js ?? []),
  ...Object.values(built.icons),
].filter(Boolean));

for (const relativePath of referencedFiles) {
  if (!existsSync(resolve(buildRoot, relativePath))) {
    throw new Error(`Built manifest references missing file: ${relativePath}`);
  }
}

for (const page of ["popup.html", "templates.html"]) {
  const pagePath = resolve(buildRoot, page);
  if (!existsSync(pagePath)) throw new Error(`Generated extension page is missing: ${page}`);
  const html = readFileSync(pagePath, "utf8");
  if (/https?:\/\//i.test(html)) throw new Error(`Generated ${page} contains a remote asset URL`);
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const relativePath = reference.replace(/^\/+/, "");
    if (!relativePath || relativePath.startsWith("#")) continue;
    if (!existsSync(resolve(buildRoot, relativePath))) {
      throw new Error(`Generated ${page} references missing asset: ${reference}`);
    }
  }
}

for (const legacyRuntimeFile of ["service-worker.js", "content/frame-bridge.js", "content/providers/core.js"]) {
  if (existsSync(resolve(buildRoot, legacyRuntimeFile))) {
    throw new Error(`Generated extension still ships a legacy runtime asset: ${legacyRuntimeFile}`);
  }
}

const generatedContentScript = built.content_scripts[0]?.js?.[0];
if (generatedContentScript) {
  const contentBundle = readFileSync(resolve(buildRoot, generatedContentScript), "utf8");
  const runtimeOrderMarkers = [
    ["provider core", /AIParallelProviderCore\s*=/],
    ["chatgpt adapter", /id\s*:\s*["'`]chatgpt["'`]/],
    ["deepseek adapter", /id\s*:\s*["'`]deepseek["'`]/],
    ["qwen adapter", /id\s*:\s*["'`]qwen["'`]/],
    ["kimi adapter", /id\s*:\s*["'`]kimi["'`]/],
    ["zhipu adapter", /id\s*:\s*["'`]zhipu["'`]/],
    ["claude adapter", /id\s*:\s*["'`]claude["'`]/],
    ["gemini adapter", /id\s*:\s*["'`]gemini["'`]/],
    ["grok adapter", /id\s*:\s*["'`]grok["'`]/],
    ["contract runtime", /AIParallelContractRuntime\s*=/],
    ["frame bridge", /Unknown provider command/]
  ];
  let previousIndex = -1;
  for (const [label, marker] of runtimeOrderMarkers) {
    const currentIndex = contentBundle.search(marker);
    if (currentIndex < 0) throw new Error(`Generated content bundle is missing marker: ${label}`);
    if (currentIndex <= previousIndex) {
      throw new Error(`Generated content bundle order changed before marker: ${label}`);
    }
    previousIndex = currentIndex;
  }
}

const unexpectedPermissions = built.permissions.filter((permission) => !source.permissions.includes(permission));
const unexpectedHosts = built.host_permissions.filter((host) => !source.host_permissions.includes(host));
if (unexpectedPermissions.length || unexpectedHosts.length) {
  throw new Error(
    `Generated permissions expanded: ${JSON.stringify({ unexpectedPermissions, unexpectedHosts })}`
  );
}

console.log(`Verified WXT build: ${buildRoot}`);
