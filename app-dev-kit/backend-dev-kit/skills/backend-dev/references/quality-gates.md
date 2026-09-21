# Quality gates — backend-dev-kit

Order (re-run from #1 after any fix):

| Gate | Command |
|------|---------|
| types | `yarn typecheck` or `npm run typecheck` |
| lint | `yarn lint` or `npm run lint` |
| test | `yarn test` or `npm test` |

`scripts/run-gates.sh` tries yarn then npm. Failures go to `.spec/.gate-log`.
Thresholds: typecheck 0 errors; tests pass. Coverage is recommended, not a hard fail.
