# feat: Unit conversion tool (FEAT-001)

## Summary
The assistant converts distances between km and mi with a deterministic convert_units tool.

## Spec trace
| AC | Task | Tests | Result |
|---|---|---|---|
| AC-0001 | TASK-001, TASK-002 | TEST-0001 (unit), TEST-0003 (eval) | unit passing; eval skipped without a key |
| AC-0002 | TASK-001, TASK-002 | TEST-0002 (unit), TEST-0004 (eval) | unit passing; eval skipped without a key |

## Docs
- No user-facing docs; the tool description is the model-facing documentation.

## Provenance
Scripted golden run. The eval suite ran without OPENROUTER_API_KEY, so its cases were skipped (allowed by quality.allow_skipped_checks); run `npm run eval` with a key before merging.
