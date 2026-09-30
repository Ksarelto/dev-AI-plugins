# Definition of Done — feature-dev-kit

A standing, project-wide bar every slice clears before the orchestrator advances. Acceptance
criteria vary per feature and answer *"did we build the right thing?"*; this list is the same every
run and answers *"is it finished to our standard?"*. A slice is done only when **both** hold.

Read by the orchestrator before Station 12 and by `code-reviewer` at Station 10.

| | Acceptance criteria | Definition of Done |
|---|---|---|
| Scope | One feature | Every slice, every run |
| Source | The spec's `## Acceptance criteria` | This file |
| Answers | "Did we build this thing?" | "Is it ready?" |

---

## Correctness

- [ ] Every acceptance criterion in the spec has a test that fails without the change
- [ ] Every new or changed executable file has a behavior test; tests mock only the fetcher, router, env, and browser APIs
- [ ] The feature was exercised at runtime, not merely typechecked
- [ ] Existing tests still pass — no regressions
- [ ] Loading, empty, and error states are implemented, not just the happy path
- [ ] Error paths surface a user-visible message, not a silent console log
- [ ] Every route is wrapped in `RouteBoundary`; every feature entry renders inside `ErrorBoundary` — one crash never unmounts the app

## FSD integrity

- [ ] Every new slice has an `index.ts` that re-exports only symbols a file outside that folder already imports — no predicted re-exports, no `export *`, no `shared/ui` mega-barrel
- [ ] No upward imports and no deep imports into another slice's internals
- [ ] Code sits in the lowest layer that can host it — shared logic is not duplicated per slice
- [ ] Entity types are imported from the entity, never re-declared in a feature

## Quality

- [ ] No comments in new code. Naming carries the intent
- [ ] No ternary in JSX, no nested ternary anywhere, no inline `on*` handler, no inline class list, no literal closed-set prop (`ButtonVariant.Outline`, not `"outline"`)
- [ ] The `conventions` gate is green on every file changed on the branch
- [ ] No duplicated business logic across slices
- [ ] No dead code, `console.log`, `TODO`, or commented-out blocks left behind
- [ ] Changes are scoped to the feature — no opportunistic refactors of adjacent files
- [ ] Lint, format, and typecheck pass

## UI standard

- [ ] Keyboard reachable end to end; visible focus on every interactive element
- [ ] Labels on every input; `aria-label` on every icon-only button
- [ ] Contrast ≥ 4.5:1 for text; state is never conveyed by colour alone
- [ ] Renders correctly at 320 / 768 / 1024 / 1440 px
- [ ] Uses design tokens and the spacing scale — no arbitrary pixel values
- [ ] Every user-facing string comes from i18n keys (`add-text-content`), never a literal or a string map
- [ ] shadcn primitives match the registry output — same parts, `data-slot`, classes, and open/close animation; no call-site motion or look overrides
- [ ] With a prototype: `extract-prototype-inventory.mjs --check` passes and the browser check compared every prototype state side by side

## Integration

- [ ] Works inside the running app, not only in isolation or in tests
- [ ] When UI changed, `.spec/features/<slug>.context/browser-check.md` records the real route, the main actions, and one adjacent route that still works
- [ ] Query invalidation covers every cache the mutation affects
- [ ] Route, navigation entry, and permissions are wired where the feature needs them
- [ ] Public interface changes to a shared slice are backward compatible or all call sites updated

## Ship-readiness

- [ ] No secret, token, or environment value committed
- [ ] Untrusted input is validated at the boundary
- [ ] Every gate in `quality-gates.md` is green in the spec's `## Gate log`
- [ ] The human has reviewed and approved at Station 12

---

## Red flags

- "It's done, I just haven't run it" — unverified work is not done.
- "Tests pass" used as a synonym for done while states, a11y, or regressions are unchecked.
- A different bar applied because the feature is small or the run is late.
- Acceptance criteria treated as the whole bar with no standing floor beneath them.
- "Done" declared before the human gate.
