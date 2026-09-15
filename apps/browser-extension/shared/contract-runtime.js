(() => {
  const MESSAGE_CONTEXT = "ai-parallel-workspace";
  const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
  const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
  const PROVIDER_COMMAND_TYPES = new Set([
    "AI_PARALLEL_SEND",
    "AI_PARALLEL_COLLECT_RESPONSE",
    "AI_PARALLEL_NEW_CHAT"
  ]);
  const FRAME_RESULT_TYPES = new Set([
    "AI_PARALLEL_FRAME_READY",
    "AI_PARALLEL_AUTH_REQUIRED",
    "AI_PARALLEL_SEND_RESULT",
    "AI_PARALLEL_RESPONSE_RESULT",
    "AI_PARALLEL_NEW_CHAT_RESULT"
  ]);
  const STORAGE_KEYS = new Set([
    "selectedProviders",
    "draftPrompt",
    "pendingLaunch",
    "workspaceLayout",
    "workspaceSessions",
    "promptLibrary",
    "promptTemplatesV1"
  ]);

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isNonEmptyString(value, maxLength = 200000) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
  }

  function isProviderId(value) {
    return typeof value === "string" && PROVIDER_ID_PATTERN.test(value);
  }

  function isRequestId(value) {
    return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
  }

  function isProviderCommand(value) {
    if (!isRecord(value) || !PROVIDER_COMMAND_TYPES.has(value.type) || !isRequestId(value.requestId)) return false;
    if (value.type === "AI_PARALLEL_SEND") return isNonEmptyString(value.prompt);
    return true;
  }

  function hasWorkspaceContext(value, providerId) {
    return isRecord(value)
      && value.context === MESSAGE_CONTEXT
      && isProviderId(value.providerId)
      && (providerId === undefined || value.providerId === providerId);
  }

  function isFrameCommandMessage(value, providerId) {
    if (!hasWorkspaceContext(value, providerId)) return false;
    if (value.type === "AI_PARALLEL_PING") return true;
    return isProviderCommand(value);
  }

  function isProviderResponseSnapshot(value) {
    return isRecord(value)
      && isProviderId(value.provider)
      && typeof value.content === "string"
      && typeof value.markdown === "string"
      && typeof value.timestamp === "string";
  }

  function isFrameToWorkspaceMessage(value, providerId) {
    if (!hasWorkspaceContext(value, providerId) || !FRAME_RESULT_TYPES.has(value.type)) return false;
    if (value.type === "AI_PARALLEL_FRAME_READY") return isNonEmptyString(value.href, 4000);
    if (value.type === "AI_PARALLEL_AUTH_REQUIRED") return true;
    if (!isRequestId(value.requestId) || typeof value.ok !== "boolean") return false;
    if (value.ok === false && !isNonEmptyString(value.error, 2000)) return false;
    if (value.type === "AI_PARALLEL_RESPONSE_RESULT" && value.ok === true) {
      return isProviderResponseSnapshot(value.response);
    }
    return true;
  }

  function isServiceWorkerRequest(value) {
    if (!isRecord(value) || typeof value.type !== "string") return false;
    if (value.type === "OPEN_WORKSPACE") return true;
    if (value.type === "OPEN_PROVIDER_TAB") return isProviderId(value.providerId);
    if (value.type === "OPEN_PROVIDER_AUTH") {
      return isProviderId(value.providerId) && isNonEmptyString(value.url, 4000);
    }
    if (value.type === "PROVIDER_TAB_COMMAND") {
      return isProviderId(value.providerId) && isProviderCommand(value.command);
    }
    return false;
  }

  function isServiceWorkerResponse(value) {
    if (!isRecord(value) || typeof value.ok !== "boolean") return false;
    if (value.ok === false) return isNonEmptyString(value.error, 2000);
    if (value.tabId !== undefined) return Number.isInteger(value.tabId) && value.tabId > 0;
    if (value.response !== undefined && value.response !== null) return isProviderResponseSnapshot(value.response);
    return true;
  }

  function isPendingLaunch(value) {
    return isRecord(value)
      && isNonEmptyString(value.prompt)
      && Array.isArray(value.providerIds)
      && value.providerIds.length > 0
      && value.providerIds.every(isProviderId)
      && isNonEmptyString(value.queuedAt, 200);
  }

  function isRunPendingLaunchMessage(value) {
    return isRecord(value) && value.type === "RUN_PENDING_LAUNCH" && isPendingLaunch(value.pending);
  }

  function isProviderIdArray(value) {
    return Array.isArray(value) && value.every(isProviderId);
  }

  function isRecordArray(value) {
    return Array.isArray(value) && value.every(isRecord);
  }

  function isStorageValue(key, value) {
    if (key === "schemaVersion") return value === 1;
    if (key === "selectedProviders") return isProviderIdArray(value);
    if (key === "draftPrompt") return typeof value === "string";
    if (key === "pendingLaunch") return isPendingLaunch(value);
    if (key === "workspaceLayout") return ["auto", "1", "2", "3"].includes(value);
    if (key === "workspaceSessions" || key === "promptLibrary" || key === "promptTemplatesV1") {
      return isRecordArray(value);
    }
    return false;
  }

  function isStorageRecord(value) {
    if (!isRecord(value)) return false;
    return Object.entries(value).every(([key, entry]) => (
      (key === "schemaVersion" || STORAGE_KEYS.has(key)) && isStorageValue(key, entry)
    ));
  }

  function isStoragePatch(value) {
    return isStorageRecord(value)
      && Object.keys(value).length > 0
      && !Object.prototype.hasOwnProperty.call(value, "schemaVersion");
  }

  function invalidMessage(error = "Invalid message") {
    return { ok: false, error, code: "INVALID_MESSAGE" };
  }

  globalThis.AIParallelContractRuntime = Object.freeze({
    MESSAGE_CONTEXT,
    isProviderId,
    isProviderCommand,
    isFrameCommandMessage,
    isFrameToWorkspaceMessage,
    isServiceWorkerRequest,
    isServiceWorkerResponse,
    isRunPendingLaunchMessage,
    isPendingLaunch,
    isStorageRecord,
    isStoragePatch,
    invalidMessage
  });
})();
