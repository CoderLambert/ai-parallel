import type { ProviderId } from "./provider";
import type { PromptTemplate } from "./template";

export const STORAGE_SCHEMA_VERSION = 1 as const;

export const STORAGE_KEYS = {
  selectedProviders: "selectedProviders",
  draftPrompt: "draftPrompt",
  pendingLaunch: "pendingLaunch",
  workspaceLayout: "workspaceLayout",
  workspaceSessions: "workspaceSessions",
  promptLibrary: "promptLibrary",
  promptTemplates: "promptTemplatesV1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type WorkspaceLayout = "auto" | "1" | "2" | "3";

export interface PendingLaunch {
  prompt: string;
  providerIds: ProviderId[];
  queuedAt: string;
}

export interface StoredSession {
  id: string;
  title: string;
  prompt: string;
  selectedProviders: ProviderId[];
  workspaceLayout: WorkspaceLayout;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPrompt {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageState {
  /** Logical contract version; legacy records may omit this field during migration. */
  schemaVersion?: typeof STORAGE_SCHEMA_VERSION;
  selectedProviders?: ProviderId[];
  draftPrompt?: string;
  pendingLaunch?: PendingLaunch;
  workspaceLayout?: WorkspaceLayout;
  workspaceSessions?: StoredSession[];
  promptLibrary?: StoredPrompt[];
  promptTemplatesV1?: PromptTemplate[];
}

export type StoragePatch = Partial<Omit<StorageState, "schemaVersion">>;
