(() => {
  const STORAGE_SCHEMA_VERSION = 1;
  const STORAGE_KEYS = Object.freeze({
    selectedProviders: "selectedProviders",
    draftPrompt: "draftPrompt",
    pendingLaunch: "pendingLaunch",
    workspaceLayout: "workspaceLayout",
    workspaceSessions: "workspaceSessions",
    promptLibrary: "promptLibrary",
    promptTemplates: "promptTemplatesV1"
  });
  const runtime = globalThis.AIParallelContractRuntime;

  function requestedKeys(keys) {
    if (keys === undefined) return Object.values(STORAGE_KEYS);
    return Array.isArray(keys) ? keys : [keys];
  }

  function assertKeys(keys) {
    const values = requestedKeys(keys);
    if (!values.length || values.some((key) => typeof key !== "string" || !Object.values(STORAGE_KEYS).includes(key))) {
      throw new TypeError("Unknown AI Parallel storage key");
    }
    return values;
  }

  function filterRecord(record) {
    if (!record || typeof record !== "object") return {};
    return Object.fromEntries(Object.entries(record).filter(([key, value]) => runtime.isStorageRecord({ [key]: value })));
  }

  function migrateStorageRecord(record) {
    return {
      ...filterRecord(record),
      schemaVersion: STORAGE_SCHEMA_VERSION
    };
  }

  function createLocalStorage(area = globalThis.chrome?.storage?.local) {
    if (!area || typeof area.get !== "function" || typeof area.set !== "function" || typeof area.remove !== "function") {
      throw new TypeError("Chrome local storage is unavailable");
    }

    return Object.freeze({
      async get(keys) {
        const values = keys === undefined ? undefined : assertKeys(keys);
        const result = await area.get(values);
        return migrateStorageRecord(result);
      },
      async set(patch) {
        if (!runtime.isStoragePatch(patch)) throw new TypeError("Invalid AI Parallel storage patch");
        await area.set(patch);
      },
      async remove(keys) {
        await area.remove(assertKeys(keys));
      }
    });
  }

  globalThis.AIParallelStorageContract = Object.freeze({
    STORAGE_SCHEMA_VERSION,
    STORAGE_KEYS,
    createLocalStorage,
    migrateStorageRecord,
    isStorageRecord: runtime.isStorageRecord,
    isStoragePatch: runtime.isStoragePatch
  });
})();
