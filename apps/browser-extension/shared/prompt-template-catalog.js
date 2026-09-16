// @ts-check

(() => {
  const utils = globalThis.AIParallelPromptTemplateUtils;

  /** @type {import("../contracts/template").PromptTemplateCategory[]} */
  const categories = [
    { id: "translation", name: "翻译", description: "翻译、术语和本地化任务" },
    { id: "code", name: "代码", description: "代码格式化、解释和重构任务" },
    { id: "http", name: "HTTP / Web", description: "HTTP、Web API 和网络问题" },
    { id: "extraction", name: "信息提取", description: "从文本中提取结构化信息" },
    { id: "classification", name: "文本分类", description: "意图、主题和风险分类" },
    { id: "summarization", name: "摘要总结", description: "摘要、要点和会议纪要" },
    { id: "rewrite", name: "改写润色", description: "风格改写、润色和校对" },
    { id: "analysis", name: "分析推理", description: "比较、分析和决策辅助" },
    { id: "custom", name: "自定义", description: "用户导入或创建的模板" }
  ];

  /** @type {import("../contracts/template").PromptTemplate[]} */
  const templates = [
    {
      $schema: utils.DRAFT_URI,
      kind: utils.TEMPLATE_KIND,
      schemaVersion: utils.SCHEMA_VERSION,
      id: "builtin.translation.en-to-zh",
      version: 1,
      name: "英文翻译",
      categoryId: "translation",
      description: "将英文内容翻译为指定语言，并保留 Markdown、代码和专有名词。",
      tags: ["translation", "english", "localization"],
      promptTemplate: [
        "你是一名专业译者。",
        "请将以下英文内容翻译成 {{targetLanguage}}。",
        "语气：{{tone}}。",
        "保留 Markdown 结构、代码、链接和专有名词。",
        "不要添加原文没有的事实。",
        "",
        "英文原文：",
        "{{sourceText}}"
      ].join("\n"),
      inputSchema: {
        $schema: utils.DRAFT_URI,
        type: "object",
        additionalProperties: false,
        properties: {
          sourceText: {
            type: "string",
            title: "英文原文",
            description: "需要翻译的英文内容",
            minLength: 1,
            examples: ["Please keep the original Markdown structure."]
          },
          targetLanguage: {
            type: "string",
            title: "目标语言",
            enum: ["简体中文", "繁體中文", "English"],
            default: "简体中文"
          },
          tone: {
            type: "string",
            title: "语气",
            enum: ["自然", "正式", "口语"],
            default: "自然"
          }
        },
        required: ["sourceText", "targetLanguage"]
      },
      output: {
        mode: "json",
        schema: {
          $schema: utils.DRAFT_URI,
          title: "Translation Result",
          type: "object",
          additionalProperties: false,
          properties: {
            translation: { type: "string", description: "翻译后的文本" },
            sourceLanguage: { type: "string", description: "识别出的源语言" },
            notes: { type: "array", items: { type: "string" }, description: "必要的翻译说明" }
          },
          required: ["translation", "sourceLanguage", "notes"],
          examples: [{
            translation: "请保留原始 Markdown 结构。",
            sourceLanguage: "English",
            notes: []
          }]
        }
      },
      metadata: { source: "builtin", language: "zh-CN" }
    },
    {
      $schema: utils.DRAFT_URI,
      kind: utils.TEMPLATE_KIND,
      schemaVersion: utils.SCHEMA_VERSION,
      id: "builtin.code.format",
      version: 1,
      name: "代码格式化",
      categoryId: "code",
      description: "只调整代码格式，不改变业务逻辑，并返回格式化结果和风险提示。",
      tags: ["code", "format", "lint"],
      promptTemplate: [
        "你是一名谨慎的代码格式化助手。",
        "请格式化下面的 {{language}} 代码。",
        "格式规范：{{styleGuide}}",
        "保留注释：{{preserveComments}}",
        "只修改缩进、空格、换行、引号等格式，不改变业务逻辑。",
        "如果发现语法或逻辑风险，请放入 warnings，不要擅自修复。",
        "",
        "源代码：",
        "{{sourceCode}}"
      ].join("\n"),
      inputSchema: {
        $schema: utils.DRAFT_URI,
        type: "object",
        additionalProperties: false,
        properties: {
          sourceCode: { type: "string", title: "源代码", minLength: 1 },
          language: {
            type: "string",
            title: "语言",
            enum: ["javascript", "typescript", "python", "json", "css", "html", "sql"],
            default: "javascript"
          },
          styleGuide: { type: "string", title: "格式规范", default: "遵循该语言主流格式规范" },
          preserveComments: { type: "boolean", title: "保留注释", default: true }
        },
        required: ["sourceCode", "language"]
      },
      output: {
        mode: "json",
        schema: {
          $schema: utils.DRAFT_URI,
          title: "Formatted Code Result",
          type: "object",
          additionalProperties: false,
          properties: {
            formattedCode: { type: "string", description: "格式化后的代码" },
            language: { type: "string" },
            changedSummary: { type: "string" },
            warnings: { type: "array", items: { type: "string" } }
          },
          required: ["formattedCode", "language", "changedSummary", "warnings"]
        }
      },
      metadata: { source: "builtin", language: "zh-CN" }
    },
    {
      $schema: utils.DRAFT_URI,
      kind: utils.TEMPLATE_KIND,
      schemaVersion: utils.SCHEMA_VERSION,
      id: "builtin.http.status-semantics",
      version: 1,
      name: "HTTP 状态码语义",
      categoryId: "http",
      description: "解释 HTTP 状态码的标准语义、常见原因、排查方向和是否适合重试。",
      tags: ["http", "web", "debugging"],
      promptTemplate: [
        "你是一名 HTTP 和 Web API 专家。",
        "请解释 HTTP 状态码 {{statusCode}} 的标准语义。",
        "请求方法：{{method}}",
        "上下文：{{context}}",
        "请区分标准定义、常见实践和推测内容。",
        "对于 retryable，只在有合理依据时返回 true。"
      ].join("\n"),
      inputSchema: {
        $schema: utils.DRAFT_URI,
        type: "object",
        additionalProperties: false,
        properties: {
          statusCode: { type: "integer", title: "HTTP 状态码", minimum: 100, maximum: 599, examples: [404] },
          method: {
            type: "string",
            title: "请求方法",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
            default: "GET"
          },
          context: { type: "string", title: "请求上下文", default: "" }
        },
        required: ["statusCode", "method"]
      },
      output: {
        mode: "json",
        schema: {
          $schema: utils.DRAFT_URI,
          title: "HTTP Status Semantics",
          type: "object",
          additionalProperties: false,
          properties: {
            statusCode: { type: "integer", minimum: 100, maximum: 599 },
            category: {
              type: "string",
              enum: ["informational", "success", "redirection", "client_error", "server_error", "unknown"]
            },
            standardPhrase: { type: "string" },
            meaning: { type: "string" },
            commonCauses: { type: "array", items: { type: "string" } },
            troubleshooting: { type: "array", items: { type: "string" } },
            retryable: { type: "boolean" },
            caveats: { type: "array", items: { type: "string" } }
          },
          required: [
            "statusCode",
            "category",
            "standardPhrase",
            "meaning",
            "commonCauses",
            "troubleshooting",
            "retryable",
            "caveats"
          ]
        }
      },
      metadata: { source: "builtin", language: "zh-CN" }
    }
  ];

  globalThis.AIParallelPromptTemplateCatalog = Object.freeze({
    categories: utils.clone(categories),
    templates: utils.clone(templates)
  });
})();
