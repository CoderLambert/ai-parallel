(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const PROVIDERS = {
    chatgpt: {
      hosts: ["chatgpt.com"],
      editorSelectors: [
        "#prompt-textarea",
        "textarea[data-testid='prompt-textarea']",
        "div[contenteditable='true'][data-testid='prompt-textarea']",
        "form textarea",
        "main textarea"
      ],
      sendSelectors: [
        "#composer-submit-button",
        "button[data-testid='send-button']",
        "button[data-testid*='send-button']",
        "button[aria-label='Send prompt']",
        "button[aria-label*='Send']",
        "button[aria-label*='发送']"
      ],
      generatingSelectors: [
        "button[data-testid='stop-button']",
        "button[aria-label*='Stop generating']",
        "button[aria-label*='停止生成']"
      ],
      responseSelectors: [
        "[data-message-author-role='assistant']"
      ],
      newChatTexts: ["New chat", "新聊天", "新建聊天", "新对话"],
      sendReadyTimeoutMs: 8000,
      rootIsFreshConversation: true,
      inputMode: "paste"
    },
    deepseek: {
      hosts: ["chat.deepseek.com"],
      editorSelectors: ["textarea", "div[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
      generatingSelectors: ["button[aria-label*='Stop']", "button[aria-label*='停止']"],
      responseSelectors: [".ds-markdown", "[class*='ds-markdown']", "main [class*='markdown']"],
      newChatTexts: ["New chat", "新建对话", "新对话", "开启新对话"]
    },
    zhipu: {
      hosts: ["chatglm.cn"],
      editorSelectors: ["textarea", "div[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='发送']", "button[aria-label*='Send']", "button[type='submit']"],
      generatingSelectors: ["button[aria-label*='停止']", "button[aria-label*='Stop']"],
      responseSelectors: ["main [class*='markdown']", "main [class*='message-content']", "main article"],
      newChatTexts: ["新建会话", "新对话", "新聊天", "New chat"]
    },
    qwen: {
      hosts: ["chat.qwen.ai"],
      editorSelectors: ["textarea", "div[contenteditable='true']", "div.ProseMirror[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
      generatingSelectors: ["button[aria-label*='Stop']", "button[aria-label*='停止']"],
      responseSelectors: ["main [class*='markdown']", "main [class*='message-content']", "main article"],
      newChatTexts: ["New chat", "新建对话", "新对话", "新聊天"]
    },
    kimi: {
      hosts: ["www.kimi.com", "kimi.com"],
      editorSelectors: ["textarea", "div[contenteditable='true']", "div.ProseMirror[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
      generatingSelectors: ["button[aria-label*='Stop']", "button[aria-label*='停止']"],
      responseSelectors: ["main [class*='markdown']", "main [class*='message-content']", "main [class*='segment-content']", "main article"],
      newChatTexts: ["New Chat", "New chat", "新建会话", "新对话", "新聊天"]
    },
    claude: {
      hosts: ["claude.ai"],
      editorSelectors: ["div[contenteditable='true'].ProseMirror", "div.ProseMirror[contenteditable='true']", "div[contenteditable='true']", "textarea"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
      generatingSelectors: ["button[aria-label*='Stop']"],
      responseSelectors: ["[class*='font-claude-message']", "main [class*='markdown']", "main article"],
      newChatTexts: ["New chat", "Start new chat", "新对话"]
    },
    gemini: {
      hosts: ["gemini.google.com"],
      editorSelectors: ["rich-textarea div[contenteditable='true']", "div.ql-editor[contenteditable='true']", "div[contenteditable='true']", "textarea"],
      sendSelectors: ["button[aria-label*='Send message']", "button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
      generatingSelectors: ["button[aria-label*='Stop']", "button[aria-label*='停止']"],
      responseSelectors: ["message-content", ".model-response-text", "main [class*='model-response']", "main [class*='markdown']"],
      newChatTexts: ["New chat", "新对话", "新建对话"]
    }
  };

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function isUsableEditor(element) {
    if (!isVisible(element)) return false;
    if (element.closest("[aria-hidden='true']")) return false;
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return !element.disabled && !element.readOnly;
    }
    return element.getAttribute("contenteditable") === "true";
  }

  function queryFirstVisible(selectors, predicate = isVisible) {
    for (const selector of selectors) {
      let nodes = [];
      try { nodes = [...document.querySelectorAll(selector)]; } catch { continue; }
      for (const node of nodes) {
        if (predicate(node)) return node;
      }
    }
    return null;
  }

  function normalizedText(element) {
    return [element.textContent, element.getAttribute?.("aria-label"), element.getAttribute?.("title")]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findByText(texts) {
    const candidates = [...document.querySelectorAll("button, a, [role='button']")].filter(isVisible);
    for (const wanted of texts) {
      const lower = wanted.toLowerCase();
      const exact = candidates.find((el) => normalizedText(el).toLowerCase() === lower);
      if (exact) return exact;
    }
    for (const wanted of texts) {
      const lower = wanted.toLowerCase();
      const partial = candidates.find((el) => normalizedText(el).toLowerCase().includes(lower));
      if (partial) return partial;
    }
    return null;
  }

  async function waitFor(getter, timeoutMs = 20000, intervalMs = 180) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await getter();
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  function setNativeValue(element, value) {
    if (element instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
      return;
    }
    if (element instanceof HTMLInputElement) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
      return;
    }
    element.textContent = value;
  }

  function dispatchInput(element, value) {
    try {
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: value
      }));
    } catch {
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  function editorContainsPrompt(editor, prompt) {
    const expected = prompt.trim().slice(0, 48);
    if (!expected) return false;
    const actual = editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
      ? editor.value
      : editor.textContent || "";
    return actual.includes(expected);
  }

  async function fillEditor(editor, prompt, adapter) {
    editor.focus();

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      setNativeValue(editor, prompt);
      dispatchInput(editor, prompt);
      await sleep(120);
      return;
    }

    if (adapter?.inputMode === "paste") {
      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", prompt);
        editor.dispatchEvent(new ClipboardEvent("paste", {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true
        }));
        await sleep(180);
        if (editorContainsPrompt(editor, prompt)) return;
      } catch {
        // Fall through to generic contenteditable insertion.
      }
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);

    let inserted = false;
    try { inserted = document.execCommand("insertText", false, prompt); } catch { inserted = false; }

    if (!inserted || !editor.textContent?.includes(prompt.slice(0, Math.min(24, prompt.length)))) {
      setNativeValue(editor, prompt);
      dispatchInput(editor, prompt);
    }

    editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
    await sleep(160);
  }

  function findGenericSendButton(editor) {
    const scopes = [editor.closest("form"), editor.parentElement, editor.closest("main"), document.body].filter(Boolean);
    const hints = ["send", "发送", "提交", "submit"];
    for (const scope of scopes) {
      const buttons = [...scope.querySelectorAll("button")].filter((button) => {
        if (!isVisible(button) || button.disabled) return false;
        const text = normalizedText(button).toLowerCase();
        return button.getAttribute("type") === "submit" || hints.some((hint) => text.includes(hint));
      });
      if (buttons.length) return buttons[buttons.length - 1];
    }
    return null;
  }

  async function submit(editor, adapter, providerId) {
    const timeoutMs = adapter.sendReadyTimeoutMs ?? 1800;
    const button = await waitFor(() => (
      queryFirstVisible(adapter.sendSelectors, (el) => isVisible(el) && !el.disabled)
        || findGenericSendButton(editor)
    ), timeoutMs, 120);

    if (button) {
      button.click();
      return;
    }

    if (providerId === "chatgpt") {
      throw new Error("ChatGPT 输入已写入，但发送按钮在等待后仍未就绪");
    }

    editor.focus();
    for (const type of ["keydown", "keyup"]) {
      editor.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    }
  }

  async function sendRuntime(message) {
    try { return await chrome.runtime.sendMessage(message); } catch { return null; }
  }

  async function progress(providerId, state, message) {
    await sendRuntime({ type: "JOB_PROGRESS", providerId, state, message });
  }

  function getResponseCandidates(adapter, editor) {
    const seen = new Set();
    const candidates = [];
    const selectors = [...adapter.responseSelectors, "main [class*='markdown']", "main [class*='message-content']", "main article"];

    for (const selector of selectors) {
      let nodes = [];
      try { nodes = [...document.querySelectorAll(selector)]; } catch { continue; }
      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || seen.has(node)) continue;
        seen.add(node);
        if (editor && (node === editor || node.contains(editor) || editor.contains(node))) continue;
        if (node.closest("form")) continue;
        const text = (node.innerText || node.textContent || "").trim();
        if (text.length < 2) continue;
        candidates.push(node);
      }
    }
    return candidates;
  }

  function extractBlocks(node) {
    const selector = "h1,h2,h3,h4,h5,h6,p,pre,li,blockquote,table";
    const elements = [...node.querySelectorAll(selector)];
    const blocks = [];

    for (const element of elements) {
      const nestedContainer = element.parentElement?.closest("pre,li,blockquote,table");
      if (nestedContainer && nestedContainer !== element) continue;
      const text = (element.innerText || element.textContent || "").trim();
      if (!text) continue;

      const tag = element.tagName.toLowerCase();
      if (tag === "pre") {
        blocks.push({ type: "code", text });
      } else if (/^h[1-6]$/.test(tag)) {
        blocks.push({ type: "heading", level: Number(tag[1]), text });
      } else if (tag === "li") {
        blocks.push({ type: "list-item", text });
      } else if (tag === "blockquote") {
        blocks.push({ type: "quote", text });
      } else if (tag === "table") {
        const rows = [...element.querySelectorAll("tr")].map((row) =>
          [...row.querySelectorAll("th,td")].map((cell) => (cell.innerText || cell.textContent || "").trim()).join("\t")
        ).filter(Boolean);
        blocks.push({ type: "table", text: rows.join("\n") || text });
      } else {
        blocks.push({ type: "paragraph", text });
      }
    }

    if (!blocks.length) {
      const text = (node.innerText || node.textContent || "").trim();
      if (text) blocks.push({ type: "paragraph", text });
    }

    return blocks.slice(0, 300);
  }

  function extractLatestResponse(adapter, editor) {
    const candidates = getResponseCandidates(adapter, editor);
    if (!candidates.length) return null;
    const node = candidates[candidates.length - 1];
    const text = (node.innerText || node.textContent || "").trim();
    if (!text) return null;
    return { text, blocks: extractBlocks(node) };
  }

  function isGenerating(adapter) {
    return Boolean(queryFirstVisible(adapter.generatingSelectors || [], (el) => isVisible(el) && !el.disabled));
  }

  async function waitForSubmissionSignal(adapter, editor, prompt, baselineText, beforeSubmitUrl) {
    return waitFor(() => {
      if (!editor.isConnected || !editorContainsPrompt(editor, prompt)) return "editor-cleared";
      if (location.href !== beforeSubmitUrl) return "navigation";
      if (isGenerating(adapter)) return "generating";
      const response = extractLatestResponse(adapter, editor);
      if (response && response.text !== baselineText) return "response";
      return null;
    }, 5000, 160);
  }

  async function monitorResponse(job, adapter, editor, baselineText) {
    const { providerId, runId } = job;
    const startedAt = Date.now();
    let latestText = "";
    let latestBlocks = [];
    let lastChangedAt = Date.now();
    let lastSentAt = 0;
    let finished = false;
    let sampleTimer = null;

    const sample = async () => {
      if (finished) return;
      const response = extractLatestResponse(adapter, editor);
      if (!response || response.text === baselineText) {
        if (!latestText && Date.now() - startedAt > 120000) {
          finished = true;
          observer.disconnect();
          clearInterval(interval);
          clearTimeout(sampleTimer);
          await sendRuntime({
            type: "JOB_RESULT",
            providerId,
            ok: false,
            error: "已提交，但 120 秒内未检测到可同步的回答；可能是该站点回答 DOM 结构已变化"
          });
        }
        return;
      }

      if (response.text !== latestText) {
        latestText = response.text;
        latestBlocks = response.blocks;
        lastChangedAt = Date.now();
        if (Date.now() - lastSentAt >= 120) {
          lastSentAt = Date.now();
          await sendRuntime({
            type: "RESPONSE_UPDATE",
            runId,
            providerId,
            text: latestText,
            blocks: latestBlocks
          });
        }
      }

      if (latestText && !isGenerating(adapter) && Date.now() - lastChangedAt > 4500) {
        finished = true;
        observer.disconnect();
        clearInterval(interval);
        clearTimeout(sampleTimer);
        await sendRuntime({
          type: "RESPONSE_COMPLETE",
          runId,
          providerId,
          text: latestText,
          blocks: latestBlocks
        });
      }
    };

    const scheduleSample = () => {
      clearTimeout(sampleTimer);
      sampleTimer = setTimeout(() => sample().catch(() => {}), 80);
    };

    const observer = new MutationObserver(scheduleSample);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const interval = setInterval(() => sample().catch(() => {}), 900);
    scheduleSample();

    setTimeout(() => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(sampleTimer);
      if (latestText) {
        sendRuntime({ type: "RESPONSE_COMPLETE", runId, providerId, text: latestText, blocks: latestBlocks }).catch(() => {});
      }
    }, 10 * 60 * 1000);
  }

  async function ensureFreshConversation(adapter, providerId) {
    await progress(providerId, "working", "准备新会话");
    if (adapter.rootIsFreshConversation && location.pathname === "/") return;

    const newChat = await waitFor(() => findByText(adapter.newChatTexts), 5000, 250);
    if (!newChat) return;
    try {
      newChat.click();
      await sleep(500);
    } catch {
      // Some providers already open a fresh composer at the root URL.
    }
  }

  async function runJob(job) {
    const { providerId, prompt } = job;
    const adapter = PROVIDERS[providerId];
    if (!adapter || !adapter.hosts.includes(location.hostname)) return;

    try {
      await ensureFreshConversation(adapter, providerId);
      await progress(providerId, "working", "等待输入框");

      const editor = await waitFor(() => queryFirstVisible(adapter.editorSelectors, isUsableEditor), 22000, 200);
      if (!editor) throw new Error("未找到输入框；请确认已登录，或该站点页面结构已变化");

      const baseline = extractLatestResponse(adapter, editor)?.text || "";
      await progress(providerId, "working", "正在填写 Prompt");
      await fillEditor(editor, prompt, adapter);
      if (!editorContainsPrompt(editor, prompt)) await fillEditor(editor, prompt, adapter);
      if (!editorContainsPrompt(editor, prompt)) throw new Error("找到输入框，但无法可靠写入 Prompt");

      await progress(providerId, "working", "等待发送按钮");
      const beforeSubmitUrl = location.href;
      await submit(editor, adapter, providerId);

      // Different AI sites update or replace their composer DOM differently after
      // submission. In particular, DeepSeek and Qwen may leave the old editor
      // node/value readable even though the message was accepted. Treat editor
      // clearing as only one possible submission signal, never as a hard gate.
      await progress(providerId, "working", "已提交，等待回答");
      await waitForSubmissionSignal(adapter, editor, prompt, baseline, beforeSubmitUrl);

      await sendRuntime({ type: "JOB_RESULT", providerId, ok: true });
      await monitorResponse(job, adapter, editor, baseline);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AI Parallel] ${providerId}: ${message}`);
      await sendRuntime({ type: "JOB_RESULT", providerId, ok: false, error: message });
    }
  }

  async function bootstrap() {
    await sleep(200);
    const response = await waitFor(async () => {
      const candidate = await sendRuntime({ type: "GET_PENDING_JOB" });
      return candidate?.ok && candidate.job ? candidate : null;
    }, 10000, 250);
    if (!response?.job) return;
    await runJob(response.job);
  }

  bootstrap();
})();
