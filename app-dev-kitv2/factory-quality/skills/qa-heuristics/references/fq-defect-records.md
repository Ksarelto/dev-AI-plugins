# Defect records — classification, severity, evidence, files

## Defect or spec gap?

| What you saw | Type | Goes to |
|---|---|---|
| The app does not do what an AC, a story's Gherkin or a UX note says | `defect` | gate-qa makes S1/S2 a fix item → planner → fix task (with a regression test that reproduces it) |
| The app crashes, loses data, leaks data or lets the wrong role act — spec or not | `defect` | as above |
| The spec does not decide the behaviour, and two reasonable readings lead to different apps | `spec_gap` | the human (via `needs_clarification` for S1/S2) and the requirements analyst |
| A customer mockup and the app differ, the spec agrees with the app | none | — |
| You would design it differently, nothing is wrong | none | a line under "Risks and suggestions" in the report |

A spec gap is never a defect with a guess attached. Write what is undecided and the readings you
see in `expected` ("Spec does not say whether…; either A or B") and what the app does in `actual`.

## Severity (the defects schema: S1–S5)

| Severity | Use for | gate-qa effect (default `qa.blocking: [S1, S2]`) |
|---|---|---|
| **S1** | crash or blank page on a main path, data loss or corruption, security or privacy breach (another user's data, an action without permission), payment wrong | blocks; defect → fix task, spec gap → human decision |
| **S2** | an AC fails and the user has no workaround | blocks; as above |
| **S3** | an AC fails but a workaround exists; a clear UX bug (stuck spinner, misleading message, unreachable by keyboard without an a11y NFR) | listed; fixed if budget allows |
| **S4** | cosmetic: alignment, overflow on an edge viewport, a console warning with no visible effect | listed |
| **S5** | polish: wording, a nicer empty state, a suggestion | listed |

Grade by the user's harm, not by how easy the fix looks. Between two levels, take the higher and
say why. A blocking defect stays blocking until a human waives it: a waiver is a human note (`HD-n`)
whose text names the defect ID; then set `waived_by: HD-n` on that defect. You cannot waive
anything yourself, and pointing at an unrelated note does not count (the gate checks the note's
text).

## Evidence

Every defect is reproducible by someone who was not there:

- `steps`: numbered actions from a stated start ("Logged in as a regular user, on /checkout with
  one 100.00 EUR item"), one action per step, with the exact values typed.
- `expected`: what the AC (quote its ID and the key words) or the story says should happen.
- `actual`: what happened, with the exact text, status code or console error.
- `evidence`: the screenshot path the browser tool returned, the `curl` status line, the console
  message — whatever proves `actual`.
- `ac`: the AC it violates, when there is one. `charter`: the charter ID that found it.

## `07-qa/defects.yaml`

IDs: charters `CH-1`, `CH-2`… (free text); defects `DEF-nnn` from "Next free IDs" in T0 — never
reuse an ID.

```yaml
feature: FEAT-001
charters:
  - id: CH-1
    mission: "Explore the coupon field with input and boundary values to find wrong discounts"
    timebox_min: 8
    result: defects              # passed | defects | blocked
  - id: CH-2
    mission: "Explore checkout with keyboard only and at 320/768/1024/1440 px to find unreachable controls"
    timebox_min: 6
    result: passed
  - id: CH-3
    mission: "Explore applying a coupon while the API is down to find missing error states"
    timebox_min: 6
    result: blocked              # say why in the report: the API needs Postgres, Docker was not running
defects:
  - id: DEF-001
    type: defect
    severity: S2
    title: "Coupon code with trailing space is rejected as expired"
    charter: CH-1
    ac: AC-0001
    steps:
      - "Open /checkout as a signed-in customer with one 100.00 EUR item"
      - "Type 'B2B10 ' (trailing space) into Coupon code"
      - "Click Apply"
    expected: "AC-0001: a -10.00 EUR discount line"
    actual: "Alert 'This coupon has expired'; total stays 105.00 EUR"
    evidence: ".playwright-mcp/FEAT-001-DEF-001.png; POST /api/v1/coupons/validate → 410"
  - id: DEF-002
    type: spec_gap
    severity: S3
    title: "Spec does not say whether coupon codes are case-insensitive"
    charter: CH-1
    steps: ["Type 'b2b10' into Coupon code", "Click Apply"]
    expected: "Undecided: accept (case-insensitive) or reject"
    actual: "Rejected as expired"
```

Every charter you planned appears, with its result. A charter with `result: defects` has at least
one defect naming it.

## `07-qa/qa-report.md`

```markdown
# QA report — FEAT-001 Coupons at checkout

## Build under test
Started with `pnpm dev` (port 5173) · backend `npm run dev` (port 3000) · <date/time>

## Charters
| Charter | Mission | Time | Result |
|---|---|---|---|
| CH-1 | … | 8 min | 1 defect, 1 spec gap |

## Coverage
- ACs exercised: AC-0001, AC-0002, AC-0003 (UI); AC-0004 (API only)
- Heuristics: input, boundaries, keyboard, viewport (320/768/1024/1440)
- Not covered, and why: slow network (no throttling tool); CH-3 blocked (Docker not running)

## Findings
- DEF-001 (S2) … · DEF-002 (S3, spec gap) …

## Risks and suggestions
- …
```

Write what you did and saw, never what you assume would happen.
