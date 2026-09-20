---
name: shadcn-usage
description: "Compose and wrap shadcn/ui primitives — installing with the CLI, asChild composition, wrapper components that spread props and merge className via cn(), portalled components (Dialog, Popover, Select, Tooltip, Dropdown), and theming through CSS custom properties. No dark: variants, no ThemeProvider — one light palette only."
---

# shadcn/ui Usage

## When to use

- Adding a new shadcn primitive to the project
- Wrapping a primitive in a local component (`ConfirmButton`, `DataTable`) instead of copy-pasting it
- Composing a primitive with another element via `asChild`
- A `Dialog`, `Popover`, `Select`, `Tooltip`, or `Dropdown` isn't receiving styles or events from an ancestor — portals are almost always the cause
- Converting a `<Select>` between controlled and uncontrolled, or wiring `open`/`onOpenChange`

The hard constraints live in the `shadcn-usage` rule and apply whether or not this skill is loaded.
This skill covers composition patterns and portal/theming reasoning. For form-specific composition (`FormField`, validation wiring), load `rhf-form`; for styles.ts patterns, load `tailwind-styles`.

## Instructions

1. **Install, don't hand-write**: `npx shadcn@latest add <component>`. Import from `@/components/ui/` — no barrel re-exports over it.
2. **Treat `components/ui/*` as generated.** Any deliberate edit there needs a comment explaining what changed and why, or belongs in a wrapper instead — re-running the CLI overwrites unmarked edits.
3. **Decide wrapper vs. inline composition**: wrap only a *repeated* arrangement of primitives (`ConfirmButton`, `DataTable`). Do not wrap a primitive just to preset one prop — a `className` or prop default does not earn a new component.
4. **Every wrapper component gets a `styles.ts`** — even if it is one line. No Tailwind classes inline in JSX.
5. **Compose with `asChild`** instead of nesting: `<Button asChild><Link to="/x">Go</Link></Button>` keeps one DOM element carrying the button's styling, semantics, and accessible name.
6. **Wrapper components spread props and merge `className` last** via `cn()` so the caller's utility wins the Tailwind-merge conflict. React 19 passes `ref` as a plain prop — no `forwardRef`.
7. **Respect portal boundaries.** `Dialog`, `Popover`, `Select`, `Tooltip`, and `Dropdown` render their content in a portal, outside the trigger's DOM ancestry:
   - Never target portalled content with descendant CSS from a parent (`.card :where(...)` won't reach it) — style the content component directly via its own `className`.
   - Never rely on event delegation or `stopPropagation` from a parent listener; the portal breaks the DOM event path assumption. Use the primitive's own callbacks (`onOpenChange`, `onSelect`) instead.
8. **Dialogs are controlled**: own `open` + `onOpenChange` in the parent. Don't let the primitive manage open state internally when the parent also needs to react to it.
9. **A controlled `<Select>` speaks strings only.** Convert ids/enums at the boundary going in and coming out. Pick controlled or uncontrolled (`value` vs. `defaultValue`) once — switching between them mid-life breaks the component.
10. **Theme through CSS custom properties** in `shared/ui/theme/globals.css` only — semantic token names (`--background`, `--foreground`, `--primary`, etc.). No `dark:` variants, no `ThemeProvider`, no per-feature color constants. This project has one light palette.

## Wrapper component pattern

```tsx
// features/orders/ui/ConfirmDeleteButton/ConfirmDeleteButton.tsx
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/alert-dialog';
import { cn } from '@/shared/lib/utils';
import * as styles from './styles';
import type { ConfirmDeleteButtonProps } from './types';

export const ConfirmDeleteButton = ({
  onConfirm,
  label = 'Delete',
  className,
  ref,
  ...props
}: ConfirmDeleteButtonProps) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button
        ref={ref}
        variant="destructive"
        className={cn(styles.trigger, className)}
        {...props}
      >
        {label}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Continue</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
```

```ts
// features/orders/ui/ConfirmDeleteButton/styles.ts
export const trigger = 'h-9 px-3';
```

## `asChild` pattern

```tsx
// ✓ One DOM element, Button styles + Link semantics
<Button asChild>
  <Link to="/orders">View Orders</Link>
</Button>

// ✗ Two nested elements — the outer Button and inner a/Link duplicate roles
<Button>
  <Link to="/orders">View Orders</Link>
</Button>
```

## Controlled Dialog

```tsx
const [open, setOpen] = useState(false);

// ✓ Parent owns state
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button onClick={() => setOpen(true)}>Open</Button>
  </DialogTrigger>
  <DialogContent>...</DialogContent>
</Dialog>
```

## Controlled Select with id conversion

```tsx
// ✓ Convert at the boundary; the primitive only sees strings
<Select
  value={order.status}
  onValueChange={(value) => setStatus(value as OrderStatus)}
>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    {ORDER_STATUSES.map((s) => (
      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

## Checklist

- [ ] Component installed via CLI, imported from `@/components/ui/`
- [ ] Any edit inside `components/ui/*` has a comment, or moved to a wrapper
- [ ] Wrapper only exists for a repeated composition, not a single preset prop
- [ ] Wrapper component has its own `styles.ts` — no Tailwind inline in JSX
- [ ] `asChild` used instead of a nested wrapper element where applicable
- [ ] Wrapper spreads props and merges `className` last with `cn()`
- [ ] No descendant CSS or event delegation reaching into a portalled component
- [ ] `Dialog`/`Popover` open state owned by the parent (`open` + `onOpenChange`)
- [ ] Controlled `<Select>` converts ids/enums at the boundary; not mixed with `defaultValue`
- [ ] No `dark:` variants, no `ThemeProvider` — semantic tokens only

See [examples.md](examples.md) for Bad/Good pairs on `asChild`, wrappers, and portal styling pitfalls.
