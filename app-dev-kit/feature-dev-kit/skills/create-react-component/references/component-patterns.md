On-demand recipe. Read this file only when the skill that owns it tells you to. The matching rule under `rules/` is the constraint list and is already attached by glob — do not read it again.


# React Patterns

Practical conventions for daily React development in FSD slices. Builds on `.claude/rules/react-coding-principles.md` — read that first for compiler rules, state, effects, and context fundamentals.

---

## Component Anatomy

### Presentational component (`entities/*/ui/`, `shared/ui/`, `features/*/ui/`)

```tsx
// entities/profile/ui/ProfileStatusBadge.tsx
import type { JSX } from 'react'
import { Tag } from '@/shared/ui'
import type { ProfileStatusValue } from '../model/profile.types'
import { PROFILE_STATUS_LABEL, PROFILE_STATUS_TAG_COLOR } from '../model/profile.constants'

interface IProfileStatusBadgeProps {
  status: ProfileStatusValue
  loading?: boolean
}

export const ProfileStatusBadge = ({
  status,
  loading = false,
}: IProfileStatusBadgeProps): JSX.Element => (
  <Tag color={PROFILE_STATUS_TAG_COLOR[status]} loading={loading}>
    {PROFILE_STATUS_LABEL[status]}
  </Tag>
)
```

- No API calls, no `useState`, no side effects.
- Props typed with an `interface`. Required props first, optional with defaults.
- Named export, explicit `: JSX.Element` return type.

### Smart component / container (`widgets/*/ui/`, `features/*/ui/` with state)

```tsx
// features/decline-profile/ui/DeclineProfileModal.tsx
import { useState } from 'react'
import type { JSX } from 'react'
import { useDeclineProfile } from '../api/declineProfile.api'

interface IDeclineProfileModalProps {
  profileId: string
  onClose: () => void
}

export const DeclineProfileModal = ({
  profileId,
  onClose,
}: IDeclineProfileModalProps): JSX.Element => {
  const [reason, setReason] = useState('')
  const { mutate: declineProfile, isPending } = useDeclineProfile()

  const handleSubmit = () => {
    declineProfile({ profileId, reason }, { onSuccess: onClose })
  }

  return ( ... )
}
```

---

## Conditional Rendering

```tsx
// Loading guard — return early, keep main render clean
if (isPending) return <ProfileSkeleton />
if (!data) return <EmptyState />

// Conditional JSX — use ternary for binary states
{isPending ? <Skeleton /> : <ProfileCard profile={data} />}

// Optional render — use && only when false/null is safe to render
{isAdmin && <AdminActions />}

// Avoid nested ternaries — extract to a variable or component
const content = isPending ? <Skeleton /> : isError ? <ErrorState /> : <ProfileCard />
return <Wrapper>{content}</Wrapper>
```

---

## Event Handlers

```tsx
// Name: handle<Event> or handle<Target><Event>
const handleSubmit = () => { ... }
const handleNameChange = (value: string) => { ... }
const handleRowClick = (profileId: string) => () => { ... }  // curried for list items

// Async handler — manual loading state for UI feedback beyond mutation.isPending
const handleDownload = async () => {
  try {
    setIsDownloading(true)
    await downloadFiles(filesMap)
  } catch (error) {
    if (isErrorResponse(error)) errorHandler(error)
  } finally {
    setIsDownloading(false)
  }
}
```

**Rules:**
- Do not pass an async function directly to `onClick` — wrap it or handle the promise explicitly.
- Inline arrow functions in JSX are fine for simple one-liners; extract to `handleX` when the body exceeds one expression.

---

## Props Patterns

```tsx
// Extend Ant Design component props
interface ITagProps extends AntdTagProps {
  shimmer?: boolean
  loading?: boolean
}

// Callback props — void return
interface IProfileCardProps {
  profile: IProfile
  onClose: () => void
  onStatusChange: (status: ProfileStatusValue) => void
}

// Optional callbacks — call with optional chaining
onSuccess?.()
onError?.(error)

// Children
interface IWrapperProps {
  children: React.ReactNode  // for any renderable content
}
```

---

## Loading / Empty / Error States

Every container that fetches data must handle all three states before rendering content.

```tsx
const { data, isPending, isError } = useGetProfiles(config)

if (isPending) return <Spin spinning />
if (isError || !data) return <ErrorState />
if (!data.items.length) return <EmptyState description={TextContent.NO_PROFILES} />

return <ProfilesTable profiles={data.items} />
```

**Order matters:** loading → error → empty → data. Do not show an empty state while loading.

---

## Custom Hooks

Extract logic from components when:
- The same stateful logic is needed in two or more places.
- The component body becomes hard to read due to mixed concerns.
- State + side effect combination belongs to a single unit (e.g., download with loading state).

```ts
// hooks/useProfileDownload.ts
interface IUseProfileDownloadReturn {
  download: (ids: string[]) => Promise<void>
  isLoading: boolean
}

export const useProfileDownload = (profileId: string): IUseProfileDownloadReturn => {
  const [isLoading, setIsLoading] = useState(false)
  const { mutateAsync } = useExportProfile()

  const download = useCallback(async (ids: string[]) => {
    try {
      setIsLoading(true)
      await mutateAsync({ profileId, ids })
      notifySuccess(TextContent.EXPORT_SUCCESS)
    } catch (error) {
      if (isErrorResponse(error)) errorHandler(error)
    } finally {
      setIsLoading(false)
    }
  }, [profileId, mutateAsync])

  return { download, isLoading }
}
```

**Return shape:** plain object `{ value, handler }`. Never return an array from a custom hook unless it is intentionally a `[state, setter]` pair.

---

## Component Splitting

Split a component when:
- It exceeds ~100 lines of JSX.
- A section has its own conditional render logic.
- A section is reused elsewhere.

Keep child components in the same slice's `ui/` directory. Export only from the slice's `index.ts`.

---

## Anti-Patterns

| Anti-pattern | Why | Fix |
|---|---|---|
| State that mirrors a prop | Duplicates truth, drifts | Derive it during render |
| `useEffect` to set state when a prop changes | Causes extra renders, race conditions | Use `key` reset or compute from prop |
| Calling a mutation in `useEffect` | Side-effect in wrong place | Call in event handler |
| `useEffect` with no dependency array to "run once" | May run more than once in strict mode | Use a ref guard or restructure |
| Inline `style={{ ... }}` | Bypasses theme, untestable | Use styled-component or class |
| Hardcoded strings in JSX | Untranslatable, inconsistent | `TextContent.KEY` |
| Default export on components | Breaks named-import consistency | Named export only (pages are the exception) |

---

## Key Principles Reminder

- Render = pure function of props + state. No side effects.
- Hooks at the top level, always unconditional.
- Compute derived values during render — do not store them in state.
- React Compiler handles memoization — do not add `memo`/`useMemo`/`useCallback` by default.
- See `.claude/rules/react-coding-principles.md` for effects, context, and compiler rules.
