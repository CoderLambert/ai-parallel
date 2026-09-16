import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repoDir = resolve(scriptDir, "..");
const verifier = resolve(scriptDir, "verify-built-extension.mjs");
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["chrome", "edge", "firefox"];

for (const target of targets) {
  if (!["chrome", "edge", "firefox"].includes(target)) {
    throw new Error(`Unsupported build target: ${target}`);
  }
  const result = spawnSync(process.execPath, [verifier, resolve(repoDir, `dist/${target}-mv3`), target], {
    cwd: repoDir,
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Verified build matrix: ${targets.join(", ")}`);
