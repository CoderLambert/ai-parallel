(() => {
  const { createProviderAdapter } = globalThis.AIParallelProviderCore;
  createProviderAdapter({
    id: "grok",
    hosts: ["grok.com"],
    editorSelectors: [
      "textarea[aria-label='Ask Grok anything']",
      "textarea[placeholder*='Ask']",
      "textarea",
      "div.ProseMirror[contenteditable='true']",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']"
    ],
    sendSelectors: [
      "button[aria-label='Submit']",
      "button[data-testid='send-button']",
      "button[aria-label*='Send']",
      "button[aria-label*='发送']",
      "button[type='submit']"
    ],
    responseSelectors: [
      "[data-testid='assistant-message']",
      "[data-message-author-role='assistant']",
      "[class*='markdown']"
    ],
    newChatSelectors: [
      "a[aria-label='Home page']",
      "a[aria-label*='New chat']",
      "button[aria-label*='New chat']",
      "a[aria-label*='新对话']",
      "button[aria-label*='新对话']"
    ]
  });
})();
