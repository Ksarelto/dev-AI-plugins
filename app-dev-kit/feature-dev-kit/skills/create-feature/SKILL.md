---
name: create-feature
description: Scaffold an FSD feature (interaction) slice with typed handlers and mutations — one user action that delivers business value (create/edit/decline, filters). Use after the relevant entities exist.
argument-hint: <feature-name>
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create Feature

## When to use

Station 5. Invoke to author `features/<slice>/` for a single user interaction (one action per slice). Used by `features-engineer`. Examples: `decline-profile`, `create-profile`, `apply-filters`.

When the slice has a form, read `references/form-patterns.md` once. Do not read `rules/form-patterns.mdc` — it is already attached by glob.

## Steps

1. **Scaffold the slice** using `create-slice` for `features/<slice>/` with segments `model/`, `ui/`, and `api/` (only if feature-specific mutations are needed — entity mutations stay in `entities/`).

2. **Create `model/` types and form schema** at `features/<slice>/model/<slice>.model.ts`:
   - Define the form schema using Zod (per `rules/form-patterns.mdc`):
     ```ts
     const declineProfileSchema = z.object({ reason: z.string().max(500).optional() })
     export type DeclineProfileFormValues = z.infer<typeof declineProfileSchema>
     ```
   - Create the `useForm` factory hook:
     ```ts
     export const useDeclineProfileForm = () =>
       useForm<DeclineProfileFormValues>({
         resolver: zodResolver(declineProfileSchema),
         defaultValues: { reason: '' },
       })
     ```

3. **Create `api/` mutation hooks** (only if the mutation is exclusively for this interaction and does not belong in the entity):
   - Follow the mutation pattern from `.claude/rules/api-patterns.md`.
   - Import entity query keys from the entity's `index.ts` for `invalidateQueries`.

4. **Create `ui/` components** at `features/<slice>/ui/`:
   - Build the interaction component (form, action button, confirmation modal) using shadcn `Form` + RHF wiring from `rules/form-patterns.mdc`.
   - Handle all states: idle, pending (disabled inputs), success (close modal), error (show inline error).
   - Use `shared/ui` shadcn components as the base.
   - Pass `disabled={isPending}` to all inputs and the submit button during mutation.
   - Co-locate a `.test.tsx` file for each UI component.

5. **Validate pure logic** in `features/<slice>/lib/` (if needed): extract field validators and formatters that do not depend on React or RHF. These must be unit-testable without rendering.

6. **Wire imports**: consume entity public APIs via their `index.ts` imports — never import from entity internals. Use `TextContent.KEY` for all user-facing strings.

7. **Update `features/<slice>/index.ts`** with only what the composing widget or page needs:
   ```ts
   export { DeclineProfileModal } from './ui/DeclineProfileModal'
   ```
   Do not re-export internal model hooks or mutation hooks unless the composing layer explicitly needs them.

8. **Run `yarn typecheck`**: fix all TypeScript errors before returning.

9. **Update the spec `## Build Plan`**: mark the feature tasks as done, list files created.

## Pre-conditions

- `entities/<domain>/` exists with the relevant query hooks and types exported.
- `shared/ui` has the required shadcn primitives (Form, Button, Input/Textarea, Dialog, etc.).
- The spec's `## UI Surface` describes the interaction flow and form fields.

## Outputs

- `features/<slice>/model/<slice>.model.ts` — form schema, `useForm` hook.
- `features/<slice>/api/<slice>.hooks.ts` — feature-specific mutation hooks (if needed).
- `features/<slice>/ui/` — interaction components with colocated tests.
- `features/<slice>/lib/` — pure validators/formatters (if needed).
- `features/<slice>/index.ts` — public API.

## What this skill does NOT do

- Does not create entity slices or modify entity hooks.
- Does not add routes or navigation (use `add-route` and `wire-navigation`).
- Does not write the containing widget or page (use `create-widget`/`create-page`).
