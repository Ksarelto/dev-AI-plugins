# Enforcement

Layer rules that are not in CI will drift. Check that the app actually enforces the graph, and know what CI cannot see.

## Evaluate

**Hard (tooling present and complete)**

- ESLint `no-restricted-imports`: deep-import ban for features/entities/widgets (only `index`); from inside a feature, no `@/features/*`, no `@/widgets/*`, no `@/app`/`@/pages`; widgets no sibling widgets, no `@/app`/`@/pages`; `ky`/`axios` banned in features/widgets/entities; `shared/` no upward imports (including entities); entity `@x` negation is `!@/entities/*/@x` (directory, no trailing `/**`).
- ESLint `no-restricted-syntax`: `queryKey` + inline `ArrayExpression` forbidden outside `src/shared/api/query-keys/**`.
- Auth extras: vendor packages (`oidc-client-ts`, `react-oidc-context`, `@azure/msal-*`) confined to `shared/lib/auth/**`. dependency-cruiser `auth-token-accessor-is-for-shared-api-only` (features/widgets/entities/pages ↛ `shared/lib/auth/token`).
- dependency-cruiser: `no-circular`, `features-no-cross-import`, `widgets-no-cross-import`, `features-not-into-widgets`, `no-upward-imports`, `entities-no-upward`, `features-not-above`, `widgets-not-above`, `ui-not-api`, `entity-ui-not-api`, `models-not-api`. `tsPreCompilationDeps: true`. `ui-not-api` must use `$1` group matching, not regex `\1`.
- Scripts or equivalent: no widget `models/`/`api/` dirs; segment spelling; kebab-case component files; graph-level same-layer edge check (`check-no-cross-slice-edges.mjs` **requires** `graph.json` as argv).
- Type-only imports still count (`allowTypeImports` must not be `true` on boundary rules).
- Missing ESLint, depcruise, or the above rules is a finding — not a skip.
- CI: eslint, depcruise, graph.json + edge script, widget-model script, segment-names script, `tsc --noEmit`. Warnings drift — these are errors except `no-orphans`.

**Review-only (CI will not catch — still report as judgment)**

- `models/` importing React / `ky` / `@tanstack/react-query` from node_modules (`zustand` is the allowed exception).
- `models/` function that takes effectful steps as parameters.
- Segment *content* vs name; widget promotion threshold.
- No `core-is-pure` depcruise rule — `models-not-api` is the rule that exists.

**Judgment**

- Generating a full ESLint/depcruise config: only if the user confirmed this finding.

## How

```bash
ls eslint.config.* .dependency-cruiser.js scripts/check-no-widget-model.sh \
   scripts/check-segment-names.sh scripts/check-no-cross-slice-edges.mjs \
   scripts/check-component-file-names.sh
```

Read the ESLint and depcruise configs against the list above. If they exist, run them:

```bash
npx eslint src
npx depcruise src
```

Treat every error as a hard violation with topic `enforcement`. Flat-config trap: a later `no-restricted-imports` block **replaces** an earlier one — `ui/` files must restate the feature/entity bans, not only `../api`. Auth vendor block must restate, not assume merge.
