# Zustand Examples

## Example 1 — Auth store with persist

```typescript
// src/stores/authStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface CurrentUser {
  id: string;
  name: string;
  role: 'admin' | 'member';
}

interface AuthState {
  token: string | null;
  user: CurrentUser | null;
  isAuthenticated: boolean;
}
interface AuthActions {
  setAuth: (token: string, user: CurrentUser) => void;
  logout: () => void;
}

const initial: AuthState = {
  token: null,
  user: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  devtools(
    persist(
      (set) => ({
        ...initial,
        setAuth: (token, user) =>
          set({
            token,
            user,
            isAuthenticated: true,
          }, false, 'setAuth'),
        logout: () =>
          set(initial, false, 'logout'),
      }),
      {
        name: 'auth',
        partialize: (s) => ({ token: s.token }), // only persist token
      },
    ),
    { name: 'AuthStore' },
  ),
);
```

---

## Example 2 — UI store for sidebar + active modal

```typescript
// src/stores/uiStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  activeModal: string | null;
}
interface UiActions {
  toggleSidebar: () => void;
  openModal: (id: string) => void;
  closeModal: () => void;
}

export const useUiStore = create<UiState & UiActions>()(
  devtools(
    (set) => ({
      sidebarCollapsed: false,
      activeModal: null,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }), false, 'toggleSidebar'),
      openModal:  (id) => set({ activeModal: id }, false, 'openModal'),
      closeModal: ()   => set({ activeModal: null }, false, 'closeModal'),
    }),
    { name: 'UiStore' },
  ),
);

// Usage
const AppShell = (): JSX.Element => {
  const collapsed = useUiStore((s) => s.sidebarCollapsed); // selector — stable reference
  const toggle    = useUiStore((s) => s.toggleSidebar);

  return (
    <Sidebar
      collapsed={collapsed}
      onToggle={toggle}
    />
  );
};
```

---

## Example 3 — Multi-step wizard store

```typescript
// src/stores/onboardingStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface WizardState {
  step: number;
  data: Partial<OnboardingData>;
}
interface WizardActions {
  next:    (partial: Partial<OnboardingData>) => void;
  back:    () => void;
  reset:   () => void;
  setData: (partial: Partial<OnboardingData>) => void;
}

const initial: WizardState = { step: 0, data: {} };

export const useOnboardingStore = create<WizardState & WizardActions>()(
  devtools(
    (set) => ({
      ...initial,
      next:    (partial) => set((s) => ({ step: s.step + 1, data: { ...s.data, ...partial } }), false, 'next'),
      back:    ()        => set((s) => ({ step: Math.max(0, s.step - 1) }), false, 'back'),
      reset:   ()        => set(initial, false, 'reset'),
      setData: (partial) => set((s) => ({ data: { ...s.data, ...partial } }), false, 'setData'),
    }),
    { name: 'OnboardingStore' },
  ),
);
```

---

## Example 4 — Immer middleware for complex nested state

Use `immer` when actions would otherwise need deep spread chains. Mutations inside `set` are safe — Immer produces a new immutable state.

```typescript
// src/stores/editorStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface Field { value: string; error: string | null }
interface EditorState {
  fields: Record<string, Field>;
  isDirty: boolean;
}
interface EditorActions {
  setField:    (name: string, value: string) => void;
  setError:    (name: string, error: string | null) => void;
  resetFields: () => void;
}

const initial: EditorState = { fields: {}, isDirty: false };

export const useEditorStore = create<EditorState & EditorActions>()(
  devtools(
    immer((set) => ({
      ...initial,
      setField: (name, value) =>
        set((s) => {
          s.fields[name] = { value, error: null };
          s.isDirty = true;
        }, false, 'setField'),
      setError: (name, error) =>
        set((s) => { s.fields[name].error = error; }, false, 'setError'),
      resetFields: () =>
        set(initial, false, 'resetFields'),
    })),
    { name: 'EditorStore' },
  ),
);
```

---

## Example 5 — Store subscription outside React

Sync the API client auth header whenever the token changes — no React component involved.

```typescript
// src/api/client.ts
import { useAuthStore } from '@/stores/authStore';

// Runs once at module init; fires immediately for the current token
const unsubscribe = useAuthStore.subscribe(
  (state) => state.token,
  (token) => {
    apiClient.defaults.headers.Authorization = token ? `Bearer ${token}` : '';
  },
  { fireImmediately: true },
);

// Call unsubscribe() if you ever need to tear this down (e.g. in tests)
```

**Rules:**
- Use `subscribe(selector, listener)` to target a specific slice — avoids firing on unrelated updates
- Call the returned `unsubscribe` function when the listener is no longer needed
- Do NOT use `subscribe` inside React components — use `useStore(selector)` instead

---

## Example 6 — Derived values and stable selectors

Never store derived data in the store — compute it with selectors. Use `useShallow` when selecting multiple fields to avoid unnecessary re-renders.

```typescript
import { useShallow } from 'zustand/react/shallow';

// Single derived value — primitive equality, no shallow needed
const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
const hasOpenModal = useUiStore((s) => s.activeModal !== null);

// Multiple fields — useShallow prevents re-render when unrelated store fields change
const { collapsed, activeModal } = useUiStore(
  useShallow((s) => ({ collapsed: s.sidebarCollapsed, activeModal: s.activeModal })),
);
```
