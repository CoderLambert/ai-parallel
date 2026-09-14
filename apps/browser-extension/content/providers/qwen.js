import { ProviderAdapter } from './base.js';

export class QwenAdapter extends ProviderAdapter {
  constructor() {
    super({
      id: 'qwen',
      hosts: ['chat.qwen.ai'],
      editorSelectors: ['textarea', "div.ProseMirror[contenteditable='true']"],
      collectSelectors: [
        '.markdown-body',
        '.message-content'
      ]
    });
  }
}
