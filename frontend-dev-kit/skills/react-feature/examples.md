# React Feature — Few-shot Examples

Minimum slice: `api/` + `ui/` + `index.ts`. Add `models/` and `hooks/` only when there is real logic. Query keys are `shared/api/query-keys/{domain}.ts`. No slice-level `types.ts`. No `components/` folder.

```
features/users/
├── api/
│   ├── endpoints.ts
│   ├── schema.ts
│   ├── dto.ts
│   ├── fetchers.ts
│   └── hooks.ts          — useUserList (useQuery). ui/ does not import this file
├── hooks/
│   └── useUserList.ts    — calls useUserList from ../api/hooks. No useQuery here
├── ui/
│   └── user-list/
│       ├── index.ts
│       ├── user-list.tsx
│       ├── user-list.stories.tsx
│       ├── styles.ts
│       └── tests/
│           ├── user-list.test.tsx
│           └── format-price.test.ts
├── locales/
│   ├── en.json
│   └── keys.ts
└── index.ts
```

`ui/` imports `hooks/useUserList.ts`. That file calls the query hook in `api/hooks.ts` and does not call `useQuery`. `ui/` never imports `api/` or a fetcher. A form's field rules may call `models/` pure functions. The page in `pages/users/` composes the feature's public `index.ts`.
