# Component structure

One kebab-case folder per component under every `ui/` tree. The file name matches the folder. The export is PascalCase.

## Evaluate

**Hard**

- Path: `item-card/item-card.tsx`, export `ItemCard`. Forbidden: `ItemCard.tsx`, `itemCard.tsx` at the component path.
- One component per `.tsx` file. A second component is `{component}/ui/{child}/` with the same shape. The only exception is a file that configures an external library's compound parts (a re-homed shadcn/Radix primitive exporting `Dialog`, `DialogTrigger`, `DialogContent`, and the rest).
- The props `interface` is declared in the component file, above the component. It is not in `types.ts`.
- Required per component folder: `{name}.tsx`, `tests/{name}.test.tsx`, `styles.ts`, `index.ts` (named exports, no `export *`). `types.ts` only when the folder has non-prop types (a view union, a row model). Domain types live in the slice model folder (`features/*/models/types.ts`, `entities/*/model/types.ts`). A `VariantProps` type derived from `cva` stays in `styles.ts`.
- Helpers and view mappers used only by this component live in `{component}/utils.ts`, tested from `{component}/tests/`. DTO mappers stay in the slice `api/`. Slice-wide helpers stay in the slice `lib/`. A `mapX.ts` or `formatX.ts` next to `{name}.tsx` is hard.
- Stories are not required on every component folder. Hard only for: `shared/ui/<name>/<name>.stories.tsx` (one file per shared primitive) and `features/<slice>/<slice>.stories.tsx` (one story for the feature's public entry). A story inside a feature's inner `ui/` part, or on an entity or widget component, is not required.
- Outside the folder, import via that folder's `index.ts` — never `item-card/ui/item-card-header` from another slice. Outside the slice, still go through the slice `index.ts` (or the component folder `index.ts` within the same slice).
- Form field rules live on `FormFieldConfig` in the form component (`rhf-form`). Business invariants they call live in the slice `models/` as pure functions — see state-ownership. Do not park field rules in `models/` or invent them in the submit handler.
- `{name}.tsx` calls the owning layer's `hooks/`, never a bare `api/` import.
- Nested components: `{component}/ui/{child}/` with the same files, including their own `tests/`. A nested component as a sibling file of `{name}.tsx` is hard.
- A string or number literal that copies a constant already defined in `shared/api`, the slice `config/`, or this folder's `constants.ts`. One occurrence is enough. A literal used once in an obvious spot (`length - 1`, `0`, `1`) is not a finding.

**Judgment**

- `constants.ts` when the component has closed-set values. `types.ts` when it has non-prop types. Neither file exists "for later".
- Other unexplained string or number literals in the component or its `constants.ts` / `types.ts`. Closed-set prop strings (`variant="outline"`) are one case; timeouts, page sizes, status strings, and z-index numbers are the rest.
- Subcomponent stories are not required.

## How

```bash
find src -path '*/ui/*' -name '*.tsx' ! -name 'index.tsx' \
  | awk -F/ '{ print $NF }' | grep -E '[A-Z]' && echo 'uppercase component file'
```

For each component directory under `ui/`:

```bash
ls {dir}/{name}.tsx {dir}/tests/{name}.test.tsx {dir}/styles.ts {dir}/index.ts
```

Missing any of those four is hard. A `{name}.test.tsx` beside `{name}.tsx` is hard — it belongs in `tests/`. A props `interface` in `types.ts`, or a second authored component in the same `.tsx` (the external-library compound file excepted), is hard. A missing `{name}.stories.tsx` is hard only under `shared/ui/`. A feature slice with no `<slice>.stories.tsx` at the slice root is hard. Grep slice `index.ts` for `export *`. Grep other slices for deep `ui/` imports of this component.

```bash
rg -n "interface \w+Props" src --glob "**/types.ts"
rg -n "['\"][a-z0-9_-]{2,}['\"]" src --glob "**/*.{ts,tsx}" --glob "!**/locales/**" --glob "!**/*.test.*"
```

The props-interface grep is a lead: a `*Props` interface in `types.ts` is a finding. The string grep is a lead for magic strings; confirm each hit is unexplained before filing it. Magic numbers are a spot-read of the same files (`30000`, page sizes, z-index), not a regex that flags every digit.
