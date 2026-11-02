# PR body — section rules and sources

`08-delivery/pr.md` is the decision aid for the human at GATE-C and the PR description. The engine
uses its first `# ` heading as the PR title and passes the file to the adapter as the body. It must
fit on a screen or two: facts and links, no diffs, no marketing.

## Section by section

Required by gate-ready: `## Summary`, `## Spec trace`, `## Docs`, `## Provenance` (exact headings).
The others below are part of the factory's PR format; keep their order.

### Title (`# …`)

`# <type>: <feature title> (FEAT-nnn)` — `feat` for a new capability, `fix` for a fix-only feature,
`feat!` when a commit in the plan is breaking. The ID makes the PR traceable to `.factory/`.

### `## Summary`

Two or three sentences in plain language from the PRD's problem/goals or the delta-spec summary,
plus what the build actually produced. Name every deviation from the request and why (from the
envelopes' `deviations` recorded in the docs report, the review or the QA report). For a change
request add a `Delta` line: ADDED / MODIFIED / REMOVED REQ IDs with titles.

### `## Spec trace`

One table row per AC of the spec, and one per removed REQ:

```markdown
| AC | Criterion | Story | Task | Tests | Result |
|---|---|---|---|---|---|
| AC-0001 | Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line | STORY-0001 | TASK-003, TASK-004 | TEST-0001 (acceptance), TEST-0005 | passing |
| REQ-0007 | Removed: export to CSV | — | TASK-006 | TEST-0009 | passing |
```

- **Criterion verbatim** from the spec — the human verifies the ACs without opening the file. Escape
  a `|` in the text as `\|`.
- **Task**: the tasks whose `satisfies` contains the AC (for a removed REQ, whose `removes`
  contains it). gate-ready fails when a row names no task that does (`trace-wrong-task`).
- **Tests**: only TEST IDs that exist in `04-plan/test-plan.yaml` (`trace-unknown-test` otherwise),
  with their level; the acceptance test file may be named in words.
- **Result** comes from the records, never from memory:

  | Result | When |
  |---|---|
  | `passing` | gate-verify passed after the last change (its events show `pass: true`), so the acceptance tests and the whole suite passed |
  | `passing (QA)` | as above, and a QA charter exercised the AC with no open defect on it |
  | `waived (HD-n)` | a blocking defect or finding on it was waived by that human note |
  | `not run` | verification did not run for this feature (a profile without it) |
  | `partial — DEF-nnn` | an open non-blocking defect names the AC |

  Every AC appears, including partial ones: hiding a partial is how an unfinished feature gets
  approved.

### `## Verification`

The gates that actually ran for this feature, from the event log — never a gate that did not run,
never ✅ for one whose last result was a failure:

```markdown
| Gate | Result | Rounds | Note |
|---|---|---|---|
| acceptance | ✅ | 1 | 4 tests, all failing before implementation |
| impl (per task) | ✅ | 6 tasks | TASK-004 needed 2 attempts |
| checks | ✅ | 2 | suite, typecheck, lint, build, integration |
| verify | ✅ | 2 | round 1: RV-1 (P1) → TASK-004 |
| qa | ✅ | 1 | 0 S1/S2 |
| docs | ✅ | 1 | — |
| GATE-A / GATE-B | approved | — | by <name> |
```

How to read it: run `node <engine>/factory.mjs events --project <dir> --feature FEAT-nnn --limit 500`
(the engine path is the one in your T0 exit check) and keep `type: "gate"` events — the last one
per gate gives the result, the count gives the rounds; `precheck: true` marks the checks run before
the review. Human gates come from `factory state --feature FEAT-nnn` (`gates`). A gate with no event
is not listed. `ready` is the gate you are about to pass: leave it out.

### `## Review and QA`

- Every non-blocking review finding that remains (from `06-verify/review.md`): `RV-n (P2,
  <lens>) <file>:<line> — <claim>`. P3 findings may be grouped by lens when there are many. Role
  audit findings show `audit` as the lens.
- Security-sensitive paths the reviewer flagged (P3 `security` findings "human review").
- QA: open S3–S5 defects and spec gaps (`DEF-nnn (S3) <title>`), waived S1/S2 with the waiving note,
  or "No open S1/S2 defects". If QA did not run, say so.

### `## Human notes`

Each `HD-n` from `human-notes.yaml`: its text (shortened to one line), its status and where it
landed (`→ AC-0004, TASK-003`). A note still `open` fails gate-ready (`open-note`): that is a
human's to resolve, not yours — return `blocked` naming it.

### `## Docs`

The files from `08-delivery/docs-report.md` (feature doc, promoted ADRs, CHANGELOG, README if any)
as paths, plus its "Needs a human" lines.

### `## Diff`

The stat only, never the diff body:

- tracked files: `git diff --stat HEAD -- <the plan's files>`;
- new files (`??` in `git status --porcelain`): `<path> (new, <n> lines)` with `wc -l`.

Group by commit when the stat is long; cut to the 30 largest files with a "+N more" line.

### `## Open items`

What the human must decide or know — assumptions the pipeline made (spec open questions answered
with defaults), deviations, parked tasks for disabled roles (tasks not done), a stale OpenAPI
export, security-sensitive paths, follow-ups agents suggested. "None" when there are none.

### `## Provenance`

One or two lines that let a reviewer understand what the agents did without replaying the session:

```markdown
Factory run FEAT-001 · 19 dispatches · models: opus (requirements, architecture, planning, review), sonnet (tests, build, QA, delivery), haiku (intake, docs) · 1.7M tokens · 105 min agent time · 2 fix rounds
Artifacts: .factory/features/FEAT-001-coupons-at-checkout/
```

- Dispatches and tokens: `factory state --feature FEAT-nnn` → `budgets.dispatches`,
  `budgets.tokens`; or `factory metrics --feature FEAT-nnn --md` (dispatches by model, tokens).
- Models per stage: the `dispatch` events (`agent`, `model`, `stage`).
- Agent time: now − `budgets.started_at` − `budgets.paused_ms` (time waiting at human gates is not
  agent time). Fix rounds: `budgets.regressions`.
- Numbers you cannot read are left out, not estimated.

## Ergonomics

- Facts, IDs and paths; one line per item; no adjectives about quality.
- If the human wants more (a diff, a log), they ask at GATE-C; do not paste it in advance.
- Every statement must be checkable against a file in `.factory/features/<FEAT>/` or the event log.
