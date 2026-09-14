# AI Parallel Repository Agent Instructions

These instructions apply to the whole repository.

Canonical references:

- `issue-rule.md` — Issue creation, revision, scope, acceptance, validation and closure.
- `docs/execution/AUTOMATION-AND-AGENT-ORCHESTRATION.md` — scheduled-task, Codex parent/sub-agent, concurrency, integration and handoff rules.

Before creating, materially rewriting, or executing a GitHub Issue, read `issue-rule.md`.
For scheduled, multi-agent, or parallel work, also read the orchestration playbook.

## Repository rules

1. **Issue = adaptive execution contract.** Target and Invariants define outcome/risk boundaries; Working Direction is provisional.

2. **Open does not mean READY.** Refresh latest Issue, main, dependencies, PRs and Execution Base before autonomous implementation.

3. **Do not silently expand risk.** Owner-local details may change autonomously. Before entering shared/cross-domain/security surfaces, apply Scope Drift.

4. **Acceptance is not Validation.** Explicitly verify AC; tests/build/E2E/CI are evidence, not automatic proof.

5. **Choose minimum useful orchestration.** Default to one writer. Prefer parallel read-only exploration/review. Parallel writes require independent semantic ownership and real branch/worktree/filesystem isolation.

6. **Semantic conflicts count.** Check file, API/contract, state, storage schema, Provider contract, permissions/DNR and integration ownership. Zero Git conflict does not imply safety.

7. **One writer per shared hotspot per wave.** Treat these conservatively:
   - `wxt.config.ts` / manifest generation;
   - Provider Registry / `ProviderId` taxonomy;
   - shared messaging protocol;
   - storage schema/migrations;
   - DNR/CSP/host-permission rules;
   - background/content/workspace integration seam;
   - package/lock/workspace files;
   - `.github/workflows/**`;
   - shared Vitest/Playwright/release config.

8. **Provider adapters are isolated ownership units when their shared contract is stable.** A ChatGPT adapter and DeepSeek adapter may be reviewed or written in parallel only if neither changes Provider Registry, shared DOM helpers in incompatible ways, messaging/storage contracts, or manifest/DNR ownership.

9. **Do not use merge-conflict resolution as architecture.** Repeated hotspot contention means establish a seam, serialize the work, or reserve composition to an integration owner.

10. **Do not freeze a known-wrong plan.** If implementation evidence invalidates Issue assumptions, revise Issue/[DECISION]/dependencies/scope before continuing affected work.

11. **Background/service-worker design must respect MV3 lifecycle.** Do not introduce correctness that depends on long-lived in-memory global state surviving service-worker suspension.

12. **Security changes are contract changes.** Any expansion of host permissions, DNR header rewriting, auth-host allowlists, CSP behavior, MAIN-world execution, or remote-code behavior is Sensitive at minimum and requires explicit evidence/review.

13. **Migration work preserves behavior by default.** During WXT/React/TypeScript engineering migration, do not quietly redesign Provider behavior, iframe/tab architecture, permissions, storage semantics, or product UX unless the Issue explicitly owns that outcome.

14. **Validation follows risk.** Adapter-local changes need focused/contract tests; cross-context/runtime changes need regression/browser evidence; manifest/DNR/security/release changes need generated-artifact review plus browser/release validation as applicable.

15. **Preserve traceability.** Unless explicitly instructed otherwise, use scoped branches/PRs and keep Issue → Execution Base → branch/PR → tested candidate → merge evidence coherent.

## Current domain map

```text
Foundation / Build
Extension Runtime
Provider Runtime & Adapters
Workspace UI
Popup UI
Messaging
Storage
Security / DNR / Permissions
Verification / CI
Release
```

This taxonomy is a coordination aid, not a frozen future architecture. If a machine-readable ownership manifest is later introduced, it becomes the preferred shared taxonomy.

## Issue execution preflight

```text
1. Read AGENTS.md + issue-rule.md
2. Refresh latest Issue / decisions / main / PRs / dependencies
3. Confirm READY state and current Execution Base
4. Confirm Target / Invariants / AC / Validation
5. Identify Expected and Sensitive/shared conflict domains
6. Choose single writer / parallel read / isolated parallel write
7. Implement owner-local work autonomously
8. Apply Scope Drift before meaningful risk expansion
9. Validate focused → repository/regression → browser/integration → required CI as applicable
10. Record concise handoff/closure evidence
```

## Standard handoff

```text
STATUS: DONE | PARTIAL | BLOCKED
ISSUE: <number or none>
LANE: <name>
EXECUTION_BASE: <sha/ref>
CONTRACT_REVISION: <issue updated-at / decision ref / none>
BRANCH: <branch>
HEAD: <sha>
PR: <number/url or none>
OWNED_SCOPE: <modules/files>
SENSITIVE_SURFACES_TOUCHED: <none or list>
CHANGED: <important files/modules>
AC_STATUS: <complete / partial + evidence>
VALIDATION: <checks and results>
SECURITY_PERMISSION_DELTA: <none or concise description>
KNOWN_RISKS: <none or concise list>
BLOCKERS: <none or exact blockers>
NEXT: <integration or follow-up action>
```

Use `BASE_SHA / HEAD_SHA / TESTED_SHA / RUN_ID` when merge-candidate evidence applies. Do not conflate branch HEAD with the revision actually tested by CI.
