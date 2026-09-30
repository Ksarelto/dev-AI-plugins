# Zustand Examples

Auth session is `useSession()` from `@/shared/lib/auth`. Do not add `src/stores/authStore.ts` or read a token from Zustand.

Client state that two components in one feature share lives in `features/{name}/models/store.ts`, created by a factory keyed by `sessionKey`. The canonical factory is in the skill. Persist `name` includes that key. Server data stays in TanStack Query.
