const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { diagnosticCode, writeDiagnostics } = require("./browser-smoke-utils.cjs");

const builtExtensionRoot = path.join(__dirname, "..", "dist", "chrome-mv3");
const sourceExtensionRoot = path.join(__dirname, "..", "apps", "browser-extension");
const extensionRoot = process.env.AI_PARALLEL_EXTENSION_ROOT
  ? path.resolve(process.env.AI_PARALLEL_EXTENSION_ROOT)
  : fs.existsSync(path.join(builtExtensionRoot, "manifest.json"))
    ? builtExtensionRoot
    : sourceExtensionRoot;
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
  let stage = "setup";

  try {
    stage = "browser-launch";
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
    else browserOptions.channel = "chromium";
    context = await chromium.launchPersistentContext(userDataDir, browserOptions);

    // Keep the smoke test deterministic and credential-free. Provider pages are
    // intentionally not exercised here; live authenticated checks belong in a
    // separately isolated environment.
    await context.route("https://**/*", (route) => route.abort());

    stage = "extension-load";
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    }
    const extensionId = new URL(serviceWorker.url()).hostname;
    page = await context.newPage();
    stage = "workspace-load";
    await page.goto(`chrome-extension://${extensionId}/workspace/index.html`, {
      waitUntil: "domcontentloaded"
    });

    if (!await page.locator("body[data-react-workspace='true']").count()) {
      throw new Error("Browser smoke requires a generated Chrome artifact; run pnpm build:chrome first or set AI_PARALLEL_EXTENSION_ROOT");
    }

    const reactRoot = page.locator("#workspaceReactRoot");
    stage = "workspace-ui";
    await page.waitForFunction(() => document.querySelectorAll("#workspaceReactRoot .workspace-provider-button").length === 8);
    assert.equal(await reactRoot.locator(".workspace-provider-button").count(), 8);
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
    const workspaceAction = (label) => reactRoot.locator(".workspace-actions .ui-button", { hasText: label });

    await page.locator("#promptInput").fill("CI browser smoke prompt");
    assert.equal(await page.locator("#sendBtn").isDisabled(), false);

    await workspaceAction("Templates").click();
    const templateDrawer = reactRoot.getByRole("dialog", { name: "Prompt Templates" });
    await templateDrawer.waitFor({ state: "visible" });
    assert.equal(await templateDrawer.locator(".workspace-react-template-card").count(), 3);
    assert.ok((await templateDrawer.locator("select option").count()) >= 4);
    await templateDrawer.locator(".workspace-react-template-card").first().getByRole("button", { name: "使用" }).click();
    assert.equal(await page.locator("#templateFormDialog").getAttribute("open"), "");
    await page.locator("#templateFormFields [name='sourceText']").fill("Keep the original structure.");
    await page.locator("#templateFormFields [name='targetLanguage']").selectOption("简体中文");
    await page.locator("#insertTemplateBtn").click();
    const templatePrompt = await page.locator("#promptInput").inputValue();
    assert.match(templatePrompt, /Keep the original structure/);
    assert.match(templatePrompt, /Output Contract/);

    await workspaceAction("Templates").click();
    const reopenedTemplateDrawer = reactRoot.getByRole("dialog", { name: "Prompt Templates" });
    await reopenedTemplateDrawer.waitFor({ state: "visible" });

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
    await reopenedTemplateDrawer.locator("input[type='file']").setInputFiles({
      name: "browser-smoke-template.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importedTemplate))
    });
    await reopenedTemplateDrawer.getByText("Browser smoke template").waitFor({ state: "visible" });
    assert.equal(await libraryCard("Templates").locator(".ui-badge").innerText(), "4");
    await reopenedTemplateDrawer.getByRole("button", { name: "关闭 Prompt Templates" }).click();
    await reopenedTemplateDrawer.waitFor({ state: "hidden" });

    await workspaceAction("Sessions").click();
    const sessionDrawer = reactRoot.getByRole("dialog", { name: "Sessions" });
    await sessionDrawer.waitFor({ state: "visible" });
    await sessionDrawer.locator("input[placeholder='Session 名称（可选）']").fill("CI smoke session");
    await sessionDrawer.getByRole("button", { name: "保存当前 Session" }).click();
    await sessionDrawer.locator(".workspace-react-session-card").waitFor({ state: "visible" });
    assert.match(await sessionDrawer.innerText(), /CI smoke session/);
    assert.equal(await libraryCard("Sessions").locator(".ui-badge").innerText(), "1");
    await reactRoot.locator(".workspace-session-card").getByText("CI smoke session").waitFor({ state: "visible" });
    assert.match(await reactRoot.locator(".workspace-session-card").first().innerText(), /[1-9]\d* 个模型/);
    assert.match(await reactRoot.locator(".workspace-session-card").first().innerText(), /字符/);
    await sessionDrawer.locator(".workspace-react-session-card").first().getByRole("button", { name: "加载" }).click();
    await sessionDrawer.waitFor({ state: "hidden" });
    assert.equal(await page.locator("#promptInput").inputValue(), templatePrompt);

    await workspaceAction("Sessions").click();
    const reopenedSessionDrawer = reactRoot.getByRole("dialog", { name: "Sessions" });
    await reopenedSessionDrawer.locator(".workspace-react-session-card").first().getByRole("button", { name: "删除" }).click();
    await reopenedSessionDrawer.getByText("还没有保存的 Session").waitFor({ state: "visible" });
    assert.equal(await libraryCard("Sessions").locator(".ui-badge").innerText(), "0");
    await page.locator(".workspace-session-empty").waitFor({ state: "visible" });
    await reopenedSessionDrawer.getByRole("button", { name: "关闭 Sessions" }).click();
    await reopenedSessionDrawer.waitFor({ state: "hidden" });

    await workspaceAction("Compare").click();
    const compareDrawer = reactRoot.getByRole("dialog", { name: "Comparison" });
    await compareDrawer.waitFor({ state: "visible" });
    assert.equal(await compareDrawer.getByRole("button", { name: "Send Agent" }).isDisabled(), true);
    assert.match(await reactRoot.getByRole("region", { name: "Agent Handoff" }).innerText(), /待准备/);
    writeDiagnostics(diagnosticsDir, { status: "passed", stage: "complete", code: null });
  } catch (error) {
    writeDiagnostics(diagnosticsDir, {
      status: "failed",
      stage,
      code: diagnosticCode(error)
    });
    throw error;
  } finally {
    if (context) {
      await context.close();
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch(async (error) => {
  console.error(`[browser-smoke] failed (${diagnosticCode(error)}); inspect sanitized diagnostics artifact`);
  process.exitCode = 1;
});
