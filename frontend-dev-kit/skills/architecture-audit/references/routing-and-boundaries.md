# Routing and boundaries

The route table lives in `app/router/`. Pages are lazy. Guards wrap routes — they are not `if (!user)` inside a page. Each data surface owns loading/error/empty.

## Evaluate

**Hard**

- Structure: `app/router/routes.tsx`, `layouts/`, `guards/` (`RequireAuth`, `RequirePermission`, `RequireFlag`).
- Pages lazy per route: `lazy(() => import('@/pages/users'))` or `lazyFeature('name', () => import('@/pages/checkout'))`.
- No auth `if (!user) return <Login/>` inside pages — use guard wrappers.
- Feature flags: names/values in `shared/config/flags`. Features do not reference their own flag. Gate with `RequireFlag` at the route (or `isEnabled()` in chrome).
- URL owns filters, pagination, sort, selected id, tab, wizard step.
- Layouts must not fetch data needed by only one child.
- Boundaries: root at `app/boundaries`; per-route ErrorBoundary + Suspense around lazy features/widgets.
- Entity/feature UI shell owns loading/error/empty for its data. A widget uses Suspense only — not a combined error UI for composed features.
- Env parsing at `shared/config` at boot — not throwing at feature module scope.
- List surfaces: loading, error, empty, partial/stale handled explicitly.

**Judgment**

- Page over ~120 lines — likely a missing widget or feature.
- Prefetch on hover is recommended, not required.

## How

```bash
ls src/app/router src/app/boundaries src/pages
rg -n "lazy\(|lazyFeature\(" src/app/router
rg -n "if \(!.*user|Navigate to=.*login|return <Login" src/pages
rg -n "RequireAuth|RequirePermission|RequireFlag" src/app/router
rg -n "isEnabled\(|flags\." src/features
```

Read `routes.tsx`: every data route should be lazy and, where siblings are guarded, this one too. Sample list UIs for the four states. Flag names inside `features/*/config` or `models/` are hard.
