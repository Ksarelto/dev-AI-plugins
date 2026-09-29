---
name: add-route
description: Wire the routing table and lazy page import in the app layer. Use after a page slice is created to make it reachable.
argument-hint: <route-path> <PageName>
disable-model-invocation: false
allowed-tools: [Read, Edit, Glob, Grep]
---

# Add Route

Station 7, after `create-page`. Pair with `wire-navigation`.

Load **frontend-dev-kit:routing**. Add an authenticated page to `app/router/root/routes.tsx` and a login/signup page to `app/router/auth/routes.tsx`. Use `lazyFeature()`. Do not grow `routes.ts` — it only spreads `auth`, `error`, and `root`. Do not add `AuthLayout`. Guards are wrapper routes. Do not add a bare `React.lazy`. Route modules that contain logic get a behavior test in that folder's `tests/`.

Mark the route row done in `## Build Plan`.

## What this skill does NOT do

- Does not add sidebar or breadcrumb entries (`wire-navigation`).
- Does not create the page (`create-page`).
- Does not change existing URLs.
