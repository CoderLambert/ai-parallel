import { ProviderAdapter } from './base.js';

export const providerRegistry = {
  create(config) {
    return new ProviderAdapter(config);
  }
};
