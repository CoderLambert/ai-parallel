# AI Parallel

AI Parallel is a monorepo for tools that send one prompt to multiple AI web experiences in parallel and make the results easy to compare.

## Apps

- `apps/browser-extension` — Chrome/Edge Manifest V3 extension. Opens selected AI chat sites, injects the prompt into a fresh conversation, and submits it using the user's existing browser sessions.

## Repository layout

```text
ai-parallel/
├── apps/
│   └── browser-extension/
├── docs/
│   └── architecture.md
├── .github/workflows/
├── package.json
└── pnpm-workspace.yaml
```

Shared packages will be extracted under `packages/` when a second app creates a real reuse boundary. Until then, provider automation stays inside the browser-extension app to avoid premature abstraction.

## Development

```bash
pnpm install
pnpm check
```

For the browser extension, load `apps/browser-extension` as an unpacked extension from `chrome://extensions` or `edge://extensions`.

## Current providers

- ChatGPT
- DeepSeek
- 智谱清言
- Qwen
- Kimi
- Claude
- Gemini
