const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const extensionRoot = process.env.AI_PARALLEL_EXTENSION_ROOT
  ? path.resolve(process.env.AI_PARALLEL_EXTENSION_ROOT)
  : path.join(__dirname, "..", "apps", "browser-extension");
const headless = process.env.AI_PARALLEL_BROWSER_HEADLESS === "true";
const executablePath = process.env.AI_PARALLEL_BROWSER_EXECUTABLE_PATH
  ? path.resolve(process.env.AI_PARALLEL_BROWSER_EXECUTABLE_PATH)
  : undefined;
const softwareRendering = process.env.AI_PARALLEL_BROWSER_SOFTWARE_RENDERING === "true";
const diagnosticsDir = path.join(process.cwd(), "test-results", "browser-smoke");

async function run() {
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-parallel-browser-smoke-"));
  let context;
  let page;

  try {
    const browserOptions = {
      headless,
      args: [
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`
      ]
    };
    if (softwareRendering) {
      browserOptions.args.push(
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-gpu-sandbox",
        "--in-process-gpu",
        "--use-gl=swiftshader"
      );
    }
    if (executablePath) browserOptions.executablePath = executablePath;
    context = await chromium.launchPersistentContext(userDataDir, browserOptions);
    await context.tracing.start({ screenshots: true, snapshots: true });

    // Keep the smoke test deterministic and credential-free. Provider pages are
    // intentionally not exercised here; live authenticated checks belong in a
    // separately isolated environment.
    await context.route("https://**/*", (route) => route.abort());

    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    }
    const extensionId = new URL(serviceWorker.url()).hostname;
    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace/index.html`, {
      waitUntil: "domcontentloaded"
    });

    await page.waitForFunction(() => document.querySelectorAll("#providerBar .provider-chip").length === 8);
    assert.equal(await page.locator("#providerBar .provider-chip").count(), 8);
    await page.locator(".workspace-provider-readiness-card").first().waitFor({ state: "visible" });
    const readinessCardCount = await page.locator(".workspace-provider-readiness-card").count();
    assert.ok(readinessCardCount > 0 && readinessCardCount <= 8);
    assert.equal(await page.locator(".workspace-compare-status").count(), 1);
    assert.equal(await page.locator(".workspace-session-status").count(), 1);
    await page.locator(".workspace-session-empty").waitFor({ state: "visible" });
    assert.equal(await page.locator(".workspace-library-card").count(), 3);
    const libraryCard = (label) => page.locator(".workspace-library-card", { hasText: label });
    assert.equal(await libraryCard("Templates").locator(".ui-badge").innerText(), "3");
    assert.equal(await libraryCard("Sessions").locator(".ui-badge").innerText(), "0");
    assert.equal(await page.locator("#sendBtn").isDisabled(), true);
    const workspaceAction = (label) => page.locator(".workspace-actions .ui-button", { hasText: label });

    await page.locator("#promptInput").fill("CI browser smoke prompt");
    assert.equal(await page.locator("#sendBtn").isDisabled(), false);

    await workspaceAction("Templates").click();
    assert.equal(await page.locator("#templateList .template-card").count(), 3);
    assert.ok((await page.locator("#templateCategorySelect option").count()) >= 4);
    await page.locator("#templateList .template-card").first().locator("button").first().click();
    assert.equal(await page.locator("#templateFormDialog").getAttribute("open"), "");
    await page.locator("#templateFormFields [name='sourceText']").fill("Keep the original structure.");
    await page.locator("#templateFormFields [name='targetLanguage']").selectOption("简体中文");
    await page.locator("#insertTemplateBtn").click();
    const templatePrompt = await page.locator("#promptInput").inputValue();
    assert.match(templatePrompt, /Keep the original structure/);
    assert.match(templatePrompt, /Output Contract/);

    const importedTemplate = {
      kind: "ai-parallel.prompt-template",
      schemaVersion: 1,
      id: "user.browser-smoke-template",
      version: 1,
      name: "Browser smoke template",
      categoryId: "custom",
      description: "Imported by browser smoke",
      promptTemplate: "Review {{text}}",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", minLength: 1 } },
        required: ["text"],
        additionalProperties: false
      },
      output: { mode: "text" }
    };
    await page.locator("#templateImportInput").setInputFiles({
      name: "browser-smoke-template.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importedTemplate))
    });
    await page.locator("#templateList").getByText("Browser smoke template").waitFor({ state: "visible" });
    assert.equal(await libraryCard("Templates").locator(".ui-badge").innerText(), "4");

    await workspaceAction("Sessions").click();
    await page.locator("#sessionTitleInput").fill("CI smoke session");
    await page.locator("#saveSessionBtn").click();
    await page.locator("#sessionList .prompt-card").waitFor({ state: "visible" });
    assert.match(await page.locator("#sessionList").innerText(), /CI smoke session/);
    assert.equal(await libraryCard("Sessions").locator(".ui-badge").innerText(), "1");
    await page.locator(".workspace-session-card").getByText("CI smoke session").waitFor({ state: "visible" });
    assert.match(await page.locator(".workspace-session-card").first().innerText(), /[1-9]\d* 个模型/);
    assert.match(await page.locator(".workspace-session-card").first().innerText(), /字符/);
    await page.locator("#sessionList .prompt-card").first().locator("button").first().click();
    assert.equal(await page.locator("#sessionDrawer").getAttribute("aria-hidden"), "true");
    assert.equal(await page.locator("#promptInput").inputValue(), templatePrompt);

    await workspaceAction("Sessions").click();
    await page.locator("#sessionList .prompt-card").first().locator("button").nth(1).click();
    await page.locator("#sessionList .prompt-empty").waitFor({ state: "visible" });
    assert.equal(await libraryCard("Sessions").locator(".ui-badge").innerText(), "0");
    await page.locator(".workspace-session-empty").waitFor({ state: "visible" });

    await workspaceAction("Compare").click();
    assert.equal(await page.locator("#compareDrawer").getAttribute("aria-hidden"), "false");
    await page.locator("#sendAgentBtn").click();
    await page.locator("#compareStatus").waitFor({ state: "visible" });
    assert.match(await page.locator("#compareStatus").innerText(), /请先点击 Compare 收集至少一个回答/);
  } finally {
    if (context) {
      try {
        await context.tracing.stop({ path: path.join(diagnosticsDir, "trace.zip") });
      } catch {
        // Preserve the original browser/assertion failure.
      }
      await context.close();
    }
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
