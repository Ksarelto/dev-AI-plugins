---
name: routing
description: Implement React Router v7 patterns for the FSD app/router/ structure — route config in routes.ts, lazyFeature() code splitting, RequireAuth/RequirePermission/RequireFlag wrapper guards, and sessionKey-derived session scoping. Use when adding new pages, setting up the router, or implementing auth-gated navigation.
---

# Routing

## When to use

- Setting up the router from scratch
- Adding a new page or nested layout
- Implementing auth-gated or permission-gated routes
- Adding lazy-loaded code-split routes with `lazyFeature()`
- Accessing route params or navigating programmatically

## Architecture rules

- The router lives in `app/router/` — not `src/routes.tsx`
- `routes.ts` only composes three branches. New pages go in `auth/routes.tsx` or `root/routes.tsx`, not in `routes.ts`
- There is no `AuthLayout`. Login and signup are route elements in `auth/`
- Authenticated chrome is `AppLayout` inside `root/`
- Guards are **wrapper routes** (`RequireAuth`, `RequirePermission`, `RequireFlag`) — never `if` statements inside pages
- All routes are code-split using `lazyFeature()` — not bare `React.lazy()`
- `RequireAuth` reads `useSession()` from `shared/lib/auth/` — it never reads from a Zustand auth store
- URL is state: filters, pagination, sort, and active tab live in search params (`useSearchParams`), not in `useState` or a store

## Router structure

Each of `auth/`, `error/`, and `root/` has the same two files: `routes.tsx` (the `RouteObject[]`) and `index.ts` (that array only).

```
app/
└── router/
    ├── routes.ts           — createBrowserRouter; spreads the three branches
    ├── auth/
    │   ├── routes.tsx      — login/signup, no layout wrapper
    │   └── index.ts
    ├── error/
    │   ├── routes.tsx      — not-found, route errorElement, feature load error
    │   └── index.ts
    ├── root/
    │   ├── routes.tsx      — AppLayout + RequireAuth and the app's pages
    │   └── index.ts
    ├── layouts/
    │   └── AppLayout.tsx   — chrome for authenticated pages
    └── guards/
        ├── RequireAuth.tsx
        ├── RequirePermission.tsx
        └── RequireFlag.tsx
```

## `app/router/routes.ts` — composition only

```typescript
import { createBrowserRouter } from 'react-router';
import { authRoutes } from './auth';
import { errorRoutes } from './error';
import { rootRoutes } from './root';

export const router = createBrowserRouter([
  ...authRoutes,
  ...rootRoutes,
  ...errorRoutes,
]);
```

## `app/router/auth/routes.tsx`

```tsx
import { lazyFeature } from '@/shared/lib/lazyFeature';
import type { RouteObject } from 'react-router';

const LoginPage = lazyFeature('login', () => import('@/pages/auth/login'));
const SignupPage = lazyFeature('signup', () => import('@/pages/auth/signup'));

export const authRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
];
```

```ts
export { authRoutes } from './routes';
```

## `app/router/root/routes.tsx`

```tsx
import { AppLayout } from '../layouts/AppLayout';
import { RequireAuth } from '../guards/RequireAuth';
import { RequirePermission } from '../guards/RequirePermission';
import { RequireFlag } from '../guards/RequireFlag';
import { lazyFeature } from '@/shared/lib/lazyFeature';
import type { RouteObject } from 'react-router';

const DocumentsPage = lazyFeature('documents', () => import('@/pages/documents'));
const DocumentUploadPage = lazyFeature('document-upload', () => import('@/pages/document-upload'));
const AdminPage = lazyFeature('admin', () => import('@/pages/admin'));
const ReportsPage = lazyFeature('reports', () => import('@/pages/reports'));
const ReportDetailPage = lazyFeature('report-detail', () => import('@/pages/reports/detail'));

export const rootRoutes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      {
        element: <RequireAuth />,
        children: [
          { path: '/documents', element: <DocumentsPage /> },
          { path: '/document-upload', element: <DocumentUploadPage /> },
          {
            element: <RequirePermission permission="admin:read" />,
            children: [{ path: '/admin', element: <AdminPage /> }],
          },
          {
            element: <RequireFlag name="reports" />,
            children: [
              { path: '/reports', element: <ReportsPage /> },
              { path: '/reports/:id', element: <ReportDetailPage /> },
            ],
          },
        ],
      },
    ],
  },
];
```

## `app/router/error/routes.tsx`

Not-found, the route `errorElement`, and the feature-load error live here. `routes.ts` does not define them inline.

```tsx
import { FeatureLoadError } from '@/app/boundaries';
import type { RouteObject } from 'react-router';

export const errorRoutes: RouteObject[] = [
  { path: '*', element: <FeatureLoadError /> },
];
```

Attach `errorElement` on the `root` route object when a crash boundary is required. The element component stays in `error/`.

## Guard implementations

### `RequireAuth`

```typescript
// app/router/guards/RequireAuth.tsx
import { Navigate, Outlet } from 'react-router';
import { useSession } from '@/shared/lib/auth';

export const RequireAuth = (): JSX.Element => {
  const session = useSession();

  if (session.status === 'loading') return <div />; // or a spinner
  if (session.status !== 'authenticated') return <Navigate to="/login" replace />;
  return <Outlet />;
};
```

### `RequirePermission`

```typescript
// app/router/guards/RequirePermission.tsx
import { Navigate, Outlet, useLocation } from 'react-router';
import { usePermission } from '@/shared/lib/permissions';

interface RequirePermissionProps { permission: string }

export const RequirePermission = ({ permission }: RequirePermissionProps): JSX.Element => {
  const allowed   = usePermission(permission);
  const location  = useLocation();

  if (!allowed) return <Navigate to="/" replace state={{ from: location }} />;
  return <Outlet />;
};
```

### `RequireFlag`

```typescript
// app/router/guards/RequireFlag.tsx
import { Navigate, Outlet } from 'react-router';
import { isEnabled, type FlagName } from '@/shared/config/flags';

interface RequireFlagProps { name: FlagName }

export const RequireFlag = ({ name }: RequireFlagProps): JSX.Element => {
  if (!isEnabled(name)) return <Navigate to="/" replace />;
  return <Outlet />;
};
```

## `lazyFeature()` wrapper

`lazyFeature()` wraps `React.lazy()` and classifies module-load failures as `FeatureLoadError` so the route boundary can distinguish a stale-deploy chunk miss from a broken module:

```typescript
// shared/lib/lazyFeature.ts
import { lazy } from 'react';

export class FeatureLoadError extends Error {
  constructor(public readonly featureName: string, cause: unknown) {
    super(`Failed to load feature: ${featureName}`);
    this.cause = cause;
  }
}

export const lazyFeature = (name: string, factory: () => Promise<{ default: React.ComponentType }>) =>
  lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      throw new FeatureLoadError(name, err);
    }
  });
```

Route-level error boundary branches on error type:

```tsx
// At the route boundary
if (error instanceof FeatureLoadError && isChunkLoadError(error.cause)) {
  // Stale client after deploy — offer reload
  return <ReloadPrompt />;
}
// Broken module init — full crash screen
return <CrashScreen error={error} />;
```

## URL as state

Filters, pagination, sort, and active tab belong in the URL — not in `useState` or a store:

```typescript
// features/documents/hooks/useDocumentFilters.ts
import { useSearchParams } from 'react-router';

export const useDocumentFilters = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get('status') ?? 'all';
  const page   = Number(searchParams.get('page') ?? '1');

  const setStatus = (s: string) => setSearchParams((p) => { p.set('status', s); return p; });
  const setPage   = (n: number) => setSearchParams((p) => { p.set('page', String(n)); return p; });

  return { status, page, setStatus, setPage };
};
```

## Typed params

```typescript
const { id } = useParams<{ id: string }>();
// id is string | undefined — guard before use
const { data } = useOrder(id ?? '');
```

## Programmatic navigation

```typescript
const navigate = useNavigate();
// After mutation success — in the hooks/ orchestration hook, not inside a component
onSuccess: (order) => navigate(`/orders/${order.id}`),
// Go back
onCancel: () => navigate(-1),
```

## Checklist

- [ ] `routes.ts` only spreads `auth`, `error`, and `root` — new pages land in `auth/routes.tsx` or `root/routes.tsx`
- [ ] No `AuthLayout` — login and signup are plain route elements
- [ ] All page imports use `lazyFeature()` — not bare `React.lazy()`
- [ ] Auth gate uses `RequireAuth` (reads `useSession()`) — not a custom component reading a Zustand store
- [ ] Permission gates use `RequirePermission` wrapper route
- [ ] Feature flag gates use `RequireFlag` wrapper route
- [ ] Guards are wrapper routes that compose — no nested `if` inside a page component
- [ ] Filters / pagination / sort / tab in `useSearchParams`, not `useState`
- [ ] `useParams` typed explicitly — guard `undefined` before use
- [ ] `navigate()` called from `hooks/` orchestration, not directly in component event handlers
- [ ] `replace` on redirects from guards (prevents back-button loop)
- [ ] New route has `lazyFeature()` and a guard if siblings have one

## References

| Topic | File |
|-------|------|
| Few-shot implementation examples | [examples.md](examples.md) |
| Error boundaries and FeatureLoadError handling | [references/boundaries.md](references/boundaries.md) |
| Mocking navigation hooks in Vitest tests | [references/testing.md](references/testing.md) |
