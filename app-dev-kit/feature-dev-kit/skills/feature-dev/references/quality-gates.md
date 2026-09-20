# Quality Gates

All gates must pass before the orchestrator advances past station 9 and emits the station-12 human packet. Gates run in the order listed. A failing gate blocks all subsequent gates.

---

## Gate Table

| # | Gate | Command | Pass condition | Fail → action |
|---|------|---------|---------------|---------------|
| 1 | Types | `yarn typecheck` | Exit 0, zero TypeScript errors | Enter fix loop |
| 2 | Lint | `yarn lint` | Exit 0, zero ESLint + Stylelint errors | Enter fix loop |
| 3 | FSD boundaries | `yarn lint:fsd` (Steiger) | No upward imports, no cross-slice internal imports, every slice has `index.ts` | Enter fix loop |
| 4 | Build | `yarn build` | Vite build succeeds, exit 0 | Enter fix loop |
| 5 | Coverage | `yarn test:auto` | branches ≥73%, functions ≥78%, lines ≥87%, statements ≥86% | Enter fix loop |
| 6 | Architecture audit | `architecture-auditor` (REPORT_ONLY, changed paths + importers) | Zero **hard** violations | Enter fix loop. Missing agent/companion skill → ESCALATION_PACKET |
| 7 | Auto-review | `frontend-dev-kit:code-review` skill | No findings tagged `[CRITICAL]`; no unresolved `[IMPORTANT]` findings | Enter fix loop |

Human gates (not automated commands):

| # | Gate | Trigger | Pass condition |
|---|------|---------|---------------|
| 1b | Dep approval | Any new package proposed | Human explicitly approves each package |
| 12 | Human review | Station-12 packet emitted | Human responds `approve` |

---

## Per-Gate Remediation Hints

| Gate | Common failure | Fix |
|------|---------------|-----|
| Types | Missing return type on exported component | Add `: JSX.Element` explicit return type |
| Types | `any` used | Replace with `unknown` + type guard, or narrow the interface |
| Types | Interface property mismatch with API response | Update the type in the `entities/<domain>/model/` types file |
| Lint | `console.log` present | Replace with `console.warn` or `console.error` |
| Lint | Missing exhaustive deps on `useCallback`/`useMemo` | Add all referenced variables to the dependency array |
| Lint | Hardcoded UI string | Move to `shared/config/textContent.ts` and reference via `TextContent.KEY` |
| FSD boundaries | Deep import into slice internals | Add the symbol to the slice's `index.ts`; update the import path |
| FSD boundaries | Upward import | Move the shared code into `shared/`; remove the upward reference |
| FSD boundaries | Missing `index.ts` | Create `index.ts` with named re-exports for all public symbols |
| Build | OOM during build | `yarn build` already sets `--max-old-space-size=4096`; check for circular deps |
| Build | Missing module | Verify the slice's `index.ts` exports the symbol; check path alias `@/` usage |
| Coverage | Branch coverage below threshold | Add tests for uncovered conditional branches; check `if`/ternary paths |
| Coverage | Function coverage below threshold | Add at least one test exercising each exported function |
| Architecture audit | Hard violation (layer, public API, query keys, import direction) | Route to the owning engineer; do not auto-fix inside the forked skill |
| Architecture audit | Agent or companion skill not installed | Install `frontend-dev-kit`; do not skip Station 9.5 |
| Auto-review | [CRITICAL] finding | Treat as a blocking bug; fix before re-running |
| Auto-review | [IMPORTANT] finding | Either fix or add a documented decision in the spec explaining why it is acceptable |

---

## Fix Loop

The orchestrator runs the fix loop as follows:

1. Identify the first failing gate.
2. Delegate to a fix engineer with: the gate name, the full error output, and the relevant spec sections.
3. The fix engineer applies a targeted fix (minimum diff to make the gate pass).
4. The orchestrator re-runs **all gates from #1** (not just the failing one) to catch regressions.
5. If the same gate fails again after 2 more attempts (3 total), escalate to human with the full gate log. Set spec status to `awaiting-human`. Stop.

Do not skip gates after a fix. Always re-run the full gate sequence from the top.
