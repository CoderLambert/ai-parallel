# AI Parallel Browser Extension

Manifest V3 browser extension that opens a dedicated comparison Workspace and drives AI web pages as background worker tabs.

## User flow

1. Click the extension icon.
2. AI Parallel opens/focuses `workspace/index.html` in a normal browser tab.
3. Select providers and enter a prompt.
4. The service worker opens provider pages in a collapsed `AI Workers` tab group.
5. Content scripts enter and submit the prompt using the user's existing login session.
6. Content scripts observe the latest assistant response and stream normalized blocks back to the Workspace.
7. The Workspace renders all responses side by side.

## Why worker tabs instead of iframe

Provider pages can block embedding with CSP `frame-ancestors`, `X-Frame-Options`, authentication/storage behavior, or application logic. Keeping the official pages in their own tabs is substantially more robust and preserves the user's normal session.

## Response mirroring

The content runner extracts a provider response into safe blocks:

```js
{ type: "paragraph", text: "..." }
{ type: "heading", level: 2, text: "..." }
{ type: "code", text: "..." }
{ type: "list-item", text: "..." }
{ type: "quote", text: "..." }
{ type: "table", text: "..." }
```

The Workspace creates its own DOM nodes with `textContent`; remote provider HTML is not injected into the extension page.

## Development

```bash
npm run check
```

Then reload the unpacked extension in `chrome://extensions/`.
