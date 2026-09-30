# Styling & shadcn/ui — review checklist

Distilled from the `tailwind-styles` and `shadcn-usage` skills and `rules/styling.mdc` / `rules/shadcn.mdc`.

## Tailwind

- A class string, template literal, or `cn('…')` literal in a JSX `className` — classes belong in the folder's `styles.ts`.
- A ternary inside `className` instead of a `styles.x(isActive)` function or a `cva` variant.
- A hardcoded color hex value or raw palette class (`bg-blue-500`) instead of a semantic token or a `globals.css` CSS variable.
- Inline `style={{}}`, a CSS module, or vanilla-extract introduced alongside the Tailwind system.
- `!important` used to override shadcn composition.
- A `dark:` variant — dark mode is token swaps in `globals.css`, not per-class overrides.

## Motion

- `animate-*`, `transition-*`, `duration-*`, `delay-*`, `ease-*`, `fade-*`, `slide-*`, or `zoom-*` in any `styles.ts` outside `shared/ui/` — it overrides the registry base's `data-state` animation.
- A new `@keyframes`, `--animate-*` token, or second animation library in global CSS, or `tw-animate-css` imported more than once.
- Prototype motion (`reveal`, `hover-lift`, staggered entrances) recreated in the app.
- A hand-rolled spinner (`Loader2` + `animate-spin`) instead of `@/shared/ui/spinner`.

## shadcn/ui

- A shadcn component hand-written, pasted from another style/registry/the prototype, or imported from `@/components/ui/` instead of the `shared/ui/<name>/` base.
- A re-homed base whose parts, props, `data-slot` attributes, Radix import, or class strings differ from the registry output (classes reordered, trimmed, or "cleaned up").
- Open/close `animate-*` or `data-[state=*]` classes stripped from a dialog, drawer, sheet, popover, dropdown, or tooltip, or global CSS missing the animation stylesheet those classes need.
- A second dialog, button, drawer, or other registry primitive authored beside `shared/ui/<name>/`.
- A call-site `className` on a primitive that changes color, radius, border, shadow, padding, or typography — a new look is a `cva` variant in the base. Layout utilities (width, margin, grid placement) are fine.
- Parts composed in a different order or nesting than the registry demo (`DialogHeader` missing, `DialogFooter` outside `DialogContent`, `DialogClose` not `asChild`).
- A literal `variant="…"`, `size="…"`, `type="…"`, `side`, `align`, or `orientation` on a primitive instead of its constant (`ButtonVariant.Outline`), or a prop restated at its default (`type={ButtonType.Button}`).
- A wrapper component created to preset a single prop or `className` default (wrap only a *repeated* arrangement of primitives).
- A primitive nested inside another element where `asChild` composition would keep one DOM node.
- A wrapper that doesn't spread props or merge `className` last through `styles.root(className)`.
- Descendant CSS reaching into a portalled component (`Dialog`, `Popover`, `Select`, `Tooltip`, `Dropdown`) from a parent selector — portals break that DOM ancestry.
- Event delegation or `stopPropagation` from a parent relied on to catch a portalled component's events instead of the primitive's own callback (`onOpenChange`, `onSelect`).
- `Dialog`/`Popover` open state managed internally when the parent also needs to react to it — it should own `open` + `onOpenChange`.
- A controlled `<Select>` mixed with `defaultValue`, or ids/enums passed through unconverted instead of at the boundary.
- Per-feature color constants instead of theming through CSS custom properties in `globals.css`.

## Severity

Portal-styling/event bugs and controlled/uncontrolled `<Select>` mixing are **Must fix** (they break at runtime). A modified registry base, stripped motion, or motion/look overrides at a call site are **Must fix** (they are the visible divergence from the registry). Everything else here is a **Should fix** convention.
