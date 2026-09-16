import type { JsonSchema } from "./json-schema";

/** Runtime provider availability remains owned by shared/provider-catalog.js. */
export type ProviderId =
  | "chatgpt"
  | "deepseek"
  | "zhipu"
  | "qwen"
  | "kimi"
  | "claude"
  | "gemini"
  | "grok";

export type ProviderMode = "iframe" | "tab";
export type ProviderAdapterType = "dom";
export type ProviderContractVersion = "provider-adapter-v1";

export interface ProviderCapabilities {
  send: boolean;
  collect: boolean;
  newChat: boolean;
  retry: boolean;
  streaming: boolean;
  timeout: boolean;
  cancel: boolean;
}

export interface ProviderDescriptor {
  id: ProviderId;
  name: string;
  url: string;
  hosts: readonly string[];
  origins: readonly string[];
  mode: ProviderMode;
  default: boolean;
  adapter: string;
  adapterType: ProviderAdapterType;
  adapterContract: ProviderContractVersion;
  capabilities: Readonly<ProviderCapabilities>;
  loginUrl?: string;
}

export interface ProviderRequestContext {
  signal?: AbortSignal;
  attempt?: number;
  timeoutMs?: number;
}

export interface ProviderResponseSnapshot {
  provider: ProviderId;
  content: string;
  markdown: string;
  timestamp: string;
}

export interface ProviderResponseContent {
  content: string;
  markdown: string;
}

export interface ProviderFailure {
  ok: false;
  error: string;
  code?: string;
  retryable?: boolean;
}

export interface ProviderSuccess<TResponse = unknown> {
  ok: true;
  response?: TResponse;
  providerId?: ProviderId;
  mode?: ProviderMode;
}

export type ProviderResult<TResponse = unknown> = ProviderSuccess<TResponse> | ProviderFailure;

export interface ProviderHealthSuccess {
  ok: true;
  providerId: ProviderId;
  mode: ProviderMode;
}

export type ProviderHealthResult = ProviderHealthSuccess | ProviderFailure;

export type ProviderOperation =
  | "AI_PARALLEL_SEND"
  | "AI_PARALLEL_COLLECT_RESPONSE"
  | "AI_PARALLEL_NEW_CHAT";

export interface ProviderAdapter {
  id: string;
  providerId: ProviderId;
  mode: ProviderMode;
  capabilities: ProviderCapabilities;
  sendPrompt(prompt: string, context?: ProviderRequestContext): Promise<ProviderResult>;
  collectResponse(context?: ProviderRequestContext): Promise<ProviderResult<ProviderResponseSnapshot>>;
  newChat(context?: ProviderRequestContext): Promise<ProviderResult>;
  healthCheck(context?: ProviderRequestContext): Promise<ProviderHealthResult>;
}

export interface ProviderDomAdapterConfig {
  id: ProviderId;
  hosts: string[];
  editorSelectors: string[];
  sendSelectors: string[];
  responseSelectors: string[];
  newChatSelectors: string[];
  sendReadyTimeoutMs?: number;
  editorReadyTimeoutMs?: number;
  submitConfirmationTimeoutMs?: number;
  inputMode?: "paste" | "insertText";
  isExternalAuthUrl?: (value: string) => boolean;
}

export interface ProviderTemplateOutputContract {
  mode: "text" | "json";
  schema?: JsonSchema;
}
