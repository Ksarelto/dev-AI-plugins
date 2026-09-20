# Styling

Every component folder has a co-located `styles.ts`. Tailwind + `cva`. Tokens in `shared/ui/theme/globals.css`. One light theme.

## Evaluate

**Hard**

- Every component folder under `ui/` has `styles.ts`.
- No Tailwind class strings in `.tsx` JSX — classes are imported from `styles.ts`.
- No inline `style={{}}` except a dynamic numeric value pushed to a CSS variable, with the class in `styles.ts`.
- No CSS Modules, vanilla-extract, styled-components.
- Colors are semantic tokens (`bg-background`, `text-muted-foreground`) — no hex/rgb/`slate-800` in `styles.ts` or `globals.css`.
- No `ThemeProvider`, no `.dark`, no `dark:` variants.
- Shared fragments move to `shared/ui/theme/styles.ts` after 2+ duplicate uses.
- `globals.css` under `shared/ui/theme/` with `@tailwind` and `:root` tokens.
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
rg -n "ThemeProvider|classList.*dark|dark:" src
rg -n "#[0-9a-fA-F]{3,8}|rgb\(|slate-[0-9]" src --glob "**/styles.ts" --glob "**/globals.css"
```

Glob `src/shared/ui/theme/globals.css`. For each `ui/{component}/{component}.tsx`, confirm sibling `styles.ts`.
