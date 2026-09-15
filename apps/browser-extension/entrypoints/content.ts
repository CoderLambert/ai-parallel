import { defineContentScript } from "wxt/utils/define-content-script";

// Preserve the established provider registration and bridge initialization
// order. Provider selectors stay inside content/providers; this entrypoint
// only makes the composition and generated bundle order explicit.
import "../content/providers/core.js";
import "../content/providers/chatgpt.js";
import "../content/providers/deepseek.js";
import "../content/providers/qwen.js";
import "../content/providers/kimi.js";
import "../content/providers/zhipu.js";
import "../content/providers/claude.js";
import "../content/providers/gemini.js";
import "../content/providers/grok.js";
import "../shared/contract-runtime.js";
import "../content/frame-bridge.js";
import legacyManifest from "../manifest.json";

const legacyContentScript = legacyManifest.content_scripts[0];
if (!legacyContentScript) throw new Error("The source manifest must define a content script");
const runAt = legacyContentScript.run_at === "document_start"
  ? "document_start"
  : legacyContentScript.run_at === "document_end"
    ? "document_end"
    : "document_idle";

export default defineContentScript({
  matches: legacyContentScript.matches,
  runAt,
  allFrames: legacyContentScript.all_frames,
  main() {}
});
