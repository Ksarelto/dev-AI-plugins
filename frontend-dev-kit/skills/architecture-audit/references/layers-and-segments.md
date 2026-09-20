# Layers and segments

Six layers, top-down. Group by business capability, not by technical type. A slice has one `index.ts`. Dependencies point down; same-layer slices do not import each other. Business logic lives in `models/` as plain functions and stores.

## Evaluate

**Hard**

- Tree under `src/`: `app/`, `pages/`, `widgets/`, `features/`, `entities/`, `shared/`. No `processes/`.
- Slice segments (features/widgets/entities) are a closed set: `ui/`, `api/`, `model/` or `models/`, `lib/`, `config/`, `hooks/`, `tests/`, `locales/`.
- `shared/` extra (not slice segments, still legal): `ui/`, `api/`, `lib/`, `model/`, `hooks/`, `config/`, `assets/`. Pages may have `index.tsx`, optional `ui/`, optional `loader.ts`.
- Forbidden at slice level (`features|widgets|entities/{name}/`): `components/`, `types/`, `utils/`, `helpers/`, `domain/`, `application/`, `state/`.
- Features use `models/` (plural directory). Entities use `model/` (singular **folder**, never `model.ts`). No `features/*/model/`, no `entities/*/models/`.
- Widgets: no `models/` and no `api/`. Optional singular `model/` for widget-local UI state only.
- New feature default is `api/ + ui/ + index.ts` — empty scaffolded `models/`/`hooks/` is a smell (judgment), not a missing folder.
- Feature `api/` that exists must include `endpoints.ts`. Same for entity `api/`.
- `shared/lib/` units use canonical names (`auth`, `i18n`, `notify`, `permissions`, `analytics`, `logger`, `modals`, `clock.ts`, `ids.ts`, `lazyFeature.ts`). No synonyms (`datetime/` next to `clock.ts`, `rbac/` next to `permissions/`). Keep `auth/` distinct from `permissions/`.
- Inside a feature: `ui/` → `hooks/` → `models/`; `hooks/` ↘ `api/` → `models/`. `ui/` never imports `api/`. `models/` never imports any `api/` (own, other slice, `shared/api`) or React/DOM.
- Feature `api/` may import entity **types** only — never an entity's canonical query. `hooks/` is the only feature segment that may call `@/entities/{name}` query APIs (via `index.ts`).
- `models/` may import `entities/*` types + pure functions via `index.ts`, never `entities/*/api/`.
- Persist carve-out: a Zustand **store** file may name `sessionStorage`/`localStorage` in `persist`'s `storage`. A pure rule function never touches `window`/DOM/storage.

**Judgment**

- A new `shared/lib/` name that is a synonym of an existing unit.
- A folder where a single file would do (or the reverse).
- `models/` importing React / `ky` / `@tanstack/react-query` from node_modules (`zustand` in a store file is allowed).

## How

```bash
ls src/
find src/features src/widgets src/entities -mindepth 2 -maxdepth 2 -type d
find src/features -mindepth 2 -maxdepth 2 -type d -name model
find src/entities -mindepth 2 -maxdepth 2 -type d -name models
find src/entities -mindepth 2 -maxdepth 2 -type f -name model.ts
find src/widgets -mindepth 2 -maxdepth 2 -type d \( -name models -o -name api \)
find src/{features,widgets,entities} -mindepth 2 -maxdepth 2 -type d \
  \( -name components -o -name types -o -name utils -o -name helpers -o -name domain -o -name application -o -name state \)
rg -n "from ['\"].*api" src/features/*/ui src/entities/*/ui
rg -n "from ['\"]@/entities/.*/api" src/features/*/api
```

Glob `src/features/*/api/` and confirm `endpoints.ts`. List `src/shared/lib/` and compare to the canonical set.
