const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const file = path.join(__dirname, "..", "apps", "browser-extension", "workspace", "context-utils.js");

function loadUtils() {
  const context = {};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context.AIParallelWorkspaceUtils;
}

test("context utilities produce the documented export formats", () => {
  const utils = loadUtils();
  const providers = [
    { id: "chatgpt", name: "ChatGPT" },
    { id: "deepseek", name: "DeepSeek" }
  ];
  const responses = new Map([
    ["chatgpt", { ok: true, response: { provider: "chatgpt", content: "Answer A", markdown: "**Answer A**", timestamp: "2026-09-14T00:00:00.000Z" } }],
    ["deepseek", { ok: false, error: "未找到回答" }]
  ]);

  const markdown = utils.buildComparisonMarkdown("What?", providers, responses);
  assert.match(markdown, /^# AI Parallel Context/m);
  assert.match(markdown, /## ChatGPT/);
  assert.match(markdown, /\*\*Answer A\*\*/);
  assert.match(markdown, /## DeepSeek/);

  const json = JSON.parse(utils.buildComparisonJson("What?", providers, responses));
  assert.equal(json.question, "What?");
  assert.equal(json.responses[0].provider, "chatgpt");
  assert.equal(json.responses[1].error, "未找到回答");

  const handoff = utils.buildHandoffPrompt("What?", providers, responses);
  assert.match(handoff, /target agent/);
  assert.match(handoff, /Answer A/);
});
