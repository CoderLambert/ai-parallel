import { ProviderAdapter } from './base.js';

export class ChatGPTAdapter extends ProviderAdapter {
  constructor() {
    super({
      id: 'chatgpt',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      editorSelectors: [
        '#prompt-textarea',
        "textarea[data-testid='prompt-textarea']",
        "div[contenteditable='true'][data-testid='prompt-textarea']"
      ],
      collectSelectors: [
        "[data-message-author-role='assistant']",
        "article[data-testid*='conversation-turn']"
      ]
    });
  }
}
