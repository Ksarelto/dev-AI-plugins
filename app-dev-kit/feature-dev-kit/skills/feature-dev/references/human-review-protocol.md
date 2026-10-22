# Human Review Protocol (station 12)

Station 12 is owned by the **`feature-dev` skill**, not by `feature-orchestrator`. The orchestrator
returns a `REVIEW_PACKET` at the end of Station 11, records its `review_path` under `## Human Review`,
sets `status: awaiting-human`, and **stops**. The skill presents the packet and asks the human.

Canonical packet JSON: `packets.md`. Canonical markdown body: `../templates/review-packet.md`.

---

## Who asks

A subagent's `AskUserQuestion` never reaches the user. Only the skill in the main conversation
may pause. The orchestrator never owns this gate.

---

## Decision Options

| Human response | Spec status set to | Next action |
|----------------|--------------------|-------------|
| first `approve` | stays `awaiting-human` | **Skill** loads `frontend-dev-kit:code-review` (`FIXED_POINT` = parent branch, `SPEC_PATH` = the feature blackboard). One fix round. Writes `code-review.md`. Does not commit |
| second `approve` | `done` | **Skill** commits; `/create-pr` is unlocked for a human to type |
| `changes-requested: <description>` | `changes-requested` | A local UI fix (`pipeline-flow.md` § Revise Re-entry Points) the skill runs itself; anything else re-spawns the orchestrator `MODE: revise` |
| `abort` | unchanged (`awaiting-human`) | Stop; no commit; branch stays |

The first `approve` does not set `done` and does not re-spawn `MODE: revise`. The second `approve` is the only path to `done`. `MODE: revise` is only for change requests.

Must-fix findings go to `slice-engineer` for one layer, or `shared-engineer` when the finding says move it to `shared`. A `useQuery` or `useMutation` in `hooks/` moves into the owning `api/`. A `let`, an IIFE, or a pure calculation in a component moves to a `const` condition or `{component}/utils.ts`. Then `--until conventions`. Re-run the two scan scripts and re-spawn only buckets that had findings. One fix round. What is still open stays in `.spec/features/<slug>.context/code-review.md`.

---

## Changes-Requested Decision Tree

The orchestrator (not the skill) picks the re-entry station from `pipeline-flow.md` § Revise
Re-entry Points, then always replays Stations 9, 9.5, and 10 before a new `REVIEW_PACKET`.

```
Human responds: changes-requested: <description>

Is the change a minor fix (typo, style tweak, missing edge-case handling)?
  YES → targeted fix: delegate to fix engineer with the description
         re-run gates + architecture-audit + auto-review → new REVIEW_PACKET

Is the change a requirement revision (new AC, different UX, API change)?
  YES → re-plan: update spec sections (AC, FSD Impact, Build Plan — via board.mjs section --put)
         re-run build from affected station
         re-run gates + architecture-audit + auto-review → new REVIEW_PACKET
```

---

## Ergonomics Rules

- The packet must fit on a single screen — no walls of text.
- The diff stat shows files and line counts, not the diff itself.
- The gate table is always included (including `architecture-audit`).
- The acceptance criteria are copied verbatim from the spec so the human can verify them without opening the file.
- If the human asks for more detail (e.g. "show me the diff for `useProfile.ts`"), the **skill**
  provides it — do not include it in the initial packet.

---

## Hard Stop

Once the packet is returned to the skill:

- No further automation runs until the human answers.
- No agent invokes `/create-pr`.
- No agent pushes, rebases, or merges.
- The orchestrator does not modify `src/` files.
