import { defineBackground } from "wxt/utils/define-background";

// Keep every Service Worker dependency explicit. The legacy source loader is
// used only when loading apps/browser-extension directly; WXT bundles these
// modules into one generated background entrypoint.
import "../shared/provider-catalog.js";
import "../shared/contract-runtime.js";
import "../shared/storage-contract.js";
import "../service-worker.js";

export default defineBackground(() => {});
