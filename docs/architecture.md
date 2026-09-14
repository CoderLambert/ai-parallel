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
             ├─ providers/core.js
             │    ├─ locates provider editor
             │    ├─ injects the shared prompt
             │    ├─ submits through the provider UI
             │    └─ exposes collectResponse/newChat hooks
             └─ providers/<provider>.js
                  └─ host and selector knowledge per provider
```

The original provider page remains the primary renderer inside the workspace
panel. When the user opens Compare, the selected iframe adapter can collect
the latest visible response on demand for the comparison drawer; the drawer
renders safe text and never injects provider HTML.

## Framing model

Most AI web applications send `X-Frame-Options` and/or CSP `frame-ancestors` headers that prevent embedding. The extension uses Manifest V3 `declarativeNetRequest` rules to remove only these framing headers for configured provider `sub_frame` responses.

Rules live in `apps/browser-extension/rules/bypass-headers.json`.

The extension does not rewrite provider HTML or JavaScript. It does not request cookie permission; the provider iframe uses the browser's normal authenticated session behavior.

## Message flow

```text
workspace/workspace.js
  │ postMessage(AI_PARALLEL_SEND)
  ▼
provider iframe / content/frame-bridge.js
  │ adapter.sendPrompt(prompt)
  ├─ fill editor
  └─ submit
  │ postMessage(AI_PARALLEL_SEND_RESULT)
  ▼
workspace/workspace.js
```

Each direct provider iframe announces `AI_PARALLEL_FRAME_READY`. The active
workspace path routes directly to the iframe and validates both the iframe
source and provider origin. The service worker owns workspace opening and
standalone provider-tab actions; it does not route iframe prompts.

## Provider boundaries

Provider-specific DOM knowledge is isolated in `content/providers/<provider>.js`,
with shared DOM operations in `content/providers/core.js`. The bridge only
validates the message boundary and delegates to the selected adapter. The
workspace only knows provider identity, URL, layout, and readiness state; it
never knows response selectors.

Provider adapters can grow independently without changing the workspace
protocol.

## Security model

- Frame-header bypass rules are limited to configured provider URLs and `sub_frame` resources.
- Prompt contents are not put into destination URLs.
- Response contents are not copied to extension storage.
- No cookie/history/webRequest permission is requested.
- Opening a provider in a normal top-level tab does not activate the iframe bridge workflow.

## Inspiration

The v2 framing pattern is informed by the open-source Parallel AI extension (MIT): a multi-panel workspace embeds original provider pages and uses DNR framing rules plus provider content scripts. AI Parallel reimplements this pattern within its own codebase and provider set, including 智谱 support.
