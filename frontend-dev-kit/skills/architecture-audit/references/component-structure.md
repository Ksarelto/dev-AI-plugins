# Component structure

One kebab-case folder per component under every `ui/` tree. The file name matches the folder. The export is PascalCase.

## Evaluate

**Hard**

- Path: `item-card/item-card.tsx`, export `ItemCard`. Forbidden: `ItemCard.tsx`, `itemCard.tsx` at the component path.
- Required per component folder: `{name}.tsx`, `{name}.test.tsx`, `{name}.stories.tsx`, `styles.ts`, `index.ts` (named exports, no `export *`).
- Outside the slice, import the component via the slice `index.ts` or the component folder `index.ts` — not a nested `ui/child` path from another slice.
- Form zod schemas live in the slice `models/`, not in the component folder.
- Internal subcomponents: `{component}/ui/{sub}/` with their own `index.ts`.

**Judgment**

- `constants.ts` / `types.ts` in the component folder when non-trivial.
- Subcomponent stories optional unless the child has distinct states.

## How

```bash
find src -path '*/ui/*' -name '*.tsx' ! -name 'index.tsx' \
  | awk -F/ '{ print $NF }' | grep -E '[A-Z]' && echo 'uppercase component file'
```

For each component directory under `ui/`:

```bash
ls {dir}/{name}.tsx {dir}/{name}.test.tsx {dir}/{name}.stories.tsx {dir}/styles.ts {dir}/index.ts
```

Missing any of the five is hard. Grep slice `index.ts` for `export *`. Grep other slices for deep `ui/` imports of this component.
