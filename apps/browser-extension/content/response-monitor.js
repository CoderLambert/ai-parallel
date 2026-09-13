(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const PROVIDERS = {
    chatgpt: {
      hosts: ["chatgpt.com"],
      responseSelectors: ["[data-message-author-role='assistant']"],
      generatingSelectors: ["button[data-testid='stop-button']", "button[aria-label*='Stop generating']", "button[aria-label*='停止生成']"]
    },
    deepseek: {
      hosts: ["chat.deepseek.com"],
      responseSelectors: [".ds-markdown", "[class*='ds-markdown']", "[class*='message'] [class*='markdown']", "[class*='message-content']"],
      generatingSelectors: ["button[aria-label*='Stop']", "button[aria-label*='停止']"]
    },
    zhipu: {
      hosts: ["chatglm.cn"],
      responseSelectors: ["[class*='markdown']", "[class*='message-content']", "[class*='response']", "article"],
      generatingSelectors: ["button[aria-label*='停止']", "button[aria-label*='Stop']"]
    },
    qwen: {
      hosts: ["chat.qwen.ai"],
      responseSelectors: ["[class*='markdown']", "[class*='message-content']", "[class*='response']", "article"],
      generatingSelectors: ["button[aria-label*='Stop']", "button[aria-label*='停止']"]
    },
    kimi: {
      hosts: ["www.kimi.com", "kimi.com"],
      responseSelectors: ["[class*='segment-content']", "[class*='markdown']", "[class*='message-content']", "[class*='response']", "article"],
      generatingSelectors: ["button[aria-label*='Stop']", "button[aria-label*='停止']"]
    },
    claude: {
      hosts: ["claude.ai"],
      responseSelectors: ["[class*='font-claude-message']", "[class*='markdown']", "article"],
      generatingSelectors: ["button[aria-label*='Stop']"]
    },
    gemini: {
      hosts: ["gemini.google.com"],
      responseSelectors: ["message-content", ".model-response-text", "[class*='model-response']", "[class*='markdown']"],
      generatingSelectors: ["button[aria-label*='Stop']", "button[aria-label*='停止']"]
    }
  };

  function providerFromHost() {
    return Object.entries(PROVIDERS).find(([, provider]) => provider.hosts.includes(location.hostname))?.[0] || null;
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function normalize(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isPromptEcho(text, prompt) {
    const value = normalize(text);
    const expected = normalize(prompt);
    if (!value || !expected) return false;
    if (value === expected) return true;
    return value.length <= expected.length + 12 && value.includes(expected);
  }

  function isUiNoise(text) {
    const value = normalize(text).toLowerCase();
    return new Set([
      "copy", "edit", "share", "retry", "regenerate", "stop", "continue",
      "复制", "编辑", "分享", "重试", "重新生成", "停止", "继续",
      "已完成思考", "完成思考", "思考中", "深度思考", "联网搜索",
      "thinking", "searching", "done"
    ]).has(value);
  }

  function scopeRoot() {
    return document.querySelector("main") || document.querySelector("[role='main']") || document.body;
  }

  function genericSelectors(provider) {
    return [
      ...(provider.responseSelectors || []),
      "[data-message-author-role]",
      "[data-testid*='message']",
      "[class*='assistant']",
      "[class*='response']",
      "[class*='markdown']",
      "[class*='message-content']",
      "[class*='segment-content']",
      "article",
      "p",
      "pre",
      "li",
      "blockquote"
    ];
  }

  function collectCandidates(provider) {
    const root = scopeRoot();
    const nodes = [];
    const seen = new Set();

    for (const selector of genericSelectors(provider)) {
      let matches = [];
      try { matches = [...root.querySelectorAll(selector)]; } catch { continue; }
      for (const node of matches) {
        if (!(node instanceof HTMLElement) || seen.has(node)) continue;
        seen.add(node);
        if (!isVisible(node)) continue;
        if (node.closest("form,nav,aside,header,footer,[role='navigation'],[role='dialog']")) continue;
        if (node.closest("button,[role='button'],[contenteditable='true']")) continue;
        const text = normalize(node.innerText || node.textContent || "");
        if (!text || text.length > 120000) continue;
        nodes.push({ node, text });
      }
    }

    return nodes.length > 1200 ? nodes.slice(-1200) : nodes;
  }

  function extractBlocks(node) {
    const elements = [...node.querySelectorAll("h1,h2,h3,h4,h5,h6,p,pre,li,blockquote,table")];
    const blocks = [];

    for (const element of elements) {
      const text = normalize(element.innerText || element.textContent || "");
      if (!text) continue;
      const tag = element.tagName.toLowerCase();
      if (tag === "pre") blocks.push({ type: "code", text });
      else if (/^h[1-6]$/.test(tag)) blocks.push({ type: "heading", level: Number(tag[1]), text });
      else if (tag === "li") blocks.push({ type: "list-item", text });
      else if (tag === "blockquote") blocks.push({ type: "quote", text });
      else if (tag === "table") blocks.push({ type: "table", text });
      else blocks.push({ type: "paragraph", text });
    }

    if (!blocks.length) {
      const text = normalize(node.innerText || node.textContent || "");
      if (text) blocks.push({ type: "paragraph", text });
    }
    return blocks.slice(0, 300);
  }

  function createBaseline(provider) {
    const map = new WeakMap();
    for (const candidate of collectCandidates(provider)) map.set(candidate.node, candidate.text);
    return map;
  }

  function pickResponse(provider, baseline, prompt) {
    const candidates = collectCandidates(provider);
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const { node, text } = candidates[index];
      if (baseline.get(node) === text) continue;
      if (isPromptEcho(text, prompt) || isUiNoise(text)) continue;
      return { text, blocks: extractBlocks(node) };
    }
    return null;
  }

  function isGenerating(provider) {
    for (const selector of provider.generatingSelectors || []) {
      let nodes = [];
      try { nodes = [...document.querySelectorAll(selector)]; } catch { continue; }
      if (nodes.some((node) => isVisible(node) && !node.disabled)) return true;
    }
    return false;
  }

  async function send(message) {
    try { return await chrome.runtime.sendMessage(message); } catch { return null; }
  }

  async function getJob() {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const response = await send({ type: "GET_PENDING_JOB" });
      if (response?.ok && response.job) return response.job;
      await sleep(100);
    }
    return null;
  }

  async function start(job, provider) {
    const baseline = createBaseline(provider);
    const { providerId, runId, prompt } = job;
    let latestText = "";
    let latestBlocks = [];
    let lastChangedAt = 0;
    let lastSentAt = 0;
    let completed = false;
    let timer = null;
    let busy = false;
    const startedAt = Date.now();

    const complete = async () => {
      if (completed || !latestText) return;
      completed = true;
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timer);
      await send({ type: "RESPONSE_COMPLETE", runId, providerId, text: latestText, blocks: latestBlocks });
    };

    const sample = async () => {
      if (completed || busy) return;
      busy = true;
      try {
        const response = pickResponse(provider, baseline, prompt);
        if (!response) return;

        if (response.text !== latestText) {
          latestText = response.text;
          latestBlocks = response.blocks;
          lastChangedAt = Date.now();
          if (Date.now() - lastSentAt >= 80) {
            lastSentAt = Date.now();
            await send({ type: "RESPONSE_UPDATE", runId, providerId, text: latestText, blocks: latestBlocks });
          }
        }

        if (latestText && !isGenerating(provider) && Date.now() - lastChangedAt > 1800 && Date.now() - startedAt > 1200) {
          await complete();
        }
      } finally {
        busy = false;
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => sample().catch(() => {}), 35);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const interval = setInterval(() => sample().catch(() => {}), 250);
    schedule();

    setTimeout(() => {
      if (!completed && latestText) complete().catch(() => {});
    }, 10 * 60 * 1000);
  }

  async function bootstrap() {
    const providerId = providerFromHost();
    if (!providerId) return;
    const job = await getJob();
    if (!job || job.providerId !== providerId) return;
    await start(job, PROVIDERS[providerId]);
  }

  bootstrap();
})();
