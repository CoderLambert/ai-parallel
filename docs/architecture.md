# Architecture

## Product boundary

AI Parallel is a multi-model comparison workspace. The browser extension reuses the user's existing authenticated web sessions rather than proxying model APIs.

## v2 runtime architecture

```text
AI Parallel Workspace (extension page)
  ├─ Provider Task Runtime
  │    ├─ bounded retry / timeout / cancel
  │    └─ in-memory task state and observation
  ├─ Agent Execution Controller
  │    ├─ explicit planner / executor / reviewer scope
  │    ├─ bounded parallel scheduling
  │    └─ in-memory result aggregation and failure isolation
  ├─ ChatGPT iframe
  ├─ DeepSeek iframe
  ├─ 智谱 iframe
  ├─ Qwen iframe
  ├─ Kimi iframe
  ├─ Claude iframe
  ├─ Gemini iframe
  └─ Grok controlled top-level tab
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

The original provider page remains the primary renderer. Iframe-compatible
providers render inside the workspace panel. Grok remains in a normal top-level
tab so its login state and WebSocket channel retain first-party browser behavior.
When the user opens Compare, the selected provider adapter can collect the latest
visible response on demand; the drawer renders safe text and never injects provider HTML.

## Framing model

Most AI web applications send `X-Frame-Options` and/or CSP `frame-ancestors` headers that prevent embedding. The extension uses Manifest V3 `declarativeNetRequest` rules to remove only these framing headers for configured provider `sub_frame` responses.

Rules live in `apps/browser-extension/rules/bypass-headers.json`.

The extension does not rewrite provider HTML or JavaScript. It does not request
cookie permission. Grok is excluded from framing-header bypass rules because its
authenticated real-time channel is not reliable in an extension iframe.

## Message flow

```text
workspace/workspace.js
  └─ Provider Task Runtime
       └─ Provider Adapter
            ├─ postMessage ─ provider iframe
            └─ runtime message ─ service worker ─ tabs.sendMessage ─ Grok tab
                         │
                         ▼
                  content/frame-bridge.js
  │ adapter.sendPrompt(prompt)
  ├─ fill editor
  └─ submit
  │ postMessage(AI_PARALLEL_SEND_RESULT)
  ▼
workspace/workspace.js
```

Each direct provider iframe announces `AI_PARALLEL_FRAME_READY`. The workspace
validates both iframe source and provider origin. For Grok only, the service
worker finds or creates an allowlisted `grok.com` tab and routes provider-scoped
commands to the same adapter contract. It never receives provider credentials.

All workspace provider operations are represented by an in-memory Provider Task.
Tasks expose `IDLE`, `QUEUED`, `RUNNING`, `SUCCESS`, `FAILED`, `TIMEOUT`, and
`CANCELLED` states. Retry attempts are bounded by the provider capability contract;
only explicitly retryable transport or timeout failures are retried. Task history
and response snapshots are not written to extension storage.

The Agent Execution Controller is a user-triggered, in-memory layer above the
Provider Task Runtime. It accepts an explicit `parallel` scope containing no
more than eight planner, executor, or reviewer agents, schedules at most three
agents concurrently by default, and sends every agent prompt through the
selected Provider Adapter and Runtime. A failed agent is isolated so remaining
agents can complete; the aggregate is `SUCCESS`, `PARTIAL`, `FAILED`, or
`CANCELLED`. It does not create autonomous loops, persist prompts/responses, or
bypass the provider message boundary.

## Provider boundaries

Provider-specific DOM knowledge is isolated in `content/providers/<provider>.js`,
with shared DOM operations in `content/providers/core.js`. The bridge only
validates the message boundary and delegates to the selected adapter. The
workspace only knows provider identity, URL, layout, and readiness state; it
never knows response selectors.

Shared provider identity, URL, host, origin, mode, and default-selection metadata
lives in `apps/browser-extension/shared/provider-catalog.js`. Popup, workspace,
and service-worker entry points consume that catalog; provider selector knowledge
remains local to each adapter.

The catalog also provides the adapter identifier, adapter type, contract version,
and runtime capabilities. The workspace builds the shared adapter contract from
that metadata; the adapter delegates to one generic iframe/tab transport, so the
Provider Task Runtime does not contain provider-specific branches.

Provider adapters can grow independently without changing the workspace
protocol.

## Security model

- Frame-header bypass rules are limited to configured provider URLs and `sub_frame` resources.
- Prompt contents are not put into destination URLs.
- Response contents are not copied to extension storage.
- No cookie/history/webRequest permission is requested.
- Tab-mode commands are restricted to providers explicitly marked for tab mode and to allowlisted command types.

## Inspiration

The v2 framing pattern is informed by the open-source Parallel AI extension (MIT): a multi-panel workspace embeds original provider pages and uses DNR framing rules plus provider content scripts. AI Parallel reimplements this pattern within its own codebase and provider set, including 智谱 support.
