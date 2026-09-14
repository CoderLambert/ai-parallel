(() => {
  const providers = [
    {
      id: "chatgpt",
      name: "ChatGPT",
      url: "https://chatgpt.com/",
      hosts: ["chatgpt.com", "chat.openai.com"],
      origins: ["https://chatgpt.com", "https://chat.openai.com"],
      mode: "iframe",
      default: true
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      url: "https://chat.deepseek.com/",
      hosts: ["chat.deepseek.com"],
      origins: ["https://chat.deepseek.com"],
      mode: "iframe",
      default: true
    },
    {
      id: "zhipu",
      name: "智谱清言",
      url: "https://chatglm.cn/",
      hosts: ["chatglm.cn"],
      origins: ["https://chatglm.cn"],
      mode: "iframe",
      default: true
    },
    {
      id: "qwen",
      name: "Qwen",
      url: "https://chat.qwen.ai/",
      hosts: ["chat.qwen.ai"],
      origins: ["https://chat.qwen.ai"],
      mode: "iframe",
      default: true
    },
    {
      id: "kimi",
      name: "Kimi",
      url: "https://www.kimi.com/",
      hosts: ["www.kimi.com", "kimi.com"],
      origins: ["https://www.kimi.com", "https://kimi.com"],
      mode: "iframe",
      default: true
    },
    {
      id: "claude",
      name: "Claude",
      url: "https://claude.ai/new",
      hosts: ["claude.ai"],
      origins: ["https://claude.ai"],
      mode: "iframe",
      default: false
    },
    {
      id: "gemini",
      name: "Gemini",
      url: "https://gemini.google.com/app",
      hosts: ["gemini.google.com"],
      origins: ["https://gemini.google.com"],
      mode: "iframe",
      default: false
    },
    {
      id: "grok",
      name: "Grok",
      url: "https://grok.com/",
      hosts: ["grok.com"],
      origins: ["https://grok.com"],
      mode: "tab",
      default: false
    }
  ];

  globalThis.AIParallelProviderCatalog = Object.freeze(providers.map((provider) => Object.freeze({
    ...provider,
    hosts: Object.freeze([...provider.hosts]),
    origins: Object.freeze([...provider.origins])
  })));
})();
