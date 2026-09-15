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
assertEqual(built.background, source.background, "background");
assertEqual(built.content_scripts, source.content_scripts, "content_scripts");
assertEqual(built.declarative_net_request, source.declarative_net_request, "declarative_net_request");
assertEqual(built.content_security_policy, source.content_security_policy, "content_security_policy");

const referencedFiles = new Set([
  built.background.service_worker,
  built.action.default_popup,
  built.declarative_net_request.rule_resources[0].path,
  ...built.content_scripts.flatMap((entry) => entry.js ?? []),
  ...Object.values(built.icons),
].filter(Boolean));

for (const relativePath of referencedFiles) {
  if (!existsSync(resolve(buildRoot, relativePath))) {
    throw new Error(`Built manifest references missing file: ${relativePath}`);
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
