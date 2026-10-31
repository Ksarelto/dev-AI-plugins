# feat: Service version and deployment log (FEAT-001)

## Summary
GET /health/live reports SERVICE_VERSION when it is set; a deployments table records each release.

## Spec trace
| AC | Task | Tests | Result |
|---|---|---|---|
| AC-0001 | TASK-001 | TEST-0001 | passing |
| AC-0002 | TASK-002 | TEST-0002 (integration, run in CI), migration check | passing |

## Docs
- No user-facing docs: operational change; SERVICE_VERSION is described in src/config/env.ts.

## Provenance
Scripted golden run.
