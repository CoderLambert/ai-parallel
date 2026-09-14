(() => {
  const { createProviderAdapter } = globalThis.AIParallelProviderCore;
  createProviderAdapter({
    id: "qwen",
    hosts: ["chat.qwen.ai"],
    editorSelectors: ["textarea", "div.ProseMirror[contenteditable='true']", "div[contenteditable='true']"],
    sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
    responseSelectors: [".markdown-body", "[class*='markdown']"],
    newChatSelectors: ["button[aria-label*='New chat']", "button[aria-label*='新对话']"]
  });
})();
