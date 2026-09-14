# AI Parallel Issue Rules

本文件定义 `ai-parallel` 的 Issue 创建、更新、执行与收口规则。

> 核心原则：**约束风险，不锁死实现。Issue 是当前最佳已知执行合同，不是冻结的施工图。**

适用对象：人类开发者、ChatGPT/Codex Agent、Scheduled Task、CI 与 PR。

---

## 1. 基本原则

### 1.1 固定 Outcome，保留 Implementation 自由度

Issue 应明确完成后系统或用户得到什么，但不要无证据锁死：

- hook/service/class 的最终命名；
- 必须修改的精确文件清单；
- 内部 API 的最终形状；
- 文件数量、LOC 等机械指标；
- 尚未验证的实现步骤。

### 1.2 约束强度

Issue 信息分三层：

1. **Invariants**：不能静默破坏的行为、兼容性、安全或验证边界；
2. **Target**：当前确认的目标状态；
3. **Working Direction**：当前优选实现方向，可被新证据修正。

### 1.3 Scope 可以变化，但风险不能静默扩张

同一 owner/domain 内的内部实现调整可以自主进行。

进入以下区域前必须重新评估并记录：

- 另一个 domain 的 contract；
- `wxt.config.ts` / manifest generation；
- Provider Registry / Provider 公共 contract；
- extension messaging protocol；
- storage schema / migration；
- DNR / CSP / host permissions；
- background/content/workspace 的 cross-context contract；
- package/lockfile、CI workflow、release config；
- 会改变用户可见行为或现有 Provider 兼容性的修改。

---

## 2. 标题规范

推荐：

```text
[类型][Domain] Outcome / Problem
```

类型：

```text
[工程] [产品] [Bug] [测试] [文档] [安全]
```

常用 Domain：

```text
[Foundation]   WXT/TypeScript/build 基础
[Runtime]      background/content/extension lifecycle
[Provider]     Provider adapter/runtime/DOM interaction
[Workspace]    主工作区 UI/交互
[Popup]        Popup UI
[Messaging]    extension/frame messaging contract
[Storage]      storage schema/migration
[Security]     permissions/DNR/CSP/auth boundary
[CI]           verification/workflow
[Release]      packaging/store submission
[Process]      Issue/Agent/Automation workflow
```

示例：

```text
[工程][Foundation] 建立 WXT + TypeScript 基础并保持 MV3 行为兼容
[工程][Provider] 将 Provider Adapter 迁移为统一 TypeScript contract
[Bug][Provider] ChatGPT DOM 变化导致 Prompt 无法发送
[工程][CI] 建立 Provider Contract 与 Playwright smoke gate
```

标题描述 Outcome / Problem，不写纯步骤列表。

---

## 3. Issue 最小核心结构

```md
## Execution State
DRAFT | READY | BLOCKED | DEFERRED

Observed base: main@<sha>（按需）
Execution base: <fresh main / dependency condition>

## Problem
为什么要处理，当前问题是什么。

## Target
完成后系统应达到什么状态。

## Invariants
- 真正不能被静默破坏的 contract / behavior / security / validation boundary。

## Working Direction
当前优选方向（按需，可被证据修正）。

## Execution Scope
Expected:
- 当前 owner-local 主要修改区域。

Sensitive / coordinate before expanding:
- shared / cross-domain / high-risk surfaces。

Out of scope by default:
- 当前不计划处理的内容。

## Acceptance Criteria
- [ ] 可观察、可判断的完成条件。

## Validation
Focused:
- 最相关的快速验证。

Repository / Regression:
- 适用的仓库级验证。

Browser:
- 适用时的 extension/browser flow。

Required CI:
- 当前 required checks（如有）。

## Dependencies
Hard blocked by:
- 真正阻止开工的依赖。

Conflict / shared surfaces:
- 需要串行或 integration owner 协调的区域。

Start condition:
- 开工前必须满足的条件。
```

可按需增加 `Evidence`、`Root Cause`、`User Impact`、`Risk`、`Rollback`、`Migration Notes`，不要为了模板完整填无价值内容。

---

## 4. Definition of Ready

`Open` 不等于 `READY`。

实现型 Issue 进入 READY 至少满足：

- Target 足够明确；
- 关键 Invariants 已知；
- Primary owner/domain 基本明确；
- Sensitive/shared surfaces 已标出；
- Hard dependencies 已说明；
- Acceptance Criteria 可判断；
- Validation 路径明确；
- 没有阻止实现的重大未决设计问题。

状态语义：

```text
DRAFT      仍在研究/设计
READY      可以自主实施
BLOCKED    有明确外部阻塞
DEFERRED   有价值，但当前不执行
```

---

## 5. Observed Base 与 Execution Base

**Observed Base** 用于记录发现问题时的版本，仅提供历史证据。

```text
Observed base: main@abc123
```

**Execution Base** 是真正开工时的基线。

```text
Execution base: latest main after #12 merged
```

Agent/Automation 每次开始执行都必须刷新 latest main / Issue / PR / dependencies，禁止机械从旧 Observed Base 开分支。

---

## 6. AI Parallel ownership / conflict domains

当前工程化阶段主要 ownership domain：

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

以下默认为 shared hotspot，每个 wave 同时只允许一个 writer：

```text
wxt.config.ts / generated manifest contract
Provider Registry / ProviderId taxonomy
messaging protocol / shared command-result types
storage schema / migrations
public/rules/** / DNR contract
background ↔ content ↔ workspace integration seam
package.json / pnpm-lock.yaml / pnpm-workspace.yaml
.github/workflows/**
shared test/playwright/vitest config
release/store configuration
```

**零 Git 冲突不代表并行安全。** 两个任务即使改不同文件，只要同时改变同一 API、state、schema、Provider contract 或 integration ownership，就属于 semantic conflict。

---

## 7. Invariants 应少而硬

适合写进 Invariants：

- 现有 Provider 用户行为不回归；
- Chrome MV3 permissions 不被无理由扩大；
- DNR iframe 行为保持兼容；
- storage key/schema migration 不丢用户数据；
- background 不依赖常驻全局状态；
- required validation 不被削弱。

不适合：

- 必须创建某个具体文件名；
- 必须使用某个未验证 hook；
- 必须减少到某个 LOC；
- 必须按固定步骤实现。

---

## 8. Acceptance Criteria 与 Validation 分离

Acceptance Criteria 回答：

> 最终系统必须具备什么性质？

Validation 回答：

> 用什么证据证明它成立？

推荐验证层级：

```text
Focused unit/contract
    ↓
Typecheck / lint / build
    ↓
Provider contract / regression
    ↓
Playwright extension smoke / browser flow
    ↓
Required CI / release candidate
```

禁止通过以下方式制造 PASS：

- 删除/skip 有价值测试；
- 弱化断言；
- 无证据扩大 timeout；
- 用 retry 掩盖确定性失败；
- 扩大权限/exception 绕过 architecture/security 问题。

---

## 9. Scope Drift Protocol

### Level A — Owner-local implementation adjustment

例如：

- adapter 内部拆文件；
- hook 改成 service；
- 增加 focused tests；
- 不改变外部 contract 的局部重构。

处理：可自主继续，PR 简述即可。

### Level B — Sensitive / shared / cross-domain

例如：

- Provider Issue 需要修改 Provider Registry；
- Workspace Issue 需要改变 messaging protocol；
- Runtime Issue 需要改 `wxt.config.ts`、DNR 或 storage contract；
- 任意任务需要修改 workflow/package/shared config。

处理：

1. 暂停扩大该部分；
2. 收集证据；
3. 更新 Issue Scope/Dependencies/AC 或记录 `[DECISION]`；
4. 检查其他 active lane/PR；
5. 明确 shared hotspot writer/integration owner 后继续。

### Level C — Core contract / outcome change

例如：

- storage migration；
- permissions/security model 改变；
- Provider iframe ↔ tab 架构改变；
- required CI semantics 改变；
- 原工程化 Issue 实际变成产品行为重做。

处理：正式修订 Issue contract，或拆成新的 prerequisite/follow-up Issue；必要时将当前 Issue 设为 BLOCKED。

---

## 10. 一个 Issue 何时拆分

按 **Outcome + Ownership + Independent Acceptance** 拆，不按 LOC。

建议拆分：

- 两个独立 outcome；
- 两个 domain owner 各需大规模修改；
- 一部分是另一部分的前置 contract/migration；
- shared hotspot 需要独立 integration step；
- 两部分可以独立验收/回滚。

通常不拆：同一 Provider adapter 的连续内部工作、同一状态机的多个内部步骤、仅因为文件多或测试多。

---

## 11. Issue Comments

只记录长期有价值的状态变化：

```text
[PLAN]      开工时的关键执行计划
[DECISION]  新证据导致 Scope/AC/依赖/方案变化
[BLOCKED]   明确阻塞
[HANDOFF]   owner/Agent 切换
[CLOSURE]   最终验收证据
```

不要把每次命令和临时调试日志写进 Issue。

---

## 12. Closure Evidence

```md
[CLOSURE]

PR: #xxx
Merged commit: <sha>

BASE_SHA: <sha if applicable>
HEAD_SHA: <sha if applicable>
TESTED_SHA: <sha if applicable>
RUN_ID: <workflow run id if applicable>

Acceptance Criteria:
- complete / partial with explicit exceptions

Validation:
- focused: PASS
- typecheck/lint/build: PASS
- provider/browser regression: PASS / N/A
- required CI: PASS / N/A

Scope deviation:
- NONE / explained

Security/permission delta:
- NONE / explained

Follow-ups:
- none / #xxx
```

Issue 只有在修复/实现真实进入 `main` 后才视为 resolved；feature branch 上完成不等于 closure。

---

## 13. Issue 与 PR 职责

Issue：

```text
Why / Outcome / Invariants / Risk boundaries / Dependencies / Acceptance / Validation contract
```

PR：

```text
How / Actual diff / Shared surfaces touched / Scope deviation / Validation result / CI evidence
```

PR 不复制整份 Issue。

---

## 14. Agent 创建或执行 Issue

创建/重写 Issue 前：读取本文件、当前仓库状态与相关 Issue/PR；事实、推断、Working Direction 必须区分。

执行前：

```text
1. Read AGENTS.md + issue-rule.md
2. Fetch latest Issue / decisions
3. Refresh main / PRs / dependencies
4. Confirm READY and Execution Base
5. Confirm Target / Invariants / AC / Validation
6. Identify Expected + Sensitive/shared conflict domains
7. Choose single writer / parallel read / isolated parallel write
8. Implement owner-local work autonomously
9. Apply Scope Drift before meaningful risk expansion
10. Validate focused → regression/browser → required CI
11. Record concise handoff/closure evidence
```

---

## 15. 不过度自动化

当前阶段优先 machine-enforce 真正影响 correctness 的内容：

- TypeScript/build correctness；
- Provider contract；
- manifest/permissions/DNR consistency；
- test inventory；
- browser smoke；
- required CI。

暂不增加复杂 Issue lint/bot 去检查 Markdown section 顺序、checkbox 数量等形式规则。只有真实事故证明某缺失字段反复造成问题时再自动化。
