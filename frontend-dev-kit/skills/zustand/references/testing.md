# Zustand — Testing Reference

Session is not a Zustand store. Auth tests use a fake `Session` provider (`architecture-audit` testing-strategy). This file is for a feature draft store.

Stores are created by `createDraftStore(sessionKey)` in `features/{name}/models/store.ts`. Tests construct a fresh store per case. Do not import `@/stores/`.

```ts
import { createDraftStore } from '@/features/wizard/models/store';

const store = createDraftStore('user-1:org-1');

beforeEach(() => {
  store.setState({ step: 0, draft: null });
});

it('keeps the draft on the store', () => {
  store.getState().setDraft({ name: 'Ada' });
  expect(store.getState().draft).toEqual({ name: 'Ada' });
});
```

Render with that store instance (prop or the feature's provider). Do not rely on a module-level singleton surviving between tests.
