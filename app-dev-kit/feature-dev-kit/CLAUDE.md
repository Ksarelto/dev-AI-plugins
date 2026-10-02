# feature-dev-kit rules

## Git

- Branch: `feature/<ticket>-<slug>` or `nt-<slug>`. Slug is lowercase and hyphenated.
- Commit: `[TICKET] imperative summary`. One logical change. No `WIP`, `fix`, or `update`.
- Humans rebase onto the integration branch and push with `--force-with-lease`. Never `--force`. Agents do not push.
- Do not commit to `main`, `master`, or `develop` directly.
- Shipping is `/create-pr`, typed by a human after spec status is `done`. No agent pushes or opens a PR.
- A PR body comes from the spec (summary, acceptance criteria, FSD impact, test plan). The procedure is the `create-pr` skill.

---

## UI quality

- Every screen has loading, empty, error, and populated. Mutations add pending (controls disabled while `isPending`).
- Every route renders inside `RouteBoundary`; every feature's exported entry renders inside `ErrorBoundary`. One crash never unmounts the app.
- With a bound prototype, `prototype-inventory.md` is the contract: every row is rendered with the same copy, control, variant, field, and state, or marked `n/a: <reason>`.
- Compose existing primitives. Do not build a config-driven table or form factory for one screen.
- One component, one job. A container fetches; a presentational child renders.
- Pick the smallest state tool: local `useState`, then a feature store, then context for read-often values (theme, locale).
- Layout is mobile-first (`sm:` / `md:` / `lg:`). Do not design a desktop-only screen.
- Skeletons match the populated layout. A centered spinner on a list is the loading state only when the layout is unknown.
- No decorative gradients, generic card grids, or placeholder copy that was not in the spec.
