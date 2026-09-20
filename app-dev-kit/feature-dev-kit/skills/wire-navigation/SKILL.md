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

2. **Add the `TextContent` key** for the navigation label (if not already in `shared/config/textContent.ts`):
   ```ts
   // shared/config/textContent.ts
   export const TextContent = {
     // existing entries...
     NAV_PROFILE_DETAIL: 'Profile Detail',
   } as const
   ```
   Use `UPPER_SNAKE_CASE` for the key, human-readable title case for the value. Invoke `add-text-content` if this step is needed.

3. **Add the menu/sidebar entry**: locate the correct position in the navigation hierarchy. Match the existing entry object shape exactly:
   ```ts
   // If navigation is a config array:
   {
     key: 'profile-detail',
     label: TextContent.NAV_PROFILE_DETAIL,
     path: navigationMap.profileDetail(profileId),
     icon: <ProfileIcon />,  // if icons are used
   }
   ```
   Place the entry in the correct section/group (e.g. same section as the parent profile route).

4. **Add a breadcrumb entry** if the application uses breadcrumbs:
   - Find the breadcrumb config or generation logic.
   - Add a mapping from the new route path to the breadcrumb label.
   - Ensure parent breadcrumbs are included for nested routes.

5. **Respect permissions/guards**: if adjacent navigation entries have role-based or permission-based visibility guards, apply the same guard pattern to the new entry. Do not add routes that bypass the application's access control.

6. **Run `yarn typecheck`**: verify the nav config is type-safe.

7. **Update the spec `## Build Plan`**: mark navigation tasks as done.

## Pre-conditions

- `add-route` has been run and the route path constant is available in `ROUTES`.
- `navigationMap` is updated with the link builder function.
- `TextContent` has the nav label key (or add it as part of this skill using `add-text-content`).

## Outputs

- Navigation config updated with new entry in the correct position.
- Breadcrumb config updated (if applicable).
- `TextContent` updated with new nav label key (if needed).

## What this skill does NOT do

- Does not create the route — `add-route` does that.
- Does not modify page components.
- Does not override existing permission guards — it only applies the same patterns already in use.
