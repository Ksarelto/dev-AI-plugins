---
name: vanilla-extract-styles
description: Style React components with vanilla-extract using design tokens, recipes, and antd composition. Use when adding or updating component styles, creating variants, or setting up the design token system.
---

# vanilla-extract Styles

## When to use

- Styling a new or existing React component
- Creating variant-based UI (sizes, intents, states)
- Setting up or extending the design token system
- User mentions styling, CSS, themes, or visual design

## Instructions

1. **Check tokens** — read `src/styles/tokens.css.ts`; add missing tokens before hardcoding values
2. **Choose approach:**
   - One-off layout/spacing → `style()`
   - Variants (size, intent, state) → `recipe()`
   - Responsive utilities → `sprinkles()` in `src/styles/sprinkles.css.ts`
3. **Create `{Component}.css.ts`** colocated with the component
4. **Import styles** as namespace: `import * as styles from './Component.css'`
5. **Apply via className** — compose with antd components; never use global CSS overrides
6. **Wrapper pattern** — when antd needs consistent custom styling, create a thin wrapper component

## Checklist

- [ ] No hardcoded colors/spacing — use tokens
- [ ] Styles colocated in `.css.ts` file
- [ ] Named exports for all style objects/recipes
- [ ] No inline styles, CSS modules, or Tailwind in component
- [ ] antd composition via `className`, not `!important` overrides

See [examples.md](examples.md) for few-shot templates.
