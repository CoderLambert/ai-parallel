(() => {
  const { createProviderAdapter } = globalThis.AIParallelProviderCore;
  createProviderAdapter({
    id: "chatgpt",
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
    responseSelectors: ["[data-message-author-role='assistant']"],
    newChatSelectors: [
      "[data-testid='create-new-chat-button']",
      "a[aria-label*='New chat']",
      "button[aria-label*='New chat']",
      "a[aria-label*='新聊天']",
      "button[aria-label*='新聊天']"
    ],
    sendReadyTimeoutMs: 8000,
    inputMode: "paste"
  });
})();
