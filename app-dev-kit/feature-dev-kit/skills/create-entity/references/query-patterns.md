On-demand recipe. Read this file only when the skill that owns it tells you to. The matching rule under `rules/` is the constraint list and is already attached by glob — do not read it again.


# TanStack Query v5 Patterns

**Version**: TanStack Query 5 | **Context**: FSD `entities/` and `features/` layers

---

## File Placement in FSD

| Concern | Segment | Example file |
|---------|---------|--------------|
| Query + mutation hooks | `entities/<name>/api/` | `profile.queries.ts` |
| Infinite / paginated queries | `entities/<name>/api/` | `profileList.queries.ts` |
| `queryOptions` factories | co-located with hooks | `profile.queries.ts` |
| Feature-specific mutations | `features/<action>/api/` | `declineProfile.api.ts` |
| Query keys | `entities/<name>/model/` | `profile.queryKeys.ts` |
| Global QueryClient | `shared/api/` | `queryClient.ts` |

---

## `queryOptions()` Factory Pattern

Extract query configs with `queryOptions()` so the same definition is reused in hooks, prefetching, suspense, and `setQueryData` — without duplicating or losing type safety.

```ts
// entities/profile/api/profile.queries.ts
import { queryOptions } from '@tanstack/react-query'
import { queryHandler } from '@/shared/api/queryHandler'
import { apiRequest } from '@/shared/api/apiRequest'
import { apiMap } from '@/shared/config/apiMap'
import { profileQueryKeys } from '../model/profile.queryKeys'
import type { IProfile } from '../model/profile.types'

export const profileQueryOptions = (profileId: string) =>
  queryOptions({
    queryKey: profileQueryKeys.detail(profileId),
    queryFn: () => queryHandler(apiRequest.get<IProfile>(apiMap.profiles.v1.profile.get(profileId))),
    enabled: !!profileId,
  })
```

**One factory, used everywhere:**

```ts
// Hook
useQuery(profileQueryOptions(id))

// Suspense hook (data is always defined — no null check)
useSuspenseQuery(profileQueryOptions(id))

// Prefetch on hover
queryClient.prefetchQuery(profileQueryOptions(id))

// Typed setQueryData
queryClient.setQueryData(profileQueryOptions(id).queryKey, updatedProfile)

// Parallel with combine
useQueries({
  queries: ids.map(id => profileQueryOptions(id)),
  combine: results => ({
    profiles: results.map(r => r.data),
    isPending: results.some(r => r.isPending),
  }),
})
```

---

## Query Keys Factory

Hierarchical key factory enables precise invalidation.

```ts
// entities/profile/model/profile.queryKeys.ts
export const profileQueryKeys = {
  all: ['profiles'] as const,
  lists: () => [...profileQueryKeys.all, 'list'] as const,
  list: (config: ITableConfig) => [...profileQueryKeys.lists(), config] as const,
  details: () => [...profileQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...profileQueryKeys.details(), id] as const,
}

// Invalidate all profiles
queryClient.invalidateQueries({ queryKey: profileQueryKeys.all })

// Invalidate all list queries only
queryClient.invalidateQueries({ queryKey: profileQueryKeys.lists() })

// Invalidate a single profile
queryClient.invalidateQueries({ queryKey: profileQueryKeys.detail(id) })
```

---

## Standard Query Hook

```ts
export const useGetProfile = (
  profileId: string,
  refetchInterval: RefetchIntervalType = REFRESH_INTERVAL,
) =>
  useQuery({
    ...profileQueryOptions(profileId),
    refetchInterval,
  })
```

**Rules:**
- `enabled: !!id` to skip the fetch when ID is empty or undefined.
- Pass `refetchInterval` from `REFRESH_INTERVAL` constant unless overriding.
- Query data type is `T | null` when using `queryHandler` (it swallows errors and returns null).

---

## `useSuspenseQuery` — Data Always Defined

Use for data-critical views where loading/error should be handled at layout level, not inline.

```tsx
// entities/profile/ui/ProfileHeader.tsx
// data is IProfile — never null, no guard needed
const { data: profile } = useSuspenseQuery(profileQueryOptions(profileId))

// Must be wrapped in Suspense + ErrorBoundary at the caller
<QueryErrorResetBoundary>
  {({ reset }) => (
    <ErrorBoundary onReset={reset} fallback={<ProfileErrorState onRetry={reset} />}>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileHeader profileId={id} />
      </Suspense>
    </ErrorBoundary>
  )}
</QueryErrorResetBoundary>
```

**When to choose:**
- `useSuspenseQuery` — data-critical UI where loading boundary is at layout level.
- `useQuery` — inline loading/empty/error states inside the component itself.

---

## Mutation Hook

```ts
// features/decline-profile/api/declineProfile.api.ts
export const useDeclineProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: IDeclineProfilePayload) =>
      apiRequest.post(apiMap.profiles.v1.profile.decline(payload.id), payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKeys.all })
      notifySuccess(TextContent.PROFILE_DECLINED)
    },
    onError: (error) => {
      if (isErrorResponse(error)) errorHandler(error)
    },
  })
}
```

**Rules:**
- `mutationFn` calls `apiRequest` directly (not `queryHandler`) — mutations handle their own errors.
- Always `invalidateQueries` in `onSuccess` for affected domain keys.
- Use `onSettled` instead of `onSuccess` for invalidation when doing optimistic updates — runs on both success and error.
- `notifySuccess(TextContent.KEY)` in `onSuccess` for user feedback.
- `isErrorResponse` guard before `errorHandler` in `onError`.

---

## Optimistic Updates

**Pattern A — Variable-based (simpler; use when one UI location shows the optimistic state):**

```ts
const { mutate, isPending, variables } = useMutation({
  mutationFn: (payload: ICreateProfilePayload) =>
    apiRequest.post(apiMap.profiles.v1.create(), payload),
  onSettled: () => queryClient.invalidateQueries({ queryKey: profileQueryKeys.lists() }),
})

// In JSX — show pending item with opacity
{isPending && <ProfileRow data={variables} style={{ opacity: 0.5 }} />}
```

**Pattern B — Cache-based (use when multiple disconnected UI locations need the optimistic state):**

```ts
return useMutation({
  mutationFn: (payload: IUpdateProfilePayload) =>
    apiRequest.put(apiMap.profiles.v1.profile.update(payload.id), payload),
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: profileQueryKeys.detail(newData.id) })
    const previous = queryClient.getQueryData<IProfile>(profileQueryKeys.detail(newData.id))
    queryClient.setQueryData(profileQueryKeys.detail(newData.id), newData)
    return { previous }
  },
  onError: (_err, newData, context) => {
    queryClient.setQueryData(profileQueryKeys.detail(newData.id), context?.previous)
  },
  onSettled: (_data, _err, variables) => {
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.detail(variables.id) })
  },
})
```

---

## Paginated Lists with `placeholderData`

Prevent flicker when transitioning between pages.

```ts
export const useGetProfiles = (config: ITableConfig) =>
  useQuery({
    queryKey: profileQueryKeys.list(config),
    queryFn: () => queryHandler(apiRequest.get<IGetProfilesResponse>(apiMap.profiles.v1.get(config))),
    placeholderData: (previousData) => previousData,  // show previous page while loading next
  })

// isPlaceholderData — disable "next page" button while transitioning
const { data, isPlaceholderData } = useGetProfiles(config)
<Button disabled={isPlaceholderData || !data?.hasMore}>Next</Button>
```

---

## Infinite Queries

```ts
export const useGetProfilesInfinite = (config: Omit<ITableConfig, 'page'>) =>
  useInfiniteQuery({
    queryKey: profileQueryKeys.list(config),
    queryFn: ({ pageParam }) =>
      queryHandler(apiRequest.get<IGetProfilesResponse>(apiMap.profiles.v1.get({ ...config, page: pageParam }))),
    initialPageParam: 1,                          // mandatory in v5
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      lastPage?.items?.length ? lastPageParam + 1 : undefined,
    maxPages: 20,                                 // caps memory usage
  })
```

**Access data:**
- `data.pages` — array of page results
- `data.pageParams` — array of page params used
- `isFetchingNextPage` — shows "load more" spinner; `isPending` — shows initial skeleton

---

## Prefetching

```ts
// Hover/focus prefetch
const queryClient = useQueryClient()
const handleMouseEnter = () => queryClient.prefetchQuery(profileQueryOptions(id))

// Declarative prefetch — before a Suspense boundary
usePrefetchQuery(profileQueryOptions(id))  // starts fetch; ignores result

// Seed item caches from a list response
listData.forEach(profile => {
  queryClient.setQueryData(profileQueryOptions(profile.id).queryKey, profile)
})
```

---

## `select` — Derived Data in Hooks

Use `select` to produce computed/filtered values in hooks instead of computing in components.

```ts
// Stable reference — enables memoization
const selectActiveProfiles = (data: IGetProfilesResponse) =>
  data.items.filter(p => p.status !== ProfileStatus.DECLINED)

export const useGetActiveProfiles = (config: ITableConfig) =>
  useQuery({
    queryKey: profileQueryKeys.list(config),
    queryFn: () => queryHandler(apiRequest.get<IGetProfilesResponse>(apiMap.profiles.v1.get(config))),
    select: selectActiveProfiles,  // named reference — not inline arrow
  })
```

**Rules:**
- Always use a named stable function reference for `select` — inline arrows defeat memoization.
- `select` runs only when `data` exists (no null guard needed inside the transform).
- Use for: status flags (`isEscalated`), filtered subsets, computed display values.

---

## Global Error Handling via Cache

Add `QueryCache` and `MutationCache` handlers to the `QueryClient` constructor for global coverage.

```ts
// shared/api/queryClient.ts
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { errorHandler } from '@/shared/lib/errorHandler'
import { isErrorResponse } from '@/shared/lib/guards'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isErrorResponse(error)) errorHandler(error)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isErrorResponse(error)) errorHandler(error)
    },
  }),
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
})
```

---

## Global Error Type Registration

Eliminate `as IErrorResponse` casts in every `onError` callback.

```ts
// shared/api/queryClient.ts (or a .d.ts file)
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: IErrorResponse
  }
}
```

---

## Parallel Queries with `combine`

```ts
const { profiles, isPending } = useQueries({
  queries: profileIds.map(id => profileQueryOptions(id)),
  combine: (results) => ({
    profiles: results.map(r => r.data).filter(Boolean),
    isPending: results.some(r => r.isPending),
    isError: results.some(r => r.isError),
  }),
})
```

---

## v5 Breaking Changes (Do Not Regress)

| Area | Removed / Changed |
|------|-------------------|
| `onSuccess`/`onError`/`onSettled` on `useQuery` | Removed — use `QueryCache` or mutation callbacks |
| `cacheTime` | Renamed to `gcTime` |
| `isLoading` | Now means `isPending && isFetching` (use `isPending` for "no data yet") |
| `status: 'loading'` | Renamed to `status: 'pending'` |
| `{ suspense: true }` option | Use `useSuspenseQuery` instead |
| `keepPreviousData` | Replaced by `placeholderData: (prev) => prev` |
| `Hydrate` component | Renamed to `HydrationBoundary` |
| Infinite query `initialPageParam` | Now mandatory — no default |

---

## Anti-Patterns

| Anti-pattern | Alternative |
|---|---|
| Inline query config repeated across hook + prefetch + `setQueryData` | `queryOptions()` factory |
| Hardcoded query key arrays inline | Key factory with hierarchy |
| `onSuccess` in `useQuery` | Removed in v5 — use `QueryCache.onError` |
| `error as IErrorResponse` cast | Register `defaultError` in module augmentation |
| Synchronous invalidation in `onSuccess` during optimistic flows | Use `onSettled` — runs on both success and error |
| Inline arrow for `select` | Named stable function reference |
| `{ suspense: true }` option | `useSuspenseQuery` hook |
