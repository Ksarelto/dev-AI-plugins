---
name: curate-digest
description: Procedure for the factory curator agent — compact a feature's spec, stories, decisions, plan and human notes into digest.md without dropping any open tracked ID. Loaded by the curator; not for direct use.
user-invocable: false
---

# Curate a feature digest

The digest is navigation, never the source of truth: later stages read it first, then open the full
artifacts by path. Its one hard rule: **every open tracked ID must appear in it.**

## Tracked IDs

| Kind | Open when | Write it as |
|---|---|---|
| `REQ-####` | always | `REQ-0412 — apply one coupon per order` |
| `AC-####` | always | `AC-0901 — valid coupon shows -10.00 EUR line` |
| `ADR-###` | always | `ADR-002 — coupon state lives in entities/cart` |
| `OQ-#` | `status` is not `answered` / `defaulted` | `OQ-31 (major, default "no") — stackable with loyalty?` |
| `HD-#` | `status` is `open` or `mapped` | `HD-3 → AC-0915 — hide coupon field for guests` |

Each line: the ID, then at most 12 words. Closed items may be left out. `SRC-*` IDs are not needed.

## Layout (the word limit is in T0 of your pack)

```markdown
# FEAT-021 Coupons at checkout — digest after <stage>
Mode: change-request · Stage passed: <stage> · Next: <next stage>

## Scope (2–3 sentences)
## Requirements and acceptance criteria
## Decisions
## Open questions
## Human notes
## Risks and watch-outs   (only what a later stage must not miss)
```

## Procedure

1. Read every artifact listed in T2 of your pack. Do not read source code.
2. Collect the open tracked IDs with one-line meanings, in the order they appear.
3. Write `digest.md` in the layout above. If it would exceed the word limit, shorten the meanings —
   never drop an ID.
4. Run the exit check from T0 (`factory gate digest`). If it reports a dropped ID, add it and run
   the check again.
5. End with the envelope.

Never copy whole sections from the artifacts, never add requirements, never resolve open questions.
