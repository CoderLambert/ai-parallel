# AI Parallel Issue Rules

This document defines how Issues are created, executed, validated, handed off,
and closed. It supplements the long-term repository rules in `AGENTS.md`.

## Source of truth

Use this order when facts disagree:

```text
repository architecture and security rules
        ↓
latest Issue contract
        ↓
latest decision or scope-drift record
        ↓
working direction and historical context
```

The normative Issue contract is its Target, Invariants, Execution Scope,
Acceptance Criteria, Validation, and Dependencies. An implementation hint is
allowed to change when evidence requires it.

## Issue states

```text
DRAFT → READY → IN PROGRESS → DONE
             ↘ BLOCKED
             ↘ DEFERRED
```

- `DRAFT`: still being investigated or designed.
- `READY`: target, owner, dependencies, acceptance, and validation are clear.
- `IN PROGRESS`: an agent or developer owns active implementation.
- `BLOCKED`: a specific external dependency, ownership conflict, or decision
  prevents safe progress.
- `DEFERRED`: valuable work intentionally postponed.
- `DONE`: the verified change is in `main`; a feature branch alone is not done.

An Open Issue is not automatically READY.

## Minimum Issue contract

Use the smallest useful version of this structure:

```md
## Execution State
DRAFT | READY | IN PROGRESS | BLOCKED | DEFERRED

Observed base: main@<sha>
Execution base: <fresh main or dependency condition>

## Problem
Current user or engineering problem.

## Target
Observable outcome after completion.

## Invariants
- Behavior, compatibility, privacy, security, or validation boundaries.

## Execution Scope
Expected:
- Owner-local files or domains.

Sensitive / coordinate before expanding:
- Shared, cross-domain, permission, security, or contract surfaces.

Out of scope by default:
- Explicit exclusions.

## Acceptance Criteria
- [ ] Observable completion conditions.

## Validation
Focused:
- Most relevant fast checks.

Repository / Regression:
- Affected repository checks.

Browser:
- Extension/browser flow when applicable.

Required CI:
- Required checks, or N/A.

## Dependencies
Hard blocked by:
- Real blockers only.

Conflict / shared surfaces:
- Files, contracts, or domains requiring coordination.
```

Acceptance Criteria describe what must be true. Validation describes the
evidence that proves it; they are not interchangeable.

## Execution preflight

Before implementation:

1. Read `AGENTS.md`, this document, the Issue, related decisions, and related
   PRs.
2. Refresh `main`, dependencies, and concurrent work; record the current
   Execution Base.
3. Confirm the Issue is READY and identify its owner domain.
4. Confirm invariants, acceptance criteria, validation, and hard dependencies.
5. Identify shared or sensitive surfaces before editing them.
6. Choose one writer, read-only parallel review, or genuinely isolated
   parallel writers.

Observed Base records where the problem was found. Execution Base records the
version actually used for implementation; do not use an old observation as a
mechanical branch base.

## Ownership and scope drift

The current domains are Foundation/Build, Extension Runtime, Provider
Adapters, Workspace UI, Popup UI, Messaging, Storage, Security/DNR/Permissions,
Verification/CI, and Release.

Shared hotspots allow one writer per wave:

- provider catalog and public Provider contract;
- messaging protocol and cross-context integration;
- storage schema and migrations;
- manifest, host permissions, CSP, DNR, and release configuration;
- package/lock files and `.github/workflows/**`;
- shared test or browser configuration.

Use this scope-drift protocol:

- Level A: an owner-local implementation adjustment that preserves external
  behavior; record it in the PR and continue.
- Level B: a shared, cross-domain, security, permission, or contract change;
  pause that portion, record evidence, coordinate the writer/integration owner,
  and update the Issue before continuing.
- Level C: a change to product outcome, provider architecture, storage
  semantics, security model, or required validation; revise the Issue or split
  a prerequisite before implementation.

Zero Git merge conflicts does not prove that parallel changes are semantically
safe.

## Validation and closure

Match validation to risk:

| Change | Expected evidence |
| --- | --- |
| Documentation | references and structure |
| Provider-local adapter | focused contract/fixture checks |
| Workspace or popup UI | focused checks, build, browser smoke when applicable |
| Messaging or storage | consumers, regression, and browser evidence |
| Manifest, DNR, security, or release | generated artifact review and browser/release evidence |

Do not make a check pass by deleting tests, weakening assertions, hiding a
deterministic error behind retries, or expanding permissions without evidence.

Issue comments should record durable state changes using `[PLAN]`, `[DECISION]`,
`[BLOCKED]`, `[HANDOFF]`, or `[CLOSURE]`. A closure comment should include the
merged commit, acceptance result, validation result, scope/security delta, and
follow-ups. Close an Issue only after the verified change is on `main`.

## Standard handoff

```text
STATUS: DONE | PARTIAL | BLOCKED
ISSUE: <number or none>
LANE: <owner domain>
EXECUTION_BASE: <sha/ref>
BRANCH: <branch>
HEAD: <sha>
PR: <number/url or none>
OWNED_SCOPE: <files/modules>
SENSITIVE_SURFACES_TOUCHED: <none or list>
AC_STATUS: <complete or partial with evidence>
VALIDATION: <checks and results>
SECURITY_PERMISSION_DELTA: <none or concise description>
KNOWN_RISKS: <none or concise list>
BLOCKERS: <none or exact blocker>
NEXT: <integration or follow-up action>
```
