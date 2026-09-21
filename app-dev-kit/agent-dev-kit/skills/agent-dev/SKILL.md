---
name: agent-dev
description: Builds one TypeScript AI agent or RAG increment from a spec-dev-kit spec (and optional html-generator-kit prototype) — scoped UPSTREAM_SPEC import of agent-surface, hub-and-spoke (scaffold-agent or embed-agent, tools, @openai/agents or LangGraph.js, eval goldens), quality gates, and a mandatory human review. Writes kit-result.json. Never opens a PR. Use when implementing a named agent from an approved spec, not for choosing architecture alone (that is agent-architect) and not for a greenfield tree alone (that is scaffold-agent).
argument-hint: "[agent-slug or request]"
disable-model-invocation: false
allowed-tools: [Read, Glob, Grep, Write, Edit, Bash, Agent, AskUserQuestion, Skill]
---

# Agent Dev

**Command**: `/agent-dev [agent-slug or request]`
**Pipeline driver**: `agent-dev-orchestrator`
**Blackboard**: `.spec/agents/<slug>.md`

This skill runs in the **main conversation**. It owns every `AskUserQuestion` call.

---

## Resolve KIT_DIR

1. `{this SKILL.md directory}/../..`
2. `app-dev-kit/agent-dev-kit` relative to workspace root.
3. `.spec/agent-dev-kit`.

Scripts: `{KIT_DIR}/skills/agent-dev/…`.

---

## Companion files

| Path | When |
|------|------|
| `references/pipeline-flow.md` | before starting |
| `references/upstream-contract.md` | Station 0 |
| `references/agent-spec-format.md` | blackboard |
| `references/packets.md` | packets |
| `references/context-budget.md` | hub + workers |
| `references/quality-gates.md` | gates |
| `references/human-review-protocol.md` | Station 12 |
| `scripts/import-upstream.mjs` | Station 0 |
| `scripts/new-agent.sh` | Station 0 |
| `scripts/validate-agent-spec.mjs` | Station 0.5 |
| `scripts/run-gates.sh` | gates |
| `scripts/write-kit-result.mjs` | Station 12 |

---

## Prerequisites

| Check | If missing |
|-------|-----------|
| Git + clean tree | Ask commit / stash |
| If `embed: backend-route` | `src/http/create-app.ts` must exist — STOP otherwise; do not invent a second HTTP stack |

---

## Arguments

`UPSTREAM_SPEC`, `TASK_ID`, `AGENT_REF`, `STORY_REFS`, `AC_REFS`, `PROTOTYPE_REF`,
`WORK_PLAN`, `SLUG_HINT`, `RESULT_OUT`. `REQUEST` is one line when those are set.

```
/agent-dev
/agent-dev campus-assistant
```

---

## Steps

Read `references/pipeline-flow.md`.

### Station 0

Resume or `new-agent.sh {slug}` from `SLUG_HINT`. Import:

```bash
node {KIT_DIR}/skills/agent-dev/scripts/import-upstream.mjs \
  --spec {UPSTREAM_SPEC} --out .spec/agents/{slug}.md \
  --task-id {TASK_ID} --agent-ref {AGENT_REF} \
  --story-refs {STORY_REFS} --ac-refs {AC_REFS} \
  --prototype-ref "{PROTOTYPE_REF}" --require-scoped
```

Spawn `agent-interpreter` then `agent-analyst`. `CLARIFY_PACKET` → this skill asks.

### Station 0.5

`validate-agent-spec.mjs`. Human approves runtime, tools, eval bar.

### Stations 1–7

Spawn `agent-dev-orchestrator` (`MODE: build`). It runs `agent-architect` (design onto
blackboard), then `scaffold-agent` or `embed-agent`, `agent-builder` / `langgraph-agent`,
optional `rag-builder`, `agent-eval`, `quality-gate-runner`, review. Returns one packet.

### Station 12

Approve → envelope. Changes → `MODE: revise`. Abort → `aborted`. Never `/create-pr`.

```bash
node {KIT_DIR}/skills/agent-dev/scripts/write-kit-result.mjs \
  --out .spec/agents/{slug}.kit-result.json \
  --kit agent-dev --outcome approved \
  --spec-path {UPSTREAM_SPEC} --agent-spec .spec/agents/{slug}.md \
  --prototype-ref "{PROTOTYPE_REF}" --slug {slug} --branch {branch} \
  --run-dir .spec/agents
```

If `RESULT_OUT` is set, `--also {RESULT_OUT}`.
