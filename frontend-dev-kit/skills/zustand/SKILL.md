---
name: zustand
description: Create and consume Zustand v5 stores for shared client-side state inside a feature's models/ segment. Stores are session-scoped (created by factory, not module-level). Use useShallow for derived collections. Never use for server data — that belongs in TanStack Query.
---

# Zustand

## When to use

- Shared client state that two or more components in a feature need to read or write
- Multi-step wizard draft state
- UI state (sidebar open/closed, active step) that outlives a single component
- Client preferences that should survive within a session

## When NOT to use

- Server data (lists, details, paginated results) — that is TanStack Query's job
- Derived state that can be computed from other state at render time
- State only one component needs — use `useState` or `useReducer` instead
- Auth session data — that lives in `shared/lib/auth/` and is read via `useSession()`

## Architecture rules

- Stores live in `features/{name}/models/store.ts` — **not** in `src/stores/`
- Stores must be created by a factory, not as module-level singletons. This allows them to be discarded on logout/tenant switch when `sessionKey` changes.
- `persist` store `name` must be scoped to the session key so a tenant switch clears the draft.
- Use Zustand v5 — it uses `useSyncExternalStore` internally, which is React Compiler-safe.
- Use `useShallow` for any selector that returns a derived collection to prevent infinite re-renders.

## Session-scoped store factory (required pattern)

```typescript
// features/wizard/models/store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface WizardState {
  step:    number;
  draft:   WizardDraft | null;
}

interface WizardActions {
  setStep:  (step: number) => void;
  setDraft: (draft: WizardDraft) => void;
  reset:    () => void;
}

const initialState: WizardState = { step: 0, draft: null };

// Factory — called with the session key so the store is scoped to the session
export const createWizardStore = (sessionKey: string) =>
  create<WizardState & WizardActions>()(
    devtools(
      persist(
        (set) => ({
          ...initialState,
          setStep:  (step)  => set({ step },  false, 'setStep'),
          setDraft: (draft) => set({ draft }, false, 'setDraft'),
          reset:    ()      => set(initialState, false, 'reset'),
        }),
        {
          // Scope the persist name to the session key — clears on logout/tenant switch
          name: `wizard-draft-${sessionKey}`,
          partialize: (s) => ({ step: s.step, draft: s.draft }),
        },
      ),
      { name: 'WizardStore' },
    ),
  );

// Module re-export of the type only — consumers get the store via context/hook
export type WizardStore = ReturnType<typeof createWizardStore>;
```

## Reading from a store

```typescript
// Good — component only re-renders when step changes
const step = useWizardStore((s) => s.step);

// Bad — component re-renders on every store update
const { step } = useWizardStore();

// Derived collection — must use useShallow to avoid infinite re-renders
import { useShallow } from 'zustand/react/shallow';
const activeItems = useFeatureStore(useShallow((s) => s.items.filter(isActive)));
```

## Non-React callers (callbacks, timeouts)

```typescript
// Read current state outside React — works with v5
const draft = wizardStore.getState().draft;
```

## Simple in-feature UI store (no factory needed when not persisted and not session-critical)

```typescript
// features/document-list/models/store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface DocumentListState {
  selectedIds: string[];
}

interface DocumentListActions {
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
}

export const useDocumentListStore = create<DocumentListState & DocumentListActions>()(
  devtools((set) => ({
    selectedIds: [],
    toggleSelect: (id) =>
      set((s) => ({
        selectedIds: s.selectedIds.includes(id)
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
      }), false, 'toggleSelect'),
    clearSelection: () => set({ selectedIds: [] }, false, 'clearSelection'),
  })),
);
```

## Checklist

- [ ] Store lives in `features/{name}/models/store.ts` — not `src/stores/`
- [ ] If store is persisted, it is created by a factory and `name` is scoped to `sessionKey`
- [ ] `devtools` middleware in all stores
- [ ] Selectors select one field, not the whole store
- [ ] Derived collections use `useShallow` — not raw `.filter()`/`.map()` inline in selector
- [ ] `reset` action exported and called on logout / wizard cancel
- [ ] No server data copied into the store — server data belongs in TanStack Query
- [ ] No module-level singleton for stores that must be cleared on session change

## References

| Topic | File |
|-------|------|
| Few-shot implementation examples | [examples.md](examples.md) |
| Resetting stores, testing actions | [references/testing.md](references/testing.md) |
