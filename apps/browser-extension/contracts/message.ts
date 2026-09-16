import type {
  ProviderFailure,
  ProviderId,
  ProviderOperation,
  ProviderResponseSnapshot,
  ProviderResult,
} from "./provider";
import type { PendingLaunch } from "./storage";

export const MESSAGE_CONTEXT = "ai-parallel-workspace" as const;
export type MessageContext = typeof MESSAGE_CONTEXT;
export type RequestId = string;

export interface PingFrameMessage {
  context: MessageContext;
  providerId: ProviderId;
  type: "AI_PARALLEL_PING";
}

export interface SendProviderCommand {
  type: "AI_PARALLEL_SEND";
  requestId: RequestId;
  prompt: string;
}

export interface CollectProviderCommand {
  type: "AI_PARALLEL_COLLECT_RESPONSE";
  requestId: RequestId;
}

export interface NewChatProviderCommand {
  type: "AI_PARALLEL_NEW_CHAT";
  requestId: RequestId;
}

export type ProviderCommand =
  | SendProviderCommand
  | CollectProviderCommand
  | NewChatProviderCommand;

export type ProviderCommandType = ProviderCommand["type"];

export type FrameCommandMessage =
  | (ProviderCommand & { context: MessageContext; providerId: ProviderId })
  | PingFrameMessage;

export interface FrameReadyMessage {
  context: MessageContext;
  providerId: ProviderId;
  type: "AI_PARALLEL_FRAME_READY";
  href: string;
}

export interface AuthRequiredMessage {
  context: MessageContext;
  providerId: ProviderId;
  type: "AI_PARALLEL_AUTH_REQUIRED";
}

export interface SendProviderResult {
  type: "AI_PARALLEL_SEND_RESULT";
  requestId: RequestId;
  ok: boolean;
  error?: string;
  code?: string;
  retryable?: boolean;
}

export interface CollectProviderResult {
  type: "AI_PARALLEL_RESPONSE_RESULT";
  requestId: RequestId;
  ok: boolean;
  response?: ProviderResponseSnapshot | null;
  error?: string;
  code?: string;
  retryable?: boolean;
}

export interface NewChatProviderResult {
  type: "AI_PARALLEL_NEW_CHAT_RESULT";
  requestId: RequestId;
  ok: boolean;
  error?: string;
  code?: string;
  retryable?: boolean;
}

export type FrameToWorkspaceMessage =
  | FrameReadyMessage
  | AuthRequiredMessage
  | SendProviderResult
  | CollectProviderResult
  | NewChatProviderResult;

export interface ProviderTabCommandMessage {
  type: "PROVIDER_TAB_COMMAND";
  providerId: ProviderId;
  command: ProviderCommand;
}

export interface OpenWorkspaceMessage {
  type: "OPEN_WORKSPACE";
}

export interface OpenProviderTabMessage {
  type: "OPEN_PROVIDER_TAB";
  providerId: ProviderId;
}

export interface OpenProviderAuthMessage {
  type: "OPEN_PROVIDER_AUTH";
  providerId: ProviderId;
  url: string;
}

export type ServiceWorkerRequest =
  | OpenWorkspaceMessage
  | OpenProviderTabMessage
  | OpenProviderAuthMessage
  | ProviderTabCommandMessage;

export interface RunPendingLaunchMessage {
  type: "RUN_PENDING_LAUNCH";
  pending: PendingLaunch;
}

export interface OpenWorkspaceResponse {
  ok: true;
  tabId: number;
}

export interface OpenProviderTabResponse {
  ok: true;
  tabId: number;
}

export interface InvalidMessageResponse extends ProviderFailure {
  code: string;
}

export type ServiceWorkerResponse =
  | OpenWorkspaceResponse
  | OpenProviderTabResponse
  | ProviderResult<ProviderResponseSnapshot>
  | InvalidMessageResponse;

export interface MessageValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface MessageValidationFailure {
  ok: false;
  error: string;
  code: "INVALID_MESSAGE";
}

export type MessageValidationResult<T> =
  | MessageValidationSuccess<T>
  | MessageValidationFailure;

export type ContractOperation = ProviderOperation;
