---
name: seven-lens-review
description: Procedure for the factory reviewer — review a change set through seven non-overlapping lenses (behaviour preservation, hidden assumptions, spec and ADR drift, independent tests, edge cases, security, over-engineering) and return severity-tagged findings with evidence. Preloaded by the reviewer; not for direct use.
user-invocable: false
---

# Seven-lens review

Runs on: reviewer (opus) — one read-only judgement pass over a whole feature's change set at S6, after the machine checks are green.

You judge the change on its own merits: the files the tasks changed against the spec, stories,
contract, ADRs and the stack's rules. You never see the builders' summaries. You have no Write and
no Bash: your output is the envelope's `findings`, and the engine writes `06-verify/review.md` from
them together with the role audits' findings, then runs gate-verify.

## What has already happened

| Before you | Result you can rely on |
|---|---|
| gate-checks (stage `precheck`) | the whole suite incl. acceptance tests, typecheck, lint, build, integration tests and the role's full eval run passed — a red build never reaches you |
| task gates | every task's red tests, depcruise architecture check and role checks passed |
| after you: role audits | frontend `raw-colours`, `i18n`, `conventions`, `duplicates`, `bundle`, `axe`; backend `openapi`, `migrations` (the role packs' `gates.audits`) |

Never file what those catch. Tests passing is not proof of the ACs — that is what you judge.

## Procedure

1. **Read the pack** (T0–T2). Note the mode (change request → lens `behaviour` is mandatory), the
   stage (`verification` runs on standard and full tiers → `edge-cases` is mandatory;
   `verification-lite` is the patch tier, with fewer inputs), and any T3 feedback from an earlier
   round.
2. **Read the change set** `06-verify/change-set.yaml`: tasks with `satisfies` and `files`,
   `changed`, `outside_plan`, `scaffold`. Read `06-verify/change.diff` when the pack lists it: it
   shows what changed in files that existed before. Skip `scaffold` files (the starter the engine
   copied) unless a task changed them.
3. **Load the stack knowledge** T1 names, per role in the change set, and open the matching lens
   group reference:

   | Role / stack | Reference |
   |---|---|
   | frontend (`frontend-dev-kit`) | [fq-lens-frontend.md](references/fq-lens-frontend.md) |
   | backend (`node-backend-dev-kit`) | [fq-lens-backend.md](references/fq-lens-backend.md) |
   | ai-agent (`node-agent-dev-kit`) | [fq-lens-ai.md](references/fq-lens-ai.md) + the backend reference for its HTTP layer |

4. **Build the AC map** before reading code: every AC of the spec (`prd.md` or `delta-spec.yaml`)
   with its `kind`, the task that `satisfies` it, and the entry point the stories name (route,
   page, operation). For a change request also list `unchanged_guarantees` and `removed`.
5. **Read every changed source file in full**, not only its hunks; open a caller when a signature
   changed (scoped Grep with a path — unscoped Grep/Glob is blocked). Tests ride with their file.
   Over ~15 source files: a per-file pass first, then a cross-file pass (see the lens catalogue).
6. **Apply the lenses one at a time**, in this order, using
   [fq-seven-lenses.md](references/fq-seven-lenses.md) for the questions and the lens group
   reference for stack checks. A problem goes under the first lens that explains it — once.

   | Lens (`lens` value) | Question | Mandatory |
   |---|---|---|
   | `behaviour` | Did the change alter behaviour the spec did not authorise? | change requests |
   | `assumptions` | What does the code assume about data, APIs, errors, users that nothing guarantees? | always |
   | `spec-adr-drift` | Does it do what each AC says, reachably, the way the ADRs and the reference architecture say? | always |
   | `tests` | Do the tests prove the ACs with the exact values, without faking the behaviour? | always |
   | `edge-cases` | Empty, boundary, failure, concurrency, locale — mishandled where? | standard, full |
   | `security` | Input, injection, secrets, auth and ownership, data exposure, tool surface | always |
   | `over-engineering` | Abstractions, options, dependencies or scope no AC asks for | always |

7. **Grade** each finding with [fq-severity.md](references/fq-severity.md). P0/P1 block by default
   (`quality.review_blocking`); grade by definition, not by what you want fixed.
8. **De-duplicate and check evidence**: one finding per problem; every finding quotes the code. Drop
   anything an audit or a machine check already reports.
9. **Return** the envelope (below). There is no exit check to run: the engine runs gate-verify
   after writing review.md.

## Finding format

```json
{ "lens": "spec-adr-drift", "severity": "P1", "file": "src/pages/checkout/ui/checkout-page.tsx",
  "line": 9, "ac": "AC-0001", "claim": "CouponField is never rendered, so AC-0001 is unreachable",
  "evidence": "checkout-page.tsx:9 renders <OrderSummary/> only; component-map puts CouponField on this page",
  "fix_hint": "render CouponField above OrderSummary in the checkout page" }
```

| Field | Rule |
|---|---|
| `file`, `line` | project-relative path from the change set; the line that carries the problem |
| `lens` | one of the seven values above (`audit` is the engine's) |
| `severity` | `P0`–`P3` |
| `claim` | one sentence: what is wrong and what it causes |
| `evidence` | a quote with its location, plus the spec/contract/rule line it contradicts |
| `fix_hint` | the smallest change that clears it |
| `ac` | the AC involved, when there is one |

Leave out `id` and `agent`: the engine assigns `RV-n` and records the agent.

## Fix rounds

A blocking finding sends the feature back to implementation; the next verification round reviews
the whole change set again with fresh findings. When T3 lists the previous round's failures, check
each one first: gone → do not file it; still there → file it again with the same claim and new
evidence. Then review the rest — a fix can break something else.

## Worked mini-example

Change set: TASK-002 `src/entities/order/model/total.ts` (satisfies AC-0003), TASK-003
`src/features/apply-coupon/ui/coupon-field.tsx` (AC-0001, AC-0002). AC-0003: "total = sum(lines) −
discount + shipping". `total.ts:7` is `return sum - discount;`.

- `spec-adr-drift` P1, `total.ts:7`, AC-0003: shipping is not added. Evidence: the line, the AC text.
- `tests` P2, `total.test.ts:12`: only one example (100 → 90); a second rule example would have
  caught the missing shipping.
- Nothing under `security` or `over-engineering`; `edge-cases`: a 0-line cart returns `-discount`
  (`total.ts:7`) — P2, no AC covers empty carts.

## Return

End with one JSON envelope: `status: "done"` with `findings` (an empty list is a valid review —
say "no findings" in the summary), `artifacts_written: []`, and a summary of at most 200 words:
files reviewed, lenses applied, counts by severity, anything you could not judge and why. Use
`blocked` only when a required input is missing (no change set, no spec), with `error` set.
