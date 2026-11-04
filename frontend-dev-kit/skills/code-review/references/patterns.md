# Patterns — right pattern, right place

Two questions per changed module: is the **pattern this stack prescribes** used where it applies,
and is a pattern **added where nothing needs it**? Missing and gratuitous patterns are both findings.
Do not require a named pattern the screen does not need (`design.md`).

## Prescribed patterns — flag the deviation

| Situation | Expected pattern | Deviation to flag |
|---|---|---|
| Stateful or effectful logic in a component | Custom hook in the slice `hooks/`, pure rules in `models/` | Logic inline in JSX/handlers; a hook that imports UI |
| Server data | Every query and mutation hook in the owning slice's `api/hooks.ts`; fetcher in `api/fetchers.ts`; keys from `shared/api/query-keys/`. Feature `hooks/` calls `api/hooks.ts` | `api/useThing.ts`; `useQuery` in `hooks/` or `ui/`; inline `['orders', id]`; server data copied to `useState` or a store |
| API boundary | zod schema in `api/schema.ts` + DTO mapper (anti-corruption layer) in `api/` | DTO shape leaking into `ui/`; callers re-checking entity fields |
| Variants of a look | `cva` variant in `styles.ts` (strategy by lookup) | Call-site `className` override; boolean props that toggle classes |
| Many cases of one thing | Lookup map / fields array / `field.render` | `switch` or `if` chains repeated per render; second `switch` on the same union |
| State with modes | Discriminated union (`status: 'idle' \| 'loading' \| 'error'`), early return per branch | Parallel booleans (`isLoading`, `isError`, `hasData`) that can disagree |
| Shared client state | Zustand store created by a session-keyed factory in `models/` | Module-level singleton store; persisted server data; no `sessionKey` in the persist name |
| Cross-cutting dependency | Provider at `app/providers/` (dependency injection), consumed via a hook | Module-level singletons, `QueryClient` built at import, feature reading `import.meta.env` |
| Compound UI | Composition with `children` and the primitive's parts (shadcn compound parts) | Prop-driven mega-component (`<Card header footer actions …/>`) |
| Failure handling | `AppError` kinds, error boundary at the route/feature seam, toast for mutations | `try/catch` that swallows; per-component error rendering of the same case |
| Cross-slice interaction | Composition in a page/widget, a shared entity, or the shared query-key registry | Feature imports feature; event bus; deep import |
| Public surface | One `index.ts` per slice exporting only what outsiders import (facade) | Barrel of everything; `export *`; deep import into a segment |
| Forms | `react-hook-form` + zod schema, feature form guard | Hand-rolled field state and validation |

## Patterns that need a justification — flag when absent

- **Abstraction with one caller** — wrapper hook, `Base*` component, generic util, Context with one
  consumer. Keep it inline until the second real consumer.
- **Context for frequently changing data** — rerenders every consumer; use a store with selectors
  or colocate the state.
- **Render props / HOCs** in new code — prefer hooks or composition unless a library requires them.
- **Memoization** (`memo`, `useMemo`, `useCallback`) — the React Compiler is on. Flag it unless an
  effect dependency needs a stable reference or a profile names the hotspot.
- **Inheritance, class components, mixins** — none belong in this stack.
- **Event emitters / pub-sub** between slices — hidden coupling; use the query cache or composition.

## Anti-patterns

- **God component / god hook** — more than one responsibility, or a return object most callers use
  one key of.
- **Prop drilling past 2 levels** — compose with `children` or read from a store/context.
- **Effect as a data pipeline** — `useEffect` that derives state, syncs two states, or fetches.
- **Stringly typed switches** — raw strings for a closed set instead of the constant/union.
- **Copy-paste inheritance** — a pasted component with a few changed lines instead of a variant or a
  prop.
- **Leaky abstraction** — a `shared/ui` wrapper that exposes the library it hides.
- **Golden hammer** — one pattern (a store, a context, a HOC) applied to every problem.
