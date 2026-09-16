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
const diagnosticsDir = path.join(process.cwd(), "test-results", "extension-pages-smoke");

async function run() {
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-parallel-pages-smoke-"));
  let context;
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
    await context.route("https://**/*", (route) => route.abort());

    stage = "extension-load";
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionId = new URL(serviceWorker.url()).hostname;

    stage = "popup-flow";
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
    if (!await popup.locator(".popup-app").count()) {
      throw new Error("Browser smoke requires a generated Chrome artifact; run pnpm build:chrome first or set AI_PARALLEL_EXTENSION_ROOT");
    }
    await popup.locator(".popup-app").waitFor({ state: "visible" });
    const providerOptions = popup.getByRole("checkbox");
    await providerOptions.first().waitFor({ state: "visible" });
    assert.equal(await providerOptions.count(), 8);
    assert.equal(await popup.getByRole("checkbox", { name: "ChatGPT" }).getAttribute("aria-checked"), "true");

    const popupPrompt = popup.locator(".popup-composer textarea");
    await popupPrompt.fill("Pages smoke prompt");
    assert.equal(await popup.getByRole("button", { name: "并行发送" }).isDisabled(), false);
    await popup.getByRole("button", { name: "清空输入" }).click();
    assert.equal(await popupPrompt.inputValue(), "");
    await popupPrompt.fill("Pages smoke launch prompt");

    const workspacePagePromise = context.waitForEvent("page");
    await popup.getByRole("button", { name: "并行发送" }).click();
    const workspace = await workspacePagePromise;
    await workspace.waitForLoadState("domcontentloaded");
    await workspace.locator("body[data-react-workspace='true']").waitFor({ state: "attached" });
    await workspace.locator("#promptInput").waitFor({ state: "visible" });
    assert.equal(await workspace.locator("#promptInput").inputValue(), "Pages smoke launch prompt");

    stage = "template-library-flow";
    const templates = await context.newPage();
    await templates.goto(`chrome-extension://${extensionId}/templates.html`, { waitUntil: "domcontentloaded" });
    await templates.getByRole("heading", { name: "Prompt Template Library" }).waitFor({ state: "visible" });
    const templateCards = templates.locator(".template-grid .template-card");
    await templateCards.first().waitFor({ state: "visible" });
    assert.equal(await templateCards.count(), 3);

    const search = templates.getByRole("searchbox", { name: "搜索模板" });
    await search.fill("HTTP");
    await templates.getByRole("heading", { name: "HTTP 状态码语义" }).waitFor({ state: "visible" });
    assert.equal(await templateCards.count(), 1);
    await search.fill("");
    await templates.getByRole("combobox", { name: "模板分类" }).selectOption("code");
    await templates.getByRole("heading", { name: "代码格式化" }).waitFor({ state: "visible" });
    assert.equal(await templateCards.count(), 1);
    await templates.getByRole("combobox", { name: "模板分类" }).selectOption("all");

    await templates.locator(".template-card", { hasText: "英文翻译" }).getByRole("button", { name: "使用" }).click();
    const templateDialog = templates.getByRole("dialog", { name: "英文翻译" });
    await templateDialog.waitFor({ state: "visible" });
    await templateDialog.locator("textarea").first().fill("Keep the original structure.");
    await templateDialog.getByRole("combobox", { name: /目标语言/ }).selectOption("简体中文");
    assert.match(await templateDialog.locator(".template-preview pre").innerText(), /Keep the original structure/);
    await templateDialog.getByRole("button", { name: "关闭模板表单" }).click();
    await templateDialog.waitFor({ state: "hidden" });

    const importedTemplate = {
      kind: "ai-parallel.prompt-template",
      schemaVersion: 1,
      id: "user.pages-smoke-template",
      version: 1,
      name: "Pages smoke template",
      categoryId: "custom",
      description: "Imported by extension pages smoke",
      promptTemplate: "Review {{text}}",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", minLength: 1 } },
        required: ["text"],
        additionalProperties: false
      },
      output: { mode: "text" }
    };
    const importInput = templates.locator("#template-import");
    await importInput.setInputFiles({
      name: "pages-smoke-template.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importedTemplate))
    });
    await templates.getByRole("heading", { name: "Pages smoke template" }).waitFor({ state: "visible" });
    assert.equal(await templateCards.count(), 4);
    assert.match(await templates.getByRole("status").innerText(), /已导入 1 个模板/);

    await importInput.setInputFiles({
      name: "invalid-pages-smoke-template.json",
      mimeType: "application/json",
      buffer: Buffer.from("not json")
    });
    await templates.getByRole("alert").waitFor({ state: "visible" });
    assert.match(await templates.getByRole("alert").innerText(), /导入失败/);
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

run().catch((error) => {
  console.error(`[extension-pages-smoke] failed (${diagnosticCode(error)}); inspect sanitized diagnostics artifact`);
  process.exitCode = 1;
});
