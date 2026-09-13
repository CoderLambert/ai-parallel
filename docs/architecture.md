# Architecture

## Product boundary

AI Parallel is a multi-model comparison workspace. The browser extension reuses the user's existing authenticated web sessions rather than proxying model APIs.

## v2 runtime architecture

```text
AI Parallel Workspace (extension page)
  ├─ ChatGPT iframe
  ├─ DeepSeek iframe
  ├─ 智谱 iframe
  ├─ Qwen iframe
  ├─ Kimi iframe
  ├─ Claude iframe
  └─ Gemini iframe
        │
        └─ content/frame-bridge.js
             ├─ locates provider editor
             ├─ injects the shared prompt
             └─ submits through the provider UI
```

The provider response is never scraped into a second renderer. The original provider page renders its own response directly inside the workspace panel. This removes the latency and fragility introduced by DOM response mirroring.

## Framing model

Most AI web applications send `X-Frame-Options` and/or CSP `frame-ancestors` headers that prevent embedding. The extension uses Manifest V3 `declarativeNetRequest` rules to remove only these framing headers for configured provider `sub_frame` responses.

Rules live in `apps/browser-extension/rules/bypass-headers.json`.

The extension does not rewrite provider HTML or JavaScript. It does not request cookie permission; the provider iframe uses the browser's normal authenticated session behavior.

## Message flow

```text
workspace/workspace.js
  │ DISPATCH_PROMPT
  ▼
service-worker.js
  │ frame registry: workspace tab + provider -> frameId
  │ chrome.tabs.sendMessage(..., { frameId })
  ▼
content/frame-bridge.js
  │
  ├─ fill editor
  └─ submit
```

Each direct provider iframe announces `FRAME_READY`. The service worker stores the provider/frame mapping in `chrome.storage.session`, so service-worker suspension does not lose routing state.

## Provider boundaries

Provider-specific DOM knowledge is isolated in `content/frame-bridge.js`. The workspace only knows provider identity, URL, layout, and readiness state. It never knows response selectors.

As provider handling grows, split `frame-bridge.js` into provider adapters without changing the workspace protocol.

## Security model

- Frame-header bypass rules are limited to configured provider URLs and `sub_frame` resources.
- Prompt contents are not put into destination URLs.
- Response contents are not copied to extension storage.
- No cookie/history/webRequest permission is requested.
- Opening a provider in a normal top-level tab does not activate the iframe bridge workflow.

## Inspiration

The v2 framing pattern is informed by the open-source Parallel AI extension (MIT): a multi-panel workspace embeds original provider pages and uses DNR framing rules plus provider content scripts. AI Parallel reimplements this pattern within its own codebase and provider set, including 智谱 support.
