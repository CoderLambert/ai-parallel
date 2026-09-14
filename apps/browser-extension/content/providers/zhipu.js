(() => {
  const { createProviderAdapter } = globalThis.AIParallelProviderCore;
  createProviderAdapter({
    id: "zhipu",
    hosts: ["chatglm.cn"],
    editorSelectors: ["textarea", "div[contenteditable='true']"],
    sendSelectors: ["button[aria-label*='发送']", "button[aria-label*='Send']", "button[type='submit']"],
    responseSelectors: [".markdown-body", "[class*='markdown']"],
    newChatSelectors: ["button[aria-label*='新建']", "button[aria-label*='新对话']"]
  });
})();
