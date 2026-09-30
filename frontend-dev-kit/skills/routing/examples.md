# Routing Examples

## Router composition

`routes.ts` only spreads the three branches. Login has no layout wrapper. Pages use `lazyFeature()`, not `React.lazy()`. Guards are `RequireAuth` / `RequirePermission` / `RequireFlag` in `app/router/guards/`. There is no `src/components/ProtectedRoute.tsx` and no Zustand auth store.

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

Params and search-param filters are in the skill. Navigation after a mutation runs in `features/{name}/hooks/`, not in the page. Primary page data is a feature hook — see [data-api.md](references/data-api.md).
