# Component structure

One kebab-case folder per component under every `ui/` tree. The file name matches the folder. The export is PascalCase.

## Evaluate

**Hard**

- Path: `item-card/item-card.tsx`, export `ItemCard`. Forbidden: `ItemCard.tsx`, `itemCard.tsx` at the component path.
- Required per component folder: `{name}.tsx`, `{name}.test.tsx`, `styles.ts`, `index.ts` (named exports, no `export *`). `types.ts` when the component has props.
- Stories are not required on every component folder. Hard only for: `shared/ui/<name>/<name>.stories.tsx` (one file per shared primitive) and `features/<slice>/<slice>.stories.tsx` (one story for the feature's public entry). A story inside a feature's inner `ui/` part, or on an entity or widget component, is not required.
- Outside the folder, import via that folder's `index.ts` — never `item-card/ui/item-card-header` from another slice. Outside the slice, still go through the slice `index.ts` (or the component folder `index.ts` within the same slice).
- Form zod schemas live in `ui/` (the form's component folder is fine). Business invariants they call live in the slice `models/` as pure functions — see state-ownership. Do not park the form schema in `models/` or invent it in the submit handler.
- `{name}.tsx` calls the owning layer's `hooks/`, never a bare `api/` import.
- Internal subcomponents: `{component}/ui/{sub}/` with their own `index.ts`.

**Judgment**

- `constants.ts` / `types.ts` in the component folder when non-trivial.
- Subcomponent stories are not required.

## How

```bash
find src -path '*/ui/*' -name '*.tsx' ! -name 'index.tsx' \
  | awk -F/ '{ print $NF }' | grep -E '[A-Z]' && echo 'uppercase component file'
```

For each component directory under `ui/`:

```bash
ls {dir}/{name}.tsx {dir}/{name}.test.tsx {dir}/styles.ts {dir}/index.ts
```

Missing any of those four is hard. A missing `{name}.stories.tsx` is hard only under `shared/ui/`. A feature slice with no `<slice>.stories.tsx` at the slice root is hard. Grep slice `index.ts` for `export *`. Grep other slices for deep `ui/` imports of this component.
