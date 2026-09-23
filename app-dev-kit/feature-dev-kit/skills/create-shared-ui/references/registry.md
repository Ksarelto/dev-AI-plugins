On-demand recipe. Read this file only when the skill that owns it tells you to. The matching rule under `rules/` is the constraint list and is already attached by glob — do not read it again.


# shadcn/ui Conventions

---

## Registry-First Workflow

Before authoring any UI component by hand, check the shadcn registry.

```
Does a registry primitive or block satisfy the requirement?
  YES → add it via shadcn MCP → adapt → re-home into shared/ui/
  PARTIALLY → add the closest match → compose with it → do not rewrite the base
  NO → hand-author the component; log the exception in the spec Decisions section
```

Hand-authoring is the exception, not the default. Every hand-authored component that could have used a registry primitive is a code-review finding.

---

## Re-Homing into `shared/ui/`

When adding a shadcn component to the project:

1. Add it via the shadcn MCP (or CLI): `npx shadcn add button`.
2. Move the generated file to `shared/ui/<component-name>/<ComponentName>.tsx`.
3. Apply our token setup — replace any hardcoded colors with CSS variable tokens.
4. Add a named export (not default).
5. Export the component from `shared/ui/index.ts`.

```ts
// shared/ui/index.ts
export { Button } from './button/Button'
export { Input } from './input/Input'
export { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from './form/Form'
export { Textarea } from './textarea/Textarea'
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog/Dialog'
```

---

## Primitive-to-Slot Mapping

| shadcn primitive | `shared/ui` slot | Notes |
|-----------------|-----------------|-------|
| `button` | `shared/ui/button/` | Extend with `isLoading` prop via CVA |
| `input` | `shared/ui/input/` | Thin wrapper; add our border-radius token |
| `textarea` | `shared/ui/textarea/` | Same as input |
| `form` | `shared/ui/form/` | RHF-connected; keep all sub-components |
| `dialog` | `shared/ui/dialog/` | Radix-based; keep ARIA intact |
| `select` | `shared/ui/select/` | Radix-based; keep keyboard nav |
| `table` | `shared/ui/table/` | Semantic HTML base; pair with TanStack Table |
| `badge` | `shared/ui/badge/` | CVA variants for status colors |
| `skeleton` | `shared/ui/skeleton/` | Use for loading states |

---

## Tailwind + CVA Variant Convention

Use CVA (class-variance-authority) for components that have multiple visual variants. Never build variants with ternary className strings.

```ts
// shared/ui/button/Button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = ({ className, variant, size, ...props }: ButtonProps): JSX.Element => (
  <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
)
```

---

## `cn()` Merge Helper

Always use `cn()` (clsx + tailwind-merge) to compose class strings. Never concatenate class strings with template literals.

```ts
// shared/lib/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
```

Usage:
```ts
// Correct
cn('px-4 py-2', isActive && 'bg-primary', className)

// Forbidden
`px-4 py-2 ${isActive ? 'bg-primary' : ''} ${className}`
```

---

## Token and Theme Setup

All color values come from CSS variable tokens. Never hardcode hex values in Tailwind classes.

```css
/* shared/ui/styles/globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
}
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
}
```

---

## Accessibility Head-Start

Radix UI (the base for most shadcn primitives) provides keyboard navigation, focus trapping, and ARIA attributes by default. Do not override or remove these. See `accessibility.mdc` for the full checklist.
