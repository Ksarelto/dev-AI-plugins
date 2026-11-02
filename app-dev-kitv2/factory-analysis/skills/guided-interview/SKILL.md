---
name: guided-interview
description: How factory agents ask the human — at most five batched questions, each with a proposed default and why it matters, returned as needs_clarification so the engine asks at the clarification gate. Preloaded by the intake-normaliser and requirements-analyst; not for direct use.
user-invocable: false
---

# Asking the human

Runs on: intake-normaliser (haiku) and requirements-analyst (opus) — a short, ranked batch of
questions when a wrong guess would make every later stage wrong.

You never talk to the human and never wait for an answer. You write what you can, put the questions
in your envelope, and stop. The engine pauses the feature at the `CLARIFY` gate; the answer comes
back to your next dispatch as a human note `HD-n` (T1) and as `Human answer (HD-n): …` (T3).

The full protocol — formats, pre-flight checks, the never-ask list, assumption tiers — is
[fa-clarification-protocol.md](references/fa-clarification-protocol.md). Read it before your first
round.

## 1. Decide whether to ask at all

| Situation | Do |
|---|---|
| A source paragraph or human note answers it | cite the SRC / HD; no question |
| A common pattern fits the domain (UI states, WCAG 2.2 AA) | write it into the AC or NFR; no question |
| A default carries it and a wrong guess means rework, not failure | `OQ-n` with `severity: major` or `minor`, `default:`, `status: defaulted` |
| A wrong guess makes the feature wrong (users, goal, security model, core data shape) and no source settles it | ask this round |
| Intake: `users` or `goals` has no source | ask — the intake gate never accepts these as a plain gap |

Prefer a defaulted open question over stopping the pipeline. GATE-A shows every one with its default.

## 2. Build the batch

1. List the candidate gaps. Group gaps that one decision closes and keep only the root question.
2. Rank them: conflicts → missing ACs on `must` requirements → core entities → auth and permissions
   → NFR targets → edge cases → nice-to-have scope.
3. Take the round's budget from the top: **5** in round 1, **4** in round 2, **2** (blockers only) in
   round 3, none after that. Your round is 1 + the `at: CLARIFY` notes in `human-notes.yaml` that answered your own
   earlier questions (not the engine's completeness round).
4. Pick the format per gap: root-goal probe, propose + confirm, conflict resolution, boundary
   probe, error/edge probe.
5. Write each as one string with a header, numbered options, the recommended option first with its
   reason, a "Decide during build" escape hatch when the decision can wait, the default if nobody
   answers, and what it closes.
6. Run the pre-flight checks (justifiable, non-leading, non-compound, distinct and exhaustive
   options, under 15 seconds, header ≤ 12 characters, labels ≤ 5 words). Fix or drop failures.

```
[Delete mode] What happens when a manager deletes a supplier? (1) Archive, restorable (Recommended):
SRC-019 keeps orders for 7 years (2) Hard delete (3) Decide during build: OQ-4 defaults to (1)
— If unanswered: (1). Closes: OQ-4, undo_rollback
```

## 3. Write first, then ask

Asking does not excuse an empty output. Before you return:

- **Intake:** write `coverage.yaml` with the asked topics as `blocker_gap` and a `note` naming the
  question.
- **Requirements:** write the draft spec. Every asked decision is an `OQ-n` with `severity: blocker`,
  its `default`, `status: open`. Requirements and ACs that do not depend on it are written in full.

The exit check fails on those open blockers — that is expected while you ask.

## 4. Envelope

```json
{ "pack_id": "<pack_id from your pack>",
  "status": "needs_clarification",
  "artifacts_written": [".factory/features/FEAT-001-coupons/01-requirements/delta-spec.yaml"],
  "open_questions": [
    "[Coupon user] Who may apply a code? (1) Signed-in accounts (Recommended): … — If unanswered: (1). Closes: OQ-2",
    "[Stacking] Can a coupon combine with the loyalty discount? (1) No (Recommended): … (2) Yes: … — If unanswered: (1). Closes: OQ-3"
  ],
  "summary": "Draft delta-spec written; two blocker decisions on who may use coupons and stacking." }
```

Use `needs_clarification` only for questions. A missing input file is `blocked`; a request to write
outside your allowlist is `needs_scope_change`.

## 5. After the answer

1. Read the new `HD-n` note. Each answer settles the questions it names: `status: answered`,
   `answer: "<decision> (HD-n)"`.
2. Treat the note as a source. Intake: cite it in the coverage topic's `sources`. Requirements:
   cite it in the `sources` of each REQ / NFR it shapes and list it in `notes_mapped` with the REQ,
   AC or OQ IDs that now carry it (`notes_mapped.to` accepts no NFR IDs: name the REQ it serves).
3. One answer closes a topic. What it left open is a defaulted minor question, never a follow-up.
4. New scope in the answer is a new requirement (`sources: [HD-n]`); it does not reopen rounds.
5. Approval without text keeps your recommended options: set those questions to `defaulted`.
6. Run the exit check from T0 and return `done` when it passes.
