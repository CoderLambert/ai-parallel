(() => {
  const { createProviderAdapter } = globalThis.AIParallelProviderCore;

  function isExternalAuthUrl(value) {
    let targetUrl;
    try {
      targetUrl = new URL(value, "https://grok.com/");
    } catch {
      return false;
    }
    if (targetUrl.hostname === "accounts.x.ai") return true;
    return ["grok.com", "www.grok.com"].includes(targetUrl.hostname)
      && /^\/(?:sign-in|login)(?:\/|$)/.test(targetUrl.pathname);
  }

  const adapter = createProviderAdapter({
    id: "grok",
    hosts: ["grok.com"],
    isExternalAuthUrl,
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
  if (window.top === window) return;

  document.addEventListener("click", (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link) return;

    let targetUrl;
    try {
      targetUrl = new URL(link.href, location.href);
    } catch {
      return;
    }
    if (!adapter.isExternalAuthUrl(targetUrl.href)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage({
      context: "ai-parallel-workspace",
      providerId: "grok",
      type: "AI_PARALLEL_AUTH_REQUIRED"
    }, new URL(chrome.runtime.getURL("/")).origin);
    chrome.runtime.sendMessage({
      type: "OPEN_PROVIDER_AUTH",
      providerId: "grok",
      url: targetUrl.href
    }).catch(() => {
      // The workspace login button remains available if the runtime changed.
    });
  }, true);
})();
