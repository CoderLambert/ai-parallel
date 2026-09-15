const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");
const diagnosticsDir = path.join(process.cwd(), "test-results", "browser-smoke");

async function run() {
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-parallel-browser-smoke-"));
  let context;
  let page;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`
      ]
    });
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
    assert.equal(await page.locator("#sendBtn").isDisabled(), true);

    await page.locator("#promptInput").fill("CI browser smoke prompt");
    assert.equal(await page.locator("#sendBtn").isDisabled(), false);

    await page.locator("#templateLibraryBtn").click();
    assert.equal(await page.locator("#templateList .template-card").count(), 3);
    assert.ok((await page.locator("#templateCategorySelect option").count()) >= 4);
    await page.locator("#templateList .template-card").first().locator("button").first().click();
    assert.equal(await page.locator("#templateFormDialog").getAttribute("open"), "");
    await page.locator("#templateFormFields [name='sourceText']").fill("Keep the original structure.");
    await page.locator("#templateFormFields [name='targetLanguage']").selectOption("简体中文");
    await page.locator("#insertTemplateBtn").click();
    assert.match(await page.locator("#promptInput").inputValue(), /Keep the original structure/);
    assert.match(await page.locator("#promptInput").inputValue(), /Output Contract/);

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

    await page.locator("#sessionBtn").click();
    await page.locator("#sessionTitleInput").fill("CI smoke session");
    await page.locator("#saveSessionBtn").click();
    await page.locator("#sessionList .prompt-card").waitFor({ state: "visible" });
    assert.match(await page.locator("#sessionList").innerText(), /CI smoke session/);
    await page.locator("#sessionList .prompt-card").first().locator("button").first().click();
    assert.equal(await page.locator("#sessionDrawer").getAttribute("aria-hidden"), "true");
    assert.equal(await page.locator("#promptInput").inputValue(), "CI browser smoke prompt");

    await page.locator("#sessionBtn").click();
    await page.locator("#sessionList .prompt-card").first().locator("button").nth(1).click();
    await page.locator("#sessionList .prompt-empty").waitFor({ state: "visible" });

    await page.locator("#compareBtn").click();
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
