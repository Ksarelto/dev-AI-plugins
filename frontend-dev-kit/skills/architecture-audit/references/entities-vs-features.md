# Entities vs features

An entity is a real-life business noun that **two or more features** need. A single-feature concept stays in `features/{f}/models/`. Entities may own a canonical query; feature-specific operations stay on the feature.

## Evaluate

**Hard**

- Entity→entity via `@/entities/{other}` (`index.ts`), not `@/entities/{other}/model/...`. Graph is acyclic.
- `@x` path: `entities/{A}/@x/{B}.ts` exports only the slice entity B needs. Provider folder, consumer filename. Prefer an id reference, then a type parameter, before `@x`. `@x` is a type/narrow export — never a live object graph to dodge the id-reference rule.
- Default relations: `customerId: string`, not a nested live `Customer` object.
- Not entities: DTOs/view-models, single-feature helpers, generic geometry → `shared/model/`.
- Entity `api/` + `endpoints.ts` only for canonical ops (the noun's own query/command). Feature operations (`placeOrder`) do not live on the entity.
- A class with `fromDTO` / invariants is **optional**, not required. Plain object + mapper is the default; a class is earned when construction must enforce an invariant (`Money` rejecting negatives).
- Cross-model policy (order total spanning cart × tier × tax) lives in the owning feature's `models/`, not on an entity.

**Judgment**

- Promote to `entities/{name}/` when ≥2 features need the noun; one consumer is premature.
- Nested concept still inside `entities/order/model/` vs split `entities/{name}/` — split on the second **independent** consumer.
- Whether an `api/` method is canonical vs a feature operation.

## How

For each `src/entities/{name}`:

```bash
rg -l "from ['\"]@/entities/{name}['\"]" src/features
rg -n "from ['\"]@/entities/{name}/" src
```

Count distinct feature folders in the first result. One feature → premature entity (judgment). Zero features and only pages/widgets → check whether it should be `shared/model/` or still an entity used from widgets.

Grep entity `model/` for nested object fields that should be ids. Read entity `api/` and ask: is this the noun's canonical fetch, or a use-case that belongs on a feature?
