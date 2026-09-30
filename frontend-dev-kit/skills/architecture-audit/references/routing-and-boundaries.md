# Routing and boundaries

The route table lives in `app/router/`. Pages are lazy. Guards wrap routes — they are not `if (!user)` inside a page. Each data surface owns loading/error/empty.

## Evaluate

**Hard**

- Structure: `app/router/routes.ts` spreads `auth/`, `error/`, and `root/`. Each group is `routes.tsx` plus `index.ts`. `layouts/AppLayout.tsx` is the authenticated chrome. No `AuthLayout`. `guards/` (`RequireAuth`, `RequirePermission`, `RequireFlag`) compose as wrappers — they do not nest logic. A new URL in `routes.ts` itself is hard.
- Pages lazy per route via `lazyFeature('name', () => import('@/pages/checkout'))`. Bare `React.lazy` on a page route is hard.
- `lazyFeature` classifies module-load failures as `FeatureLoadError`. Route boundary: chunk-load cause → reload; other init failure → crash screen. Do not rely on a feature `Shell` as the only boundary on a lazy route.
- No auth `if (!user) return <Login/>` inside pages — use guard wrappers. Do not fetch the session in a React Router **loader** (`getToken()` there reintroduces the singleton).
- Feature flags: names/values in `shared/config/flags`. Features do not reference their own flag. Gate with `RequireFlag` at the route (or `isEnabled()` in chrome).
- URL owns filters, pagination, sort, selected id, tab, wizard step.
- Layouts must not fetch data needed by only one child.
- Boundaries, four levels, one crash never blanks the app:
  - root at `app/boundaries/`;
  - every route element wrapped in `RouteBoundary` (ErrorBoundary + Suspense, `resetKeys` on the path) — a route without it is hard;
  - every feature's public entry component renders `<ErrorBoundary>` from `@/shared/ui/error-boundary` around its content, with the feature's hooks below the boundary — a feature entry without it is hard;
  - the entity/feature UI shell for loading/error/empty.
- One shared `ErrorBoundary` in `shared/ui/error-boundary/`; nothing else imports `react-error-boundary`. Fallbacks are translated and never render `error.message`.
- Entity/feature UI shell owns loading/error/empty for its data. A widget uses Suspense only — not a combined error UI or retry for composed features.
- Env parsing at `shared/config` at boot — not throwing at feature module scope. Store creation in a factory the provider calls, not throwing at import.
- List surfaces: loading, error, empty, partial/stale handled explicitly.
- Expected business outcomes are return values, not ErrorBoundaries.

**Judgment**

- Page over ~120 lines — likely a missing widget or feature.
- Prefetch on hover is recommended, not required.
- Component-level `lazy()` only for genuinely heavy conditional UI (editor, chart, map, PDF).

## How

```bash
ls src/app/router src/app/boundaries src/pages
rg -n "lazy\(|lazyFeature\(" src/app/router
rg -n "if \(!.*user|Navigate to=.*login|return <Login" src/pages
rg -n "RequireAuth|RequirePermission|RequireFlag" src/app/router
rg -n "isEnabled\(|flags\." src/features
rg -n "getToken\(" src/**/loader.ts src/pages
rg -n "element:" src/app/router --glob "routes.tsx" | rg -v "withRouteBoundary|RouteBoundary|Require|Layout"
for d in src/features/*/; do rg -q "<ErrorBoundary" "$d" || echo "no boundary: $d"; done
rg -n "from ['\"]react-error-boundary" src --glob "!**/shared/ui/error-boundary/**"
```

Read `auth/routes.tsx`, `root/routes.tsx`, and `error/routes.tsx`: every data route should be lazy and, where siblings are guarded, this one too. `routes.ts` only spreads the three arrays. `AuthLayout` is hard. Sample list UIs for the four states. Flag names inside `features/*/config` or `models/` are hard.
