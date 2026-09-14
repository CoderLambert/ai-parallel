(() => {
  const { createProviderAdapter } = globalThis.AIParallelProviderCore;
  createProviderAdapter({
    id: "deepseek",
    hosts: ["chat.deepseek.com"],
    editorSelectors: ["textarea", "div[contenteditable='true']"],
    sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
    responseSelectors: [".ds-markdown", "[class*='markdown']"],
    newChatSelectors: ["button[aria-label*='New chat']", "button[aria-label*='新对话']"]
  });
})();
