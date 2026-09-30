# Quality Gates

Station 9 runs every gate below, in order, once. A failing gate blocks later gates in that sweep.
Between layers (Stations 3–7) run only `run-gates.sh --until fsd` (types, lint, fsd) — tests are
written at Station 8, so `conventions` would report every new file as `missing-test`. A **patch**
run walks Station 8 first and then runs `run-gates.sh --until conventions`. `yarn build` and
`yarn test:auto` are Station 9, not per layer.

---

## Gate Table

| # | Gate | Command | Pass condition | Fail → action |
|---|------|---------|---------------|---------------|
| 1 | Types | `yarn typecheck` | Exit 0, zero TypeScript errors | Enter fix loop |
| 2 | Lint | `yarn lint` | Exit 0, zero ESLint + Stylelint errors | Enter fix loop |
| 3 | FSD boundaries | `yarn lint:fsd` (Steiger) | No upward imports, no cross-slice internal imports, every slice has `index.ts` | Enter fix loop |
| 4 | Conventions | `node scripts/check-conventions.mjs` (kit script, run by `run-gates.sh`; changed files vs `HEAD` + untracked, plus `--base <ref>`) | Zero errors (warnings allowed) | Enter fix loop |
| 5 | Build | `yarn build` | Vite build succeeds, exit 0 | Enter fix loop |
| 6 | Coverage | `yarn test:auto` | branches ≥73%, functions ≥78%, lines ≥87%, statements ≥86% | Enter fix loop |
| 7 | Architecture audit | `architecture-auditor` (REPORT_ONLY, changed paths + importers) | Zero **hard** violations | Enter fix loop. Missing agent/companion skill → ESCALATION_PACKET |
| 8 | Auto-review | `code-reviewer` (companion `code-review/references/`, not the `code-review` skill) | No findings tagged `[CRITICAL]`; no unresolved `[IMPORTANT]` findings | Enter fix loop |

The conventions gate enforces the mechanically checkable frontend-dev-kit rules on changed `src/` files:

| Rule | Severity | Catches |
|------|----------|---------|
| `missing-test` | error | Executable file (has a function, class, or top-level call) with no `<name>.test.ts(x)` beside it or in a `tests/` folder up the tree. Exempt: `index`, `types`, `constants`, `styles`, stories, `locales/`, `main` |
| `comment` | error | Any comment except `/// <reference …>` and `@vite-ignore` |
| `lint-directive` | warn | `eslint-disable` / `eslint-enable` |
| `inline-class` | error | String, template, or `cn('…')` literal in `className`; ternary in `className`; `style={…}` outside `shared/ui` |
| `nested-ternary` | error | A ternary inside a ternary |
| `jsx-ternary` | warn | A ternary inside JSX (outside `shared/ui`) |
| `inline-handler` | error | Arrow/function expression in an `on*` prop (outside `shared/ui`) |
| `hardcoded-copy` | error | JSX text; string literals rendered in JSX; literal `aria-label`/`alt`/`title`/`placeholder`/`label`/`description`; `notify`/`toast` literals; zod message literals |
| `string-map` | error | Object literal with English copy values outside `locales/` |
| `magic-prop` | error | Literal `variant`/`size`/`type`/`side`/`align`/`orientation`/`intent` on a component outside `shared/ui` |
| `unused-export` | error | Export (or `index.ts` re-export) no other non-test `src` file imports. `shared/ui` is exempt |
| `export-star` | error | `export * from` |
| `motion-utility` | error | `animate-*`, `transition*`, `duration-*`, `delay-*`, `ease-*`, `fade-*`, `slide-*`, `zoom-*` in a `styles.ts` outside `shared/ui` |
| `motion-css` | warn / error | `@keyframes`, `--animate-*`, `animation:` in CSS (warn); `tw-animate-css` imported twice (error) |

It loads the host app's `typescript` package (5.x/6.x compiler API). TypeScript 7 ships no JS API — add `typescript-api@npm:typescript@^6` as a dev dependency. The script exits 2 when neither resolves; report that as a setup failure, never as a pass.

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
| Lint | Hardcoded UI string | Add an i18n key via `add-text-content` (`frontend-dev-kit:i18n`) |
| FSD boundaries | Deep import into slice internals | Add the symbol to the slice's `index.ts`; update the import path |
| FSD boundaries | Upward import | Move the shared code into `shared/`; remove the upward reference |
| FSD boundaries | Missing `index.ts` | Create `index.ts` with named re-exports only for symbols a file outside the folder already imports |
| Conventions | `missing-test` | `test-engineer` writes the listed test (behavior, boundary mocks only) |
| Conventions | `comment` | Delete the comment; if the code needs it, extract a function whose name says it |
| Conventions | `unused-export` | Drop the `export` keyword or the `index.ts` line — do not add an import to justify it |
| Conventions | `hardcoded-copy` / `string-map` | Move the text to the slice's `locales/en.json` + `keys.ts` (or `common`), render `t(key)` (`add-text-content`) |
| Conventions | `inline-class` / `motion-utility` | Move classes to `styles.ts`; remove motion from non-`shared/ui` styles — the primitive animates itself |
| Conventions | `inline-handler` / `nested-ternary` / `jsx-ternary` | Named `handleX` above the return; compute the branch before the return or use early returns |
| Conventions | `magic-prop` | Import the constant from the primitive (`ButtonVariant.Outline`); drop props set to their default |
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
4. Re-run `fsd` only if the fix touched imports. Re-run `conventions` after any source edit (it is fast). Re-run `coverage` only if the fix touched tests. Do not run `yarn build` after a type error.
5. If the same gate fails again after 2 more attempts (3 total), escalate. Set spec status to `awaiting-human`. Stop.

A green layer gate (`--until fsd`) does not replace the Station 9 sweep.
