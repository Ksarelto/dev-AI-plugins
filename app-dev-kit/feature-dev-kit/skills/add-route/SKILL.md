---
name: add-route
description: Wire the routing table and lazy page import in the app layer, with every route wrapped in a route error boundary. Use after a page slice is created to make it reachable.
argument-hint: <route-path> <PageName>
disable-model-invocation: false
allowed-tools: [Read, Edit, Glob, Grep]
---

# Add Route

Station 7, after `create-page`. Pair with `wire-navigation`.

Load **frontend-dev-kit:routing**. Add an authenticated page to `app/router/root/routes.tsx` and a login/signup page to `app/router/auth/routes.tsx`. Use `lazyFeature()`. Do not grow `routes.ts` — it only spreads `auth`, `error`, and `root`. Do not add `AuthLayout`. Guards are wrapper routes. Do not add a bare `React.lazy`.

Every page element is `withRouteBoundary(<Page />)` from `app/router/route-boundary` — an error boundary that resets on path change plus the `Suspense` fallback — so one page crashing never unmounts the app shell. If `route-boundary/` does not exist, create it once from `frontend-dev-kit:routing` (`with-route-boundary.tsx`, `route-boundary.tsx`, `route-fallback.tsx`) and `error-handling`. Do not wrap a route in a second boundary inside the page.

Route modules that contain logic (including `route-boundary/`) get a behavior test in that folder's `tests/`.

Mark the route row done in `## Build Plan`.

## What this skill does NOT do

- Does not add sidebar or breadcrumb entries (`wire-navigation`).
- Does not create the page (`create-page`).
- Does not change existing URLs.
