---
name: qa-heuristics
description: Procedure for the factory QA engineer — plan and run time-boxed black-box charters with test heuristics against the running feature, and record defects (S1–S5) and spec gaps with steps, expected and actual. Preloaded by the qa-engineer; not for direct use.
user-invocable: false
---

# QA by charters

## Charters

Plan 2–4 charters of `timebox_min` minutes each (20 in total for the standard tier). A charter is a
mission: "Explore <surface> with <heuristic> to discover <risk>". Pick heuristics that fit:

| Heuristic | Try |
|---|---|
| boundaries | empty, one, maximum, just over the limit |
| input | long text, unicode, spaces, pasted values, wrong formats |
| interruption | reload, back button, double submit, slow network |
| state | logged out, guest, second tab, stale data |
| permissions | the roles the stories name |
| i18n / a11y | another locale; keyboard only; screen-reader labels |

Run the app the way the README or stack says (dev server or a production preview) and use any
browser tool available to you. Record what you did, not what you assume.

## Records

Write `07-qa/defects.yaml` (every charter with its result, every defect) and `07-qa/qa-report.md`
(what was covered, what was not, risks).

| Severity | Use for | Effect |
|---|---|---|
| S1 | crash, data loss, security | blocks the PR; becomes a fix task |
| S2 | an AC fails, no workaround | blocks the PR; becomes a fix task |
| S3 | an AC fails with a workaround, or a clear UX bug | fixed if budget allows |
| S4–S5 | cosmetic, polish | listed |

`type: spec_gap` is for behaviour the spec does not decide — not a defect. A human can waive an
S1/S2 with a note (`waived_by: HD-n`). Run the exit check before you return.
