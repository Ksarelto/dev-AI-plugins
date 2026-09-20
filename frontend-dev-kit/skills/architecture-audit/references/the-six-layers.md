# The six layers

What each layer owns and who may import it. A layer imports only strictly below. `pages/` and `app/` may import `features/` and `widgets/` via public APIs. No `processes/`.

```
app/ → pages/ → widgets/ → features/ → entities/ → shared/
```

## Evaluate

**Hard**

- `app/`: providers, router, root boundaries, `main.tsx`. Nobody below imports `@/app`. No `ThemeProvider`.
- `pages/`: thin route composition. Only `app/router/` mounts pages. No business rules; no chained `await`s across two features.
- `widgets/`: reusable composition of 2+ features used on 2+ routes. Importers = `pages/` and `app/` only. Features must not import widgets. No widget→widget.
- `features/`: business capabilities. External imports only `@/features/{name}` (or `/index`). No feature→feature, feature→widget, feature→app/pages.
- `entities/`: public API only. May import other entities via `index.ts` or `@x`. Never `features/`. `shared/` must not import `entities/`.
- `shared/`: generic only. No upward imports.
- Business types (`Money`, `OrderId`) are not in `shared/model/`. `shared/model/` holds non-business shapes (`Rect`, `Point`).

**Judgment**

- Widget that exists for a composition still used on exactly one route (see lifecycle).
- Entity vs `shared/model/` for a type that might be business.

## How

```bash
rg -n "from ['\"]@/app" src/{pages,widgets,features,entities,shared}
rg -n "from ['\"]@/widgets" src/features
rg -n "from ['\"]@/entities" src/shared
rg -n "from ['\"]@/(features|widgets|pages|app)" src/shared
```

Read `src/pages/**/index.tsx` for sequential cross-feature `await`s. Sample `src/shared/model/` for business nouns. Confirm `app/` has `providers/`, `router/`, `boundaries/`, `main.tsx`.
