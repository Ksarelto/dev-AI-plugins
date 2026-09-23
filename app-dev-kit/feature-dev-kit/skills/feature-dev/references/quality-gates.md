# Quality Gates

Station 9 runs every gate below, in order, once. A failing gate blocks later gates in that sweep.
Between layers (Stations 3–7) and on a **patch** run, run only `run-gates.sh --until fsd`
(types, lint, fsd). `yarn build` and `yarn test:auto` are Station 9, not per layer.

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

1. Identify the first failing gate. The transcript is `.spec/.gate-log`. Pass that **path** to the fix engineer, not the transcript.
2. The engineer applies the smallest diff that can make that gate pass, then writes a handoff file.
3. Re-run the failed gate plus `types` (`run-gates.sh --only types`, then `--only <failed>` when they differ).
4. Re-run `fsd` only if the fix touched imports. Re-run `coverage` only if the fix touched tests. Do not run `yarn build` after a type error.
5. If the same gate fails again after 2 more attempts (3 total), escalate. Set spec status to `awaiting-human`. Stop.

A green layer gate (`--until fsd`) does not replace the Station 9 sweep.
