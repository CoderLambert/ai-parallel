export class ProviderAdapter {
  constructor(config) {
    this.id = config.id;
    this.hosts = config.hosts || [];
    this.editorSelectors = config.editorSelectors || [];
    this.sendSelectors = config.sendSelectors || [];
    this.collectSelectors = config.collectSelectors || [];
  }

  findEditor(documentRef = document) {
    for (const selector of this.editorSelectors) {
      const element = documentRef.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  findAssistantMessages(documentRef = document) {
    return this.collectSelectors
      .flatMap((selector) => [...documentRef.querySelectorAll(selector)])
      .map((element) => element.innerText?.trim())
      .filter(Boolean);
  }

  collectResponse(documentRef = document) {
    const messages = this.findAssistantMessages(documentRef);
    return messages.at(-1) || null;
  }
}
