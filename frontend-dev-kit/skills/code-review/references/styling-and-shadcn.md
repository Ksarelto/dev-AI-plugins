# Styling & shadcn/ui — review checklist

Distilled from the `tailwind-styles` and `shadcn-usage` skills.

## Tailwind

- Classes concatenated as strings instead of merged with `cn()`.
- A hardcoded color hex value instead of a Tailwind semantic token or a `globals.css` CSS variable.
- Ad-hoc conditional classes inside JSX for size/intent/state instead of a `cva()` variant.
- Inline `style={{}}`, a CSS module, or vanilla-extract introduced alongside the Tailwind system.
- `!important` used to override shadcn composition instead of a `className` prop.

## shadcn/ui

- A shadcn component hand-written instead of installed via `npx shadcn@latest add` and imported from `@/components/ui/`.
- An edit inside `components/ui/*` with no comment explaining it — the CLI will silently overwrite it on the next re-run.
- A wrapper component created to preset a single prop or `className` default (wrap only a *repeated* arrangement of primitives).
- A primitive nested inside another element where `asChild` composition would keep one DOM node (accessible name/semantics loss otherwise).
- A wrapper that doesn't spread props or merge `className` last via `cn()` (caller's utility should win the merge conflict).
- Descendant CSS reaching into a portalled component (`Dialog`, `Popover`, `Select`, `Tooltip`, `Dropdown`) from a parent selector — portals break that DOM ancestry.
- Event delegation or `stopPropagation` from a parent relied on to catch a portalled component's events instead of the primitive's own callback (`onOpenChange`, `onSelect`).
- `Dialog`/`Popover` open state managed internally by the primitive when the parent also needs to react to it — it should own `open` + `onOpenChange`.
- A controlled `<Select>` mixed with `defaultValue`, or ids/enums passed through unconverted instead of at the boundary.
- Per-feature color constants instead of theming through CSS custom properties in `globals.css` / `dark:`.

## Severity

Portal-styling/event bugs and controlled/uncontrolled `<Select>` mixing are **Must fix** (they
break at runtime). Everything else here is a **Should fix** convention.
