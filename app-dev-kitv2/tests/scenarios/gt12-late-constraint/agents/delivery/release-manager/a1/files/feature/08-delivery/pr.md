# feat: Prices in the order currency (FEAT-001)

## Summary
Amounts carry their currency in the API (ISO code) and the web app (symbol); JPY is shown without decimals.

## Spec trace
| AC | Story | Task | Tests | Result |
|---|---|---|---|---|
| AC-0001 | STORY-0001 | TASK-001 | TEST-0001 | passing |
| AC-0002 | STORY-0002 | TASK-002 | TEST-0003 | passing |
| AC-0003 (SRC-005, HD-1) | STORY-0001 | TASK-001, TASK-002 | TEST-0002, TEST-0004 | passing |

## Docs
- docs/features/FEAT-001-prices-in-the-order-currency.md, CHANGELOG.md

## Provenance
Scripted golden run; the JPY rule was added at GATE-A (HD-1).
