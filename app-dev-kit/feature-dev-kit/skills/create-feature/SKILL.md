---
name: create-feature
description: Scaffold an FSD feature (interaction) slice with typed handlers and mutations — one user action that delivers business value (create/edit/decline, filters). Use after the relevant entities exist.
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
4. `ui/` is the interaction (form, button, dialog). Copy via `add-text-content` (`frontend-dev-kit:i18n`). Components via `create-react-component` — one kebab-case folder each. If the piece is a registry primitive and `shared/ui/<name>` is missing, stop and hand it to `shared-engineer`. Do not author a second dialog. `disabled={isPending}` while the mutation runs. Component test is colocated (`frontend-dev-kit:testing`).
5. Pure validators that do not need form state go in `lib/`.
6. Import entities only through their `index.ts`. Export from `features/<slice>/index.ts` only what the widget or page already imports.
7. One Storybook file for the whole feature: `features/<slice>/<slice>.stories.tsx`, rendering the public entry and its states. Do not add stories for inner parts.
8. `yarn typecheck`. Mark the feature rows done in `## Build Plan`.

## Pre-conditions

- The entity slice exists and exports its public API.
- `## UI Surface` describes the interaction.

## What this skill does NOT do

- Does not create entities, routes, widgets, or pages.
