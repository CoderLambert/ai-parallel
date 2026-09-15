import type {
  FrameCommandMessage,
  FrameToWorkspaceMessage,
  MessageContext,
  MessageValidationResult,
  PendingLaunch,
  ProviderCommand,
  ProviderId,
  RunPendingLaunchMessage,
  ServiceWorkerRequest,
} from "./index";
import type { StoragePatch, StorageState } from "./storage";
import type { ProviderDescriptor } from "./provider";
import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplatePackage,
  TemplateValidationResult,
} from "./template";

export interface AIParallelContractRuntime {
  readonly MESSAGE_CONTEXT: MessageContext;
  isProviderId(value: unknown): value is ProviderId;
  isProviderCommand(value: unknown): value is ProviderCommand;
  isFrameCommandMessage(value: unknown, providerId?: string): value is FrameCommandMessage;
  isFrameToWorkspaceMessage(value: unknown, providerId?: string): value is FrameToWorkspaceMessage;
  isServiceWorkerRequest(value: unknown): value is ServiceWorkerRequest;
  isServiceWorkerResponse(value: unknown): boolean;
  isRunPendingLaunchMessage(value: unknown): value is RunPendingLaunchMessage;
  isPendingLaunch(value: unknown): value is PendingLaunch;
  isStorageRecord(value: unknown): value is StorageState;
  isStoragePatch(value: unknown): value is StoragePatch;
  invalidMessage(error?: string): { ok: false; error: string; code: "INVALID_MESSAGE" };
}

declare global {
  var AIParallelProviderCatalog: readonly ProviderDescriptor[];
  var AIParallelPromptTemplateCatalog: {
    readonly categories: readonly PromptTemplateCategory[];
    readonly templates: readonly PromptTemplate[];
  };
  var AIParallelPromptTemplateUtils: {
    readonly DRAFT_URI: string;
    readonly TEMPLATE_KIND: "ai-parallel.prompt-template";
    readonly PACKAGE_KIND: "ai-parallel.prompt-template-package";
    readonly SCHEMA_VERSION: 1;
    clone<T>(value: T): T;
    normalizeTemplate(raw: unknown, options?: { source?: string }): PromptTemplate;
    validateTemplateDefinition(template: PromptTemplate): TemplateValidationResult;
    toPackage(templates: PromptTemplate[]): PromptTemplatePackage;
  };
  var AIParallelProviderAdapterContract: {
    readonly CONTRACT_VERSION: "provider-adapter-v1";
    readonly REQUIRED_METHODS: readonly string[];
    readonly operations: Readonly<Record<string, string>>;
  };
  var AIParallelContractRuntime: AIParallelContractRuntime;
  var AIParallelStorageContract: {
    readonly STORAGE_SCHEMA_VERSION: 1;
    readonly STORAGE_KEYS: Readonly<Record<string, string>>;
    migrateStorageRecord(record: unknown): StorageState;
    createLocalStorage(): {
      get(keys?: string | string[]): Promise<Record<string, unknown>>;
      set(patch: StoragePatch): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
    isStorageRecord(value: unknown): value is StorageState;
    isStoragePatch(value: unknown): value is StoragePatch;
  };
}

export {};
