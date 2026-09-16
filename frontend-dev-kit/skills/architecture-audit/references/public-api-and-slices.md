# Public API and slices

Each feature, widget, and entity exposes exactly one public entry: `{slice}/index.ts`. Nothing outside the slice reaches past it. Named re-exports only.

## Evaluate

**Hard**

- Every slice has `index.ts`. Outside imports are `@/features/{x}`, `@/entities/{x}`, `@/widgets/{x}` — not `@/features/{x}/hooks/...`, `@/features/{x}/models/...`, etc. (`/index` suffix is allowed.)
- Slice `index.ts`: no `export *`.
- No segment barrel: `features/x/ui/index.ts` must not re-export every component. Per-component-folder `index.ts` is required, not a finding.
- `@x` only on **entities**: file at `entities/{provider}/@x/{consumer}.ts`; consumer imports `@/entities/{provider}/@x/{consumer}`. Never feature↔feature `@x`.
- Do not export from a feature public API: internal stores, DTOs, raw fetchers, hand-typed key objects.
- Mountable UI: export `{Component}` and `{Component}Props` from slice `index.ts`.
- Optional `reset()` on feature `index.ts` is for `app/` only (logout/tenant) — not for pages, widgets, or other features.

**Judgment**

- Second entry point (e.g. `@/features/reports/charts`) for a heavy sub-area — allowed if documented and rare.
- Over-exporting internals that happen to be typed.

## How

```bash
rg -n "export \*" src/{features,widgets,entities} --glob "**/index.ts"
rg -n "from ['\"]@/features/[^'\"]+/" src --glob "!**/features/**"
rg -n "from ['\"]@/features/" src/features
rg -n "from ['\"]@/entities/[^'\"]+/" src --glob "!**/entities/**"
```

Glob `**/@x/**` — must sit under `entities/{name}/@x/`. Glob `src/features/*/ui/index.ts` and read: a barrel that re-exports every sibling folder is a violation; a component-folder `ui/item-card/index.ts` is not.

For each slice `index.ts`, confirm named exports only and that consumers do not import deep paths.
