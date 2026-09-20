---
name: create-entity
description: Scaffold an FSD entity slice (model + api + ui). Wraps add-api-domain logic into the entity's api segment (hooks, types, queryKeys, apiMap). Use for a new business entity (profile, document, client, file).
argument-hint: <EntityName>
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create Entity

## When to use

Station 4. Invoke to author `entities/<domain>/` after the shared layer exists. Used by `entities-engineer`. One invocation per business entity (profile, document, client, file).

## Steps

1. **Scaffold the slice** using `create-slice` for `entities/<domain>/` with segments `model/`, `api/`, `ui/`.

2. **Create `model/` types file** at `entities/<domain>/model/<domain>.types.ts`:
   - Define entity interface (e.g. `IProfile`) matching the spec's `## API Contract` response shape.
   - Define any status enums or union types (e.g. `ProfileStatus`).
   - Add the query keys constant: `export const <domain>QueryKeys = { all: ['<domain>'] as const }`.
   - No React, no Axios, no side effects in this file.

3. **Create `api/` hooks file** at `entities/<domain>/api/<domain>.hooks.ts`:
   - Import `queryHandler`, `apiRequest`, `apiMap` from `shared/api/`.
   - Implement each `useQuery` hook following the pattern from `.claude/rules/api-patterns.md`:
     ```ts
     export const useGet<Entity> = (id: string) =>
       useQuery({
         queryKey: [...<domain>QueryKeys.all, id],
         queryFn: () => queryHandler(apiRequest.get<IEntity>(apiMap.<domain>.v1.<endpoint>(id))),
         enabled: !!id,
         refetchInterval: REFRESH_INTERVAL,
       })
     ```
   - Implement each `useMutation` hook:
     ```ts
     export const use<Action><Entity> = () => {
       const queryClient = useQueryClient()
       return useMutation({
         mutationFn: (payload: I<Action>Payload) =>
           apiRequest.post<IEntity>(apiMap.<domain>.v1.<endpoint>(), payload),
         onSuccess: () => {
           queryClient.invalidateQueries({ queryKey: <domain>QueryKeys.all })
           notifySuccess(TextContent.<ACTION>_<ENTITY>)
         },
       })
     }
     ```

4. **Add URL builder to `apiMap`** (or note the file path if `apiMap` is in the legacy `src/utils/apiMap.ts`):
   ```ts
   const <domain> = {
     v1: (() => {
       const v1Root = `${ENV.<DOMAIN>_URL}/v1`
       return {
         list: (params?) => `${v1Root}/<domain>s` + getQueryString(params),
         get: (id: string) => `${v1Root}/<domain>s/${encodeURI(id)}`,
       }
     })(),
   }
   ```

5. **Create `ui/` display components** at `entities/<domain>/ui/` for read-only entity display:
   - Use `shared/ui` shadcn components as the base.
   - Apply Tailwind classes + CVA variants per `rules/styling-conventions.mdc`.
   - Components receive entity data as props — they do not call API hooks.
   - Co-locate a `.test.tsx` file for each component.

6. **Update `entities/<domain>/index.ts`** with all public exports:
   ```ts
   export type { IProfile, ProfileStatus } from './model/profile.types'
   export { profileQueryKeys } from './model/profile.types'
   export { useGetProfile, useGetProfiles, useUpdateProfile } from './api/profile.hooks'
   export { ProfileCard, ProfileStatusBadge } from './ui'
   ```

7. **Run `yarn typecheck`**: fix all TypeScript errors before returning.

8. **Update the spec `## Build Plan`**: mark the entity tasks as done, list files created.

## Pre-conditions

- `shared/` layer exists and `apiRequest`, `queryHandler`, `apiMap`, `notifySuccess`, `TextContent` are accessible.
- The spec's `## API Contract / Data Model` provides endpoint and type information.

## Outputs

- `entities/<domain>/model/<domain>.types.ts` — types and query keys.
- `entities/<domain>/api/<domain>.hooks.ts` — query and mutation hooks.
- `entities/<domain>/ui/` — display components with colocated tests.
- `entities/<domain>/index.ts` — public API.
- `apiMap` updated with domain URL builders.

## What this skill does NOT do

- Does not create feature slices (interaction logic).
- Does not modify other entity slices.
- Does not install packages (those require human approval at station 1b).
