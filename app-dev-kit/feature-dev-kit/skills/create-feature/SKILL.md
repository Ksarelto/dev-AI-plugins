---
name: create-feature
description: Scaffold an FSD feature (interaction) slice with typed handlers and mutations, wrapped in an error boundary with its own translated locales — one user action that delivers business value (create/edit/decline, filters). Use after the relevant entities exist.
argument-hint: <feature-name>
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create Feature

Station 5. One user action per `features/<slice>/`. Used by `features-engineer`.

## Steps

1. Scaffold with `create-slice`: `model/`, `ui/`, and `api/` only when the mutation belongs to this interaction.
2. `model/` holds local interaction state. A form loads **frontend-dev-kit:rhf-form** (Zod schema, `useForm`, shadcn `Form`). Do not hand-write a parallel values interface.
3. Feature-only mutations load **frontend-dev-kit:react-query-hook**. Read hooks stay on the entity. Invalidate through `shared/api/query-keys/`.
4. `ui/` is the interaction (form, button, dialog). Copy — labels, placeholders, toasts, zod messages, `aria-label` — goes to `features/<slice>/locales/en.json` + `keys.ts` via `add-text-content` (`frontend-dev-kit:i18n`); reuse `common` keys for Save / Cancel / Retry. Components via `create-react-component` — one kebab-case folder each, classes in `styles.ts`. If the piece is a registry primitive and `shared/ui/<name>` is missing, stop and hand it to `shared-engineer`. Do not author a second dialog. Compose dialogs, selects, and menus in the part order of the registry demo (`get_item_examples_from_registries`). Handlers are named (`handleOpenChange`, `handleCancel`) above the return. `disabled={isPending}` while the mutation runs; the pending label is computed before the return. Closed-set props use constants (`ButtonVariant.Outline`); defaults are omitted. Component test is colocated (`frontend-dev-kit:testing`), mocking only the fetcher.
5. **Error boundary.** The entry component `index.ts` exports wraps the content component in `<ErrorBoundary resetKeys={[…]}>` from `@/shared/ui/error-boundary` (`frontend-dev-kit:error-handling` § Every feature). Hooks live in the content component, below the boundary. A missing `shared/ui/error-boundary` goes to `shared-engineer`.
6. Pure validators that do not need form state go in `lib/`.
7. Import entities only through their `index.ts`. Export from `features/<slice>/index.ts` only what the widget or page already imports — usually the entry component alone.
8. One Storybook file for the whole feature: `features/<slice>/<slice>.stories.tsx`, rendering the public entry and its states. Do not add stories for inner parts.
9. Self-check (`{KIT_DIR}/skills/feature-dev/references/ui-build-contract.md` § 7). Mark the feature rows done in `## Build Plan`, and the `prototype-inventory.md` rows this feature renders.

## Pre-conditions

- The entity slice exists and exports its public API.
- `## UI Surface` describes the interaction.

## What this skill does NOT do

- Does not create entities, routes, widgets, or pages.
