# Orchestration Protocol

The feature-orchestrator owns the pipeline from Station 1 to the review packet. It never builds code
itself — it delegates to worker agents and reads the spec blackboard to decide the next step.

> **`pipeline-flow.md` is canonical** for station order, gates, loop guards, and parallelism. This
> file owns the *contracts*: how a delegation is shaped, how handoff works, and when to escalate.
> Where the two disagree, `pipeline-flow.md` wins.
>
> Stations 0, 0.5, 1b, and 12 belong to the `feature-dev` skill, not to this agent — a subagent's
> `AskUserQuestion` never reaches the user. The orchestrator returns a packet instead of asking.

---

## Station Sequence

| # | Station | Agent | Gate / Checkpoint |
|---|---------|-------|-------------------|
| 0 | Intake + clarify | upstream-interpreter + spec-analyst | Spec status: `draft` → `awaiting-clarification`; skill sets `approved` |
| 1 | Discovery | code-explorer | FSD impact + reuse map written to spec |
| 1.5 | Baseline architecture | architecture-auditor | REPORT_ONLY → `## Architecture Baseline` |
| 1a | Investigation (conditional) | research-analyst | Triggered when unfamiliar capability detected; outputs to spec "Tech investigation" |
| 1b | Dep approval | **Human** (hard stop) | Every proposed new package approved before proceeding |
| 2 | Plan | Orchestrator | Build plan written to spec; spec status → `building` |
| 3 | Build shared | shared-engineer | `shared/` segments built and gated |
| 4 | Build entities | entities-engineer | `entities/` segments built and gated |
| 5 | Build features | features-engineer | `features/` segments built and gated |
| 6 | Build widgets + pages | composition-engineer | `widgets/` and `pages/` segments built and gated |
| 7 | Wire app | app-engineer | Providers, routing wired; integration verified |
| 8 | Tests | test-engineer | Coverage thresholds met |
| 9 | Quality gates | quality-gate-runner | All gates green (see quality-gates.md) |
| 9.5 | Architecture audit | architecture-auditor | Zero hard violations on changed paths |
| 10 | Auto-review | code-reviewer | No [CRITICAL], no unresolved [IMPORTANT] |
| 11 | Fix loop | Appropriate engineer | Iterates until gates pass or escalation threshold hit |
| 12 | Human review | **feature-dev skill** (hard STOP) | Approve → `done`; changes-requested → `MODE: revise` |
| — | /create-pr | **Human only** | Invoked manually after station 12 approval |

---

## Delegation Message Template

Canonical copy with field rules and a worked example: `../templates/delegation-message.md`.
The `SPEC_SECTIONS` allowlist in `context-budget.md` is a required part of every delegation.

The orchestrator uses this exact format when delegating to a worker agent:

```
OBJECTIVE: <one sentence — what the worker must produce>
SPEC: .spec/features/<slug>.md — read sections: <list sections>; write to sections: <list sections>
TARGET: <fsd-layer>/<slice>/<segment(s)>
APPLY: skill: <one skill name>
BOUNDARY: only touch files under <path>; do not modify <excluded paths>
RETURN: HANDOFF path + one CONTAINS line
```

Example:
```
OBJECTIVE: Implement the useDeclineProfile mutation hook and its query-key invalidation.
SPEC: .spec/features/decline-profile.md — read: API contract, Dependencies; write to: Build plan (mark api/ done), Gate log
CHECKPOINT: .spec/features/decline-profile.context/orchestrator-checkpoint.md
TARGET: entities/profile/api/
APPLY: skill: create-entity
BOUNDARY: only touch src/entities/profile/api/; do not modify index.ts (orchestrator wires that)
RETURN: HANDOFF .spec/features/decline-profile.context/entities-engineer-4.md + one CONTAINS line
```

Do not list `development-cycle.md`, `increment-protocol.md`, `fsd-architecture.md`, or rule files in `APPLY`. Rules attach by glob. The worker reads one skill recipe when that skill says to.

---

## Handoff via files

- Workers read the checkpoint and the spec sections named in the delegation.
- Workers write decisions onto their spec sections, and write the detail to `.spec/features/<slug>.context/<agent>-<station>.md`.
- The chat return is only `HANDOFF` and `CONTAINS`. The orchestrator does not read `src/` to learn what the worker did.
- After a layer, the orchestrator rewrites `orchestrator-checkpoint.md` and passes that path to the next spawn.
- If the orchestrator's own context is near the limit, it refreshes the checkpoint and continues from that file instead of the chat so far.

---

## Bottom-Up Gate Ordering

Build proceeds bottom-up: `shared` → `entities` → `features` → `widgets`+`pages` → `app`.

After each layer group completes, run `run-gates.sh --until fsd`. If that fails, fix before the next layer. The package build and coverage run once at Station 9.

---

## Worker-Count Heuristics

| Feature complexity | Worker strategy |
|--------------------|-----------------|
| 1–2 slices, single layer | Single `slice-engineer` handles all segments |
| 3–5 slices across 2 layers | One engineer per layer group |
| 6+ slices or cross-cutting concern | One engineer per slice, one after another, on the feature branch |

When a layer has more than one slice, run those slices one after another on the feature branch. Do not use a git worktree and do not merge.

---

## Fix Loop

```
Gate failure detected
       │
       ▼
Fix engineer receives: failing gate name + error output + relevant spec sections
       │
       ▼
Fix engineer applies targeted fix
       │
       ▼
Orchestrator re-runs the failing gate
       │
   ┌───┴───┐
 PASS     FAIL (attempt N)
   │         │
   ▼         ▼ (N ≥ 3)
Continue   Escalate to human:
pipeline   emit gate log + error output
           set spec status: awaiting-human
           STOP
```

After 2–3 failed fix-loop iterations on the same gate, escalate. Do not continue looping indefinitely.

---

## The Hard Stop at Station 12

When the orchestrator finishes Station 11:
1. Set spec status to `awaiting-human`.
2. Return a `REVIEW_PACKET` (`references/packets.md`) and append the markdown to `## Human Review`.
3. Stop all automation. Do not invoke `/create-pr`, do not push, do not merge, do not `AskUserQuestion`.
4. The **feature-dev skill** presents the packet and waits for the human.

The orchestrator never proceeds past station 11 without returning a packet.

---

## Review Packet (returned at the end of station 11)

The full shape, with its rules, lives in `../templates/review-packet.md` — use that file, not this
excerpt. Skeleton for orientation:

```
## Feature Review: <feature-slug>

**Spec**: .spec/features/<slug>.md
**Branch**: <branch-name>
**Status**: awaiting-human

### Summary
<2–3 sentence description from spec Request section>

### Acceptance Criteria
<bulleted list from spec>

### FSD Impact
<new/modified slices from spec>

### Gate Log
| Gate | Result |
|------|--------|
| typecheck | PASS |
| lint | PASS |
| fsd-boundaries | PASS |
| build | PASS |
| coverage | PASS |
| auto-review | PASS |

### Diff Stat
<output of git diff --stat develop...HEAD>

**Decision required**: reply `approve` or `changes-requested: <description>`
```

The orchestrator **returns** this packet to the `feature-dev` skill and stops. It also appends the
packet to the spec's `## Human Review` section so a resumed run can find it.
