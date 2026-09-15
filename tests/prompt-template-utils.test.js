const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sharedRoot = path.join(__dirname, "..", "apps", "browser-extension", "shared");

function loadCatalog() {
  const context = { console };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["prompt-template-utils.js", "prompt-template-catalog.js"]) {
    const filename = path.join(sharedRoot, file);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  }
  return {
    utils: context.AIParallelPromptTemplateUtils,
    catalog: context.AIParallelPromptTemplateCatalog
  };
}

test("built-in prompt templates satisfy the shared contract", () => {
  const { utils, catalog } = loadCatalog();
  assert.equal(catalog.templates.length, 3);
  assert.ok(catalog.categories.some((category) => category.id === "translation"));
  for (const template of catalog.templates) {
    const result = utils.validateTemplateDefinition(template);
    assert.equal(result.ok, true, `${template.id}: ${JSON.stringify(result.errors)}`);
    assert.equal(JSON.stringify(result.errors), "[]");
  }
});

test("template import accepts a single fenced JSON template and rejects unknown placeholders", () => {
  const { utils } = loadCatalog();
  const valid = {
    kind: utils.TEMPLATE_KIND,
    schemaVersion: 1,
    id: "user.example.template",
    version: 1,
    name: "Example",
    categoryId: "custom",
    description: "Example template",
    promptTemplate: "Review {{text}}",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false
    },
    output: { mode: "text" }
  };
  const imported = utils.parseTemplateImport(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);
  assert.equal(imported.ok, true);
  assert.equal(imported.templates[0].id, valid.id);

  const invalid = utils.parseTemplateImport(JSON.stringify({
    ...valid,
    promptTemplate: "Review {{missing}}"
  }));
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0].message, /Unknown placeholder/);
});

test("rendering validates typed inputs and appends the JSON output contract", () => {
  const { utils, catalog } = loadCatalog();
  const template = catalog.templates.find((entry) => entry.id === "builtin.http.status-semantics");
  const rendered = utils.renderPromptTemplate(template, {
    statusCode: 404,
    method: "GET",
    context: "API request failed"
  });
  assert.equal(rendered.ok, true);
  assert.match(rendered.prompt, /404/);
  assert.match(rendered.prompt, /Output Contract/);
  assert.match(rendered.prompt, /statusCode/);

  const invalid = utils.renderPromptTemplate(template, {
    statusCode: "404",
    method: "GET",
    context: ""
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0].message, /integer/);
});

test("JSON response validation accepts fenced JSON and reports schema failures", () => {
  const { utils, catalog } = loadCatalog();
  const template = catalog.templates.find((entry) => entry.id === "builtin.translation.en-to-zh");
  const valid = utils.validateTemplateResponse(template, "```json\n{\"translation\":\"你好\",\"sourceLanguage\":\"English\",\"notes\":[]}\n```");
  assert.equal(valid.ok, true);
  assert.equal(valid.value.translation, "你好");

  const invalid = utils.validateTemplateResponse(template, JSON.stringify({
    translation: "你好",
    sourceLanguage: "English"
  }));
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.path.endsWith("notes")));
});

test("schema inference produces a strict object schema for an imported result", () => {
  const { utils } = loadCatalog();
  const schema = utils.inferSchemaFromValue({ statusCode: 404, retryable: false, causes: ["missing"] });
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.equal(JSON.stringify(schema.required), JSON.stringify(["statusCode", "retryable", "causes"]));
  assert.equal(schema.properties.statusCode.type, "integer");
  assert.equal(schema.properties.causes.items.type, "string");
});

test("generation prompt contains the canonical template schema", () => {
  const { utils } = loadCatalog();
  const prompt = utils.buildTemplateGenerationPrompt("生成一个 HTTP 状态码解释模板");
  assert.match(prompt, /HTTP 状态码解释模板/);
  assert.match(prompt, /ai-parallel\.prompt-template/);
  assert.match(prompt, /inputSchema/);
  assert.match(prompt, /output/);
});
