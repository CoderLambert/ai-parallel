# AI Parallel Project Standards v1.1 Additions

This document supplements the initial execution standards PR.

## 1. Decision Record Convention

Long-lived architecture or contract decisions MUST have a durable record.

Applies to:

- Provider contract
- Provider Registry / ProviderId model
- Messaging protocol
- Storage schema and migration
- Permissions / DNR / CSP / MAIN-world behavior
- Migration strategy
- Release architecture

Recommended location:

```text
docs/decisions/
```

Format:

```md
[DECISION]

Context:

Decision:

Reason:

Rejected alternatives:

Impact:

Related Issues:
```

---

## 2. Automation Lifecycle

Scheduled Tasks are durable ownership lanes with lifecycle management.

States:

```text
DRAFT
 ↓
ACTIVE
 ↓
PAUSED
 ↓
COMPLETED
 ↓
ARCHIVED
```

Rules:

- Completed lanes should not remain active without a clear monitoring purpose.
- Issue closure does not automatically imply automation deletion.
- Every automation needs an owner and a defined useful recurrence.

---

## 3. Automation Exception Rule

The five active project automation limit is a default safety boundary, not an absolute architecture limit.

Exceeding it requires:

- independent ownership lanes;
- clear integration ownership;
- no shared hotspot contention;
- measurable throughput benefit.

---

## 4. Agent Evidence Format

Exploration and review agents should report using:

```text
Observation:
- Current behavior
- Relevant files/modules

Evidence:
- Code reference
- Test result
- Runtime output

Impact:
- Why this matters

Recommendation:
- Proposed next action
```

Conclusions without evidence should not be treated as implementation input.

---

## 5. Validation Matrix

Browser extension changes should validate according to risk:

| Area | Validation |
|---|---|
| React UI | component/unit test |
| Extension Runtime | background/content lifecycle test |
| Provider Adapter | contract test + fixture |
| Messaging | protocol compatibility test |
| Storage | migration test |
| Security | manifest/permission/DNR review |
| Browser | extension smoke test |

---

## 6. Shared vs Provider Ownership

Provider parallelism boundary:

Owner-local:

```text
providers/<provider>/adapter.ts
provider-specific DOM selectors
provider fixtures
```

Shared ownership:

```text
Provider Registry
ProviderId taxonomy
shared DOM helpers
Provider contract
messaging/storage integration
```

Shared ownership changes require coordination.

---

## 7. Forbidden Agent Actions

Agents MUST NOT:

- silently expand Issue scope;
- bypass contract changes through "cleanup" commits;
- weaken tests to satisfy CI;
- create competing messaging/storage/security contracts;
- modify another lane's owned scope;
- add automation without ownership and acceptance criteria.
