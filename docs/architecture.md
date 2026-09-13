# Architecture

## 1. Product boundary

AI Parallel is a multi-client product for parallel interaction with AI models. A browser extension is currently the best implementation because it can reuse a user's authenticated web sessions and operate inside supported AI web pages through Manifest V3 content scripts.

The repository boundary is intentionally wider than the extension so future clients can coexist without creating unrelated repositories.

## 2. Current runtime architecture

```text
Extension popup
  │
  │ LAUNCH_PARALLEL(prompt, providers)
  ▼
Service worker
  ├─ creates one tab per provider
  ├─ stores a one-time job keyed by tabId
  └─ groups comparison tabs
        │
        ▼
Provider page content script
  ├─ claims only the job for sender.tab.id
  ├─ locates the editor
  ├─ writes the prompt
  ├─ submits it
  └─ reports status
```

A prompt is not transported through the destination URL. This avoids leaking prompt contents into browser history, copied URLs, analytics referrers, or screenshots of the address bar.

## 3. Monorepo boundaries

### `apps/browser-extension`

Owns browser-specific concerns:

- Manifest V3 configuration and permissions
- popup UI
- service worker lifecycle
- tab creation and grouping
- content-script execution
- DOM interaction with model websites

### Future `packages/core`

Create only when at least two apps share orchestration behavior. Candidate responsibilities:

- provider IDs and capabilities
- launch request validation
- job state model
- comparison session model

It must not depend on `chrome.*` APIs.

### Future `packages/providers`

Create when provider definitions are consumed outside the extension. Separate stable provider metadata from unstable browser DOM adapters where possible.

Possible split later:

```text
packages/providers        # id, label, official URL, capability metadata
apps/browser-extension/
  providers/              # browser DOM adapters/selectors
```

### Future `packages/ui`

Create only after UI is actually shared by more than one client. Do not make the extension popup depend on a framework merely to justify a shared UI package.

## 4. Provider adapter direction

The current extension centralizes provider behavior in the content runner. As integrations grow, move toward a provider adapter contract such as:

```ts
interface WebProviderAdapter {
  id: string
  matches(location: Location): boolean
  findEditor(): Promise<HTMLElement>
  writePrompt(editor: HTMLElement, prompt: string): Promise<void>
  submit(editor: HTMLElement): Promise<void>
}
```

Do this refactor when selector maintenance becomes difficult, not solely for architectural symmetry.

## 5. Reliability model

AI web UIs are not stable APIs. The extension should therefore:

1. prefer provider-specific selectors;
2. use semantic generic fallbacks only after provider selectors fail;
3. verify that prompt insertion occurred;
4. attempt submission once through the preferred mechanism;
5. avoid repeated blind clicks;
6. report actionable failure state to the popup.

## 6. Security model

- Request the minimum host permissions required for supported providers.
- Do not request cookie, history, download, or web-request permissions unless a concrete feature requires them.
- Do not store prompts longer than required for dispatch/status UX.
- Never put prompt contents into destination query strings or fragments.
- Treat content from model pages as untrusted DOM.

## 7. Suggested evolution

The next architectural milestone should be driven by product needs, not repository aesthetics:

1. stabilize browser provider adapters;
2. add provider health/debug diagnostics;
3. add reusable comparison-session data model if needed;
4. add a second client (web/desktop) only when it has a distinct capability;
5. extract shared packages after concrete duplication appears.
