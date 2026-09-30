---
name: shadcn-usage
description: "Compose and wrap shadcn/ui primitives — installing with the CLI, keeping the registry's structure, style, and open/close animation verbatim, composing parts the way the registry demos do, asChild composition, closed-set prop constants (ButtonVariant, ButtonType), wrapper components that merge className via cn(), portalled components (Dialog, Popover, Select, Tooltip, Dropdown), and theming through CSS custom properties. No dark: variants, no ThemeProvider — one light palette only."
---

# shadcn/ui Usage

## When to use

- Adding a new shadcn primitive to the project
- Composing a primitive in a feature, entity, widget, or page (a dialog, a form, a menu)
- A primitive looks or animates differently from the shadcn docs
- Wrapping a *repeated* arrangement of primitives (`ConfirmButton`, `DataTable`)
- A `Dialog`, `Popover`, `Select`, `Tooltip`, or `Dropdown` isn't receiving styles or events from an ancestor — portals are almost always the cause
- Converting a `<Select>` between controlled and uncontrolled, or wiring `open`/`onOpenChange`

Hard constraints: `rules/shadcn.mdc` (bases) and `rules/styling.mdc` (call sites). This skill is the procedure. Form composition: `rhf-form`. `styles.ts` patterns: `tailwind-styles`.

## Instructions

### Adding a base (`shared/ui/<name>/`)

1. **Registry first.** Search the registry (`search_items_in_registries`) before writing UI. Hand-write only after a recorded miss (`## Tech Investigation`: `"<Name> hand-authored: no registry match because <reason>"`).
2. **Install against the project's one style.** `npx shadcn@latest add <component>` (or `get_add_command_for_items`) reads `components.json`. Never paste a component from another style, registry, blog, or the HTML prototype.
3. **Re-home, do not rewrite.** Move the generated file into `shared/ui/<name>/<name>.tsx`. Keep every exported part, prop, `data-slot`, and the Radix import the CLI wrote. Delete the leftover under the CLI output path so `@/components/ui/*` is not a second copy. No `shared/ui/index.ts` mega-barrel.
4. **Move classes verbatim.** Every class string goes to `styles.ts` in the same order, the `cva()` table unchanged — including `animate-in`, `animate-out`, `fade-*`, `zoom-*`, `slide-in-from-*`, `duration-*`, and every `data-[state=*]:` class. Diff the moved strings against the CLI output; any missing class is a bug.
5. **Keep the motion running.** Confirm global CSS imports the stylesheet the CLI configured (`@import "tw-animate-css"` on Tailwind v4) once. Do not add `@keyframes`, `--animate-*`, or another animation library. A missing package is a dependency approval, not a silent skip.
6. **Translate registry literals.** `sr-only` text such as "Close" becomes `t(commonKeys.actions.close)`.
7. **Export closed-set constants.** Add `constants.ts` derived from the `cva` table, and use them in `index.ts`:

   ```ts
   // shared/ui/button/constants.ts
   import type { ButtonVariants } from './styles';

   export const ButtonVariant = {
     Default: 'default',
     Destructive: 'destructive',
     Outline: 'outline',
     Secondary: 'secondary',
     Ghost: 'ghost',
     Link: 'link',
   } as const satisfies Record<string, NonNullable<ButtonVariants['variant']>>;

   export const ButtonSize = {
     Default: 'default',
     Small: 'sm',
     Large: 'lg',
     Icon: 'icon',
   } as const satisfies Record<string, NonNullable<ButtonVariants['size']>>;

   export const ButtonType = {
     Button: 'button',
     Submit: 'submit',
     Reset: 'reset',
   } as const;
   ```

   Copy the keys from the installed `cva` table — the list above is the common `new-york` set, not a guarantee. `Button` defaults `type` to `ButtonType.Button` (a native `<button>` defaults to `submit`, which submits any enclosing form). With `asChild`, the default is not applied.
8. **If `shared/ui/<name>` is missing while composing, stop.** Hand the primitive to the shared-UI step (`create-shared-ui` / `shared-engineer`). Do not author a second dialog, button, or drawer.

### Composing a primitive

1. **Start from the registry demo.** Call `get_item_examples_from_registries` (`dialog-demo`, `alert-dialog-demo`, `select-demo`, `dropdown-menu-demo`) and keep its part order and nesting. Replace only the content: copy with `t()`, data with props, handlers with named functions.
2. **Closed-set props use constants; defaults are omitted.** `variant={ButtonVariant.Outline}`, `type={ButtonType.Submit}`. A plain button writes neither `type` nor `variant`.
3. **Call-site `className` is layout only** (margin, width, placement), from the caller's `styles.ts`. A different look is a new `cva` variant in the base — request it from the shared-UI step.
4. **No motion at the call site.** No `animate-*`, `transition-*`, `duration-*`, `fade-*`, `slide-*`, or `zoom-*` on a primitive. Prototype effects (`reveal`, `hover-lift`) are not ported.
5. **Compose with `asChild`** instead of nesting: `<Button asChild><Link to={routes.orders}>…</Link></Button>` keeps one DOM element.
6. **Dialogs are controlled.** The parent owns `open` + `onOpenChange` and passes named handlers (`handleOpenChange`), never an inline function.
7. **Respect portals.** `Dialog`, `Popover`, `Select`, `Tooltip`, and `Dropdown` render outside the trigger's DOM ancestry. Style the content component through its own `className`, and use the primitive's callbacks (`onOpenChange`, `onSelect`) rather than parent event delegation.
8. **A controlled `<Select>` speaks strings only.** Convert ids/enums at the boundary. Pick `value` or `defaultValue` once for the component's life.

### Wrappers

- Wrap only a *repeated* arrangement. A wrapper that presets one prop or `className` is not a component.
- The wrapper is its own kebab-case folder with `styles.ts`, spreads props, and merges `className` last via `cn()`. React 19 passes `ref` as a plain prop — no `forwardRef`.

### Theming

Theme through CSS custom properties in `shared/ui/theme/globals.css` only (`--background`, `--primary`, `--radius`, fonts). The prototype's palette, radius, and fonts map into these tokens once; primitives then match the prototype without per-feature overrides. No `dark:` variants, no `ThemeProvider`, no per-feature color constants.

## Composition pattern (from `alert-dialog-demo`)

```tsx
// features/orders/ui/confirm-delete-order/confirm-delete-order.tsx
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { commonKeys } from '@/shared/lib/i18n/locales/common/keys';
import { Button, ButtonVariant } from '@/shared/ui/button';
import { ordersKeys } from '../../locales/keys';
import type { ConfirmDeleteOrderProps } from './types';

export const ConfirmDeleteOrder = ({ onConfirm }: ConfirmDeleteOrderProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={ButtonVariant.Destructive}>
          {t(ordersKeys.delete.trigger)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(ordersKeys.delete.title)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(ordersKeys.delete.description)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t(commonKeys.actions.cancel)}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t(ordersKeys.delete.confirm)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
```

No `className`, no motion classes, no literals — the base supplies look and animation.

## Controlled Dialog

```tsx
const [open, setOpen] = useState(false);

const handleOpenChange = (nextOpen: boolean): void => {
  if (!nextOpen) {
    form.reset();
  }

  setOpen(nextOpen);
};

<Dialog
  open={open}
  onOpenChange={handleOpenChange}
>
  <DialogTrigger asChild>
    <Button>
      {t(usersKeys.invite.trigger)}
    </Button>
  </DialogTrigger>
  <DialogContent>…</DialogContent>
</Dialog>
```

## Checklist

- [ ] Registry searched first; hand-write only after a recorded miss
- [ ] Installed with `shadcn add` against `components.json`; no component from another style or registry
- [ ] Base lives in `shared/ui/<name>/`, imported as `@/shared/ui/<name>` — no `@/components/ui`, no mega-barrel
- [ ] Parts, props, `data-slot`, Radix import, and every class string match the CLI output (classes moved to `styles.ts` verbatim)
- [ ] Global CSS imports the CLI's animation stylesheet once; no extra `@keyframes` / `--animate-*`
- [ ] No motion utility or look override (`color`, `radius`, `shadow`, `padding`) on a primitive at a call site
- [ ] Composition follows the registry demo's part order
- [ ] Closed-set props use `constants.ts` (`ButtonVariant`, `ButtonType`); defaults omitted
- [ ] `sr-only` and every other literal translated
- [ ] Handlers are named functions, not inline in JSX
- [ ] `asChild` used instead of a nested wrapper element where applicable
- [ ] Wrapper exists only for a repeated composition; spreads props and merges `className` last
- [ ] No descendant CSS or event delegation reaching into a portalled component
- [ ] Controlled `<Select>` converts ids/enums at the boundary; not mixed with `defaultValue`
- [ ] No `dark:` variants, no `ThemeProvider` — semantic tokens only

See [examples.md](examples.md) for Bad/Good pairs.
