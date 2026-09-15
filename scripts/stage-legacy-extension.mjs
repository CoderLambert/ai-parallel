import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(scriptDir, "..");
const sourceRoot = resolve(repoDir, "apps/browser-extension");
const publicRoot = resolve(repoDir, ".wxt-legacy");

const files = [
  "shared/contract-runtime.js",
  "shared/storage-contract.js",
  "workspace/index.html",
  "workspace/workspace.css",
  "workspace/workspace.js",
  "workspace/context-utils.js",
  "shared/agent-execution-controller.js",
  "shared/prompt-template-catalog.js",
  "shared/prompt-template-utils.js",
  "shared/provider-adapter-contract.js",
  "shared/provider-catalog.js",
  "shared/provider-task-runtime.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "rules/bypass-headers.json",
  "schemas/prompt-template.schema.json",
  "schemas/prompt-template-package.schema.json",
];

rmSync(publicRoot, { recursive: true, force: true });

for (const relativePath of files) {
  const sourcePath = resolve(sourceRoot, relativePath);
  const targetPath = resolve(publicRoot, relativePath);
  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath);
}

console.log(`Staged ${files.length} legacy extension assets for WXT`);
