---
name: react-component
description: Scaffold a standalone React component folder with the mandatory files — kebab-case name.tsx (button.tsx, custom-button.tsx), styles.ts (required, no exceptions), index.ts, types.ts — following FSD layer conventions. Use when adding a single component outside a full feature slice or wrapping a shadcn primitive.
---

# React Component

## When to use

- Adding a single component to `shared/ui/` (generic, business-agnostic) or a feature's `ui/` folder (business-specific)
- Wrapping a shadcn/ui primitive in a reusable wrapper
- User asks to "create a component" or "scaffold a component"

For a full feature (api hooks + components + types), use the `react-feature` skill instead.

## Where it lives

| Component is... | Goes in |
|-----------------|---------|
| Generic, reused across features, no business meaning (`Button`, `DataTable`, `EmptyState`) | `src/shared/ui/{name}/` |
| Specific to one feature (`UserAvatar`, `OrderStatusBadge`) | `src/features/{feature}/ui/{name}/` |
| A route-level composition of feature components | Not this skill — belongs in `pages/`, thin, no folder of its own |

`{name}` is kebab-case of the PascalCase export: `Button` → `button/`, `CustomButton` → `custom-button/`, `OrderStatusBadge` → `order-status-badge/`.

If a component built inside a feature turns out to be needed by a second feature, promote it to `shared/ui/` rather than importing across features.

## Component folder structure (mandatory)

Every component lives in its own kebab-case folder. This is the required layout — no exceptions, including one-liners:

```
{TargetPath}/{name}/
├── index.ts                  — re-exports the component; a type or constant only if an outside file imports it
├── {name}.tsx                — JSX implementation (button.tsx, custom-button.tsx)
├── styles.ts                 — ALL Tailwind classes; never inline in JSX
├── types.ts                  — {Name}Props interface (optional but common)
├── constants.ts              — closed-set values and key maps (only when needed)
└── {name}.test.tsx           — colocated behavior test, written in the same change
```

Stories are not part of this folder. A `shared/ui` primitive also gets `{name}.stories.tsx` in that folder. A feature gets one story at `features/<slice>/<slice>.stories.tsx` for the public entry. Entity and widget folders do not get stories.

## Instructions

1. Determine the PascalCase export and kebab-case file stem (`CustomButton` / `custom-button`) and target path from the table above
2. Read rules: `component-structure`, `react`, `styling`, `shadcn`, `i18n`, `testing`, `accessibility`. For FSD placement (`shared/ui` vs feature `ui/`), load `architecture-audit`.
3. Create the component folder with the core files (`index.ts`, `{name}.tsx`, `styles.ts`, `types.ts`) **and** `{name}.test.tsx` in the same change.
4. Every visible string is `t(key)` from the slice's `locales/` or `commonKeys` (`i18n` skill). Server data renders as-is.
5. Handlers are named (`handleX`) and declared above the return; JSX only passes the reference.
6. Branches are computed before the return or written as early returns — no ternary in JSX, never a nested one.
7. Closed-set props on primitives use their constants (`ButtonVariant.Outline`, `ButtonType.Submit`); omit a prop whose value is the default.
8. The templates below carry no comments; the generated files must not either.

## File templates

**`types.ts`:**
```ts
export interface {Name}Props {
  className?: string;
  title: string;
  onSelect: (id: string) => void;
}
```

**`styles.ts` (mandatory — all Tailwind classes go here, never inline in JSX):**
```ts
import { cn } from '@/shared/lib/utils';

export const root = (className?: string): string =>
  cn('flex items-center gap-2 rounded-md', className);

export const label = 'text-sm font-medium text-foreground';
```

Variants use `cva` in the same file (`tailwind-styles` skill § cva). A shadcn base keeps the registry's own `cva` table.

**`{name}.tsx`:**
```tsx
import { useTranslation } from 'react-i18next';
import { Button, ButtonVariant } from '@/shared/ui/button';
import { ordersKeys } from '../../locales/keys';
import * as styles from './styles';
import type { {Name}Props } from './types';

export const {Name} = ({ className, title, onSelect }: {Name}Props): JSX.Element => {
  const { t } = useTranslation();

  const handleSelect = (): void => {
    onSelect(title);
  };

  return (
    <div className={styles.root(className)}>
      <span className={styles.label}>{title}</span>
      <Button
        variant={ButtonVariant.Outline}
        onClick={handleSelect}
      >
        {t(ordersKeys.actions.select)}
      </Button>
    </div>
  );
};
```

**`index.ts`:**
```ts
export { {Name} } from './{name}';
```

Add `export type { {Name}Props } from './types';` only when a file outside the folder imports the props type. Tests import from `./types` directly and are not a reason to re-export.

## shadcn/ui wrapper pattern

When wrapping a shadcn primitive, spread props and merge `className` last through the wrapper's `styles.ts`. No `forwardRef` — React 19 passes `ref` as a plain prop. The wrapper adds behavior or composition, never a new look (a new look is a `cva` variant in the base — `rules/shadcn.mdc`):

```tsx
import type { ComponentProps } from 'react';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';
import * as styles from './styles';

interface PendingButtonProps extends ComponentProps<typeof Button> {
  pending?: boolean;
}

export const PendingButton = ({
  className,
  pending = false,
  disabled,
  children,
  ...props
}: PendingButtonProps): JSX.Element => (
  <Button
    className={styles.root(className)}
    disabled={disabled || pending}
    {...props}
  >
    {pending && <Spinner />}
    {children}
  </Button>
);
```

That wrapper lives at `shared/ui/pending-button/pending-button.tsx` and imports the base from `@/shared/ui/button`. If `shared/ui/<name>` does not exist yet, stop and add the registry primitive first (`shadcn-usage`). Do not author a second dialog, button, spinner, or drawer.

## Four required data states for list-driven components

Any component that displays list or fetched data must handle all four states explicitly:

| State | What to render |
|-------|----------------|
| **loading** | `Skeleton` with the same layout as the loaded state, or `Spinner` from `@/shared/ui/spinner` |
| **error** | Translated message in `Alert` + retry `Button` |
| **empty** | The registry `Empty` composition with translated copy — not a loading skeleton |
| **partial/stale** | Stale indicator while a background refetch resolves |

Pick the state with early returns before the main `return` — never a ternary chain in JSX.

## Checklist

- [ ] Folder and files are kebab-case (`custom-button/custom-button.tsx`); the export is PascalCase (`CustomButton`)
- [ ] `styles.ts` exists — zero class strings, `cn('…')`, or `style={{}}` in JSX
- [ ] `index.ts` re-exports the component only, plus types/constants an outside file actually imports (not `export *`)
- [ ] `{name}.test.tsx` written in the same change, mocking only the boundary
- [ ] Lives under `shared/ui/` if generic, or the owning feature's `ui/` if business-specific
- [ ] Root element merges caller `className` last via `styles.root(className)`
- [ ] No `forwardRef` — `ref` destructured as a plain prop (React 19)
- [ ] No business logic, data fetching, or TanStack Query calls inside a `shared/ui/` component
- [ ] Every visible string is `t(key)`; no English literal, no string-map object
- [ ] Named handlers only — no arrow or function expression in an `on*` prop
- [ ] No ternary in JSX; no nested ternary anywhere
- [ ] Closed-set props use constants; defaults omitted
- [ ] No comments
- [ ] Interactive elements have accessible names, visible focus, and keyboard support
- [ ] The slice's public `index.ts` exports this component only if another slice or layer imports it
- [ ] No `React.memo`/`useMemo`/`useCallback` added preemptively — React Compiler handles it
- [ ] Semantic token names only — no `text-slate-900`, no hex values, no `dark:` variants
- [ ] No motion utilities outside `shared/ui/` bases

See [examples.md](examples.md) for full worked examples.
