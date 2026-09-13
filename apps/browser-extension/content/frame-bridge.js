(() => {
  if (window.top === window) return;
  try {
    if (window.parent !== window.top) return;
  } catch {
    return;
  }

  const MESSAGE_CONTEXT = "ai-parallel-workspace";
  const PARENT_ORIGIN = new URL(chrome.runtime.getURL("/")).origin;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const PROVIDERS = {
    chatgpt: {
      hosts: ["chatgpt.com", "chat.openai.com"],
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
      sendReadyTimeoutMs: 8000,
      inputMode: "paste"
    },
    deepseek: {
      hosts: ["chat.deepseek.com"],
      editorSelectors: ["textarea", "div[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"]
    },
    zhipu: {
      hosts: ["chatglm.cn"],
      editorSelectors: ["textarea", "div[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='发送']", "button[aria-label*='Send']", "button[type='submit']"]
    },
    qwen: {
      hosts: ["chat.qwen.ai"],
      editorSelectors: ["textarea", "div.ProseMirror[contenteditable='true']", "div[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"]
    },
    kimi: {
      hosts: ["www.kimi.com", "kimi.com"],
      editorSelectors: ["textarea", "div.ProseMirror[contenteditable='true']", "div[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"]
    },
    claude: {
      hosts: ["claude.ai"],
      editorSelectors: ["div.ProseMirror[contenteditable='true']", "div[contenteditable='true'].ProseMirror", "div[contenteditable='true']", "textarea"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"]
    },
    gemini: {
      hosts: ["gemini.google.com"],
      editorSelectors: ["rich-textarea div[contenteditable='true']", "div.ql-editor[contenteditable='true']", "div[contenteditable='true']", "textarea"],
      sendSelectors: ["button[aria-label*='Send message']", "button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"]
    }
  };

  const providerId = Object.entries(PROVIDERS)
    .find(([, provider]) => provider.hosts.includes(location.hostname))?.[0];
  if (!providerId) return;
  const adapter = PROVIDERS[providerId];

  function postParent(payload) {
    window.parent.postMessage(
      { ...payload, context: MESSAGE_CONTEXT, providerId },
      PARENT_ORIGIN
    );
  }

  function announceReady() {
    postParent({ type: "AI_PARALLEL_FRAME_READY", href: location.href });
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function isUsableEditor(element) {
    if (!isVisible(element) || element.closest("[aria-hidden='true']")) return false;
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return !element.disabled && !element.readOnly;
    }
    return element.getAttribute("contenteditable") === "true";
  }

  function queryFirstVisible(selectors, predicate = isVisible) {
    for (const selector of selectors) {
      let nodes = [];
      try { nodes = [...document.querySelectorAll(selector)]; } catch { continue; }
      for (const node of nodes) if (predicate(node)) return node;
    }
    return null;
  }

  async function waitFor(getter, timeoutMs = 25000, intervalMs = 120) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await getter();
      if (value) return value;
      await sleep(intervalMs);
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

  function editorText(editor) {
    return editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
      ? editor.value
      : editor.textContent || "";
  }

  function editorContainsPrompt(editor, prompt) {
    const expected = prompt.trim().slice(0, 48);
    return Boolean(expected && editorText(editor).includes(expected));
  }

  async function fillEditor(editor, prompt) {
    editor.focus();

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      setNativeValue(editor, prompt);
      dispatchInput(editor, prompt);
      await sleep(120);
      return;
    }

    if (adapter.inputMode === "paste") {
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
    if (!inserted || !editorContainsPrompt(editor, prompt)) {
      setNativeValue(editor, prompt);
      dispatchInput(editor, prompt);
    }
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

  async function submit(editor) {
    const button = await waitFor(() => (
      queryFirstVisible(adapter.sendSelectors, (el) => isVisible(el) && !el.disabled)
        || findGenericSendButton(editor)
    ), adapter.sendReadyTimeoutMs ?? 2500, 100);

    if (button) {
      button.click();
      return;
    }

    editor.focus();
    for (const type of ["keydown", "keypress", "keyup"]) {
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

  async function injectAndSend(prompt) {
    const editor = await waitFor(
      () => queryFirstVisible(adapter.editorSelectors, isUsableEditor),
      25000,
      120
    );
    if (!editor) throw new Error("未找到输入框；可能尚未登录或页面结构已变化");

    await fillEditor(editor, prompt);
    if (!editorContainsPrompt(editor, prompt)) await fillEditor(editor, prompt);
    if (!editorContainsPrompt(editor, prompt)) throw new Error("无法可靠写入 Prompt");

    await submit(editor);
    return true;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== PARENT_ORIGIN) return;
    if (!event.data || event.data.context !== MESSAGE_CONTEXT) return;
    if (event.data.providerId !== providerId) return;

    if (event.data.type === "AI_PARALLEL_PING") {
      announceReady();
      return;
    }

    if (event.data.type !== "AI_PARALLEL_SEND") return;
    const requestId = String(event.data.requestId || "");
    const prompt = String(event.data.prompt || "").trim();
    if (!requestId) return;

    if (!prompt) {
      postParent({ type: "AI_PARALLEL_SEND_RESULT", requestId, ok: false, error: "Prompt 不能为空" });
      return;
    }

    injectAndSend(prompt)
      .then(() => postParent({ type: "AI_PARALLEL_SEND_RESULT", requestId, ok: true }))
      .catch((error) => postParent({
        type: "AI_PARALLEL_SEND_RESULT",
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }));
  });

  announceReady();
})();
