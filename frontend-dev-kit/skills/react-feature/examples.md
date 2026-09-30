# React Feature — Few-shot Examples

Minimum slice: `api/` + `ui/` + `index.ts`. Add `models/` and `hooks/` only when there is real logic. Query keys are `shared/api/query-keys/{domain}.ts`. No slice-level `types.ts`. No `components/` folder.

```
features/users/
├── api/
│   ├── endpoints.ts
│   ├── dto.ts
│   └── fetchers.ts
├── hooks/
│   ├── useUserList.ts
│   └── tests/
├── ui/
│   └── user-list/
│       ├── index.ts
│       ├── user-list.tsx
│       ├── styles.ts
│       ├── types.ts
│       └── user-list.test.tsx
├── locales/
│   ├── en.json
│   └── keys.ts
└── index.ts
```

`ui/` imports hooks, not `api/`. A form schema in `ui/` may call `models/` pure functions. The page in `pages/users/` composes the feature's public `index.ts`.
