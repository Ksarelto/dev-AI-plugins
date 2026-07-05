---
name: react-feature
description: Scaffold and implement a React feature slice with api hooks, components, types, and barrel exports. Use when building a new page, CRUD feature, or feature module with React, TypeScript, antd, vanilla-extract, and react-query.
---

# React Feature

## When to use

- Building a new page or feature (e.g. users, orders, settings)
- Adding a CRUD slice to an existing app
- User asks to "create a feature" or "add a new section"

## Instructions

1. **Plan the feature scope** — identify entities, API endpoints, UI components, and routes needed
2. **Create folder structure** under `src/features/{feature}/`:
   ```
   features/{feature}/
   ├── api/
   ├── components/
   ├── types.ts
   └── index.ts
   ```
3. **Define types** in `types.ts` — entity interfaces, input/output types, list params
4. **Add query keys** — extend `src/api/queryKeys.ts` with a factory for this feature
5. **Create API hooks** — `use{Entity}List`, `use{Entity}`, `useCreate{Entity}`, etc. in `api/`
6. **Build components** — one folder per component with `index.tsx`, `{Name}.css.ts`, `types.ts`
7. **Wire the page** — container component connects hooks to presentational components
8. **Export barrel** — `index.ts` exports public API only
9. **Apply rules** — follow project-structure, react-components, antd-usage, react-query rules

## Checklist

- [ ] Feature folder follows `src/features/{name}/` layout
- [ ] Types defined before hooks and components
- [ ] Query keys added to central factory
- [ ] Each component has colocated vanilla-extract styles
- [ ] No direct `fetch` in components
- [ ] Barrel export exposes clean public API
- [ ] Loading, error, and empty states handled

See [examples.md](examples.md) for few-shot templates.
