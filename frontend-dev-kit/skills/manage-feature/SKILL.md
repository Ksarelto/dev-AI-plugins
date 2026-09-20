---
name: manage-feature
description: Hide a React FSD feature behind a feature flag, turn a flag on or off, remove a flag after launch, or delete a feature slice and every leftover dependency (routes, query keys, locales, flags, entities, e2e, stories). Use when the user asks to flag a feature, disable or enable a feature, unflag it, or remove a feature and clean up connected files.
argument-hint: "[hide|enable|unflag|delete] <feature-name>"
disable-model-invocation: true
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Manage Feature

Architecture source of truth: `docs/frontend/architecturev2/cross-cutting-concerns.md#feature-flags`
and `docs/frontend/architecturev2/lifecycle-and-scaling.md`. Do not invent a second flag mechanism.

## When to use

- Hide an existing feature without deleting it
- Turn a flagged feature on or off
- Remove a flag after the feature is always on
- Delete a feature and every file that existed only for it

Not this skill: scaffolding a new feature (`react-feature`).

Pick **one** procedure per invocation. Do not delete a feature when the user asked to hide it.

---

## 1. Hide behind a feature flag

The feature stays in the tree. Routes and chrome stop reaching it when the flag is off.

1. **Value.** In `shared/config/flags.ts` add the flag key as a plain boolean. Owner and removal
   date are **comments** — not runtime properties:

   ```ts
   // shared/config/flags.ts
   import { env } from './env';

   export const flags = {
     // owner: reports team — remove by 2026-12-01
     reports: env.reportsEnabled,
   } as const;

   export type FlagName = keyof typeof flags;
   export const isEnabled = (name: FlagName) => flags[name];
   ```

   The flag name (e.g. `'reports'`) never lives in a per-feature `config/` file.
   A feature never knows its own flag name.

2. **Env seed.** Ensure the corresponding env var is wired in `shared/config/env.ts`:

   ```ts
   export const env = {
     reportsEnabled: import.meta.env.VITE_REPORTS_ENABLED === 'true',
   } as const;
   ```

3. **Route.** Wrap the route with `RequireFlag` in `app/router/routes.tsx`:

   ```tsx
   import { isEnabled } from '@/shared/config/flags';

   {
     element: <RequireFlag name="reports" />,
     children: [
       { path: '/reports',     element: <ReportsPage /> },
       { path: '/reports/:id', element: <ReportDetailPage /> },
     ],
   }
   ```

4. **Chrome.** Hide nav links, widget slots, and other entry points using the flag name directly:

   ```ts
   import { isEnabled } from '@/shared/config/flags';

   if (!isEnabled('reports')) return null;
   ```

5. **Do not** branch inside `models/`, mappers, or fetchers. A flag is about presence of a
   capability, not a business invariant.

6. Confirm the feature's SSE consumer hook (if any) is only mounted from UI that is already
   behind the flag, or gate `addConsumer` with `isEnabled`.

---

## 2. Enable or disable (flag stays)

The only change is the env variable value that seeds `shared/config/env.ts`.
Do not delete `RequireFlag` or `isEnabled` checks here. That is procedure 3.

---

## 3. Remove the flag (feature stays)

The capability is now always on. The flag is leftover branching.

1. `rg` the flag name string (e.g. `'reports'`) across `src/`.
2. Delete `RequireFlag` wrappers in `app/router/`.
3. Delete `isEnabled(...)` branches in `ui/`, widgets, and nav.
4. Delete the entry from `shared/config/flags.ts` and from `shared/config/env.ts`.
5. Run `rg` again. Zero hits.

---

## 4. Delete the feature and its dependencies

A clean feature deletes in one commit. If the grep below finds files outside the list, the
boundary was leaking — stop and show the extra hits before deleting.

### One-grep test

```bash
rg '@/features/{name}' src --files-with-matches
```

Legal hits: `app/` (router, plus `SessionScope` only if the feature exported `reset()`),
`pages/` that mount it, `widgets/` that compose it. Anything else is a leak.

Also search the un-aliased path and the flag name:

```bash
rg 'features/{name}' src --files-with-matches
rg '{flag-name}' src --files-with-matches
```

### Connected-files sweep

For each row, grep, then delete or update.

| Look here | What to do |
|-----------|------------|
| `src/features/{name}/` | Delete the slice |
| `src/pages/` that import it | Delete the page folder, or remove the composition if the page hosts others |
| `src/widgets/` that import it | Remove the feature from the widget, or delete the widget if it exists only to compose this feature |
| `src/app/router/routes.tsx`, layouts, guards | Remove the route, `lazyFeature` import, and `RequireFlag` if it existed only for this feature |
| `src/shared/api/query-keys/{domain}.ts` | Delete the file, or remove this feature's keys if the domain is shared. **Easy to miss:** leftover factories still type-check |
| `src/features/{name}/locales/` and i18n registration | Already gone with the slice; drop the namespace from i18n config if it was registered centrally |
| `shared/config/flags.ts` and `shared/config/env.ts` | Remove this feature's flag entry and env var |
| `src/entities/` | Delete an entity **only** if this feature was its last consumer (`rg '@/entities/{e}'`). Do not delete a noun other features still import |
| `src/shared/` | Delete a `shared/` unit only if it existed solely for this feature (the one-grep test on that unit returns nothing above `shared/`) |
| `e2e/` | Delete specs that target this feature's routes |
| `**/*.stories.tsx` | Delete stories under the feature; grep the feature name in other story files |
| `CODEOWNERS` | Remove the feature path |
| Tests under other slices | There should be none (no cross-slice tests). If a test imports this feature, that test was already a boundary violation — delete the import or the test |

### After deletion

1. `rg` the feature name, its route path, its flag, and its query-key factory one more time.
2. Fix remaining imports — do not leave commented-out mounts.
3. If an entity or widget was deleted, repeat the one-grep test for that slice.

---

## Checklist

- [ ] Chose hide, enable/disable, unflag, or delete — not a mix
- [ ] Flag values are plain booleans in `shared/config/flags.ts` seeded from `shared/config/env.ts`
- [ ] Flag name string (`'reports'`) is used directly in chrome — no per-feature `config/featureFlags.ts`
- [ ] `isEnabled(name)` returns `flags[name]` — not `flags[name].enabled`
- [ ] Owner and removal date are code comments, not runtime properties
- [ ] No `isEnabled` / flag reads inside `models/`
- [ ] Delete: one-grep test passed; query-keys, flags, env vars, locales, routes, widgets, orphan entities, e2e, stories, CODEOWNERS all checked
