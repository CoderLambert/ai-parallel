(() => {
  const root = globalThis;
  const adapters = root.AIParallelProviderAdapters ||= {};

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  function queryFirstVisible(selectors, predicate = isVisible, rootDocument = document) {
    for (const selector of selectors || []) {
      let nodes = [];
      try { nodes = [...rootDocument.querySelectorAll(selector)]; } catch { continue; }
      for (const node of nodes) if (predicate(node)) return node;
    }
    return null;
  }

  function queryVisible(selectors, predicate = isVisible, rootDocument = document) {
    const matches = [];
    for (const selector of selectors || []) {
      let nodes = [];
      try { nodes = [...rootDocument.querySelectorAll(selector)]; } catch { continue; }
      for (const node of nodes) {
        if (predicate(node) && !matches.includes(node)) matches.push(node);
      }
    }
    matches.sort((left, right) => {
      if (left === right) return 0;
      return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    return matches;
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

  async function fillEditor(adapter, editor, prompt) {
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

  async function submit(adapter, editor) {
    const button = await waitFor(() => (
      queryFirstVisible(adapter.sendSelectors, (element) => isVisible(element) && !element.disabled)
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

  async function sendPrompt(adapter, prompt) {
    const editor = await waitFor(
      () => queryFirstVisible(adapter.editorSelectors, isUsableEditor),
      adapter.editorReadyTimeoutMs ?? 25000,
      120
    );
    if (!editor) throw new Error("未找到输入框；可能尚未登录或页面结构已变化");

    await fillEditor(adapter, editor, prompt);
    if (!editorContainsPrompt(editor, prompt)) await fillEditor(adapter, editor, prompt);
    if (!editorContainsPrompt(editor, prompt)) throw new Error("无法可靠写入 Prompt");

    await submit(adapter, editor);
    return true;
  }

  function collectResponse(adapter, rootDocument = document) {
    const responses = queryVisible(
      adapter.responseSelectors,
      (element) => isVisible(element) && !element.closest("[aria-hidden='true']"),
      rootDocument
    );
    const response = responses.at(-1);
    if (!response) return null;

    const content = (response.innerText || response.textContent || "").trim();
    if (!content) return null;
    return { content, markdown: content };
  }

  function newChat(adapter, rootDocument = document) {
    const button = queryFirstVisible(
      adapter.newChatSelectors,
      (element) => isVisible(element) && !element.disabled,
      rootDocument
    );
    if (!button) return false;
    button.click();
    return true;
  }

  function createProviderAdapter(config) {
    const adapter = {
      ...config,
      async sendPrompt(prompt) {
        const value = String(prompt || "").trim();
        if (!value) throw new Error("Prompt 不能为空");
        return sendPrompt(adapter, value);
      },
      collectResponse(rootDocument = document) {
        return collectResponse(adapter, rootDocument);
      },
      newChat(rootDocument = document) {
        return newChat(adapter, rootDocument);
      },
      healthCheck(rootDocument = document) {
        return Boolean(queryFirstVisible(adapter.editorSelectors, isUsableEditor, rootDocument));
      }
    };
    adapters[config.id] = Object.freeze(adapter);
    return adapters[config.id];
  }

  root.AIParallelProviderCore = Object.freeze({ createProviderAdapter });
})();
