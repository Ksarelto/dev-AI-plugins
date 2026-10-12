# Styling

Every component folder has a co-located `styles.ts`. Tailwind + `cva`. Tokens in `shared/ui/theme/globals.css`. One light theme.

## Evaluate

**Hard**

- Every component folder under `ui/` has `styles.ts` (not `ComponentName.styles.ts`).
- No Tailwind class strings in `.tsx` JSX — classes are imported from `styles.ts` (or `shared/ui/theme/styles.ts`). Conditional classes that are not a named variant are still functions exported from `styles.ts`.
- No inline `style={{}}` except a dynamic numeric value pushed to a CSS variable, with the class in `styles.ts`.
- No CSS Modules, vanilla-extract, styled-components.
- Colors are semantic tokens (`bg-background`, `text-muted-foreground`) — no hex/rgb/`slate-800` (or other palette-step classes) in `styles.ts` or in `globals.css` rules. Use surface/content pairs together (`bg-primary` with `text-primary-foreground`).
- `globals.css` has exactly one `:root`. Its custom-property values (hex, `oklch`, `px`, prototype tokens such as `--text-*` or `--lift`) are the theme source, not a finding. With a prototype, `port-prototype-theme.mjs` writes them verbatim and its `--check` gates parity. A duplicate `:root` is fixed by re-running the port, which merges the blocks. Never report "delete the second `:root`" — deleting it drops the prototype tokens.
- No `ThemeProvider`, no `.dark`, no `dark:` variants — including inside a re-homed registry base, where deleting them is an allowed edit (`rules/shadcn.mdc`).
- Shared fragments move to `shared/ui/theme/styles.ts` after the third duplicate (rule of three). `@layer components` in `globals.css` is only for CSS Tailwind cannot express as one utility.
- No `!important`. Do not fight a shadcn primitive with specificity or a call-site `className` override — a new look is a new `cva` variant appended to the base's `styles.ts`; the registry classes stay verbatim (`rules/shadcn.mdc`).
- `className` from callers is merged in `styles.ts` via `cn()`, `className` last. Do not use both `cn` and `cva` for the same prop. Call-site `className` on a primitive is layout only (width, margin, grid placement).
- Motion utilities (`animate-*`, `transition-*`, `duration-*`, `fade-*`, `slide-*`, `zoom-*`) appear only in `shared/ui/*/styles.ts`. `globals.css` imports `tw-animate-css` once and declares no extra `@keyframes` or `--animate-*`.
- A component created from an external library (a re-homed shadcn/Radix primitive, or another UI package) still applies the animation classes and `data-[state=*]` animations that library shipped. They are present in `styles.ts`, in the library's order, and they are the classes on the element — not dropped, reordered, or replaced. The library's animation stylesheet is imported once. A feature, widget, or page that composes that component adds none of those utilities.
- Prototype look is reproduced through tokens in `globals.css`, not per-component overrides. Prototype motion (`reveal`, `hover-lift`) is a finding unless it is a `shared/ui` variant.
- Icon-only buttons: `aria-label`. Forms: `FormLabel` with `FormField`.

**Judgment**

- Whether an inline style is "genuinely dynamic."
- Duplicate `cva` snippets that have not yet earned `shared/ui/theme/styles.ts`.

## How

```bash
find src -path '*/ui/*' -name '*.tsx' ! -name 'index.tsx' ! -name '*.test.tsx' ! -name '*.stories.tsx'
# each sibling dir should contain styles.ts
rg -n "className=\{?['\"\`]" src --glob "*.tsx"
rg -n "style=\{\{" src --glob "*.tsx"
rg -n "styled-components|\.module\.(css|scss)|vanilla-extract" src
rg -n "ThemeProvider|classList.*dark|dark:|!important" src
rg -n "#[0-9a-fA-F]{3,8}|rgb\(|slate-[0-9]|amber-[0-9]|emerald-[0-9]" src --glob "**/styles.ts"
rg -n "slate-[0-9]|amber-[0-9]|emerald-[0-9]" src --glob "**/globals.css"
rg -c ":root\s*\{" src/shared/ui/theme/globals.css   # must be 1
rg -n "animate-|transition-|duration-|delay-|ease-|fade-|slide-in|zoom-" src --glob "**/styles.ts" --glob "!**/shared/ui/**"
rg -n "@keyframes|--animate-|tw-animate-css" src --glob "*.css"
```

For each re-homed primitive under `shared/ui/`, diff its `styles.ts` animation classes (`animate-*`, `fade-*`, `zoom-*`, `slide-*`, `duration-*`, `data-[state=*]:`) against the registry output. A missing, reordered, or replaced class is hard. Glob `src/shared/ui/theme/globals.css`. For each `ui/{component}/{component}.tsx`, confirm sibling `styles.ts`.
