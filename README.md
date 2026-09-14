# AI Parallel

AI Parallel is a monorepo for comparing and orchestrating multiple AI web experiences from one workspace.

The first app is a Chrome/Edge Manifest V3 extension. It reuses the user's
existing authenticated web sessions and embeds the selected model sites as
live provider iframes in a single workspace. Providers that are not iframe-safe,
currently Grok, run in a controlled top-level tab through the same adapter contract.

## Current app

```text
apps/browser-extension
```

Workspace v2.1 supports:

- ChatGPT
- DeepSeek
- 智谱清言
- Qwen
- Kimi
- Claude (best-effort response adapter)
- Gemini (best-effort response adapter)
- Grok (best-effort response adapter)
- Local Prompt Library
- Comparison and Agent Handoff

The default comparison set is ChatGPT, DeepSeek, 智谱清言, Qwen and Kimi.

## Workspace architecture

```text
AI Parallel Workspace
        │
        ├─ ChatGPT iframe ─ Content Script ─┐
        ├─ DeepSeek iframe ─ Content Script ├─ postMessage bridge
        ├─ Qwen iframe ───── Content Script ├─ native provider rendering
        ├─ Kimi iframe ───── Content Script ┘
        └─ Grok tab ─ Service Worker ─ tabs.sendMessage bridge
```

Prompts are not transported in destination URLs. The workspace sends one-time
jobs to iframe providers through an origin-checked `postMessage` bridge and to
tab-mode providers through a provider-scoped service-worker bridge.

## Repository structure

```text
ai-parallel/
├── apps/
│   └── browser-extension/
│       ├── content/
│       ├── workspace/
│       ├── icons/
│       ├── manifest.json
│       └── service-worker.js
├── docs/
│   └── architecture.md
├── .github/workflows/
├── package.json
└── pnpm-workspace.yaml
```

Shared packages will be extracted only when a second client or genuine cross-app duplication requires them.

## Development

```bash
npm run check
```

Load `apps/browser-extension` as an unpacked extension from `chrome://extensions/` or `edge://extensions/`.

Clicking the extension icon opens or focuses the full-page Workspace.

## Security and reliability

- Uses only the host permissions required by supported providers.
- Reuses existing browser login sessions; it does not store provider credentials.
- Does not put prompt text into provider URLs.
- Renders collected model output as safe text/structured blocks rather than injecting remote HTML.
- Provider DOM adapters are best-effort because AI web UIs are not stable public APIs.

See [`docs/architecture.md`](docs/architecture.md) for the runtime design and evolution plan.
