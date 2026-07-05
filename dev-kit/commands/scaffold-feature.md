---
name: scaffold-feature
description: Scaffold a full React feature folder with api hooks, components, types, and barrel exports
---

# Scaffold Feature

Create a complete feature module following dev-kit conventions.

## Steps

1. Ask the user for (or infer from context):
   - Feature name (kebab-case folder, PascalCase components)
   - Scope: list only, CRUD, or read-only widget
   - Required components and API operations
2. Load the `react-feature` skill and read `skills/react-feature/examples.md`
3. Read rules: `project-structure`, `react-components`, `react-query`, `antd-usage`
4. Read few-shot templates: `examples/rules/project-structure.md`

5. Create folder structure:

```
src/features/{feature}/
├── api/
│   ├── fetch{Entity}.ts
│   ├── use{Entity}s.ts          # list query (if needed)
│   ├── use{Entity}.ts           # detail query (if needed)
│   └── useCreate{Entity}.ts     # mutation (if needed)
├── components/
│   └── {Entity}List/            # or primary component
│       ├── index.tsx
│       ├── {Entity}List.css.ts
│       └── types.ts
├── types.ts
└── index.ts
```

6. Execute in order:
   - **types.ts** — entity interfaces, params, API input/output types
   - **queryKeys** — extend `src/api/queryKeys.ts`
   - **api/** — fetchers and hooks (use `create-query-hook` patterns)
   - **components/** — scaffold each component (use `scaffold-component` patterns)
   - **index.ts** — barrel export public API

7. Wire loading, error, and empty states in the primary component
8. Use antd for UI primitives (Table, Form, Modal, etc.)

## Scope shortcuts

| Scope | Create |
|-------|--------|
| List page | `use{Entity}s`, `{Entity}List`, filters optional |
| CRUD | list + detail + create/update mutations + forms |
| Widget | single `use{Entity}s` with limit param + widget component |

Do not create route files unless explicitly requested.
