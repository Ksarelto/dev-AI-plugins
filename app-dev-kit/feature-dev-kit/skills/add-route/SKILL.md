---
name: add-route
description: Wire the routing table and lazy page import in the app layer. Use after a page slice is created to make it reachable.
argument-hint: <route-path> <PageName>
disable-model-invocation: false
allowed-tools: [Read, Edit, Glob, Grep]
---

# Add Route

## When to use

Station 7. Invoke after `create-page` to register the new page as a reachable route. Used by `app-engineer`. Always pair with `wire-navigation` to make the page discoverable in the UI.

## Steps

1. **Read the existing routing structure**: use `Glob` to find the routes file (`src/app/router/` or `src/utils/routes.ts`) and the route table. Read the existing entries to understand the naming and object shape conventions before making any changes.

2. **Add the path constant** to the routes constants file (e.g. `src/utils/routes.ts`):
   ```ts
   export const ROUTES = {
     // existing routes...
     profiles: '/profiles',
     profileDetail: '/profiles/:profileId',    // <-- add new route path
   } as const
   ```
   Follow the existing naming convention exactly — camelCase keys, kebab-case paths.

3. **Add the route entry** in the route table with a `React.lazy` import:
   ```tsx
   // src/app/router/routes.tsx (or wherever the route table lives)
   const ProfileDetailPage = React.lazy(() =>
     import('@/pages/profile-detail-page').then(m => ({ default: m.ProfileDetailPage }))
   )

   // In the route array/object:
   {
     path: ROUTES.profileDetail,
     element: (
       <Suspense fallback={<PageLoadingSkeleton />}>
         <ProfileDetailPage />
       </Suspense>
     ),
   }
   ```
   Wrap in `<Suspense>` with a page-level loading fallback skeleton.

4. **Place the route in the correct tree section**: authenticated routes go inside the auth-protected layout route; public routes go outside. Read the existing nesting structure to determine placement.

5. **Update `navigationMap.ts`** (if the project uses a navigation map for building links):
   ```ts
   export const navigationMap = {
     profiles: () => ROUTES.profiles,
     profileDetail: (profileId: string) => ROUTES.profileDetail.replace(':profileId', profileId),
   }
   ```

6. **Run `yarn typecheck`**: verify the new route entry and lazy import are type-safe.

7. **Update the spec `## Build Plan`**: mark route tasks as done.

## Pre-conditions

- `create-page` has been run and the page slice exists with `pages/<slice>/index.ts`.
- The routes constants file and route table file are identified.

## Outputs

- Routes constants updated with new path constant.
- Route table updated with new entry and lazy import.
- `navigationMap.ts` updated if the project uses a navigation map.

## What this skill does NOT do

- Does not add navigation menu/sidebar entries — use `wire-navigation` for that.
- Does not create the page component — `create-page` does that.
- Does not change the URL structure of existing routes.
