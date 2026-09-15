# Authenticated Provider Smoke

The authenticated smoke flow is an opt-in validation path for dedicated
Provider test accounts. It is separate from the default credential-free
Browser Smoke workflow and runs only from `main` through a manually dispatched
GitHub Actions job.

## Protected setup

Create a protected GitHub Environment named `authenticated-provider-smoke` and
require reviewer approval before jobs can start. Add username and password
Secrets for only the dedicated non-personal accounts that will be tested:

```text
AI_PARALLEL_SMOKE_CHATGPT_USERNAME
AI_PARALLEL_SMOKE_CHATGPT_PASSWORD
AI_PARALLEL_SMOKE_DEEPSEEK_USERNAME
AI_PARALLEL_SMOKE_DEEPSEEK_PASSWORD
AI_PARALLEL_SMOKE_ZHIPU_USERNAME
AI_PARALLEL_SMOKE_ZHIPU_PASSWORD
AI_PARALLEL_SMOKE_QWEN_USERNAME
AI_PARALLEL_SMOKE_QWEN_PASSWORD
AI_PARALLEL_SMOKE_KIMI_USERNAME
AI_PARALLEL_SMOKE_KIMI_PASSWORD
AI_PARALLEL_SMOKE_CLAUDE_USERNAME
AI_PARALLEL_SMOKE_CLAUDE_PASSWORD
AI_PARALLEL_SMOKE_GEMINI_USERNAME
AI_PARALLEL_SMOKE_GEMINI_PASSWORD
AI_PARALLEL_SMOKE_GROK_USERNAME
AI_PARALLEL_SMOKE_GROK_PASSWORD
```

The workflow maps these Secrets only to the smoke process. Do not place values
in workflow inputs, command arguments, URLs, repository files, or local shell
history. The selected Provider list is an explicit comma-separated input; the
default is `chatgpt,grok`.

## Run and validation

Use **Actions → Authenticated Browser Smoke → Run workflow** on the `main`
branch. The test launches a fresh temporary persistent Chrome Profile, logs in
to each selected Provider, opens the AI Parallel workspace, selects only those
Providers, sends a fixed health-check Prompt, and collects each visible answer.
Grok additionally must have an allowlisted top-level `grok.com` tab and an
observed `grok.com`/`x.ai` WebSocket connection.

Provider authentication selectors are best-effort test configuration. Accounts
requiring interactive MFA, CAPTCHA, or an unsupported OAuth-only flow must not
be used for this automated path until an explicitly reviewed test strategy is
available.

## Retention boundary

The smoke test never starts Playwright tracing, takes screenshots, writes
`storageState`, or uploads the browser Profile. It removes the temporary Profile
after the run. On failure it writes only provider, stage, status, bounded error
code, and timestamps to `diagnostics.json`; Prompt, response, Cookie, password,
authentication URL, page HTML, and WebSocket URL contents are excluded.

The extension manifest, permissions, runtime message allowlists, and the
credential-free Browser Smoke workflow are unchanged by this validation path.
