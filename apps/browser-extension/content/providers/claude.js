(() => {
  const { createProviderAdapter } = globalThis.AIParallelProviderCore;
  createProviderAdapter({
    id: "claude",
    hosts: ["claude.ai"],
    editorSelectors: ["div.ProseMirror[contenteditable='true']", "div[contenteditable='true'].ProseMirror", "div[contenteditable='true']", "textarea"],
    sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[type='submit']"],
    responseSelectors: ["[data-testid='assistant-message']", "[class*='font-claude-response']"],
    newChatSelectors: ["button[aria-label*='New chat']", "button[aria-label*='新对话']"]
  });
})();
