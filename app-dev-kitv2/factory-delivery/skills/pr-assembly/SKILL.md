---
name: pr-assembly
description: Procedure for the factory release manager — assemble the PR description (the pull-request body) with summary, a spec trace row per acceptance criterion, open findings and provenance, from the template. Preloaded by the release-manager; not for direct use.
user-invocable: false
---

# PR body (S8)

Runs on: release-manager (sonnet) — one assembly pass per feature at delivery, after the commit plan, from the feature's records.

The PR body is the human's decision aid at GATE-C: it lets them check every acceptance criterion,
see which gates really ran and what is still open, without opening the session. Everything in it
comes from a file or the event log — nothing from memory.

## What gate-ready checks in the body

| Rule | Fails when |
|---|---|
| `missing-section` | `## Summary`, `## Spec trace`, `## Docs` or `## Provenance` is missing (exact text) |
| `trace-missing` | an AC of the spec, or a removed REQ, has no row in the spec trace |
| `trace-wrong-task` | the row names no task whose `satisfies` (or `removes`) contains that ID |
| `trace-unknown-test` | the row names a `TEST-nnnn` that is not in `04-plan/test-plan.yaml` |
| `open-note` | a human note is still `open` (not yours to fix: return `blocked`) |

The same gate checks the commit plan (`commit-grouping`); run it once both files exist.

## Procedure

1. **Gather** (paths from T2; commands with the engine path from T0's exit check):
   - the spec — AC IDs and their verbatim text, `removed`, delta summary;
   - `04-plan/tasks.yaml` (`satisfies`, `removes`, status via the change set) and `test-plan.yaml`;
   - `06-verify/review.md` (remaining findings), `07-qa/defects.yaml` and `qa-report.md` when present;
   - `08-delivery/docs-report.md`, `human-notes.yaml`;
   - `factory events --feature FEAT-nnn --limit 500` (gate and dispatch events) and
     `factory state --feature FEAT-nnn` (budgets, human gates).
2. **Start from the template** [fd-pr-body.md](../../templates/fd-pr-body.md) and fill the sections
   in this order: title, Summary, Spec trace, Verification, Review and QA, Human notes, Docs, Diff,
   Open items, Provenance. Rules and sources for each: [fd-pr-body-rules.md](references/fd-pr-body-rules.md).
3. **Spec trace**: one row per AC (criterion verbatim, story, the tasks that satisfy it, planned
   TEST IDs, result from the records) and one per removed REQ (the task that removes it).
4. **Verification**: one row per gate that has a gate event for this feature, with its last result
   and round count; human gates with who approved. Never list a gate that did not run, never ✅ for
   a gate whose last result failed.
5. **Diff**: the stat only (`git diff --stat HEAD -- <files>` plus new files with line counts).
6. **Provenance**: dispatches, models by stage, tokens, agent time (paused time excluded), fix
   rounds, the artifacts folder.
7. **Self-check**: each AC ID and removed REQ ID appears in a trace row with a task from
   `satisfies`/`removes`; every TEST ID is in the test plan; the four required headings exist.
8. **Run the exit check** from T0 (`gate ready`); fix what it reports in either file.

## Worked mini-example (trace and verification)

Spec: AC-0001..AC-0004. Tasks: TASK-002 satisfies AC-0003; TASK-003 AC-0001, AC-0002, AC-0004;
fix TASK-004 AC-0001. Test plan: TEST-0001..0004 (acceptance), TEST-0005 (component). Events: gate
`acceptance` pass ×1, `verify` fail then pass (2 rounds), `docs` pass, and no `qa` event (a profile
without the QA stage) → the Verification table has no QA row and Review and QA says "QA did not run".

```markdown
| AC | Criterion | Story | Task | Tests | Result |
|---|---|---|---|---|---|
| AC-0001 | (criterion text copied verbatim from the spec) | STORY-0001 | TASK-003, TASK-004 | TEST-0001, TEST-0005 | passing |
| AC-0002 | … | STORY-0001 | TASK-003 | TEST-0002 | passing |
| AC-0003 | … | STORY-0002 | TASK-002 | TEST-0003 | passing |
| AC-0004 | … | STORY-0001 | TASK-003 | TEST-0004 | passing |

| Gate | Result | Rounds | Note |
|---|---|---|---|
| acceptance | ✅ | 1 | 4 tests failing before implementation |
| verify | ✅ | 2 | round 1 failed → TASK-004 |
| docs | ✅ | 1 | — |
```

## Must not

- Mark a gate ✅ that did not run or whose last run failed; claim CI results (none ran yet).
- Paraphrase an AC, drop a partial one, or invent a test ID.
- Paste a diff body, logs or full review text; add marketing language.
- Run `gh`, `git push` or `git commit` — the engine opens the PR from your file.
