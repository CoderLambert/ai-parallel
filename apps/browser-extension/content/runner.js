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
      newChatTexts: ["New chat", "新聊天", "新建聊天", "新对话"],
      sendReadyTimeoutMs: 8000,
      rootIsFreshConversation: true,
      inputMode: "paste"
    },
    deepseek: {
      hosts: ["chat.deepseek.com"],
      editorSelectors: [
        "textarea",
        "div[contenteditable='true']"
      ],
      sendSelectors: [
        "button[aria-label*='Send']",
        "button[aria-label*='发送']",
        "button[type='submit']"
      ],
      newChatTexts: ["New chat", "新建对话", "新对话", "开启新对话"]
    },
    zhipu: {
      hosts: ["chatglm.cn"],
      editorSelectors: [
        "textarea",
        "div[contenteditable='true']"
      ],
      sendSelectors: [
        "button[aria-label*='发送']",
        "button[aria-label*='Send']",
        "button[type='submit']"
      ],
      newChatTexts: ["新建会话", "新对话", "新聊天", "New chat"]
    },
    qwen: {
      hosts: ["chat.qwen.ai"],
      editorSelectors: [
        "textarea",
        "div[contenteditable='true']",
        "div.ProseMirror[contenteditable='true']"
      ],
      sendSelectors: [
        "button[aria-label*='Send']",
        "button[aria-label*='发送']",
        "button[type='submit']"
      ],
      newChatTexts: ["New chat", "新建对话", "新对话", "新聊天"]
    },
    kimi: {
      hosts: ["www.kimi.com", "kimi.com"],
      editorSelectors: [
        "textarea",
        "div[contenteditable='true']",
        "div.ProseMirror[contenteditable='true']"
      ],
      sendSelectors: [
        "button[aria-label*='Send']",
        "button[aria-label*='发送']",
        "button[type='submit']"
      ],
      newChatTexts: ["New Chat", "New chat", "新建会话", "新对话", "新聊天"]
    },
    claude: {
      hosts: ["claude.ai"],
      editorSelectors: [
        "div[contenteditable='true'].ProseMirror",
        "div.ProseMirror[contenteditable='true']",
        "div[contenteditable='true']",
        "textarea"
      ],
      sendSelectors: [
        "button[aria-label*='Send']",
        "button[aria-label*='发送']",
        "button[type='submit']"
      ],
      newChatTexts: ["New chat", "Start new chat", "新对话"]
    },
    gemini: {
      hosts: ["gemini.google.com"],
      editorSelectors: [
        "rich-textarea div[contenteditable='true']",
        "div.ql-editor[contenteditable='true']",
        "div[contenteditable='true']",
        "textarea"
      ],
      sendSelectors: [
        "button[aria-label*='Send message']",
        "button[aria-label*='Send']",
        "button[aria-label*='发送']",
        "button[type='submit']"
      ],
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
    return [
      element.textContent,
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title")
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function findByText(texts) {
    const candidates = [...document.querySelectorAll("button, a, [role='button']")].filter(isVisible);
    for (const wanted of texts) {
      const wantedLower = wanted.toLowerCase();
      const exact = candidates.find((el) => normalizedText(el).toLowerCase() === wantedLower);
      if (exact) return exact;
    }
    for (const wanted of texts) {
      const wantedLower = wanted.toLowerCase();
      const partial = candidates.find((el) => normalizedText(el).toLowerCase().includes(wantedLower));
      if (partial) return partial;
    }
    return null;
  }

  async function waitFor(getter, timeoutMs = 20000, intervalMs = 180) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = getter();
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  function setNativeValue(element, value) {
    if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(element, value);
      return;
    }
    if (element instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(element, value);
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

  async function fillEditor(editor, prompt, adapter) {
    editor.focus();

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      setNativeValue(editor, prompt);
      dispatchInput(editor, prompt);
      await sleep(120);
      return;
    }

    // ChatGPT's current composer is ProseMirror. Dispatching a paste event lets
    // ProseMirror update its internal document state instead of only mutating DOM.
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

    // ProseMirror / Lexical / Quill style contenteditable editors.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, prompt);
    } catch {
      inserted = false;
    }

    if (!inserted || !editor.textContent?.includes(prompt.slice(0, Math.min(24, prompt.length)))) {
      setNativeValue(editor, prompt);
      dispatchInput(editor, prompt);
    }

    editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
    await sleep(160);
  }

  function editorContainsPrompt(editor, prompt) {
    const expected = prompt.trim().slice(0, 48);
    if (!expected) return false;
    const actual = editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
      ? editor.value
      : editor.textContent || "";
    return actual.includes(expected);
  }

  function findGenericSendButton(editor) {
    const scopes = [editor.closest("form"), editor.parentElement, editor.closest("main"), document.body].filter(Boolean);
    const labelHints = ["send", "发送", "提交", "submit"];

    for (const scope of scopes) {
      const buttons = [...scope.querySelectorAll("button")].filter((button) => {
        if (!isVisible(button) || button.disabled) return false;
        const text = normalizedText(button).toLowerCase();
        const type = button.getAttribute("type");
        return type === "submit" || labelHints.some((hint) => text.includes(hint));
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
      return "button";
    }

    // ChatGPT's composer only exposes/enables its Send control after ProseMirror
    // has committed the input. Synthetic Enter events are not a reliable fallback
    // there, so fail explicitly instead of pretending the message was submitted.
    if (providerId === "chatgpt") {
      throw new Error("ChatGPT 输入已写入，但发送按钮在等待后仍未就绪");
    }

    editor.focus();
    editor.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
    editor.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
    return "enter";
  }

  async function progress(providerId, state, message) {
    try {
      await chrome.runtime.sendMessage({ type: "JOB_PROGRESS", providerId, state, message });
    } catch {
      // Extension updates/reloads can temporarily disconnect the content script.
    }
  }

  async function result(providerId, ok, error = "") {
    try {
      await chrome.runtime.sendMessage({ type: "JOB_RESULT", providerId, ok, error });
    } catch {
      // Ignore reporting failure.
    }
  }

  async function ensureFreshConversation(adapter, providerId) {
    await progress(providerId, "working", "准备新会话");

    // The launcher opens ChatGPT at its root URL, which already is a fresh
    // composer. Clicking the sidebar "New chat" again can cause a SPA remount
    // while the automation is starting, so avoid that unnecessary transition.
    if (adapter.rootIsFreshConversation && location.pathname === "/") return;

    const newChat = await waitFor(() => findByText(adapter.newChatTexts), 5000, 250);
    if (!newChat) return;

    try {
      newChat.click();
      await sleep(500);
    } catch {
      // Root URLs already represent a fresh composer on several providers.
    }
  }

  async function runJob(job) {
    const { providerId, prompt } = job;
    const adapter = PROVIDERS[providerId];
    if (!adapter) return;
    if (!adapter.hosts.includes(location.hostname)) return;

    try {
      await ensureFreshConversation(adapter, providerId);
      await progress(providerId, "working", "等待输入框");

      const editor = await waitFor(
        () => queryFirstVisible(adapter.editorSelectors, isUsableEditor),
        22000,
        200
      );

      if (!editor) {
        throw new Error("未找到输入框；请确认已登录，或该站点页面结构已变化");
      }

      await progress(providerId, "working", "正在填写 Prompt");
      await fillEditor(editor, prompt, adapter);

      if (!editorContainsPrompt(editor, prompt)) {
        await fillEditor(editor, prompt, adapter);
      }
      if (!editorContainsPrompt(editor, prompt)) {
        throw new Error("找到输入框，但无法可靠写入 Prompt");
      }

      await progress(providerId, "working", "等待发送按钮");
      await submit(editor, adapter, providerId);

      const accepted = await waitFor(() => !editorContainsPrompt(editor, prompt), 5000, 160);
      if (!accepted) {
        throw new Error("已尝试发送，但输入框内容未清空；请在该页面手动确认发送")
      }
      await result(providerId, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AI Parallel Launcher] ${providerId}: ${message}`);
      await result(providerId, false, message);
    }
  }

  async function bootstrap() {
    // Pages such as login redirects may cause this content script to run more than once.
    // The background keeps the job until success, so retries remain safe.
    await sleep(250);
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "GET_PENDING_JOB" });
    } catch {
      return;
    }
    if (!response?.ok || !response.job) return;
    await runJob(response.job);
  }

  bootstrap();
})();
