# AI Parallel Agent Roadmap

## Purpose

This document records product direction and high-level priorities for AI Parallel. Detailed acceptance criteria, implementation checklists, and status updates belong in GitHub Issues. The repository's long-term engineering rules live in `AGENTS.md`.

## Product direction

AI Parallel is evolving into a multi-AI research workspace that lets users ask one question, receive responses from multiple native AI web sessions, compare those responses, package the useful context, hand it to a target agent, and produce a final answer.

## Priority areas

### P0 — core research workflow

- Provider adapter architecture
- On-demand response collector
- Comparison workspace
- Context export

### P1 — collaboration workflow

- Agent handoff improvements
- Prompt library
- Session management

### P2 — advanced workspace capabilities

- Attachment broadcast
- Advanced workspace features
- MCP integration

## v2.1 status

The v2.1 comparison workspace foundation is implemented across provider adapters, on-demand collection, the comparison drawer, Markdown/JSON export, agent handoff, prompt library foundations, runtime cleanup, and contract/export tests.

The main known follow-up is live selector validation against authenticated provider pages, together with broader browser-backed provider fixtures. See [v2.1 comparison workspace plan](v2.1-comparison-workspace-plan.md) and [v2.1 Phase 0 review](v2.1-phase0-review.md) for the current technical detail.

The first P1 session-management foundation is now implemented: users can save
and restore the question, selected providers, and layout locally. Response
content is intentionally excluded from saved sessions and must be collected
again after restoration.

## Roadmap maintenance

When priorities change, update this document at the high level and create or update the corresponding GitHub Issues with concrete scope, acceptance criteria, dependencies, and verification results. Avoid turning this file into a second issue tracker.
