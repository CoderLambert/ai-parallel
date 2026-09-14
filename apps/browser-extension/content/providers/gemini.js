(() => {
  const { createProviderAdapter } = globalThis.AIParallelProviderCore;
  createProviderAdapter({
    id: "gemini",
    hosts: ["gemini.google.com"],
    editorSelectors: ["rich-textarea div[contenteditable='true']", "div.ql-editor[contenteditable='true']", "div[contenteditable='true']", "textarea"],
    sendSelectors: ["button[aria-label*='Send message']", "button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
    responseSelectors: ["message-content", ".markdown-main-panel", "[class*='markdown']"],
    newChatSelectors: ["a[aria-label*='New chat']", "button[aria-label*='New chat']", "a[aria-label*='新对话']"]
  });
})();
