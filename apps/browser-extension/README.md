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
  └─ Gemini iframe
        │
        └─ content/frame-bridge.js handles prompt injection + submit
```

`rules/bypass-headers.json` removes `X-Frame-Options` and framing CSP headers only for matching `sub_frame` responses so the original provider pages can render inside the extension workspace.

Model output is not scraped or re-rendered. You see the original provider page directly, so there is no response-mirroring latency.

## Install

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this directory.

## Security boundary

- No prompt is placed in destination URLs.
- No response content is copied into extension storage.
- DNR rules apply only to configured provider `sub_frame` responses.
- The extension does not request cookie access.
