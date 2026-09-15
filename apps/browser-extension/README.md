# AI Parallel Browser Extension

AI Parallel v2 uses a live iframe workspace instead of mirroring model responses through DOM scraping.

## Architecture

```text
Workspace extension page
  ├─ Provider Task Runtime
  │    └─ Provider Adapter Contract → shared iframe/tab transport
  ├─ Agent Execution Controller
  │    └─ bounded planner / executor / reviewer aggregation
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

Workspace provider operations run through the shared Provider Task Runtime. It
tracks each operation in memory, bounds retry attempts, exposes timeout and
cancellation states, and keeps deterministic provider failures visible. Task
history and response snapshots are not persisted.

The shared Agent Execution Controller provides an explicit, bounded parallel
execution model for planner, executor, and reviewer roles. It allows at most
eight agents per execution and three concurrent provider tasks by default. Each
agent still runs through the Provider Task Runtime and Adapter Contract; one
failure is isolated and reported in the aggregate. Prompts and responses remain
in memory only, with no autonomous loop or background execution.

## Install from a release

Download and extract `ai-parallel-browser-extension-vX.Y.Z.zip`. Open
`chrome://extensions` or `edge://extensions`, enable Developer mode, choose
**Load unpacked**, and select the extracted `ai-parallel-browser-extension`
directory. Keep that directory in place after installation.

When loading from a source checkout, select `apps/browser-extension` directly.

## Build foundation

The repository is migrating from a source-directory archive to a WXT/Vite
build in phases. The first foundation phase keeps the existing runtime files
unchanged while WXT generates and validates a Manifest V3 Chrome artifact:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:chrome
pnpm package:extension
```

The generated extension is written to `dist/chrome-mv3`. The current
`wxt.config.ts` reads the existing `manifest.json` as a compatibility source,
stages the legacy runtime assets, and verifies permissions, host permissions,
CSP, DNR, content-script order, and referenced files before packaging. The
temporary `entrypoints/foundation.ts` is only a WXT build anchor; the actual
background and content-script entrypoints will be migrated under the Runtime
issue after the shared contracts are stable.

For a local browser smoke against the built artifact, use:

```bash
AI_PARALLEL_EXTENSION_ROOT=dist/chrome-mv3 \
AI_PARALLEL_BROWSER_HEADLESS=true \
node tests/browser-smoke.cjs
```

The smoke remains credential-free. Provider authentication and live Provider
checks stay in the protected authenticated smoke workflow.

Grok authentication and chat run in a top-level browser tab because `accounts.x.ai`
does not permit iframe login and Grok's real-time WebSocket is not iframe-safe. AI
Parallel reuses that tab for prompt dispatch, response collection, and handoff.

## Security boundary

- No prompt is placed in destination URLs.
- No response content is copied into extension storage.
- DNR rules apply only to configured provider `sub_frame` responses.
- Authentication pages are never added to the iframe header-bypass rules.
- The extension does not request cookie access.
