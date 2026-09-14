# AI Parallel Automation & Agent Orchestration Playbook

> Scope: ChatGPT scheduled/recurring execution and Codex parent/sub-agent orchestration for `CoderLambert/ai-parallel`.
>
> Goal: increase verified throughput without trading away correctness, Provider compatibility, security, reviewability, or merge stability.

This document does **not** define a second task contract. For Issue-backed work, `issue-rule.md` is canonical for Problem, Target, Invariants, Execution Scope, Acceptance Criteria, Validation, Dependencies and Scope Drift. This playbook defines how that contract is dispatched, parallelized, resumed, integrated and handed off.

> Core principle: **Scheduled Task is a durable ownership lane, not a cron-shaped micro-task. Parallelism is useful only when expected throughput gain exceeds coordination and integration cost.**

---

## 1. Source-of-truth hierarchy

```text
repository / architecture / security rules
        ↓
latest Issue normative contract
        ↓
latest [DECISION] / Scope Drift revision
        ↓
Working Direction / historical background
```

Normative Issue contract is primarily:

- Target;
- Invariants;
- Execution Scope;
- Acceptance Criteria;
- Validation;
- Dependencies.

Working Direction is advisory.

---

## 2. Conflict domains for AI Parallel

Parallel safety is not determined by file overlap alone.

Treat all of these as conflict domains:

- **file ownership** — same files/directories;
- **Provider contract ownership** — adapter interface, Provider Registry, shared DOM helpers;
- **message contract ownership** — background/content/workspace/frame payloads;
- **state ownership** — workspace/provider runtime state, pending request lifecycle;
- **storage ownership** — persisted keys, schema, migration semantics;
- **security ownership** — host permissions, DNR, CSP, auth allowlists, MAIN-world execution;
- **integration ownership** — `wxt.config.ts`, entrypoints, background/content/workspace composition;
- **verification ownership** — shared Vitest/Playwright config, required CI, release gates.

Shared hotspots include:

```text
wxt.config.ts
Provider Registry / ProviderId
shared messaging types
storage schema/migrations
public/rules/**
background/content/workspace integration seams
package.json / pnpm-lock.yaml / pnpm-workspace.yaml
.github/workflows/**
vitest/playwright shared config
release/store config
```

One wave should have exactly one writer for each shared hotspot.

---

## 3. Dispatch Gate

### Mode A — Single writer

Default when:

- task is small or owner-local;
- most changes share one contract/state boundary;
- WXT migration step crosses the same entrypoints/config repeatedly;
- isolation is unavailable;
- integration cost exceeds parallel gain.

A single writer may still use read-only explorers/reviewers.

### Mode B — Parallel read

Preferred for:

- current architecture mapping;
- Provider DOM/evidence investigation;
- manifest/DNR/security audit;
- dependency analysis;
- test-gap discovery;
- PR review;
- framework/API verification.

### Mode C — Isolated parallel write

Use only when all are true:

- at least two genuinely independent write/contract domains exist;
- each writer has explicit ownership;
- real branch/worktree/filesystem isolation exists;
- shared hotspots have one owner;
- required cross-lane contracts are already stable enough for the wave;
- each lane has independent acceptance/validation;
- integration path/owner exists.

Practical rule:

```text
if small or tightly coupled:
    single writer
elif independent investigation exists:
    parallel read + single writer
elif independent write domains + real isolation:
    isolated parallel writers + integration owner
else:
    single writer + parallel reviewers
```

---

## 4. WXT migration lane guidance

Do not force these lanes to exist simultaneously; they are recommended ownership shapes when the wave justifies them.

### Foundation / Integration lane

Owns shared foundation such as:

```text
WXT setup
wxt.config.ts
entrypoint composition
Provider Registry foundation
shared protocol foundation
manifest/DNR migration coordination
```

This lane is the default integration owner during early migration.

### Provider lane

Owns:

```text
Provider adapter contract implementation
provider-specific DOM behavior
provider fixtures/contract tests
```

Once the shared adapter contract is stable, individual Provider adapters can become independent isolated sub-lanes.

### Workspace / UI lane

Owns:

```text
React workspace/popup presentation
workspace hooks/reducer/components
UI behavior migration
```

It does not redefine Provider or messaging contracts unilaterally.

### Verification lane

Owns:

```text
Vitest setup
provider contract harness
Playwright extension smoke
CI verification contracts
```

Workflow/package changes are shared hotspots; only this lane or an explicit integration owner writes them in a wave.

### Integration / Release lane

Used when needed for:

```text
cross-lane reconciliation
manifest/permission diff
browser regression
artifact/package verification
release readiness
```

Do not keep an integration automation active merely to wait for other lanes if there is no contiguous safe work.

---

## 5. ChatGPT Scheduled Task rules

### 5.1 Lane count

Use the smallest number of independent automations that keeps useful work moving.

**Project convention: no more than five active project automations unless there is a concrete reason to exceed it.**

This is a ceiling, not a utilization target. Two independent lanes are better than five overlapping ones.

### 5.2 One automation = one stable ownership lane

Good:

- one Provider migration group with stable contract;
- one Workspace React migration lane;
- one verification/CI lane;
- one read-only security/manifest audit lane;
- one integration/closure lane.

Avoid:

- one automation per tiny Issue;
- multiple automations writing `wxt.config.ts` or Provider Registry;
- separate automations independently modifying messaging/storage schema;
- automation chains that wake mainly to wait on another scheduled run.

### 5.3 Each trigger reaches a coherent checkpoint

A run should:

1. reconcile latest Issue/main/PR/dependency state;
2. skip already completed work;
3. select highest-priority unblocked work in its lane;
4. advance through contiguous safe work;
5. stop at a coherent review/validation checkpoint;
6. run risk-appropriate validation;
7. update PR/status/handoff evidence;
8. continue only while next work remains in the same ownership/acceptance boundary.

Meaningful stop conditions:

- lane complete;
- hard dependency;
- Level B/C Scope Drift;
- ownership conflict;
- product/security/architecture decision required;
- failure repair would leave the lane;
- next work is a distinct review/rollback unit.

### 5.4 Resume-aware and idempotent

Every run assumes humans or previous runs may have changed the repository.

Required:

- re-read latest Issue and `[DECISION]` records;
- refresh main/PR/dependencies;
- establish current Execution Base;
- avoid duplicate branches/PRs/work;
- detect already completed AC;
- re-evaluate after upstream merge;
- do not repeatedly retry an unchanged blocker.

---

## 6. Scheduled execution prompt template

Use this when creating a project automation:

```text
Repository: CoderLambert/ai-parallel
Issue(s): <numbers or none>
Lane: <stable ownership lane>

Before execution:
- Read AGENTS.md and issue-rule.md.
- Reconcile latest Issue normative contract, main, PRs, dependencies and concurrent work.
- Establish the current Execution Base.

Contract subset for this lane:
- Target: <relevant target>
- Invariants: <relevant invariants>
- Expected scope: <owner-local scope>
- Sensitive/shared: <surfaces requiring Scope Drift/coordination>
- Acceptance Criteria: <relevant AC>
- Validation: <focused/domain/browser/CI as applicable>
- Hard dependencies: <real blockers>

Execution:
1. Skip work already complete.
2. Advance the highest-priority unblocked work to a coherent checkpoint.
3. Owner-local implementation choices remain autonomous.
4. If work enters Sensitive/shared or changes a core contract/outcome, apply issue-rule.md Scope Drift Protocol before expanding.
5. Do not duplicate another lane's writes or create a competing Provider/message/storage/security contract.
6. Run risk-appropriate validation.
7. Continue only while the next work remains inside the same safe ownership/acceptance boundary.

Finish with the standard handoff from AGENTS.md.
```

### Automation creation checklist

Before enabling a scheduled task, confirm:

- latest Issue/task outcome is understood;
- READY/hard-dependency state permits execution;
- lane has stable ownership;
- shared hotspots have a single writer;
- parallel writer isolation really exists where applicable;
- lane has meaningful AC/validation;
- recurrence is useful rather than creating wait-only wakeups;
- prompt is resume-aware and idempotent;
- integration owner/path is known when cross-lane composition is expected.

---

## 7. Codex parent/sub-agent orchestration

Parent Agent is the contract consumer, coordinator, default writer/integrator and final synthesizer.

Parent responsibilities:

- consume latest Issue normative contract;
- establish Execution Base;
- run Dispatch Gate;
- identify conflict domains/hotspots;
- choose minimum useful sub-agents;
- maintain one interpretation of Invariants/AC/Validation;
- own Scope Drift decisions and final integration.

Prefer read-only sub-agents for exploration/review. Parallel writes are conditional on isolation and independent semantic ownership.

### Codex sub-agent work-order template

```text
You are a bounded sub-agent. The Issue contract is authoritative.

Repository: CoderLambert/ai-parallel
Issue / work item: <id>
Execution Base: <sha/ref>
Objective / question: <bounded objective>
Relevant Target: <subset>
Relevant Invariants: <subset>
Expected scope: <subset>
Sensitive/shared surfaces: <subset>
Relevant Acceptance Criteria: <subset>
Relevant Validation: <subset>
Hard dependencies: <subset>
Output required: <evidence / patch / review result>

Rules:
- Do not reinterpret Working Direction as immutable.
- Stay inside assigned role/scope.
- If evidence invalidates an Issue assumption, report it explicitly.
- If work requires Sensitive/shared/core-contract expansion, stop that portion and report Scope Drift evidence.
- Do not create a competing Provider/API/state/schema/security contract owned by another lane.
- Return concise evidence for the parent/integration owner.
```

---

## 8. Provider-specific parallelism rules

Provider adapters are a natural parallelization boundary **only after** shared contracts are stable.

Safe example:

```text
ChatGPT adapter lane     DeepSeek adapter lane
        │                         │
        └──── both consume ───────┘
             stable ProviderAdapter
```

Unsafe example:

```text
ChatGPT lane modifies ProviderAdapter + Registry
DeepSeek lane independently modifies ProviderAdapter + Registry
```

Provider lane must escalate before changing:

- `ProviderAdapter` shared interface;
- `ProviderId` taxonomy / registry;
- shared message payloads;
- shared storage schema;
- DNR/host permissions;
- shared DOM helper semantics used by active sibling lanes.

---

## 9. Risk-based validation

| Change class | Expected validation |
| --- | --- |
| docs/policy | consistency/references; current CI remains authoritative |
| provider-local DOM/adapter | focused unit/fixture + provider contract |
| workspace/popup owner-local UI | component/focused test + build |
| messaging/storage/runtime contract | focused + affected consumers + build + browser smoke |
| manifest/DNR/security | generated manifest/rule diff + browser behavior + security review |
| integration/shared hotspot | repository regression + Playwright/browser flows |
| release candidate | canonical required CI + package/artifact + applicable live smoke |

Validation hierarchy:

```text
sub-agent investigation → focused evidence
lane writer             → domain/contract validation
integration owner       → cross-context/browser regression
CI                      → authoritative merge gate
```

Do not run expensive full live-provider smoke in every worker if integration/release verification can provide authoritative evidence.

---

## 10. Branch, PR and merge discipline

Unless explicitly instructed otherwise:

- do not opportunistically edit `main`;
- use scoped branch per writer/lane;
- keep unrelated changes out;
- dependent PRs merge in dependency order;
- do not rewrite another lane's branch;
- refresh stale Execution Base deliberately;
- preserve Issue → Execution Base → branch/PR → tested candidate → merge traceability.

When parallel assumptions become false, serialize/re-plan instead of relying on conflict resolution.

---

## 11. Optional execution ledger

Do not require a ledger for one Issue/one writer.

Use one lightweight ledger only when recurring automations or multiple concurrent lanes make reconstruction costly.

Example:

```yaml
wave: wxt-migration
execution_base: <sha/ref>
contract_revision: <issue updated-at / decision ref>
lanes:
  foundation:
    state: active
    owner: <automation/agent>
    branch: <branch>
    head: <sha>
    hard_dependencies: []
    sensitive_surfaces:
      - wxt.config.ts
      - provider-registry
```

Keep a single ledger source. Do not maintain a permanent full DAG or duplicate the same state across many docs/comments.

---

## 12. Blocker record

```text
STATUS: BLOCKED
ISSUE: <number or none>
LANE: <name>
EXECUTION_BASE: <sha/ref>
CURRENT_HEAD: <sha>
BLOCKER_TYPE: dependency | ownership-conflict | test-failure | permission | product-decision | security-decision | contract-drift
BLOCKER: <specific condition>
EVIDENCE: <test/CI/PR/file evidence>
SAFE_WORK_COMPLETED: <what is already done>
NEXT_UNBLOCKING_ACTION: <specific action>
```

If independent safe work remains inside the lane, complete it before declaring the lane blocked.

---

## 13. Pre-dispatch checklist

Before creating a scheduled wave or spawning multiple Codex agents:

- [ ] latest Issue contract / task outcome understood;
- [ ] current Execution Base known;
- [ ] READY/dependency state allows start;
- [ ] Dispatch Gate says delegation adds value;
- [ ] conflict domains and Sensitive/shared surfaces known;
- [ ] every shared hotspot has one writer;
- [ ] parallel writers have real isolation;
- [ ] cross-lane contracts are minimal and explicit;
- [ ] lane-local AC/validation is meaningful;
- [ ] integration ownership is explicit when needed;
- [ ] Scope Drift can revise the plan instead of being hidden;
- [ ] recurring work is resume-aware/idempotent.

If these are obvious for small owner-local work, use one writer and proceed. Do not manufacture process ceremony.
