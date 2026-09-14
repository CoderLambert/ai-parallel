# AI Parallel Browser Extension

AI Parallel v2 uses a live iframe workspace instead of mirroring model responses through DOM scraping.

## Architecture

```text
Workspace extension page
  ├─ ChatGPT iframe
  ├─ DeepSeek iframe
  ├─ 智谱 iframe
  ├─ Qwen iframe
  ├─ Kimi iframe
  ├─ Claude iframe
  ├─ Gemini iframe
  └─ Grok controlled top-level tab
        │
        ├─ content/providers/core.js shared DOM operations
        ├─ content/providers/<provider>.js provider selectors
        └─ content/frame-bridge.js message boundary + adapter delegation
```

`rules/bypass-headers.json` removes `X-Frame-Options` and framing CSP headers only for matching `sub_frame` responses so compatible provider pages can render inside the extension workspace. Grok runs in a controlled top-level tab because its authenticated WebSocket channel does not work reliably inside an extension iframe.

The original provider page remains visible directly. Compare can collect the
latest visible response on demand for safe text rendering and export; it does
not inject provider HTML or replace the native iframe view.

## Install from a release

Download and extract `ai-parallel-browser-extension-vX.Y.Z.zip`. Open
`chrome://extensions` or `edge://extensions`, enable Developer mode, choose
**Load unpacked**, and select the extracted `ai-parallel-browser-extension`
directory. Keep that directory in place after installation.

When loading from a source checkout, select `apps/browser-extension` directly.

Grok authentication and chat run in a top-level browser tab because `accounts.x.ai`
does not permit iframe login and Grok's real-time WebSocket is not iframe-safe. AI
Parallel reuses that tab for prompt dispatch, response collection, and handoff.

## Security boundary

- No prompt is placed in destination URLs.
- No response content is copied into extension storage.
- DNR rules apply only to configured provider `sub_frame` responses.
- Authentication pages are never added to the iframe header-bypass rules.
- The extension does not request cookie access.
