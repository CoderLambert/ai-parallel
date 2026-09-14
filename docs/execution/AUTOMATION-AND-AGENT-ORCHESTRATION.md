# AI Parallel Automation and Agent Orchestration

This document explains how to dispatch scheduled tasks and bounded agents. It
does not create a second Issue contract; `issue-rule.md` remains canonical for
outcome, invariants, scope, acceptance, validation, and dependencies.

## Dispatch gate

Use the smallest useful orchestration mode:

### Single writer

Default for small work, tightly coupled state changes, shared contracts, or
when isolation is unavailable. Read-only reviewers may still explore in
parallel.

### Parallel read

Use for architecture mapping, Provider DOM investigation, security/manifest
audits, dependency analysis, test-gap discovery, or PR review.

### Isolated parallel write

Use only when write domains are independent, ownership is explicit, shared
hotspots have one writer, and each writer has a real branch/worktree or other
filesystem isolation. An integration owner and a composition path must be
known before starting.

```text
small or coupled       → single writer
independent research   → parallel read + single writer
independent writes     → isolated writers + integration owner
uncertain ownership    → single writer + review
```

## Shared hotspots

Treat these as semantic conflict domains even when files do not overlap:

- provider catalog, ProviderId taxonomy, and adapter contract;
- messaging payloads and bridge allowlists;
- workspace/provider state and request lifecycle;
- storage keys, schema, and migration behavior;
- manifest, host permissions, CSP, DNR, and release configuration;
- `package.json`, lockfiles, `.github/workflows/**`, and shared test/browser
  configuration.

One wave has one writer for each shared hotspot. Provider-specific adapter work
can run independently only when the shared contract is stable and the adapter
does not change permissions, messaging, storage, or shared DOM semantics.

## Scheduled task lanes

A scheduled task is a durable ownership lane, not a timer around a tiny Issue.
Use no more than five active project automations by default; this is a safety
ceiling, not a utilization target.

Each lane must have:

- an owner and stable domain;
- a useful recurrence and a clear lane-level stop condition;
- a resume/idempotency rule that re-reads the latest Issue, `main`, PRs, and
  dependencies;
- a known integration owner when it crosses a shared contract;
- focused acceptance and validation evidence.

At every run, skip already-complete work, refresh the Execution Base, select the
highest-priority unblocked work in the lane, advance to a coherent checkpoint,
validate it, and record a handoff. Stop when the lane is complete, blocked by a
specific dependency, enters unresolved scope drift, needs a product/security
decision, or the next item is a distinct review/rollback unit.

## Scheduled task prompt

```text
Repository: CoderLambert/ai-parallel
Issue(s): <numbers or none>
Lane: <stable ownership domain>

Before execution:
- Read AGENTS.md, issue-rule.md, and relevant architecture docs.
- Refresh the latest Issue, decisions, main, PRs, and dependencies.
- Establish the current Execution Base and confirm READY state.

Contract for this lane:
- Target: <relevant outcome>
- Invariants: <relevant boundaries>
- Expected scope: <owner-local scope>
- Sensitive/shared surfaces: <surfaces requiring coordination>
- Acceptance Criteria: <relevant criteria>
- Validation: <required evidence>
- Hard dependencies: <real blockers>

Execution:
1. Skip work that is already complete.
2. Implement only the bounded owner-local outcome.
3. Apply the Scope Drift protocol before expanding a shared contract.
4. Do not duplicate another lane's Provider, message, storage, or security path.
5. Validate and record the standard handoff.
6. Continue only while the next work remains in this lane's safe boundary.
```

Completed lanes should not remain active unless they have a defined monitoring
purpose. Do not create wait-only automation chains or repeatedly retry an
unchanged blocker.

## Parent and sub-agent contract

The parent agent consumes the latest Issue contract, chooses the dispatch mode,
owns scope drift and final integration, and maintains one interpretation of
invariants and acceptance criteria. Sub-agents should be bounded and preferably
read-only.

```text
You are a bounded sub-agent. The Issue contract is authoritative.

Repository: CoderLambert/ai-parallel
Issue/work item: <id>
Execution Base: <sha/ref>
Objective: <one bounded question or outcome>
Expected scope: <files/modules>
Sensitive/shared surfaces: <list>
Acceptance Criteria: <subset>
Validation: <subset>
Output: <evidence, patch, or review result>

Rules:
- Stay inside the assigned scope.
- Report evidence and assumptions separately.
- Stop and report Scope Drift before changing a shared/core contract.
- Do not modify another lane's owned scope.
- Return concise findings to the parent/integration owner.
```

## Handoff and integration

Every handoff should identify Issue, lane, Execution Base, branch/PR, HEAD,
owned scope, changed files, acceptance status, validation, security/permission
delta, risks, blockers, and next action. Do not conflate branch HEAD with the
commit actually validated by CI.

Integration is a deliberate step: refresh the candidate, inspect semantic
conflicts, review manifest/permission and storage changes, run the risk-
appropriate repository/browser checks, then record the merged commit on the
Issue. Closing an Issue or deleting an automation is not implied by a branch
commit alone.
