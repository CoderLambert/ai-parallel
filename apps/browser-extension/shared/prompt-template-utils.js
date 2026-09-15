(() => {
  const TEMPLATE_KIND = "ai-parallel.prompt-template";
  const PACKAGE_KIND = "ai-parallel.prompt-template-package";
  const SCHEMA_VERSION = 1;
  const DRAFT_URI = "https://json-schema.org/draft/2020-12/schema";
  const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;
  const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,95}$/;
  const CATEGORY_PATTERN = /^[a-z][a-z0-9._-]{1,31}$/;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createId(prefix = "imported") {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${prefix}.${uuid}`.slice(0, 96);
    return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`.slice(0, 96);
  }

  function pathFor(path, key) {
    if (typeof key === "number") return `${path}[${key}]`;
    return path ? `${path}.${key}` : String(key);
  }

  function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function typeMatches(value, type) {
    if (type === "null") return value === null;
    if (type === "object") return isObject(value);
    if (type === "array") return Array.isArray(value);
    if (type === "string") return typeof value === "string";
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    if (type === "integer") return Number.isInteger(value);
    if (type === "boolean") return typeof value === "boolean";
    return true;
  }

  function resolveLocalRef(rootSchema, reference) {
    if (typeof reference !== "string") return null;
    if (reference === "#") return rootSchema;
    if (!reference.startsWith("#/")) return null;
    return reference.slice(2).split("/").reduce((value, segment) => {
      if (value === undefined || value === null) return undefined;
      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      return value[key];
    }, rootSchema) || null;
  }

  function validateSchemaDefinition(schema, path = "$", rootSchema = schema, seen = new Set()) {
    const errors = [];
    if (!isObject(schema)) {
      return [{ path, message: "Schema must be a JSON object" }];
    }

    if (typeof schema.$ref === "string") {
      if (!schema.$ref.startsWith("#")) {
        errors.push({ path: `${path}.$ref`, message: "External $ref values are not supported" });
      }
      return errors;
    }

    if (seen.has(schema)) return errors;
    seen.add(schema);

    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.length || types.some((type) => typeof type !== "string" || ![
        "null", "object", "array", "string", "number", "integer", "boolean"
      ].includes(type))) {
        errors.push({ path: `${path}.type`, message: "Unsupported JSON Schema type" });
      }
    }

    if (schema.properties !== undefined) {
      if (!isObject(schema.properties)) {
        errors.push({ path: `${path}.properties`, message: "properties must be an object" });
      } else {
        for (const [key, child] of Object.entries(schema.properties)) {
          errors.push(...validateSchemaDefinition(child, `${path}.properties.${key}`, rootSchema, seen));
        }
      }
    }

    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required)
        || schema.required.some((key) => typeof key !== "string")
        || new Set(schema.required).size !== schema.required.length) {
        errors.push({ path: `${path}.required`, message: "required must be a unique string array" });
      }
    }

    if (schema.additionalProperties !== undefined
      && typeof schema.additionalProperties !== "boolean"
      && !isObject(schema.additionalProperties)) {
      errors.push({ path: `${path}.additionalProperties`, message: "additionalProperties must be boolean or schema" });
    } else if (isObject(schema.additionalProperties)) {
      errors.push(...validateSchemaDefinition(schema.additionalProperties, `${path}.additionalProperties`, rootSchema, seen));
    }

    if (schema.items !== undefined) {
      if (Array.isArray(schema.items)) {
        schema.items.forEach((child, index) => {
          errors.push(...validateSchemaDefinition(child, `${path}.items[${index}]`, rootSchema, seen));
        });
      } else {
        errors.push(...validateSchemaDefinition(schema.items, `${path}.items`, rootSchema, seen));
      }
    }

    if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
      errors.push({ path: `${path}.enum`, message: "enum must be an array" });
    }

    if (schema.const !== undefined && typeof schema.const === "function") {
      errors.push({ path: `${path}.const`, message: "const must be JSON data" });
    }

    for (const keyword of ["allOf", "anyOf", "oneOf"]) {
      if (schema[keyword] === undefined) continue;
      if (!Array.isArray(schema[keyword]) || !schema[keyword].length) {
        errors.push({ path: `${path}.${keyword}`, message: `${keyword} must be a non-empty schema array` });
        continue;
      }
      schema[keyword].forEach((child, index) => {
        errors.push(...validateSchemaDefinition(child, `${path}.${keyword}[${index}]`, rootSchema, seen));
      });
    }

    for (const keyword of ["minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"]) {
      if (schema[keyword] !== undefined && (typeof schema[keyword] !== "number" || schema[keyword] < 0)) {
        errors.push({ path: `${path}.${keyword}`, message: `${keyword} must be a non-negative number` });
      }
    }

    if (schema.pattern !== undefined) {
      try {
        if (typeof schema.pattern !== "string") throw new Error("not a string");
        new RegExp(schema.pattern);
      } catch {
        errors.push({ path: `${path}.pattern`, message: "pattern must be a valid regular expression" });
      }
    }

    seen.delete(schema);
    return errors;
  }

  function validateValue(value, schema, path = "$", rootSchema = schema, depth = 0) {
    if (!isObject(schema)) return [{ path, message: "Schema must be an object" }];
    if (depth > 32) return [{ path, message: "Schema nesting is too deep" }];

    if (schema.$ref) {
      const target = resolveLocalRef(rootSchema, schema.$ref);
      return target
        ? validateValue(value, target, path, rootSchema, depth + 1)
        : [{ path, message: `Unable to resolve local $ref ${schema.$ref}` }];
    }

    const errors = [];
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((type) => typeMatches(value, type))) {
        errors.push({ path, message: `Expected ${types.join(" or ")}` });
        return errors;
      }
    }

    if (schema.const !== undefined && !sameJson(value, schema.const)) {
      errors.push({ path, message: "Value does not match const" });
    }
    if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => sameJson(value, candidate))) {
      errors.push({ path, message: "Value is not in enum" });
    }

    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({ path, message: `Must contain at least ${schema.minLength} characters` });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({ path, message: `Must contain no more than ${schema.maxLength} characters` });
      }
      if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
        errors.push({ path, message: "Value does not match pattern" });
      }
    }

    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, message: `Must be >= ${schema.minimum}` });
      if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, message: `Must be <= ${schema.maximum}` });
    }

    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push({ path, message: `Must contain at least ${schema.minItems} items` });
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({ path, message: `Must contain no more than ${schema.maxItems} items` });
      }
      if (Array.isArray(schema.items)) {
        value.forEach((item, index) => {
          const itemSchema = schema.items[index];
          if (itemSchema) errors.push(...validateValue(item, itemSchema, pathFor(path, index), rootSchema, depth + 1));
        });
      } else if (isObject(schema.items)) {
        value.forEach((item, index) => {
          errors.push(...validateValue(item, schema.items, pathFor(path, index), rootSchema, depth + 1));
        });
      }
    }

    if (isObject(value)) {
      const properties = isObject(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const key of required) {
        if (!(key in value)) errors.push({ path: pathFor(path, key), message: "Required property is missing" });
      }
      for (const [key, childSchema] of Object.entries(properties)) {
        if (key in value) errors.push(...validateValue(value[key], childSchema, pathFor(path, key), rootSchema, depth + 1));
      }
      for (const [key, childValue] of Object.entries(value)) {
        if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
        if (schema.additionalProperties === false) {
          errors.push({ path: pathFor(path, key), message: "Additional property is not allowed" });
        } else if (isObject(schema.additionalProperties)) {
          errors.push(...validateValue(childValue, schema.additionalProperties, pathFor(path, key), rootSchema, depth + 1));
        }
      }
    }

    for (const keyword of ["allOf", "anyOf", "oneOf"]) {
      if (!Array.isArray(schema[keyword])) continue;
      const results = schema[keyword].map((child) => validateValue(value, child, path, rootSchema, depth + 1));
      if (keyword === "allOf") {
        results.forEach((result) => errors.push(...result));
      } else {
        const validCount = results.filter((result) => result.length === 0).length;
        const valid = keyword === "anyOf" ? validCount > 0 : validCount === 1;
        if (!valid) errors.push({ path, message: `${keyword} constraint failed` });
      }
    }

    return errors;
  }

  function extractPlaceholders(prompt = "") {
    const names = [];
    const seen = new Set();
    for (const match of String(prompt).matchAll(PLACEHOLDER_PATTERN)) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        names.push(match[1]);
      }
    }
    return names;
  }

  function schemaProperties(schema) {
    return isObject(schema?.properties) ? schema.properties : {};
  }

  function validateTemplateDefinition(template) {
    const errors = [];
    const warnings = [];
    if (!isObject(template)) return { ok: false, errors: [{ path: "$", message: "Template must be an object" }], warnings };
    if (template.kind !== TEMPLATE_KIND) errors.push({ path: "$.kind", message: `kind must be ${TEMPLATE_KIND}` });
    if (template.schemaVersion !== SCHEMA_VERSION) errors.push({ path: "$.schemaVersion", message: `schemaVersion must be ${SCHEMA_VERSION}` });
    if (typeof template.id !== "string" || !ID_PATTERN.test(template.id)) errors.push({ path: "$.id", message: "id must contain 2-96 lowercase URL-safe characters" });
    if (!Number.isInteger(template.version) || template.version < 1) errors.push({ path: "$.version", message: "version must be a positive integer" });
    if (typeof template.name !== "string" || !template.name.trim()) errors.push({ path: "$.name", message: "name is required" });
    if (typeof template.categoryId !== "string" || !CATEGORY_PATTERN.test(template.categoryId)) errors.push({ path: "$.categoryId", message: "categoryId must be lowercase URL-safe text" });
    if (typeof template.description !== "string") errors.push({ path: "$.description", message: "description must be a string" });
    if (typeof template.promptTemplate !== "string" || !template.promptTemplate.trim()) errors.push({ path: "$.promptTemplate", message: "promptTemplate is required" });

    if (!isObject(template.inputSchema)) {
      errors.push({ path: "$.inputSchema", message: "inputSchema is required" });
    } else {
      errors.push(...validateSchemaDefinition(template.inputSchema, "$.inputSchema"));
      if (template.inputSchema.type !== "object") errors.push({ path: "$.inputSchema.type", message: "inputSchema.type must be object" });
    }

    if (!isObject(template.output)) {
      errors.push({ path: "$.output", message: "output is required" });
    } else {
      if (!["text", "json"].includes(template.output.mode)) errors.push({ path: "$.output.mode", message: "output.mode must be text or json" });
      if (template.output.mode === "json") {
        if (!isObject(template.output.schema)) errors.push({ path: "$.output.schema", message: "JSON output requires output.schema" });
        else errors.push(...validateSchemaDefinition(template.output.schema, "$.output.schema"));
      }
    }

    if (template.tags !== undefined && (!Array.isArray(template.tags) || template.tags.some((tag) => typeof tag !== "string"))) {
      errors.push({ path: "$.tags", message: "tags must be a string array" });
    }

    const properties = schemaProperties(template.inputSchema);
    const placeholders = extractPlaceholders(template.promptTemplate);
    for (const name of placeholders) {
      if (!Object.prototype.hasOwnProperty.call(properties, name)) {
        errors.push({ path: "$.promptTemplate", message: `Unknown placeholder {{${name}}}` });
      }
    }
    for (const required of Array.isArray(template.inputSchema?.required) ? template.inputSchema.required : []) {
      if (!placeholders.includes(required)) warnings.push({ path: "$.promptTemplate", message: `Required input ${required} is not referenced in promptTemplate` });
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  function normalizeTemplate(raw, { source = "imported" } = {}) {
    const value = clone(raw) || {};
    const prompt = typeof value.promptTemplate === "string"
      ? value.promptTemplate
      : typeof value.content === "string"
        ? value.content
        : "";
    const firstLine = prompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    const normalized = {
      $schema: typeof value.$schema === "string" ? value.$schema : undefined,
      kind: TEMPLATE_KIND,
      schemaVersion: SCHEMA_VERSION,
      id: typeof value.id === "string" && ID_PATTERN.test(value.id) ? value.id : createId(source),
      version: Number.isInteger(value.version) && value.version > 0 ? value.version : 1,
      name: typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : typeof value.title === "string" && value.title.trim()
          ? value.title.trim()
          : (firstLine || "Imported Prompt Template").slice(0, 80),
      categoryId: typeof value.categoryId === "string" && CATEGORY_PATTERN.test(value.categoryId) ? value.categoryId : "custom",
      description: typeof value.description === "string" ? value.description : "Imported prompt template",
      tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === "string").slice(0, 20) : [],
      promptTemplate: prompt.trim(),
      inputSchema: isObject(value.inputSchema)
        ? value.inputSchema
        : {
            $schema: DRAFT_URI,
            type: "object",
            properties: {},
            additionalProperties: false
          },
      output: isObject(value.output)
        ? value.output
        : { mode: "text" },
      metadata: {
        ...(isObject(value.metadata) ? value.metadata : {}),
        source
      }
    };
    if (!normalized.$schema) delete normalized.$schema;
    return normalized;
  }

  function parseJsonText(text) {
    const input = String(text || "").trim().replace(/^\uFEFF/, "");
    if (!input) throw new Error("JSON 内容为空");
    const fenced = input.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return JSON.parse(fenced ? fenced[1] : input);
  }

  function unwrapTemplates(value) {
    if (Array.isArray(value)) return value;
    if (isObject(value) && Array.isArray(value.templates)) return value.templates;
    if (isObject(value) && isObject(value.template)) return [value.template];
    return [value];
  }

  function parseTemplateImport(text, { source = "imported" } = {}) {
    let parsed;
    try {
      parsed = parseJsonText(text);
    } catch (error) {
      return { ok: false, templates: [], errors: [{ path: "$", message: error instanceof Error ? error.message : "JSON 解析失败" }], warnings: [] };
    }

    const templates = unwrapTemplates(parsed).map((value) => normalizeTemplate(value, { source }));
    const errors = [];
    const warnings = [];
    templates.forEach((template, index) => {
      const result = validateTemplateDefinition(template);
      result.errors.forEach((error) => errors.push({ ...error, path: `templates[${index}]${error.path.slice(1)}` }));
      result.warnings.forEach((warning) => warnings.push({ ...warning, path: `templates[${index}]${warning.path.slice(1)}` }));
    });
    return { ok: errors.length === 0 && templates.length > 0, templates, errors, warnings };
  }

  function toPackage(templates) {
    return {
      kind: PACKAGE_KIND,
      schemaVersion: SCHEMA_VERSION,
      templates: templates.map((template) => clone(template))
    };
  }

  function renderPromptTemplate(template, values, { appendOutputSchema = true } = {}) {
    const inputErrors = validateValue(values, template.inputSchema);
    if (inputErrors.length) return { ok: false, errors: inputErrors };
    const prompt = template.promptTemplate.replace(PLACEHOLDER_PATTERN, (_match, name) => {
      const value = values[name];
      return typeof value === "string" ? value : JSON.stringify(value);
    });
    if (template.output?.mode !== "json" || appendOutputSchema !== true) return { ok: true, prompt };
    return {
      ok: true,
      prompt: `${prompt}\n\n[Output Contract]\nReturn exactly one valid JSON object. Do not use Markdown code fences. The response must validate against this JSON Schema:\n${JSON.stringify(template.output.schema, null, 2)}`
    };
  }

  function stripJsonFence(text) {
    const input = String(text || "").trim();
    const fenced = input.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : input;
  }

  function validateTemplateResponse(template, content) {
    if (template.output?.mode !== "json") return { ok: true, mode: "text", value: content };
    let value;
    try {
      value = JSON.parse(stripJsonFence(content));
    } catch (error) {
      return {
        ok: false,
        mode: "json",
        error: error instanceof Error ? error.message : "返回结果不是合法 JSON"
      };
    }
    const errors = validateValue(value, template.output.schema);
    return errors.length
      ? { ok: false, mode: "json", value, errors }
      : { ok: true, mode: "json", value };
  }

  function inferSchemaFromValue(value, title = "Inferred value", depth = 0) {
    if (depth > 8) return { type: "string", description: "Nested value omitted at depth limit" };
    if (value === null) return { type: "null", title };
    if (Array.isArray(value)) {
      return {
        type: "array",
        title,
        items: value.length ? inferSchemaFromValue(value[0], "Item", depth + 1) : {}
      };
    }
    if (isObject(value)) {
      const properties = {};
      for (const [key, child] of Object.entries(value)) properties[key] = inferSchemaFromValue(child, key, depth + 1);
      return {
        type: "object",
        title,
        properties,
        required: Object.keys(properties),
        additionalProperties: false
      };
    }
    if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number", title };
    return { type: typeof value, title };
  }

  const templateSchema = {
    $schema: DRAFT_URI,
    $id: "https://raw.githubusercontent.com/CoderLambert/ai-parallel/main/apps/browser-extension/schemas/prompt-template.schema.json",
    title: "AI Parallel Prompt Template",
    description: "A locally stored prompt template definition for AI Parallel.",
    type: "object",
    additionalProperties: false,
    required: ["kind", "schemaVersion", "id", "version", "name", "categoryId", "description", "promptTemplate", "inputSchema", "output"],
    properties: {
      $schema: { type: "string" },
      kind: { const: TEMPLATE_KIND },
      schemaVersion: { const: SCHEMA_VERSION },
      id: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]{1,95}$" },
      version: { type: "integer", minimum: 1 },
      name: { type: "string", minLength: 1, maxLength: 80 },
      categoryId: { type: "string", pattern: "^[a-z][a-z0-9._-]{1,31}$" },
      description: { type: "string", maxLength: 500 },
      tags: { type: "array", items: { type: "string" }, maxItems: 20 },
      promptTemplate: { type: "string", minLength: 1 },
      inputSchema: { type: "object", description: "A JSON Schema object whose root type must be object" },
      output: {
        type: "object",
        additionalProperties: false,
        required: ["mode"],
        properties: {
          mode: { enum: ["text", "json"] },
          schema: { type: "object", description: "Required when mode is json" }
        }
      },
      metadata: { type: "object" }
    }
  };

  const packageSchema = {
    $schema: DRAFT_URI,
    $id: "https://raw.githubusercontent.com/CoderLambert/ai-parallel/main/apps/browser-extension/schemas/prompt-template-package.schema.json",
    title: "AI Parallel Prompt Template Package",
    type: "object",
    additionalProperties: false,
    required: ["kind", "schemaVersion", "templates"],
    properties: {
      kind: { const: PACKAGE_KIND },
      schemaVersion: { const: SCHEMA_VERSION },
      templates: { type: "array", minItems: 1, items: { $ref: "#/$defs/template" } }
    },
    $defs: { template: templateSchema }
  };

  globalThis.AIParallelPromptTemplateUtils = Object.freeze({
    DRAFT_URI,
    TEMPLATE_KIND,
    PACKAGE_KIND,
    SCHEMA_VERSION,
    templateSchema: clone(templateSchema),
    packageSchema: clone(packageSchema),
    clone,
    extractPlaceholders,
    inferSchemaFromValue,
    normalizeTemplate,
    parseTemplateImport,
    renderPromptTemplate,
    validateJsonSchema: validateSchemaDefinition,
    validateJsonValue: validateValue,
    validateTemplateDefinition,
    validateTemplateResponse,
    toPackage,
    buildTemplateGenerationPrompt(requirement = "") {
      const scenario = String(requirement || "").trim() || "请根据我接下来描述的场景生成模板";
      return [
        "你是 AI Parallel 提示词模板设计器。",
        "请严格按照下面的 JSON Schema 生成一个 ai-parallel.prompt-template 对象。",
        "只能输出 JSON，不要输出 Markdown 代码块、解释文字或额外字段。",
        "promptTemplate 中的每一个 {{fieldName}} 都必须在 inputSchema.properties 中定义。",
        "如果 output.mode 为 json，必须提供完整的 output.schema，并明确 required、description 和 additionalProperties。",
        "场景需求：",
        scenario,
        "",
        "模板 JSON Schema：",
        JSON.stringify(templateSchema, null, 2)
      ].join("\n");
    }
  });
})();
