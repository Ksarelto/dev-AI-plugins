---
name: qa-heuristics
description: Procedure for the factory QA engineer — plan and run time-boxed black-box charters with test heuristics against the running feature, and record defects (S1–S5) and spec gaps with steps, expected and actual. Preloaded by the qa-engineer; not for direct use.
user-invocable: false
---

# QA by charters

Runs on: qa-engineer (sonnet) — one time-boxed exploratory session of a built feature at S7, driving the running app through a browser and `curl`, never its source.

You use the feature the way its users will, and a few ways they should not. `src/` is unreadable to
you (the hook denies it, except acceptance tests); you work from the stories, the ACs, the UX notes,
the human notes and the running build. You record — you never fix and never create tasks.

## What gate-qa checks

- `07-qa/defects.yaml` exists and validates (`factory/schemas/defects.schema.json`): at least one
  charter, each with `id`, `mission`, `timebox_min`, `result` (`passed` | `defects` | `blocked`);
  each defect with `id` (`DEF-nnn`), `type` (`defect` | `spec_gap`), `severity` (`S1`–`S5`),
  `title`, `steps` (≥1), `expected`, `actual`.
- Not every charter is `blocked` (rule `no-charter-ran`).
- No open S1/S2 `defect` (each becomes a fix item with its steps) and no open S1/S2 `spec_gap`
  (return `needs_clarification`) — unless `waived_by: HD-n` names a human note whose text names
  that defect ID.
- `07-qa/qa-report.md` exists.

## Procedure

1. **Read the pack.** T2: `02-stories/stories.yaml` (stories, Gherkin, `ux.surfaces`, roles),
   `02-stories/ux-notes.md`, the spec (ACs with `kind`, NFRs — especially accessibility and
   performance), `06-verify/change-set.yaml` (which routes, pages and endpoints changed, by file
   name), `human-notes.yaml`. T0: the next free `DEF-nnn` IDs and the exit check.
2. **Read the expected flow** from the stories, the UX notes and, when T0 lists one, the customer
   mockup. The spec wins over the mockup.
3. **Plan charters per story.** For each story (must-priority stories first), write one charter:
   "Explore <surface> with <heuristic(s)> to discover <risk>". Pick heuristics that fit the story's
   shape from [fq-heuristics.md](references/fq-heuristics.md#choosing-heuristics-for-a-charter);
   cover each AC `kind` the story has (error, edge, permission, nfr) at least once. 2–5 charters,
   20 minutes in total unless T0 sets another time box; split the time by risk.
4. **Start the app** in the background and wait for its port
   ([fq-browser-qa.md](references/fq-browser-qa.md#start-the-app)). Loopback only.
5. **Run each charter** inside its time box: the happy path first (each AC's Gherkin with its exact
   values), then the heuristics. UI: the Playwright MCP loop — navigate, snapshot, act, wait_for,
   snapshot, console messages, network requests; screenshots as evidence. API: `curl -i`. Write
   down every step and what you saw as you go.
6. **Always include** in some charter: keyboard-only and screen-reader names (snapshot) on the
   feature's main surface; the four widths 320/768/1024/1440; one network failure (stop the backend
   or force an error) for anything that calls the network; double submit for anything that writes.
7. **Classify and grade** each finding with
   [fq-defect-records.md](references/fq-defect-records.md): defect vs spec gap, S1–S5, steps,
   expected (with the AC ID), actual, evidence (screenshot path, status line, console message).
8. **Write** `07-qa/defects.yaml` (every charter with its result, every defect and gap) and
   `07-qa/qa-report.md` (build under test, charters, ACs and heuristics covered, what was not
   covered and why, findings, risks).
9. **Stop the processes** you started.
10. **Run the exit check** from T0 (`gate qa`). An open S1/S2 defect fails it by design — that is the
    fix loop working; return `done`. An open S1/S2 spec gap fails it too: return
    `needs_clarification` with the gap as the question.

## Heuristics at a glance

| Heuristic | Try |
|---|---|
| boundaries | empty, one, the maximum, one over, first/last page |
| input | long text, Unicode, spaces, pasted values, HTML/SQL-looking text, wrong formats |
| data volume | more rows than a page, long names, exactly one page, empty list |
| interruption | reload mid-flow, back after submit, navigate away during a request |
| network | backend stopped (offline), a forced 5xx; check the UI's error state and console |
| concurrency | double submit, a stale page after a change made through the API ("second tab"), two users racing |
| state | logged out, guest, expired session, first-time user, record deleted elsewhere |
| permissions | every role the stories name, and none; another user's ID |
| device / viewport | 320, 768, 1024, 1440 px |
| visual | layout, overflow, contrast, all four data states |
| accessibility | keyboard order and activation, visible focus, names in the snapshot, live regions |
| i18n | another locale: no raw keys, formats per locale, layout holds |

Details, failure signals and tool calls per heuristic: [fq-heuristics.md](references/fq-heuristics.md).

## Blocked charters

A charter you could not run is `blocked`, with the reason in the report (the log line, the missing
service, the tool that is not available). If every charter is blocked the gate fails: before giving
up, try the charters that need less (an API-only charter when the UI will not start, a UI charter
with the backend down for the error states). If nothing can run, return `blocked` with `error`
explaining what to start.

## Worked mini-example

Story STORY-0001 "Apply a coupon" (AC-0001 happy, AC-0002 error: expired coupon, AC-0004
permission: guests see no field). Charters: CH-1 input + boundaries on the coupon field (8 min),
CH-2 permissions + state (guest, logged-out, expired session) (6 min), CH-3 keyboard + viewport
(6 min). CH-1 finds that `B2B10 ` with a trailing space is rejected → DEF-001, `defect`, S2,
AC-0001. It also finds lowercase `b2b10` rejected, and the spec says nothing about case → DEF-002,
`spec_gap`, S3 (not blocking, listed). Exit check fails on DEF-001 → envelope `done`; the engine
turns DEF-001 into a fix item.

## Return

The envelope: `artifacts_written` (both files), `gate_result` from your exit check, a summary (≤200
words: charters run, ACs exercised, defects by severity, what was not covered). Status `done` when
the record is complete (even with open S1/S2 defects), `needs_clarification` with `open_questions`
for an S1/S2 spec gap, `blocked` when nothing could run.
