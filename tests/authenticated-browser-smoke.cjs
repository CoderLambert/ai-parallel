const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");
const diagnosticsDir = path.join(process.cwd(), "test-results", "authenticated-browser-smoke");
const diagnosticsPath = path.join(diagnosticsDir, "diagnostics.json");
const DEFAULT_PROVIDER_IDS = ["chatgpt", "grok"];
const MAX_PROVIDER_IDS = 8;
const AUTH_TIMEOUT_MS = 45000;
const RESPONSE_TIMEOUT_MS = 120000;
const SMOKE_PROMPT = "AI Parallel authenticated smoke: respond with a short health check.";
const GROK_HOSTS = new Set(["grok.com", "www.grok.com"]);

const COMMON_LOGIN_SELECTORS = [
  "a[href*='/login']",
  "a[href*='/sign-in']",
  "button:has-text('Log in')",
  "button:has-text('Sign in')",
  "a:has-text('Log in')",
  "a:has-text('Sign in')",
  "button:has-text('登录')",
  "a:has-text('登录')"
];
const COMMON_USERNAME_SELECTORS = [
  "input[type='email']",
  "input[name='email']",
  "input[name='username']",
  "input[autocomplete='username']",
  "input[autocomplete='email']"
];
const COMMON_PASSWORD_SELECTORS = [
  "input[type='password']",
  "input[name='password']",
  "input[autocomplete='current-password']"
];
const COMMON_SUBMIT_SELECTORS = [
  "button[type='submit']",
  "button:has-text('Continue')",
  "button:has-text('Next')",
  "button:has-text('Log in')",
  "button:has-text('Sign in')",
  "button:has-text('登录')",
  "input[type='submit']"
];

const PROVIDERS = Object.freeze({
  chatgpt: {
    mode: "iframe",
    hosts: ["chatgpt.com", "chat.openai.com"],
    url: "https://chatgpt.com/",
    editorSelectors: [
      "#prompt-textarea",
      "textarea[data-testid='prompt-textarea']",
      "div[contenteditable='true'][data-testid='prompt-textarea']",
      "form textarea",
      "main textarea"
    ],
    responseSelectors: ["[data-message-author-role='assistant']"]
  },
  deepseek: {
    mode: "iframe",
    hosts: ["chat.deepseek.com"],
    url: "https://chat.deepseek.com/",
    editorSelectors: ["textarea", "div[contenteditable='true']"],
    responseSelectors: ["[class*='ds-markdown']", "[class*='message-content']"]
  },
  zhipu: {
    mode: "iframe",
    hosts: ["chatglm.cn"],
    url: "https://chatglm.cn/",
    editorSelectors: ["textarea", "div[contenteditable='true']"],
    responseSelectors: ["[class*='markdown']", "[class*='message-content']"]
  },
  qwen: {
    mode: "iframe",
    hosts: ["chat.qwen.ai"],
    url: "https://chat.qwen.ai/",
    editorSelectors: ["textarea", "div[contenteditable='true']"],
    responseSelectors: ["[class*='markdown']", "[class*='message-content']"]
  },
  kimi: {
    mode: "iframe",
    hosts: ["www.kimi.com", "kimi.com"],
    url: "https://www.kimi.com/",
    editorSelectors: ["textarea", "div[contenteditable='true']"],
    responseSelectors: ["[class*='markdown']", "[class*='message-content']"]
  },
  claude: {
    mode: "iframe",
    hosts: ["claude.ai"],
    url: "https://claude.ai/new",
    editorSelectors: ["div.ProseMirror[contenteditable='true']", "div[contenteditable='true']", "textarea"],
    responseSelectors: ["[data-testid='assistant-message']", "[class*='font-claude-response']"]
  },
  gemini: {
    mode: "iframe",
    hosts: ["gemini.google.com"],
    url: "https://gemini.google.com/app",
    editorSelectors: ["rich-textarea div[contenteditable='true']", "div[contenteditable='true']", "textarea"],
    responseSelectors: ["message-content", ".markdown-main-panel", "[class*='markdown']"]
  },
  grok: {
    mode: "tab",
    hosts: ["grok.com"],
    url: "https://grok.com/",
    editorSelectors: [
      "textarea[aria-label='Ask Grok anything']",
      "textarea[placeholder*='Ask']",
      "textarea",
      "div.ProseMirror[contenteditable='true']",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']"
    ],
    responseSelectors: [
      "[data-testid='assistant-message']",
      "[data-message-author-role='assistant']",
      "[class*='markdown']"
    ]
  }
});

class SmokeFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "SmokeFailure";
    this.code = code;
  }
}

function parseProviderIds(value = process.env.AI_PARALLEL_SMOKE_PROVIDER_IDS) {
  const rawIds = typeof value === "string" && value.trim()
    ? value.split(",").map((id) => id.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_PROVIDER_IDS;
  const ids = [...new Set(rawIds)];
  if (!ids.length || ids.length > MAX_PROVIDER_IDS || ids.some((id) => !PROVIDERS[id])) {
    throw new SmokeFailure("INVALID_PROVIDER_ALLOWLIST");
  }
  return ids;
}

function credentialsFor(providerId) {
  const prefix = `AI_PARALLEL_SMOKE_${providerId.toUpperCase()}`;
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
    throw new SmokeFailure(`MISSING_${providerId.toUpperCase()}_CREDENTIALS`);
  }
  return { username, password };
}

function writeDiagnostics(entries) {
  fs.mkdirSync(diagnosticsDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(diagnosticsPath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entries
  }, null, 2), { encoding: "utf8", mode: 0o600 });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveInteger(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.max(1, Math.floor(number)), maximum);
}

async function waitForVisible(pageOrFrame, selectors, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        const locator = pageOrFrame.locator(selector).first();
        if (await locator.isVisible()) return locator;
      } catch {
        // A provider may replace the document while the login flow is changing pages.
      }
    }
    await sleep(250);
  }
  return null;
}

async function clickVisible(page, selectors, timeoutMs = 10000) {
  const locator = await waitForVisible(page, selectors, timeoutMs);
  if (!locator) return false;
  await locator.click();
  return true;
}

async function pageHasEditor(page, provider) {
  return Boolean(await waitForVisible(page, provider.editorSelectors, 5000));
}

async function authenticateProvider(page, provider, credentials) {
  try {
    await page.goto(provider.url, { waitUntil: "domcontentloaded", timeout: AUTH_TIMEOUT_MS });
    if (await pageHasEditor(page, provider)) return;

    let usernameInput = await waitForVisible(page, COMMON_USERNAME_SELECTORS, 5000);
    let passwordInput = await waitForVisible(page, COMMON_PASSWORD_SELECTORS, 1000);
    if (!usernameInput && !passwordInput) {
      const clicked = await clickVisible(page, COMMON_LOGIN_SELECTORS, 10000);
      if (!clicked) throw new SmokeFailure("AUTH_FORM_NOT_FOUND");
      usernameInput = await waitForVisible(page, COMMON_USERNAME_SELECTORS, 20000);
      passwordInput = await waitForVisible(page, COMMON_PASSWORD_SELECTORS, 3000);
    }
    if (!usernameInput) throw new SmokeFailure("AUTH_USERNAME_FIELD_NOT_FOUND");

    await usernameInput.fill(credentials.username);
    if (!passwordInput) {
      await clickVisible(page, COMMON_SUBMIT_SELECTORS, 5000);
      passwordInput = await waitForVisible(page, COMMON_PASSWORD_SELECTORS, 20000);
    }
    if (!passwordInput) throw new SmokeFailure("AUTH_PASSWORD_FIELD_NOT_FOUND");

    await passwordInput.fill(credentials.password);
    const submitted = await clickVisible(page, COMMON_SUBMIT_SELECTORS, 5000);
    if (!submitted) await passwordInput.press("Enter");
    await page.waitForLoadState("domcontentloaded", { timeout: AUTH_TIMEOUT_MS }).catch(() => {});
    if (!await pageHasEditor(page, provider)) throw new SmokeFailure("AUTH_INCOMPLETE");
  } catch (error) {
    if (error instanceof SmokeFailure) throw error;
    throw new SmokeFailure("AUTH_PROVIDER_ERROR");
  } finally {
    credentials.username = "";
    credentials.password = "";
  }
}

function hostMatches(value, hosts) {
  try {
    return hosts.includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

async function waitForProviderResponse(context, provider, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      for (const frame of page.frames()) {
        if (!hostMatches(frame.url(), provider.hosts)) continue;
        for (const selector of provider.responseSelectors) {
          try {
            const locator = frame.locator(selector).last();
            if (!await locator.isVisible()) continue;
            if ((await locator.innerText()).trim()) return true;
          } catch {
            // The response DOM can be replaced while a provider is streaming.
          }
        }
      }
    }
    await sleep(500);
  }
  return false;
}

async function configureWorkspace(page, providerIds) {
  await page.waitForFunction(() => document.querySelectorAll("#providerBar .provider-chip").length === 8, {
    timeout: 20000
  });
  const selected = new Set(providerIds);
  const providerOrder = Object.keys(PROVIDERS);
  for (let index = 0; index < providerOrder.length; index += 1) {
    const button = page.locator("#providerBar .provider-chip").nth(index);
    const expected = selected.has(providerOrder[index]);
    if ((await button.getAttribute("data-selected")) === String(expected)) continue;
    await button.click();
    await page.waitForFunction(({ index: buttonIndex, value }) => (
      document.querySelectorAll("#providerBar .provider-chip")[buttonIndex]?.dataset.selected === String(value)
    ), { index, value: expected }, { timeout: 5000 });
  }
  await page.waitForFunction((ids) => ids.every((id) => (
    document.querySelector(`[data-provider-id="${id}"]`)
  )), providerIds, { timeout: 20000 });
}

async function waitForWorkspaceProviders(page, providerIds) {
  await page.waitForFunction((ids) => ids.every((id) => {
    const panel = document.querySelector(`[data-provider-id="${id}"]`);
    return panel?.dataset.ready === "true";
  }), providerIds, { timeout: 60000 });
}

async function sendAndCollect(page, context, providerIds) {
  await page.locator("#promptInput").fill(SMOKE_PROMPT);
  await page.locator("#sendBtn").click();
  await page.waitForFunction(() => document.querySelector("#dispatchStatus")?.textContent.includes("已发送"), {
    timeout: 60000
  });
  const dispatchStatus = await page.locator("#dispatchStatus").innerText();
  if (dispatchStatus.includes("需要处理")) throw new SmokeFailure("PROMPT_SEND_FAILED");

  const responseTimeout = positiveInteger(
    process.env.AI_PARALLEL_SMOKE_RESPONSE_TIMEOUT_MS,
    RESPONSE_TIMEOUT_MS,
    RESPONSE_TIMEOUT_MS
  );
  for (const providerId of providerIds) {
    const provider = PROVIDERS[providerId];
    if (!await waitForProviderResponse(context, provider, responseTimeout)) {
      throw new SmokeFailure(`RESPONSE_NOT_VISIBLE_${providerId.toUpperCase()}`);
    }
  }

  await page.locator("#compareBtn").click();
  await page.waitForFunction((count) => (
    document.querySelectorAll("#responseList .response-card").length === count
  ), providerIds.length, { timeout: 30000 });
  const contentCount = await page.locator("#responseList .response-card-content").count();
  if (contentCount !== providerIds.length) throw new SmokeFailure("RESPONSE_COLLECTION_INCOMPLETE");
}

async function run() {
  const diagnostics = [];
  let context;
  let userDataDir;
  try {
    const providerIds = parseProviderIds();
    writeDiagnostics(diagnostics);
    const recordStage = async (providerId, stage, action) => {
      const startedAt = new Date().toISOString();
      try {
        const result = await action();
        diagnostics.push({ providerId, stage, status: "passed", code: null, startedAt, finishedAt: new Date().toISOString() });
        writeDiagnostics(diagnostics);
        console.log(`[authenticated-smoke] ${providerId} ${stage} passed`);
        return result;
      } catch (error) {
        const code = error instanceof SmokeFailure ? error.code : "UNEXPECTED_FAILURE";
        diagnostics.push({ providerId, stage, status: "failed", code, startedAt, finishedAt: new Date().toISOString() });
        writeDiagnostics(diagnostics);
        console.log(`[authenticated-smoke] ${providerId} ${stage} failed (${code})`);
        throw error instanceof SmokeFailure ? error : new SmokeFailure(code);
      }
    };

    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-parallel-auth-smoke-"));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`
      ]
    });

    let grokWebSocketCount = 0;
    const observePage = (page) => {
      page.on("websocket", (webSocket) => {
        try {
          const hostname = new URL(webSocket.url()).hostname;
          if (hostname === "grok.com" || hostname.endsWith(".grok.com") || hostname.endsWith(".x.ai")) {
            grokWebSocketCount += 1;
          }
        } catch {
          // WebSocket URLs are never included in diagnostics.
        }
      });
    };
    context.pages().forEach(observePage);
    context.on("page", observePage);

    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker", { timeout: 20000 });
    const extensionId = new URL(serviceWorker.url()).hostname;

    for (const providerId of providerIds) {
      const provider = PROVIDERS[providerId];
      let credentials;
      try {
        credentials = await recordStage(providerId, "credentials", () => credentialsFor(providerId));
        const providerPage = await context.newPage();
        try {
          await recordStage(providerId, "authentication", () => authenticateProvider(providerPage, provider, credentials));
        } finally {
          if (providerId !== "grok") await providerPage.close().catch(() => {});
        }
      } finally {
        if (credentials) {
          credentials.username = "";
          credentials.password = "";
        }
      }
    }

    const workspace = await context.newPage();
    await recordStage("workspace", "extension-load", async () => {
      await workspace.goto(`chrome-extension://${extensionId}/workspace/index.html`, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
      await workspace.waitForFunction(() => document.querySelectorAll("#providerBar .provider-chip").length === 8, {
        timeout: 20000
      });
    });
    await recordStage("workspace", "provider-selection", () => configureWorkspace(workspace, providerIds));
    await recordStage("workspace", "provider-ready", () => waitForWorkspaceProviders(workspace, providerIds));
    await recordStage("workspace", "prompt-send-and-response-collect", () => sendAndCollect(workspace, context, providerIds));

    if (providerIds.includes("grok")) {
      await recordStage("grok", "top-level-tab", async () => {
        const page = context.pages().find((candidate) => {
          try { return GROK_HOSTS.has(new URL(candidate.url()).hostname); } catch { return false; }
        });
        if (!page) throw new SmokeFailure("GROK_TAB_NOT_OPEN");
        await page.bringToFront();
      });
      await recordStage("grok", "websocket-observed", async () => {
        if (!grokWebSocketCount) throw new SmokeFailure("GROK_WEBSOCKET_NOT_OBSERVED");
      });
    }

    console.log(`[authenticated-smoke] passed for ${providerIds.join(",")}`);
  } catch (error) {
    if (!diagnostics.some((entry) => entry.status === "failed")) {
      diagnostics.push({
        providerId: "run",
        stage: "setup",
        status: "failed",
        code: error instanceof SmokeFailure ? error.code : "UNEXPECTED_FAILURE",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString()
      });
      writeDiagnostics(diagnostics);
    }
    console.error("[authenticated-smoke] failed; inspect sanitized diagnostics artifact");
    process.exitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    writeDiagnostics(diagnostics);
  }
}

if (require.main === module) run();

module.exports = Object.freeze({
  PROVIDERS,
  parseProviderIds,
  credentialsFor
});
