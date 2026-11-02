# Severity — P0 to P3, and what blocks

The review schema (`factory/schemas/review.schema.json`) and the envelope accept exactly `P0`, `P1`,
`P2`, `P3`. gate-verify fails on every finding whose severity is in `quality.review_blocking` in the
project config — `[P0, P1]` by default. Each blocking finding becomes a fix item (its `claim` and
`fix_hint` reach the planner, who adds a fix task). Non-blocking findings stay in review.md and the
release manager lists them in the PR. A project may widen the blocking set (for example `[P0, P1,
P2]`); grade by the definitions below, never by what blocks today.

| Severity | Definition | Effect with the default config |
|---|---|---|
| **P0** | Broken, unsafe or losing data: a security hole, data loss or corruption, a crash on a main path, a faked result (code special-cased to a test, a fabricated answer) | blocks; fix task |
| **P1** | An AC is not met or not reachable, a guarantee or recorded decision is broken, the contract is violated, an NFR is clearly missed | blocks; fix task |
| **P2** | Works, but fragile or unclear: a missing unhappy path no AC names, weak tests, layering bent, an unbounded query on a small table, an abstraction no AC needs | listed in the PR; fixed if budget allows |
| **P3** | Nit or note: naming, small duplication, an optional improvement, a security-sensitive path to point a human at | listed in the PR |

## Deciding

1. Is a user, their data or the system harmed now, or is a result faked? → **P0**.
2. Does an AC, an `unchanged_guarantees` item, an ADR, the contract or an NFR say otherwise? → **P1**.
   Name the AC in `ac` when there is one.
3. Would the next change or an unusual input likely break it? → **P2**.
4. Otherwise → **P3**, or no finding at all.

Between two levels, pick the higher one and say why in `evidence`. Do not soften a P0/P1 because the
change is small, late or the fix is easy. Do not raise a P2 to P1 to get it fixed: if it matters to
an AC, cite the AC; if not, it is P2.

## Mapping from other scales

| Source | Their level | Here |
|---|---|---|
| v1 feature-dev reviewer | CRITICAL | P0 if unsafe or faked, else P1 |
| v1 feature-dev reviewer | IMPORTANT | P1 if it breaks an AC, a decision or the stack's architecture; else P2 |
| v1 feature-dev reviewer | MINOR | P3 |
| `node-backend-dev-kit:code-review` | blocker | P0 for security, data loss, secrets; P1 for broken contract or schema without migration |
| `node-backend-dev-kit:code-review` | major | P1 when the contract or an AC depends on it, else P2 |
| `node-backend-dev-kit:code-review` | minor / nit | P3 (minor that will spread when copied: P2) |
| `frontend-dev-kit:code-review` checklists | their "Severity" sections | blocks the task → P1; hostile / degrades → P2; cosmetic → P3 |
| v1 backend reviewer | must fix / should fix / consider | P0–P1 / P2 / P3 |

## Examples

| Finding (claim) | Severity | Why |
|---|---|---|
| `GET /orders/:id` returns another user's order — no ownership check in `orders.service.ts:41` | P0 | data exposure |
| `total.ts:12` returns 95 when the code is "B2B10", whatever the cart holds | P0 | faked result |
| The coupon field is never rendered on the checkout page; AC-0001 unreachable | P1 | AC not met |
| Expired coupon shows `error.message` from the server instead of the translated text in AC-0002 | P1 | AC text differs |
| Delta-spec guarantees guest checkout is unchanged; the new guard redirects guests to login | P1 | guarantee broken |
| A write tool `send_invoice` acts without `interrupt()` | P0 | unapproved side effect |
| List endpoint has `limit` without a maximum; no AC names list size | P2 | fragile |
| `useCouponStore` wraps one `useState` | P2 | over-engineering |
| Test asserts the mocked hook was called instead of the rendered discount | P2 | weak proof (P1 if it is the only test of an AC) |
| `applyCoupon` could be named `applyCouponCode` for clarity | P3 | nit |
| `src/middleware/auth.ts` changed — no problem found | P3 | point a human at a sensitive path |

## Finding shape

Every finding has: `file`, `line` (when one line carries it), `lens`, `severity`, `claim`,
`evidence`, `fix_hint`, and `ac` when an AC is involved. Leave `id` and `agent` out — the engine
numbers findings `RV-n` and records who made them.

- `claim`: one sentence, what is wrong and its consequence ("… so AC-0003 shows the wrong total").
- `evidence`: a short quote of the code (and of the spec, contract or rule it contradicts), with
  its location. No quote, no finding.
- `fix_hint`: the smallest change that clears it, in one sentence; never a redesign.
