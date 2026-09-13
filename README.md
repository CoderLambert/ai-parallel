# AI Parallel

AI Parallel is a monorepo for comparing and orchestrating multiple AI web experiences from one workspace.

The first app is a Chrome/Edge Manifest V3 extension. It reuses the user's existing authenticated web sessions, opens model sites as collapsed worker tabs, and mirrors their responses into a single comparison workspace.

## Current app

```text
apps/browser-extension
```

Workspace v1 supports:

- ChatGPT
- DeepSeek
- 智谱清言
- Qwen
- Kimi
- Claude (best-effort response adapter)
- Gemini (best-effort response adapter)

The default comparison set is ChatGPT, DeepSeek, 智谱清言, Qwen and Kimi.

## Workspace architecture

```text
AI Parallel Workspace
        │
        │ launch(prompt, providers)
        ▼
Manifest V3 Service Worker
        │
        ├─ collapsed ChatGPT worker tab ─ Content Script ─┐
        ├─ collapsed DeepSeek worker tab ─ Content Script ├─ response events
        ├─ collapsed Qwen worker tab ─ Content Script ────┤
        └─ collapsed Kimi worker tab ─ Content Script ────┘
                                                         │
                                                         ▼
                                                Workspace panels
```

Prompts are not transported in destination URLs. Worker pages receive one-time jobs through extension messaging/session storage.

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
- Renders mirrored model output as safe text/structured blocks rather than injecting remote HTML.
- Provider DOM adapters are best-effort because AI web UIs are not stable public APIs.

See [`docs/architecture.md`](docs/architecture.md) for the runtime design and evolution plan.
