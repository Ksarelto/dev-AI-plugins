# Layers and segments

Six layers, top-down. Group by business capability, not by technical type. A slice has one `index.ts`. Dependencies point down; same-layer slices do not import each other. Business logic lives in `models/` as plain functions and stores.

## Evaluate

**Hard**

- Tree under `src/`: `app/`, `pages/`, `widgets/`, `features/`, `entities/`, `shared/`. No `processes/`.
- Allowed slice segments only: `ui/`, `api/`, `model/` or `models/`, `lib/`, `config/`, `hooks/`, `tests/`, `locales/`. Plus `shared/model/`.
- Forbidden at slice level (`features|widgets|entities/{name}/`): `components/`, `types/`, `utils/`, `helpers/`, `domain/`, `application/`.
- Features use `models/` (plural directory). Entities use `model/` (singular **folder**, never `model.ts`). No `features/*/model/`, no `entities/*/models/`.
- Widgets: no `models/` and no `api/`. Optional singular `model/` for widget-local UI state only.
- New feature default is `api/ + ui/ + index.ts` — empty scaffolded `models/`/`hooks/` is a smell (judgment), not a missing folder.
- Feature `api/` that exists must include `endpoints.ts`. Same for entity `api/`.
- `shared/lib/` units use canonical names (`auth`, `i18n`, `notify`, `permissions`, `analytics`, `logger`, `modals`, `clock.ts`, `ids.ts`, `lazyFeature.ts`). No synonyms (`datetime/` next to `clock.ts`, `rbac/` next to `permissions/`).

**Judgment**

- A new `shared/lib/` name that is a synonym of an existing unit.
- A folder where a single file would do (or the reverse).

## How

```bash
ls src/
find src/features src/widgets src/entities -mindepth 2 -maxdepth 2 -type d
find src/features -mindepth 2 -maxdepth 2 -type d -name model
find src/entities -mindepth 2 -maxdepth 2 -type d -name models
find src/entities -mindepth 2 -maxdepth 2 -type f -name model.ts
find src/widgets -mindepth 2 -maxdepth 2 -type d \( -name models -o -name api \)
find src/{features,widgets,entities} -mindepth 2 -maxdepth 2 -type d \
  \( -name components -o -name types -o -name utils -o -name helpers -o -name domain -o -name application \)
```

Glob `src/features/*/api/` and confirm `endpoints.ts`. List `src/shared/lib/` and compare to the canonical set.
