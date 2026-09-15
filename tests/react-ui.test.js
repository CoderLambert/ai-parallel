const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extensionRoot = path.join(__dirname, "..", "apps", "browser-extension");

function read(...parts) {
  return fs.readFileSync(path.join(extensionRoot, ...parts), "utf8");
}

test("React extension pages use local module and style assets under the extension CSP", () => {
  const popupHtml = read("entrypoints", "popup", "index.html");
  const templateHtml = read("entrypoints", "templates.html");

  for (const html of [popupHtml, templateHtml]) {
    assert.doesNotMatch(html, /https?:\/\//);
    assert.match(html, /<script type="module" src="[./a-z-]+\.tsx"><\/script>/);
  }
  assert.match(popupHtml, /id="root"/);
  assert.match(templateHtml, /id="root"/);
});

test("Popup React slice preserves provider, storage, message, keyboard, and template entry behavior", () => {
  const source = read("entrypoints", "popup", "main.tsx");
  assert.match(source, /AIParallelProviderCatalog/);
  assert.match(source, /selectedProviders/);
  assert.match(source, /pendingLaunch/);
  assert.match(source, /OPEN_WORKSPACE/);
  assert.match(source, /Ctrl \/ ⌘ \+ Enter/);
  assert.match(source, /role="checkbox"/);
  assert.match(source, /templates\.html/);
  assert.match(source, /createRoot\(document\.getElementById\("root"\)!\)/);
});

test("React template library covers schema validation, import/export, editing, and empty/error states", () => {
  const source = read("ui", "template-library", "main.tsx");
  assert.match(source, /parseTemplateImport/);
  assert.match(source, /validateTemplateDefinition/);
  assert.match(source, /renderPromptTemplate/);
  assert.match(source, /toPackage/);
  assert.match(source, /promptTemplatesV1/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /没有匹配的模板/);
  assert.match(source, /OPEN_WORKSPACE/);
  assert.match(source, /编辑模板定义/);
  assert.match(source, /createRoot\(document\.getElementById\("root"\)!\)/);
});

test("Workspace React shell owns the generated toolbar and delegates legacy runtime actions", () => {
  const shell = read("ui", "workspace", "workspace-shell.tsx");
  const providerStrip = read("ui", "workspace", "features", "provider-strip.tsx");
  const readinessPanel = read("ui", "workspace", "features", "provider-readiness-panel.tsx");
  const compareStatus = read("ui", "workspace", "features", "compare-status.tsx");
  const handoffStatus = read("ui", "workspace", "features", "handoff-status.tsx");
  const libraryStatus = read("ui", "workspace", "features", "library-status.tsx");
  const sessionStatus = read("ui", "workspace", "features", "session-status.tsx");
  const promptStatus = read("ui", "workspace", "features", "prompt-status.tsx");
  const templateStatus = read("ui", "workspace", "features", "template-status.tsx");
  const entrypoint = read("entrypoints", "workspace-shell.tsx");
  const workspaceHtml = read("workspace", "index.html");
  const legacyWorkspace = read("workspace", "workspace.js");

  assert.match(shell, /ProviderStrip/);
  assert.match(shell, /WorkspaceActions/);
  assert.match(shell, /ai-parallel:workspace-set-selection/);
  assert.match(shell, /providerStates/);
  assert.doesNotMatch(shell, /responseBundles|contentWindow|iframe/);
  assert.match(providerStrip, /ProviderReadiness/);
  assert.match(providerStrip, /workspace-provider-readiness/);
  assert.match(providerStrip, /is-ready/);
  assert.match(shell, /ProviderReadinessPanel/);
  assert.match(shell, /triggerProviderPanelAction/);
  assert.match(readinessPanel, /ProviderPanelAction/);
  assert.match(readinessPanel, /reload/);
  assert.match(readinessPanel, /open/);
  assert.match(readinessPanel, /workspace-provider-readiness-card/);
  assert.match(shell, /CompareStatus/);
  assert.match(shell, /compare/);
  assert.match(compareStatus, /responseCount/);
  assert.match(compareStatus, /pendingCount/);
  assert.doesNotMatch(compareStatus, /responseBundles|response\.content|iframe/);
  assert.match(shell, /HandoffStatus/);
  assert.match(handoffStatus, /responseCount/);
  assert.match(handoffStatus, /Agent Handoff/);
  assert.doesNotMatch(handoffStatus, /responseBundles|response\.content|contextPackage|iframe/);
  assert.match(shell, /LibraryStatus/);
  assert.match(shell, /libraries/);
  assert.match(libraryStatus, /WorkspaceLibrarySummary/);
  assert.match(libraryStatus, /sessions/);
  assert.match(libraryStatus, /prompts/);
  assert.match(libraryStatus, /templates/);
  assert.doesNotMatch(libraryStatus, /promptLibraryEntries|userTemplateEntries|sessionEntries/);
  assert.match(shell, /SessionStatus/);
  assert.match(shell, /sessions/);
  assert.match(sessionStatus, /WorkspaceSessionSummary/);
  assert.match(sessionStatus, /promptLength/);
  assert.doesNotMatch(sessionStatus, /entry\.prompt|responseBundles|iframe/);
  assert.match(shell, /PromptStatus/);
  assert.match(shell, /prompts/);
  assert.match(promptStatus, /WorkspacePromptSummary/);
  assert.match(promptStatus, /contentLength/);
  assert.doesNotMatch(promptStatus, /entry\.content|responseBundles|iframe/);
  assert.match(shell, /TemplateStatus/);
  assert.match(shell, /templates/);
  assert.match(templateStatus, /WorkspaceTemplateSummary/);
  assert.match(templateStatus, /outputMode/);
  assert.doesNotMatch(templateStatus, /promptTemplate|inputSchema|outputSchema|responseBundles|iframe/);
  assert.match(shell, /sessionBtn/);
  assert.match(shell, /promptLibraryBtn/);
  assert.match(shell, /templateLibraryBtn/);
  assert.match(shell, /compareBtn/);
  assert.doesNotMatch(shell, /content\/providers/);
  assert.match(entrypoint, /defineUnlistedScript/);
  assert.match(entrypoint, /workspaceReactRoot/);
  assert.match(workspaceHtml, /id="workspaceReactRoot"/);
  assert.match(legacyWorkspace, /ai-parallel:workspace-state/);
  assert.match(legacyWorkspace, /function workspaceProviderStates/);
  assert.match(legacyWorkspace, /providerStates: workspaceProviderStates\(\)/);
  assert.match(legacyWorkspace, /function workspaceCompareState/);
  assert.match(legacyWorkspace, /responseCount: responseBundles\.size/);
  assert.match(legacyWorkspace, /function workspaceLibraryState/);
  assert.match(legacyWorkspace, /templates: allPromptTemplates\(\)\.length/);
  assert.match(legacyWorkspace, /function workspaceSessionState/);
  assert.match(legacyWorkspace, /promptLength: typeof entry\.prompt === "string" \? entry\.prompt\.length : 0/);
  assert.match(legacyWorkspace, /sessions: workspaceSessionState\(\)/);
  assert.match(legacyWorkspace, /function workspacePromptState/);
  assert.match(legacyWorkspace, /contentLength: typeof entry\.content === "string" \? entry\.content\.length : 0/);
  assert.match(legacyWorkspace, /prompts: workspacePromptState\(\)/);
  assert.match(legacyWorkspace, /function workspaceTemplateState/);
  assert.match(legacyWorkspace, /outputMode: template\.output\?\.mode === "json" \? "json" : "text"/);
  assert.match(legacyWorkspace, /templates: workspaceTemplateState\(\)/);
  assert.match(legacyWorkspace, /ai-parallel:workspace-set-selection/);
});
