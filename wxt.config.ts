import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type ConfigEnv } from "wxt";

type LegacyManifest = {
  name: string;
  version: string;
  description: string;
  homepage_url: string;
  minimum_chrome_version?: string;
  permissions: string[];
  host_permissions: string[];
  action: Record<string, unknown>;
  icons: Record<string, string>;
  content_scripts: Array<Record<string, unknown>>;
  background: Record<string, unknown>;
  declarative_net_request: {
    rule_resources: Array<{
      id: string;
      enabled: boolean;
      path: string;
    }>;
  };
  content_security_policy: Record<string, unknown>;
};

const legacyManifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/browser-extension/manifest.json"), "utf8")
) as LegacyManifest;

function isChromiumTarget(browser: ConfigEnv["browser"]) {
  return browser === "chrome" || browser === "edge";
}

export default defineConfig({
  srcDir: "apps/browser-extension",
  publicDir: ".wxt-legacy",
  outDir: "dist",
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}",
  targetBrowsers: ["chrome", "edge", "firefox"],
  manifest: ({ browser }) => ({
    name: legacyManifest.name,
    version: legacyManifest.version,
    description: legacyManifest.description,
    homepage_url: legacyManifest.homepage_url,
    ...(isChromiumTarget(browser) && legacyManifest.minimum_chrome_version
      ? { minimum_chrome_version: legacyManifest.minimum_chrome_version }
      : {}),
    permissions: legacyManifest.permissions,
    host_permissions: legacyManifest.host_permissions,
    action: legacyManifest.action,
    icons: legacyManifest.icons,
    content_security_policy: legacyManifest.content_security_policy,
  }),
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      // Keep the legacy runtime intact during the foundation wave. The next
      // runtime issue will replace these public assets with explicit WXT
      // entrypoints without changing the generated manifest contract.
      manifest.background = legacyManifest.background;
      manifest.content_scripts = legacyManifest.content_scripts;
      manifest.declarative_net_request = legacyManifest.declarative_net_request;
    },
  },
});
