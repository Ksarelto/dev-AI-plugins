---
name: create-entity
description: Scaffold an FSD entity slice (model + api + ui). Wraps add-api-domain logic into the entity's api segment (hooks, types, queryKeys, apiMap). Use for a new business entity (profile, document, client, file).
argument-hint: <EntityName>
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create Entity

Station 4. One business entity per `entities/<domain>/`. Used by `entities-engineer`.

## Steps

1. Scaffold with `create-slice`: `model/`, `api/`, `ui/`.
2. `model/` is types and pure transforms. No React, no HTTP. An enum the UI shows gets an enum → locale-key map (`LISTING_STATUS_KEY`) and `entities/<domain>/locales/` keys — never an enum → English string map.
3. `api/` hooks load **frontend-dev-kit:react-query-hook**. Keys live in `shared/api/query-keys/`, not beside the hook. HTTP goes through **frontend-dev-kit:api-client**.
4. Display components take props and do not call hooks. Load `create-react-component` (`frontend-dev-kit:react-component`, `tailwind-styles`, `testing`) — one kebab-case folder each. If the piece is a registry primitive and `shared/ui/<name>` is missing, stop and hand it to `shared-engineer`. Do not author a second dialog.
5. Export from `entities/<domain>/index.ts` only the names a file outside the slice imports — usually the hooks, the display components, and the domain type the features use. No `export *`.
6. Self-check (`{KIT_DIR}/skills/feature-dev/references/ui-build-contract.md` § 7). Mark the entity rows done in `## Build Plan`.

## Pre-conditions

- `shared/` exists.
- `## API Contract / Data Model` names the endpoints and types.

## What this skill does NOT do

- Does not create feature slices or install packages.
