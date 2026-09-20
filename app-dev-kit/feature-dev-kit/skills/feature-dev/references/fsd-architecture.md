# FSD Architecture (target)

**Style**: Feature-Sliced Design | supersedes legacy layered `architecture.md` for generated code.

---

## Layers

Layers run top-to-bottom. A layer may only import from layers **strictly below** it. Never sideways, never upward.

| Layer | Description | Segments used | May import from | Must NOT contain |
|-------|-------------|---------------|-----------------|------------------|
| `app` | Providers, router, global styles, app bootstrap | `providers/`, `router/`, `styles/` | All layers | Business logic, API calls |
| `pages` | Route screens — thin composition of widgets/features | `ui/`, `index.ts` | `widgets`, `features`, `entities`, `shared` | State logic, direct API calls |
| `widgets` | Large self-contained UI blocks reused across pages | `ui/`, `model/`, `api/`, `lib/`, `index.ts` | `features`, `entities`, `shared` | Page-level routing, app providers |
| `features` | Single user interaction / action per slice | `ui/`, `model/`, `api/`, `lib/`, `index.ts` | `entities`, `shared` | Multi-action business flows, widget composition |
| `entities` | Business objects: their data, API hooks, and display UI | `ui/`, `model/`, `api/`, `lib/`, `config/`, `index.ts` | `shared` | Feature logic, user-interaction handlers |
| `shared` | Primitives, utilities, design system; domain-agnostic | `ui/`, `api/`, `lib/`, `config/`, `hooks/` | Nothing above it | Business domain concepts |

---

## Slices and Segments

A **slice** partitions a layer by business domain (e.g. `entities/profile`, `features/decline-profile`).

A **segment** partitions a slice by technical purpose:

| Segment | Contents |
|---------|----------|
| `ui/` | React components and styled wrappers for this slice |
| `model/` | State, derived selectors, TypeScript types for this slice |
| `api/` | TanStack Query hooks, mutation hooks, query keys |
| `lib/` | Pure utilities, validators, formatters — no side effects |
| `config/` | Constants, enums, text content scoped to this slice |
| `index.ts` | **Public API** — the only legal import surface |

---

## Public API Rule

Every slice MUST have `index.ts`. It is the only file external code may import from.

```ts
// entities/profile/index.ts
export type { IProfile, ProfileStatus } from './model/profile.types'
export { ProfileCard } from './ui/ProfileCard'
export { useGetProfile, useGetProfiles } from './api/profile.hooks'
export { profileQueryKeys } from './api/profile.queryKeys'
```

Rules:
- No wildcard re-exports (`export * from './ui/ProfileCard'` is forbidden).
- No deep imports into internals from outside the slice.
- If something is not in `index.ts`, it is private to the slice.

---

## Mapping Existing Stack to FSD

| Current `src/*` path | FSD target location |
|----------------------|---------------------|
| `src/utils/apiRequest.ts` | `shared/api/apiRequest.ts` |
| `src/utils/apiMap.ts` | `shared/api/apiMap.ts` |
| `src/api/utils.ts` (`queryHandler`) | `shared/api/queryHandler.ts` |
| `src/utils/env.ts` | `shared/config/env.ts` |
| `src/utils/errorHandler.ts` | `shared/lib/errorHandler.ts` |
| `src/utils/notification/` | `shared/lib/notification.ts` |
| `src/utils/navigationMap.ts` | `shared/config/navigationMap.ts` |
| `src/utils/routes.ts` | `shared/config/routes.ts` |
| `src/enums/` | `shared/config/enums/` |
| `src/constants/textContent.ts` | `shared/config/textContent.ts` |
| `src/constants/testId.ts` | `shared/config/testId.ts` |
| `src/theme/` | `shared/ui/theme/` |
| `src/components/` (presentational) | `shared/ui/` (shadcn wrappers) |
| `src/api/<domain>/` hooks | `entities/<domain>/api/` |
| `src/api/constants.ts` queryKeys | co-located in each `entities/<domain>/api/<domain>.queryKeys.ts` |
| `src/containers/` (smart) | `features/<action>/` or `widgets/<block>/` |
| `src/pages/` | `pages/<page>/` |
| `src/authentication/` | `app/providers/` |
| `src/hooks/` (shared) | `shared/hooks/` |
| `src/mocks/` | `shared/mocks/` (test utilities) |

---

## Which Layer a Thing Goes In — Decision Guide

```
Is it domain-agnostic (utility, primitive, design system)?
  YES → shared/

Does it represent a business object with its own data shape and API?
  YES → entities/<domain>/

Is it a single user action/interaction (a form, button that triggers one mutation)?
  YES → features/<action>/

Is it a large reusable UI block composed of multiple features and entities?
  YES → widgets/<block>/

Is it a route screen that composes widgets/features into a full page?
  YES → pages/<page>/

Is it a global provider, router, or app bootstrap concern?
  YES → app/
```

| Concrete thing | Layer + slice |
|----------------|---------------|
| Profile status badge component | `entities/profile/ui/` |
| `useGetProfiles` hook | `entities/profile/api/` |
| "Decline profile" button + confirmation modal | `features/decline-profile/` |
| Document review panel with tabs | `widgets/document-review/` |
| `/profiles` route page | `pages/profiles-page/` |
| `cn()`, `formatDate()` | `shared/lib/` |
| `Button`, `Input` (shadcn wrappers) | `shared/ui/` |

---

## Segment Responsibilities

| Segment | Purpose | May import | Must NOT contain |
|---------|---------|------------|------------------|
| `api/` | Query/mutation hooks, URL builders, API DTOs | `shared/api`, `shared/lib`, `shared/config` | React components, UI state |
| `model/` | Entity types, interaction state types, factory functions | own `types`, pure TS stdlib | React, hooks, Axios, side effects |
| `ui/` | Feature/entity display and interaction components | `shared/ui`, own `model/`, own `api/` (via state/) | Direct Axios calls, other slices' internals |
| `lib/` | Pure formatters, validators, mappers | own `model/`, own types | React, network calls, side effects |
| `config/` | Constants, enums, text content | nothing | Runtime code |
| `index.ts` | Re-exports the slice's public surface | — | Wildcard `export *` of internals |

---

## Coexistence with Legacy Code

New features are built in FSD. Legacy layered code (`src/containers/`, `src/components/`, `src/api/`) continues to work unchanged.

Bridge rule: when new FSD code needs legacy utilities, import them through a `shared/` re-export adapter. Do not import directly from `src/utils/` paths inside FSD slices — adapt them into `shared/` first. Legacy code calling new FSD entities is permitted only through the slice's `index.ts`.
