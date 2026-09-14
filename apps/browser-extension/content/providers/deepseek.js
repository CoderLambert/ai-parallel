import { ProviderAdapter } from './base.js';

export class DeepSeekAdapter extends ProviderAdapter {
  constructor() {
    super({
      id: 'deepseek',
      hosts: ['chat.deepseek.com'],
      editorSelectors: ['textarea', "div[contenteditable='true']"],
      collectSelectors: [
        '.ds-markdown',
        '.markdown-body'
      ]
    });
  }
}
