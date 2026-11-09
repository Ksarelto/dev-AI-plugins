---
name: acceptance-tests
description: Procedure for the factory acceptance-test author — write one or more acceptance tests per acceptance criterion from the spec alone, named with the AC ID, driving the feature through its public surface, failing before implementation. Preloaded by the acceptance-test author; not for direct use.
user-invocable: false
---

# Acceptance tests (written before implementation)

Runs on: acceptance-test-author (sonnet) — one pass per feature at S5a, turning every AC into a black-box test before any task is built.

The tests are the feature's holdout: written from the spec, the stories and the contract by someone
who never saw the code, locked once the acceptance gate passes (builders cannot read or change them),
and run unchanged at verification, where they must all pass.

## What gate-acceptance checks

For every enabled role's stack it runs the stack's `test` command (scoped to changed files), then:

| Rule | Fails when |
|---|---|
| `none` | no `*.acceptance.test.*` file mentions any AC ID of the spec |
| `no-stack` / `no-report` | no installed stack, or the test command wrote no report |
| `not-run` | an acceptance file is outside what the test command runs |
| `syntax-error` | a file does not parse |
| `passes-before-implementation` | **any** test in an acceptance file passes now |
| `ac-without-test` | an AC of the spec is named by no test title |

A file that fails to import (the feature's modules do not exist yet) is a valid red: the gate reads
its `test("…")` / `it("…")` titles from the source text. After the gate passes the engine locks
every acceptance file (hash + snapshot); a later change makes gate-checks fail with
`acceptance-test-changed` for a human to decide. A test that is wrong (not the code) is settled by a
human: `factory acceptance waive <test> --reason …` (the only way a failing acceptance test passes
gate-checks; the review and digest list it) or `factory replay acceptance --relock <test>` (you rewrite
that one test from the contract; the engine re-locks the file).

## Procedure

1. **Read the pack.** T2: the spec (`prd.md` or `delta-spec.yaml`: every REQ and AC with `kind` and
   text, NFRs), `02-stories/stories.yaml` (Gherkin per AC, roles, `ux.surfaces`),
   `02-stories/ux-notes.md`, `03-architecture/component-map.md` (pages, slices, public entry
   points, props), `03-architecture/api-contract.yaml`, `04-plan/test-plan.yaml`, the normalised inbox
   sources (the customer's API sections) and the entity types/schemas the pack lists (read-only). T1: the stack's
   testing skill to load (`frontend-dev-kit:testing`, `node-backend-dev-kit:api-testing`, or the
   one T1 names).
2. **List every AC** of the spec with its story, its Gherkin and its `kind`. Add the test-plan
   cases of level `acceptance` and `e2e` (TEST IDs, `data`). Removed REQs need no acceptance test.
3. **Pick the surface per story** — the highest public surface the stack's test command runs:
   the page or route a user reaches, the API operation from the contract, the agent service the
   design names. Read [fq-acceptance-patterns.md](references/fq-acceptance-patterns.md) for the
   stack's folder, imports, fakes and an example.
4. **Write one file per story**: `<surface>/<story-slug>.acceptance.test.ts(x)` in the folder the
   pattern names. The `.acceptance.test.` part matters: task gates leave these files alone until
   verification and builders cannot read them.
5. **Write the tests**, at least one per AC:
   - Title: the AC ID first, then the observable outcome in the AC's words; the test-plan TEST ID
     after it when the plan has one — `test("AC-0001 TEST-0004 applying B2B10 shows a -10.00 EUR discount line", …)`.
     A plain string literal in `test`/`it`, never only in `describe`, never via `test.each`.
   - Body: the Gherkin's Given/When/Then with its exact values, through the public surface only.
   - Fixtures: build every response and prop from the contract's schema and the entity types, field by
     field, with the contract's names and nesting. A builder cannot bend production code to a
     fixture (it must raise a dispute), so an invented shape stalls the feature. Where the contract
     and the inbox disagree, follow the contract and say so in `deviations`.
   - Fakes: only what lies outside the feature — the network via the contract's responses, time,
     the model (scripted). Never the behaviour under test: for "an expired coupon shows the message",
     the fake returns the contract's expired response and the test asserts what the page shows.
   - Rule-shaped ACs (a calculation, a limit, a format): add a second example with other values
     that follow the same rule, so a hard-coded answer fails.
   - By `kind`: `error` → the failure response and the message; `edge` → the boundary value;
     `permission` → each named role and the role that must be refused; `nfr` → only when it is
     observable in a test (a limit, a label, a status); otherwise list it in `deviations` as
     verified elsewhere.
6. **Know why each test fails now** — write it down in your summary per file:

   | Valid red (now) | Not valid |
   |---|---|
   | the imported page/service/route does not exist yet (import error) | a syntax error |
   | the element, label or route is missing (not found, 404) | a test that passes |
   | the value differs (assertion) or "not implemented" | a typo in a value the spec gives |

7. **Run the exit check** from T0 (`gate acceptance`). Fix every failure it reports:
   - `passes-before-implementation`: the test proves nothing yet. Tighten it to the AC's new
     behaviour and exact values. If the AC describes behaviour the app already has (a change
     request restating today's behaviour), do not weaken anything: return `needs_clarification`
     naming the AC — it is a guarantee, not a change.
   - `ac-without-test`: add the test, or put the ID into the title of the test that proves it.
   - `not-run`: the file is in a folder the stack's test command does not include; move it.
8. **Return** the envelope.

## Mini-example

AC-0003 (`kind: happy`): "Given a 100.00 EUR cart with 5.00 EUR shipping, when B2B10 (10%) is
applied, the total is 95.00 EUR." Tests:
`AC-0003 the total is 100.00 − 10.00 + 5.00 = 95.00 EUR` and
`AC-0003 second example: a 40.00 EUR cart with B2B10 totals 41.00 EUR` (40 − 4 + 5). Both fail now:
the checkout page has no coupon field (not found). An implementation returning a literal 95 fails
the second.

## Return

The envelope: `artifacts_written` (the acceptance files), `gate_result` from the exit check,
`summary` (≤200 words: files, AC → test count, why each file fails now), `deviations` for any AC
proved only partly here (NFRs, model-judged behaviour, a backend service-level fallback). Status
`done` when the gate passes; `needs_clarification` with `open_questions` when an AC has no
observable outcome or restates current behaviour; `blocked` with `error` when no public surface for
a story exists in the component map or the contract.
