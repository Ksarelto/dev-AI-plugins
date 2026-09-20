# Zustand — Testing Reference

## Resetting store state between tests

Call `store.setState(initial)` in `beforeEach`. Zustand stores are module-level singletons — state persists across tests unless you reset it explicitly.

```ts
import { useAuthStore } from '@/stores/authStore';

const initialAuthState = {
  token: null,
  user: null,
  isAuthenticated: false,
};

beforeEach(() => {
  useAuthStore.setState(initialAuthState);
  vi.clearAllMocks();
});
```

## Testing a component that reads from a store

Set the store state before rendering. No provider wrapper is needed.

```ts
it('shows admin menu when user is an admin', () => {
  useAuthStore.setState({
    user: {
      id: '1',
      name: 'Alice',
      role: 'admin',
    },
    isAuthenticated: true,
  });

  render(<NavMenu />)

  const adminLink = screen.getByRole('link', { name: TextContent.nav.admin })
  expect(adminLink).toBeInTheDocument()
})

it('hides admin menu for non-admin users', () => {
  useAuthStore.setState({
    user: {
      id: '2',
      name: 'Bob',
      role: 'member',
    },
    isAuthenticated: true,
  });

  render(<NavMenu />)

  const adminLink = screen.queryByRole('link', { name: TextContent.nav.admin })
  expect(adminLink).not.toBeInTheDocument()
})
```

## Testing store actions directly

Use `store.getState()` to call actions and read state after they run.

```ts
describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it('sets auth data when setAuth is called', () => {
    useAuthStore.getState().setAuth('token-123', {
      id: '1',
      name: 'Alice',
      role: 'admin',
    });

    const state = useAuthStore.getState();
    expect(state.token).toBe('token-123');
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.role).toBe('admin');
  });

  it('clears auth data on logout', () => {
    useAuthStore.setState({
      token: 'old-token',
      user: mockUser,
      isAuthenticated: true,
    });

    useAuthStore.getState().logout();

    const { token, isAuthenticated } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(isAuthenticated).toBe(false);
  });
});
```

## Spying on store actions

When you want to assert an action was called without running its real implementation:

```ts
it('calls toggleSidebar when menu button is clicked', async () => {
  const mockToggle = vi.fn();
  useUiStore.setState({ toggleSidebar: mockToggle });

  render(<Header />)

  const menuButton = screen.getByRole('button', { name: TextContent.nav.menu })
  await userEvent.click(menuButton)

  expect(mockToggle).toHaveBeenCalledOnce()
})
```

## Rules

- Reset store to initial state in `beforeEach` — tests must not share mutable store state
- Use `store.setState(partial)` to set up preconditions — never call action creators just to produce side effects
- Use `store.getState()` to assert post-action store shape
- Do NOT render a `Provider` wrapper — Zustand stores are singletons and work without one
