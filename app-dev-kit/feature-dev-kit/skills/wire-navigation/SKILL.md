---
name: wire-navigation
description: Add sidebar menu, navigation, and breadcrumb entries in the app layer for an already-routed screen. Use with add-route so the screen appears in the nav UI. Not for scaffolding the page slice.
argument-hint: <PageName> <nav-label>
disable-model-invocation: false
allowed-tools: [Read, Edit, Glob, Grep]
---

# Wire Navigation

## When to use

Station 7. Invoke with or after `add-route` to make the new page discoverable in the application's navigation UI. Used by `app-engineer`. Always run after `add-route`.

## Steps

1. **Read the existing navigation structure**: use `Glob` and `Read` to find the navigation config file (sidebar menu config, nav items array, or navigation component). Read all existing entries to understand the shape, grouping, and labelling conventions before making any changes.

2. **Add the nav label** via `add-text-content` (`frontend-dev-kit:i18n`) if it is not already a key.

3. **Add the menu/sidebar entry**: locate the correct position in the navigation hierarchy. Match the existing entry object shape exactly. When navigation is a config array, the entry stores the **key**, and the menu component renders `t(item.labelKey)`:
   ```ts
   {
     id: NavItemId.ProfileDetail,
     labelKey: commonKeys.nav.profileDetail,
     path: navigationMap.profileDetail(profileId),
     icon: UserRound,
   }
   ```
   Keep `icon` only when adjacent entries have one. Place the entry in the correct section/group (e.g. same section as the parent profile route). A config holding English labels (`label: 'Profile'`) is a string map — convert the entry you touch to a key.

4. **Add a breadcrumb entry** if the application uses breadcrumbs:
   - Find the breadcrumb config or generation logic.
   - Add a mapping from the new route path to the breadcrumb label.
   - Ensure parent breadcrumbs are included for nested routes.

5. **Respect permissions/guards**: if adjacent navigation entries have role-based or permission-based visibility guards, apply the same guard pattern to the new entry. Do not add routes that bypass the application's access control.

6. **Run `yarn typecheck`**: verify the nav config is type-safe.

7. **Mark your Build Plan rows done**: `node {KIT_DIR}/skills/feature-dev/scripts/board.mjs row .spec/features/<slug>.md --row <n> --status done --note "<files — one line>"`.

## Pre-conditions

- `add-route` has been run and the route path constant is available in `ROUTES`.
- `navigationMap` is updated with the link builder function.
- The nav label exists (or add it with `add-text-content`).

## Outputs

- Navigation config updated with new entry in the correct position.
- Breadcrumb config updated (if applicable).
- Nav label key added when it was missing.

## What this skill does NOT do

- Does not create the route — `add-route` does that.
- Does not modify page components.
- Does not override existing permission guards — it only applies the same patterns already in use.
