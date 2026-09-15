(() => {
  const REQUIRED_ADAPTER_METHODS = Object.freeze([
    "sendPrompt",
    "collectResponse",
    "newChat",
    "healthCheck"
  ]);
  const ROLES = Object.freeze(["planner", "executor", "reviewer"]);
  const STATUS = Object.freeze({
    IDLE: "IDLE",
    QUEUED: "QUEUED",
    RUNNING: "RUNNING",
    SUCCESS: "SUCCESS",
    PARTIAL: "PARTIAL",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED"
  });
  const AGENT_STATUS = Object.freeze({
    PENDING: "PENDING",
    RUNNING: "RUNNING",
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    TIMEOUT: "TIMEOUT",
    CANCELLED: "CANCELLED"
  });
  const TERMINAL_STATUSES = new Set([
    STATUS.SUCCESS,
    STATUS.PARTIAL,
    STATUS.FAILED,
    STATUS.CANCELLED
  ]);
  const DEFAULT_MAX_CONCURRENCY = 3;
  const DEFAULT_MAX_AGENTS = 8;
  const DEFAULT_TIMEOUT_MS = 30000;
  const DEFAULT_MAX_HISTORY = 50;
  let executionSequence = 0;

  function defaultIdFactory() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    executionSequence += 1;
    return `agent-execution-${Date.now()}-${executionSequence}`;
  }

  function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
  }

  function asMessage(error, fallback = "Agent execution failed") {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.trim()) return error.trim();
    if (error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
    if (error && typeof error.error === "string" && error.error.trim()) return error.error.trim();
    return fallback;
  }

  function asErrorSnapshot(error, fallback) {
    return {
      message: asMessage(error, fallback),
      code: typeof error?.code === "string" ? error.code : null,
      retryable: error?.retryable === true
    };
  }

  function adapterIsValid(adapter) {
    const contract = globalThis.AIParallelProviderAdapterContract;
    if (contract?.validateProviderAdapter) return contract.validateProviderAdapter(adapter);
    return Boolean(
      adapter
      && typeof adapter.id === "string"
      && typeof adapter.providerId === "string"
      && REQUIRED_ADAPTER_METHODS.every((method) => typeof adapter[method] === "function")
    );
  }

  function toAdapterMap(adapters) {
    if (adapters instanceof Map) return new Map(adapters);
    if (adapters && typeof adapters === "object") return new Map(Object.entries(adapters));
    return new Map();
  }

  function snapshotAgent(agent) {
    return {
      id: agent.id,
      providerId: agent.providerId,
      role: agent.role,
      taskId: agent.taskId,
      status: agent.status,
      attempt: agent.attempt,
      maxAttempts: agent.maxAttempts,
      startedAt: agent.startedAt,
      finishedAt: agent.finishedAt,
      error: agent.error ? { ...agent.error } : null,
      response: agent.response
    };
  }

  function snapshotExecution(execution) {
    return {
      id: execution.id,
      taskId: execution.taskId,
      strategy: execution.strategy,
      status: execution.status,
      ok: execution.status === STATUS.SUCCESS || execution.status === STATUS.PARTIAL,
      cancelRequested: execution.cancelRequested,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      maxConcurrency: execution.maxConcurrency,
      scope: { ...execution.scope },
      agents: execution.agents.map(snapshotAgent),
      responses: execution.responses.map((response) => ({ ...response })),
      error: execution.error
    };
  }

  class AgentExecutionController {
    constructor({
      taskRuntime,
      adapters,
      maxConcurrency = DEFAULT_MAX_CONCURRENCY,
      maxAgents = DEFAULT_MAX_AGENTS,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxHistory = DEFAULT_MAX_HISTORY,
      idFactory = defaultIdFactory,
      now = () => Date.now()
    } = {}) {
      if (!taskRuntime || typeof taskRuntime.run !== "function") {
        throw new TypeError("Agent execution controller requires a provider task runtime");
      }

      this.taskRuntime = taskRuntime;
      this.adapters = toAdapterMap(adapters);
      this.maxConcurrency = positiveInteger(maxConcurrency, DEFAULT_MAX_CONCURRENCY);
      this.maxAgents = Math.min(positiveInteger(maxAgents, DEFAULT_MAX_AGENTS), DEFAULT_MAX_AGENTS);
      this.timeoutMs = positiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);
      this.maxHistory = positiveInteger(maxHistory, DEFAULT_MAX_HISTORY);
      this.idFactory = idFactory;
      this.now = now;
      this.executions = new Map();
      this.finishedExecutionIds = [];
      this.listeners = new Set();

      for (const adapter of this.adapters.values()) {
        if (!adapterIsValid(adapter)) {
          throw new TypeError("Agent execution controller received an invalid provider adapter");
        }
      }
    }

    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Agent execution listener must be a function");
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    createExecution({
      taskId,
      strategy = "parallel",
      prompt,
      agents,
      scope = {},
      maxConcurrency = this.maxConcurrency,
      timeoutMs = this.timeoutMs
    } = {}) {
      if (strategy !== "parallel") throw new TypeError("Only the parallel agent strategy is supported");
      if (typeof prompt !== "string" || !prompt.trim()) throw new TypeError("Agent execution requires a prompt");
      if (!Array.isArray(agents) || agents.length === 0) {
        throw new TypeError("Agent execution requires at least one agent");
      }
      if (agents.length > this.maxAgents) {
        throw new RangeError(`Agent execution is limited to ${this.maxAgents} agents`);
      }

      const executionId = String(taskId || this.idFactory());
      if (!executionId.trim()) throw new TypeError("Agent execution requires a task ID");
      if (this.executions.has(executionId)) throw new Error(`Agent execution already exists: ${executionId}`);

      const normalizedConcurrency = Math.min(
        positiveInteger(maxConcurrency, this.maxConcurrency),
        this.maxAgents
      );
      const normalizedTimeout = positiveInteger(timeoutMs, this.timeoutMs);
      const normalizedAgents = agents.map((agent, index) => this.normalizeAgent(agent, index, executionId));
      const agentIds = new Set();
      for (const agent of normalizedAgents) {
        if (agentIds.has(agent.id)) throw new Error(`Agent IDs must be unique: ${agent.id}`);
        agentIds.add(agent.id);
      }
      const scopeInput = scope && typeof scope === "object" ? scope : {};
      const execution = {
        id: executionId,
        taskId: executionId,
        strategy,
        status: STATUS.IDLE,
        cancelRequested: false,
        startedAt: null,
        finishedAt: null,
        maxConcurrency: normalizedConcurrency,
        scope: {
          id: String(scopeInput.id || executionId),
          label: String(scopeInput.label || "bounded-agent-execution"),
          providerIds: normalizedAgents.map((agent) => agent.providerId),
          roles: normalizedAgents.map((agent) => agent.role)
        },
        agents: normalizedAgents,
        responses: [],
        error: null
      };
      const record = {
        execution,
        prompt: prompt.trim(),
        timeoutMs: normalizedTimeout,
        nextAgentIndex: 0,
        activeCount: 0,
        activeTasks: new Map(),
        cancelReason: "Agent execution cancelled",
        cancelRequested: false,
        completed: false,
        resolve: null,
        promise: null,
        pump: null
      };

      Object.defineProperty(execution, "run", {
        enumerable: false,
        value: () => this.start(execution.id)
      });
      Object.defineProperty(execution, "cancel", {
        enumerable: false,
        value: (reason) => this.cancel(execution.id, reason)
      });

      this.executions.set(execution.id, record);
      this.notify(execution);
      return execution;
    }

    run(options) {
      const execution = this.createExecution(options);
      const promise = this.start(execution.id);
      promise.execution = execution;
      promise.executionId = execution.id;
      promise.cancel = execution.cancel;
      return promise;
    }

    start(executionOrId) {
      const executionId = typeof executionOrId === "string" ? executionOrId : executionOrId?.id;
      const record = this.executions.get(executionId);
      if (!record) return Promise.reject(new Error("Unknown agent execution"));
      if (record.promise) return record.promise;

      record.promise = new Promise((resolve) => {
        record.resolve = resolve;
      });
      this.setStatus(record.execution, STATUS.QUEUED);
      Promise.resolve().then(() => this.runRecord(record));
      return record.promise;
    }

    cancel(executionOrId, reason = "Agent execution cancelled") {
      const executionId = typeof executionOrId === "string" ? executionOrId : executionOrId?.id;
      const record = this.executions.get(executionId);
      if (!record || record.completed) return false;

      record.cancelRequested = true;
      record.cancelReason = asMessage(reason, "Agent execution cancelled");
      record.execution.cancelRequested = true;
      this.cancelQueuedAgents(record);
      for (const task of record.activeTasks.values()) task.cancel?.(record.cancelReason);
      this.notify(record.execution);
      if (record.activeCount === 0) this.finish(record, STATUS.CANCELLED);
      return true;
    }

    getExecution(executionId) {
      const record = this.executions.get(String(executionId));
      return record ? snapshotExecution(record.execution) : null;
    }

    listExecutions({ includeFinished = true } = {}) {
      return [...this.executions.values()]
        .filter((record) => includeFinished || !TERMINAL_STATUSES.has(record.execution.status))
        .map((record) => snapshotExecution(record.execution));
    }

    normalizeAgent(agent, index, executionId) {
      if (!agent || typeof agent !== "object") throw new TypeError(`Agent ${index + 1} is invalid`);
      if (typeof agent.providerId !== "string" || !agent.providerId.trim()) {
        throw new TypeError(`Agent ${index + 1} requires a provider ID`);
      }
      if (!ROLES.includes(agent.role)) {
        throw new TypeError(`Agent ${index + 1} role must be planner, executor, or reviewer`);
      }

      const adapter = this.adapterFor(agent.providerId);
      if (!adapter) throw new Error(`Provider adapter not found: ${agent.providerId}`);

      const id = String(agent.id || `${executionId}:agent-${index + 1}`);
      return {
        id,
        providerId: agent.providerId,
        role: agent.role,
        taskId: null,
        status: AGENT_STATUS.PENDING,
        attempt: 0,
        maxAttempts: adapter.capabilities?.retry === true ? 2 : 1,
        startedAt: null,
        finishedAt: null,
        error: null,
        response: null
      };
    }

    adapterFor(providerId) {
      const direct = this.adapters.get(providerId);
      if (direct?.providerId === providerId) return direct;
      for (const adapter of this.adapters.values()) {
        if (adapter?.providerId === providerId) return adapter;
      }
      return null;
    }

    runRecord(record) {
      if (record.completed) return;
      if (record.cancelRequested) {
        this.cancelQueuedAgents(record);
        this.finish(record, STATUS.CANCELLED);
        return;
      }

      record.execution.startedAt = this.now();
      this.setStatus(record.execution, STATUS.RUNNING);
      record.pump = () => this.pump(record);
      record.pump();
    }

    pump(record) {
      if (record.completed) return;
      if (record.cancelRequested) {
        this.cancelQueuedAgents(record);
        if (record.activeCount === 0) this.finish(record, STATUS.CANCELLED);
        return;
      }

      while (
        record.activeCount < record.execution.maxConcurrency
        && record.nextAgentIndex < record.execution.agents.length
      ) {
        const agent = record.execution.agents[record.nextAgentIndex++];
        record.activeCount += 1;
        const agentPromise = this.startAgent(record, agent);
        agentPromise.then(
          () => this.agentFinished(record, agent.id),
          () => this.agentFinished(record, agent.id)
        );
      }

      if (record.nextAgentIndex >= record.execution.agents.length && record.activeCount === 0) {
        this.finish(record, this.finalStatus(record));
      }
    }

    agentFinished(record, agentId) {
      record.activeCount = Math.max(0, record.activeCount - 1);
      record.activeTasks.delete(agentId);
      if (!record.completed) record.pump?.();
    }

    async startAgent(record, agent) {
      const adapter = this.adapterFor(agent.providerId);
      agent.status = AGENT_STATUS.RUNNING;
      agent.startedAt = this.now();
      this.notify(record.execution);

      try {
        if (record.cancelRequested) {
          this.markAgentCancelled(agent, record.cancelReason);
          return;
        }
        const taskPromise = this.taskRuntime.run({
          providerId: agent.providerId,
          operation: `agent-${agent.role}`,
          timeoutMs: record.timeoutMs,
          maxAttempts: agent.maxAttempts,
          retryOn: (error) => error?.retryable === true,
          execute: ({ signal, attempt }) => adapter.sendPrompt(
            this.scopedPrompt(record.prompt, record.execution, agent),
            {
              signal,
              attempt,
              timeoutMs: record.timeoutMs,
              executionId: record.execution.id,
              scopeId: record.execution.scope.id,
              agentId: agent.id,
              role: agent.role
            }
          )
        });
        record.activeTasks.set(agent.id, taskPromise);
        agent.taskId = taskPromise.taskId || taskPromise.task?.id || null;
        this.notify(record.execution);
        const result = await taskPromise;
        agent.attempt = taskPromise.task?.attempt || agent.attempt;

        if (record.cancelRequested || result?.status === "CANCELLED") {
          this.markAgentCancelled(agent, record.cancelReason);
        } else if (result?.ok === false) {
          agent.status = result.status === "TIMEOUT" ? AGENT_STATUS.TIMEOUT : AGENT_STATUS.FAILED;
          agent.error = asErrorSnapshot(result, result.status || "Agent task failed");
        } else {
          agent.status = AGENT_STATUS.SUCCESS;
          agent.response = result?.response ?? result;
          agent.error = null;
        }
      } catch (error) {
        agent.attempt = agent.attempt || 1;
        if (record.cancelRequested || error?.code === "TASK_CANCELLED") {
          this.markAgentCancelled(agent, record.cancelReason);
        } else {
          agent.status = error?.code === "TASK_TIMEOUT" ? AGENT_STATUS.TIMEOUT : AGENT_STATUS.FAILED;
          agent.error = asErrorSnapshot(error);
        }
      } finally {
        agent.finishedAt = this.now();
        this.notify(record.execution);
      }
    }

    scopedPrompt(prompt, execution, agent) {
      return [
        `You are the ${agent.role} agent in a bounded AI Parallel execution.`,
        `Execution scope: ${execution.scope.label} (${execution.scope.id}).`,
        "Follow the requested scope and return only the useful result.",
        "",
        prompt
      ].join("\n");
    }

    markAgentCancelled(agent, reason) {
      agent.status = AGENT_STATUS.CANCELLED;
      agent.error = asErrorSnapshot({ code: "AGENT_CANCELLED", retryable: false }, reason);
      agent.response = null;
    }

    cancelQueuedAgents(record) {
      for (let index = record.nextAgentIndex; index < record.execution.agents.length; index += 1) {
        const agent = record.execution.agents[index];
        if (agent.status !== AGENT_STATUS.PENDING) continue;
        this.markAgentCancelled(agent, record.cancelReason);
        agent.finishedAt = this.now();
      }
      record.nextAgentIndex = record.execution.agents.length;
      this.notify(record.execution);
    }

    finalStatus(record) {
      if (record.cancelRequested) return STATUS.CANCELLED;
      const succeeded = record.execution.agents.filter((agent) => agent.status === AGENT_STATUS.SUCCESS).length;
      return succeeded === record.execution.agents.length
        ? STATUS.SUCCESS
        : succeeded > 0 ? STATUS.PARTIAL : STATUS.FAILED;
    }

    finish(record, status) {
      if (record.completed) return;
      record.completed = true;
      const execution = record.execution;
      execution.status = status;
      execution.finishedAt = this.now();
      execution.error = status === STATUS.SUCCESS || status === STATUS.PARTIAL
        ? null
        : status === STATUS.CANCELLED ? record.cancelReason : "All agent tasks failed";
      execution.responses = execution.agents
        .filter((agent) => agent.status === AGENT_STATUS.SUCCESS)
        .map((agent) => ({
          agentId: agent.id,
          providerId: agent.providerId,
          role: agent.role,
          response: agent.response
        }));
      const result = snapshotExecution(execution);
      record.prompt = null;
      record.activeTasks.clear();
      this.finishedExecutionIds.push(execution.id);
      while (this.finishedExecutionIds.length > this.maxHistory) {
        this.executions.delete(this.finishedExecutionIds.shift());
      }
      this.notify(execution);
      record.resolve?.(result);
    }

    setStatus(execution, status) {
      if (execution.status === status) return;
      execution.status = status;
      this.notify(execution);
    }

    notify(execution) {
      const snapshot = snapshotExecution(execution);
      for (const listener of this.listeners) {
        try { listener(snapshot); } catch { /* Observers must not affect agent execution. */ }
      }
    }
  }

  globalThis.AIParallelAgentExecutionController = Object.freeze({
    ROLES,
    STATUS,
    AGENT_STATUS,
    TERMINAL_STATUSES: Object.freeze([...TERMINAL_STATUSES]),
    AgentExecutionController,
    createAgentExecutionController(options) {
      return new AgentExecutionController(options);
    }
  });
})();
