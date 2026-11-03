# Severity

One tag per finding. The tag measures consequence, not how much you dislike the code.

| Tag | Means | Examples |
|---|---|---|
| **Blocker** | Breaks behavior, security, or a load-bearing architecture invariant. Merge waits. | Cross-feature import; auth only in the UI; server state mirrored into `useState`; XSS sink; a crashing path; typecheck/lint/test failure |
| **Must fix** | Violates a documented rule in `rules/` or an FSD hard rule, with no behavioral break today. | Inline `className` string; `t()` in `models/`; missing test file; magic literal; inline `on*` arrow; deep import |
| **Should fix** | Design-principle or pattern violation with a concrete maintenance or performance cost. | God component; second `switch` on one union; abstraction with one caller; request waterfall; prop drilling past 2 levels |
| **Consider** | Judgement call; reasonable people differ. Include only with a one-line alternative. | Naming; extract-vs-inline; a smell with no current cost |

Rules for the report:

- Blocker and Must fix are listed in full, every occurrence, with `path:line`.
- Should fix lists every occurrence of a pattern once with the count and the first three locations.
- Consider is capped at 400 words in total. Drop any item a script or a Must-fix finding already covers.
- A finding without a concrete failure or cost is not a finding. Say less rather than pad.
- Praise one thing the diff did well only when it is a pattern worth keeping; skip if nothing stands out.
