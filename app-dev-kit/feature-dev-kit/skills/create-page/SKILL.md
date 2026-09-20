---
name: create-page
description: Scaffold an FSD page slice — a route-level screen composed from widgets/features/entities. Default export allowed per repo convention. Use after the widgets/features it composes exist.
argument-hint: <PageName>
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create Page

## When to use

Station 6. Invoke to author `pages/<slice>/` route screens. Used by `composition-engineer`. Each distinct route is one page slice. Examples: `profiles-page`, `profile-detail-page`, `document-review-page`.

## Steps

1. **Scaffold the slice** using `create-slice` for `pages/<slice>/` with segment `ui/`.

2. **Build the page component** at `pages/<slice>/ui/<PageName>.tsx`:
   - Pages are thin composition — they import widgets, features, and entities via their `index.ts` and arrange them on the screen.
   - No business logic, no direct API calls, no form handling — delegate those to feature and entity slices.
   - Local layout state (e.g. selected tab from URL params) is acceptable with `useState` or `useSearchParams`.
   - Handle the full-page loading state with a viewport-filling skeleton.
   - Handle the full-page error state with an inline error message and retry action.
   - Use the page layout conventions consistent with existing pages (read existing page files first).

3. **Default export allowed**: the page component may use a default export (the single exception to the named-exports rule):
   ```tsx
   // pages/profiles-page/ui/ProfilesPage.tsx
   const ProfilesPage = (): JSX.Element => (
     <main>
       <ProfilesWidget />
     </main>
   )
   export default ProfilesPage
   ```

4. **Re-export for lazy import** in `pages/<slice>/index.ts`:
   ```ts
   export { default as ProfilesPage } from './ui/ProfilesPage'
   // OR simply:
   export { default } from './ui/ProfilesPage'
   ```
   The `app` layer uses this for `React.lazy(() => import('@/pages/profiles-page'))`.

5. **Co-locate tests** at `pages/<slice>/ui/<PageName>.test.tsx`. Test that the page renders its key widgets without crashing, and that loading/error states are handled.

6. **Run `yarn typecheck`**: fix all TypeScript errors.

7. **Update the spec `## Build Plan`**: mark page tasks as done, list files created.

8. **Follow up with `add-route`** to register this page in the `app` routing table.

## Pre-conditions

- All widget and feature slices the page composes exist with their `index.ts` public APIs.
- The spec's `## UI Surface` describes the page layout and states.

## Outputs

- `pages/<slice>/ui/<PageName>.tsx` — the route screen component (default export).
- `pages/<slice>/ui/<PageName>.test.tsx` — co-located tests.
- `pages/<slice>/index.ts` — public API (re-exports the default for lazy import).

## What this skill does NOT do

- Does not register the route — use `add-route` after this skill.
- Does not add navigation entries — use `wire-navigation` after `add-route`.
- Does not contain business logic, forms, or direct API calls.
- Does not create widgets or features.
