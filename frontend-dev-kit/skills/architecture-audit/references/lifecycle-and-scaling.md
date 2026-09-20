# Lifecycle and scaling

Slices start small, earn segments, and must remain deletable. Widgets exist only after a second route needs the same composition.

## Evaluate

**Hard**

- New slice has `index.ts` from day one.
- Widget must not gain `models/` (plural) or `api/` (also a layers check). Widget `hooks/` that fetch or own a rule → the widget has become a feature; split it out.
- Sub-features: at most one nesting level — `features/billing/{invoices,subscriptions,shared,index.ts}`. `billing/shared` is imported only inside billing.
- Feature delete leftovers: `shared/api/query-keys/{domain}` still present with no fetchers; flag still in `shared/config/flags` / env; `locales/` folder left behind with no feature; anything in `shared/` that existed solely for it.
- One-grep test: `rg '@/features/x'` should return only `app/` (router, plus session provider if `reset()`), the `pages/` that mount it, and `widgets/` that compose it.

**Judgment**

- Widget whose `@/widgets/x` importers are a single route (and maybe `app/`) — premature. Create only after the **second** route needs the same composition.
- Split signals: 15+ `ui/` folders, a 150-line `types.ts`, two teams on one slice, `index.ts` exporting two unrelated groups — suggest a split, do not fail the audit alone.
- Extracting `models/` to a package — verify by hand that nothing framework-shaped snuck in. Do not start with a monorepo.
- Hide / unflag / delete procedure is the `manage-feature` skill, not this audit.

## How

```bash
rg -n "from ['\"]@/widgets/" src/pages src/app src/features src/widgets
find src/features -mindepth 3 -maxdepth 3 -type d
ls src/shared/api/query-keys src/shared/config src/features/*/locales
```

For each widget, count distinct `pages/` folders that import it. For each `query-keys/*.ts`, count importers outside that directory — zero is an orphan (hard if the feature is gone; judgment if the feature still exists but does not fetch). Nested `features/{a}/{b}/{c}/` beyond one extra level is hard. For a nested `shared/` inside a parent feature, grep importers outside that parent.
