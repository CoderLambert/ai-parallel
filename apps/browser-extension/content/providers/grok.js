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

  if (typeof document === "undefined" || typeof chrome === "undefined") return;

  document.addEventListener("click", (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link) return;

    let targetUrl;
    try {
      targetUrl = new URL(link.href, location.href);
    } catch {
      return;
    }
    if (targetUrl.hostname !== "accounts.x.ai") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    chrome.runtime.sendMessage({
      type: "OPEN_PROVIDER_AUTH",
      providerId: "grok",
      url: targetUrl.href
    }).catch(() => {
      // The workspace login button remains available if the runtime changed.
    });
  }, true);
})();
