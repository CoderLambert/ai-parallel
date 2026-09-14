(() => {
  const STATUS = Object.freeze({
    IDLE: "IDLE",
    QUEUED: "QUEUED",
    RUNNING: "RUNNING",
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    TIMEOUT: "TIMEOUT",
    CANCELLED: "CANCELLED"
  });

  const TERMINAL_STATUSES = new Set([
    STATUS.SUCCESS,
    STATUS.FAILED,
    STATUS.TIMEOUT,
    STATUS.CANCELLED
  ]);
  const DEFAULT_TIMEOUT_MS = 30000;
  const DEFAULT_MAX_ATTEMPTS = 1;
  let taskSequence = 0;

  function defaultIdFactory() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    taskSequence += 1;
    return `provider-task-${Date.now()}-${taskSequence}`;
  }

  function asMessage(error, fallback = "Provider task failed") {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.trim()) return error.trim();
    if (error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
    return fallback;
  }

  function asTaskError(error) {
    const normalized = error instanceof Error ? error : new Error(asMessage(error));
    normalized.message = asMessage(normalized);
    if (error && typeof error === "object") {
      if (typeof error.code === "string") normalized.code = error.code;
      if (typeof error.name === "string") normalized.name = error.name;
      normalized.retryable = error.retryable === true;
    }
    return normalized;
  }

  function errorFromResult(result) {
    const error = new Error(asMessage(result?.error));
    error.code = typeof result?.code === "string" ? result.code : "PROVIDER_FAILURE";
    error.retryable = result?.retryable === true;
    return error;
  }

  function isTimeoutError(error) {
    return error?.code === "TASK_TIMEOUT"
      || error?.code === "REQUEST_TIMEOUT"
      || error?.name === "TimeoutError";
  }

  function snapshotTask(task) {
    return {
      id: task.id,
      providerId: task.providerId,
      operation: task.operation,
      status: task.status,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      error: task.error,
      response: task.response,
      retryReasons: task.retryReasons.map((entry) => ({ ...entry }))
    };
  }

  function createAbortController() {
    if (typeof AbortController === "function") return new AbortController();
    let aborted = false;
    const listeners = new Set();
    return {
      signal: {
        get aborted() { return aborted; },
        addEventListener(_type, listener) { listeners.add(listener); },
        removeEventListener(_type, listener) { listeners.delete(listener); }
      },
      abort() {
        if (aborted) return;
        aborted = true;
        for (const listener of listeners) listener();
      }
    };
  }

  function createAbortError(reason = "Provider task cancelled") {
    const error = new Error(reason);
    error.name = "AbortError";
    error.code = "TASK_CANCELLED";
    error.retryable = false;
    return error;
  }

  class ProviderTaskRuntime {
    constructor({
      defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
      defaultMaxAttempts = DEFAULT_MAX_ATTEMPTS,
      maxHistory = 100,
      idFactory = defaultIdFactory,
      now = () => Date.now()
    } = {}) {
      this.defaultTimeoutMs = this.#positiveInteger(defaultTimeoutMs, DEFAULT_TIMEOUT_MS);
      this.defaultMaxAttempts = this.#positiveInteger(defaultMaxAttempts, DEFAULT_MAX_ATTEMPTS);
      this.maxHistory = this.#positiveInteger(maxHistory, 100);
      this.idFactory = idFactory;
      this.now = now;
      this.tasks = new Map();
      this.finishedTaskIds = [];
      this.listeners = new Set();
    }

    #positiveInteger(value, fallback) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
    }

    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Task listener must be a function");
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    createTask({
      providerId,
      operation = "provider-request",
      execute,
      timeoutMs = this.defaultTimeoutMs,
      maxAttempts = this.defaultMaxAttempts,
      retryOn
    } = {}) {
      if (typeof providerId !== "string" || !providerId.trim()) throw new TypeError("Provider task requires a provider ID");
      if (typeof execute !== "function") throw new TypeError("Provider task requires an executor");

      const task = {
        id: String(this.idFactory()),
        providerId,
        operation: String(operation),
        status: STATUS.IDLE,
        attempt: 0,
        maxAttempts: this.#positiveInteger(maxAttempts, this.defaultMaxAttempts),
        startedAt: null,
        finishedAt: null,
        error: null,
        response: null,
        retryReasons: [],
        run: null,
        cancel: null
      };
      const record = {
        task,
        execute,
        timeoutMs: this.#positiveInteger(timeoutMs, this.defaultTimeoutMs),
        retryOn: typeof retryOn === "function" ? retryOn : (error) => error?.retryable === true,
        controller: null,
        cancelRequested: false,
        completed: false,
        resolve: null,
        promise: null
      };

      task.run = () => this.start(task.id);
      task.cancel = (reason) => this.cancel(task.id, reason);
      this.tasks.set(task.id, record);
      this.notify(task);
      return task;
    }

    run(options) {
      const task = this.createTask(options);
      const promise = this.start(task.id);
      promise.task = task;
      promise.taskId = task.id;
      promise.cancel = task.cancel;
      return promise;
    }

    execute(options) {
      return this.run(options);
    }

    start(taskOrId) {
      const taskId = typeof taskOrId === "string" ? taskOrId : taskOrId?.id;
      const record = this.tasks.get(taskId);
      if (!record) return Promise.reject(new Error("Unknown provider task"));
      if (record.promise) return record.promise;
      if (TERMINAL_STATUSES.has(record.task.status)) {
        record.promise = Promise.resolve(this.failureResult(record.task));
        return record.promise;
      }

      record.promise = new Promise((resolve) => {
        record.resolve = resolve;
      });
      this.setStatus(record.task, STATUS.QUEUED);
      Promise.resolve().then(() => this.runRecord(record));
      return record.promise;
    }

    cancel(taskOrId, reason = "Provider task cancelled") {
      const taskId = typeof taskOrId === "string" ? taskOrId : taskOrId?.id;
      const record = this.tasks.get(taskId);
      if (!record || record.completed) return false;

      record.cancelRequested = true;
      record.controller?.abort();
      this.finish(record, STATUS.CANCELLED, createAbortError(String(reason || "Provider task cancelled")));
      return true;
    }

    getTask(taskId) {
      const record = this.tasks.get(String(taskId));
      return record ? snapshotTask(record.task) : null;
    }

    listTasks({ providerId, includeFinished = true } = {}) {
      return [...this.tasks.values()]
        .filter((record) => !providerId || record.task.providerId === providerId)
        .filter((record) => includeFinished || !TERMINAL_STATUSES.has(record.task.status))
        .map((record) => snapshotTask(record.task));
    }

    async runRecord(record) {
      const { task } = record;
      if (record.cancelRequested || record.completed) return;

      while (!record.completed && task.attempt < task.maxAttempts) {
        if (record.cancelRequested) {
          this.finish(record, STATUS.CANCELLED, createAbortError());
          return;
        }

        task.attempt += 1;
        if (!task.startedAt) task.startedAt = this.now();
        this.setStatus(task, STATUS.RUNNING);

        const controller = createAbortController();
        record.controller = controller;
        try {
          const response = await this.withTimeout(record, controller);
          if (record.cancelRequested || record.completed) return;
          if (response?.ok === false) throw errorFromResult(response);
          task.response = response;
          this.finish(record, STATUS.SUCCESS);
          return;
        } catch (error) {
          if (record.cancelRequested || record.completed) return;
          const normalized = asTaskError(error);
          const shouldRetry = task.attempt < task.maxAttempts && this.shouldRetry(record, normalized, task);
          if (shouldRetry) {
            task.retryReasons.push({
              attempt: task.attempt,
              reason: normalized.message,
              code: normalized.code || null,
              timestamp: this.now()
            });
            this.notify(task);
            this.setStatus(task, STATUS.QUEUED);
            continue;
          }
          this.finish(record, isTimeoutError(normalized) ? STATUS.TIMEOUT : STATUS.FAILED, normalized);
          return;
        } finally {
          if (record.controller === controller) record.controller = null;
        }
      }
    }

    shouldRetry(record, error, task) {
      try {
        return record.retryOn(error, snapshotTask(task)) === true;
      } catch {
        return false;
      }
    }

    withTimeout(record, controller) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          controller.abort();
          const error = new Error(`Provider task timed out after ${record.timeoutMs}ms`);
          error.name = "TimeoutError";
          error.code = "TASK_TIMEOUT";
          error.retryable = true;
          reject(error);
        }, record.timeoutMs);

        Promise.resolve()
          .then(() => record.execute({
            task: snapshotTask(record.task),
            attempt: record.task.attempt,
            signal: controller.signal
          }))
          .then((value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            resolve(value);
          })
          .catch((error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            reject(error);
          });
      });
    }

    setStatus(task, status) {
      if (task.status === status) return;
      task.status = status;
      this.notify(task);
    }

    finish(record, status, error) {
      if (record.completed) return;
      const { task } = record;
      record.completed = true;
      task.status = status;
      task.finishedAt = this.now();
      task.error = status === STATUS.SUCCESS ? null : asMessage(error, status);
      if (status !== STATUS.SUCCESS) task.response = null;
      this.finishedTaskIds.push(task.id);
      while (this.finishedTaskIds.length > this.maxHistory) {
        const oldId = this.finishedTaskIds.shift();
        const oldRecord = this.tasks.get(oldId);
        if (oldRecord?.completed) this.tasks.delete(oldId);
      }
      this.notify(task);
      record.resolve?.(status === STATUS.SUCCESS ? task.response : this.failureResult(task));
    }

    failureResult(task) {
      return {
        ok: false,
        error: task.error || task.status,
        status: task.status,
        taskId: task.id,
        attempt: task.attempt,
        retryReasons: task.retryReasons.map((entry) => ({ ...entry }))
      };
    }

    notify(task) {
      const snapshot = snapshotTask(task);
      for (const listener of this.listeners) {
        try { listener(snapshot); } catch { /* Observers must not affect task execution. */ }
      }
    }
  }

  globalThis.AIParallelProviderTaskRuntime = Object.freeze({
    STATUS,
    TERMINAL_STATUSES: Object.freeze([...TERMINAL_STATUSES]),
    ProviderTaskRuntime,
    createProviderTaskRuntime(options) {
      return new ProviderTaskRuntime(options);
    }
  });
})();
