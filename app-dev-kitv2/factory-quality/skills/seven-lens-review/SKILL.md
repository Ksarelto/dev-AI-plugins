---
name: seven-lens-review
description: Procedure for the factory reviewer — review a change set through seven non-overlapping lenses (behaviour preservation, hidden assumptions, spec and ADR drift, independent tests, edge cases, security, over-engineering) and return severity-tagged findings with evidence. Preloaded by the reviewer; not for direct use.
user-invocable: false
---

# Seven-lens review

Read the change set (`06-verify/change-set.yaml`): every file a task changed. Then judge them
against the spec, stories, contract and ADRs — one lens at a time, so nothing overlaps.

| Lens (`lens` value) | Ask | Always? |
|---|---|---|
| `behaviour` | Did the change alter behaviour the spec did not authorise (`unchanged_guarantees`, removed list)? | change requests |
| `assumptions` | What does the code assume about data, APIs, errors, users that the spec does not guarantee? | yes |
| `spec-adr-drift` | Does it do what the ACs say, and respect recorded decisions and the reference architecture? Is every AC reachable by a user? | yes |
| `tests` | Do the tests prove the ACs with the exact values, or only the happy path? Does any test fake the behaviour it claims to prove, or any code special-case the test's values? | yes |
| `edge-cases` | Empty, boundary, failure, concurrency, locale | standard and full tiers |
| `security` | Input handling, injection, secrets, auth paths, unsafe HTML | yes |
| `over-engineering` | Abstractions, options or dependencies no AC asks for | yes |

## Findings

One finding per problem, in the envelope's `findings`:

```json
{ "lens": "spec-adr-drift", "severity": "P1", "file": "src/pages/checkout/ui/checkout-page.tsx",
  "line": 9, "ac": "AC-0001", "claim": "CouponField is never rendered, so AC-0001 is unreachable",
  "evidence": "checkout-page.tsx renders only the total", "fix_hint": "render CouponField in the page" }
```

| Severity | Meaning | Effect |
|---|---|---|
| P0 | broken, unsafe or data loss | blocks; becomes a fix task |
| P1 | an AC is not met, or a guarantee is broken | blocks; becomes a fix task |
| P2 | correct but fragile or unclear | fixed if budget allows |
| P3 | nit | listed in the PR |

Quote evidence from the files. A claim without evidence is not a finding. No findings is a valid
review: return an empty list and say so in the summary.
