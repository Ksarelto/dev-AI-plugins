On-demand recipe. Read this file only when the skill that owns it tells you to. The matching rule under `rules/` is the constraint list and is already attached by glob — do not read it again.


# TypeScript Patterns

Everyday TypeScript conventions used in this codebase. Builds on `.claude/rules/general-coding-principles.md`.

---

## Interfaces vs Types

```ts
// interface — object shapes, component props, API responses, hook returns
interface IProfile {
  id: string
  name: string
  status: ProfileStatusValue
}

interface IProfileCardProps {
  profile: IProfile
  onClose: () => void
}

interface IUseProfileDownloadReturn {
  download: (ids: string[]) => Promise<void>
  isLoading: boolean
}

// type — unions, intersections, mapped types, derived types
type ProfileStatusValue = typeof ProfileStatus[keyof typeof ProfileStatus]
type RefetchIntervalType = number | false | ((data: unknown) => number | false)
```

**Rule:** `interface` for everything that describes a shape. `type` for everything that involves a union or derivation.

---

## Typing Component Props

```tsx
// Extend Ant Design types when wrapping their components
interface ITagProps extends AntdTagProps {
  shimmer?: boolean
  loading?: boolean
}

// No I-prefix on internal/private interfaces — only on exported ones shared across files
// (project convention: I-prefix kept on exported types)

// Optional props with defaults in destructuring
export const Tag = ({
  shimmer = false,
  loading = false,
  ...props
}: ITagProps): JSX.Element => { ... }
```

---

## Typing Hook Returns

Always define an explicit return interface. Never rely on inferred return types for exported hooks.

```ts
// Correct
interface IUseTableSettingsReturn {
  pageSize: number
  currentPage: number
  setPage: (page: number) => void
}

export const useTableSettings = (): IUseTableSettingsReturn => { ... }

// Wrong — inferred return type leaks implementation details
export const useTableSettings = () => { ... }
```

---

## Const Assertions + Derived Union Types

Use `as const` for fixed literal maps. Derive the union type — never duplicate it.

```ts
// enums/ProfileStatus.ts
export const ProfileStatus = {
  NEW: 'new',
  APPROVED: 'approved',
  DECLINED: 'declined',
} as const

// Derived union — single source of truth
export type ProfileStatusValue = typeof ProfileStatus[keyof typeof ProfileStatus]
// → 'new' | 'approved' | 'declined'

// Status → label mapping — covers all values, compiler verifies exhaustiveness
export const PROFILE_STATUS_LABEL: Record<ProfileStatusValue, string> = {
  [ProfileStatus.NEW]: 'New',
  [ProfileStatus.APPROVED]: 'Approved',
  [ProfileStatus.DECLINED]: 'Declined',
}
```

**Keep existing `enum` declarations** — do not refactor working enums. Use `as const` for new constants.

---

## `import type`

```ts
// Type-only imports must use import type
import type { IProfile } from '../model/profile.types'
import type { JSX } from 'react'

// Runtime values (enums, constants, components) use regular import
import { ProfileStatus } from '../model/profile.types'
import { Tag } from '@/shared/ui'
```

---

## Typing Events and Callbacks

```ts
// React event types
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { ... }
const handleSelect = (value: string, option: DefaultOptionType) => { ... }

// Ant Design callback types — import from antd/es/component
import type { TableProps } from 'antd/es/table'
type OnTableChange = NonNullable<TableProps<IProfile>['onChange']>

// Generic callbacks
type OnChange<T> = (value: T) => void
```

---

## Typing Async Functions

```ts
// Always explicit Promise<T> on exported async functions
export const fetchProfile = async (id: string): Promise<IProfile | null> => { ... }

// Mutation payload and response types
interface IDeclineProfilePayload {
  profileId: string
  reason?: string
}

interface IDeclineProfileResponse {
  id: string
  status: ProfileStatusValue
}
```

---

## Common Utility Types

| Type | When to use | Example |
|------|-------------|---------|
| `Record<K, V>` | Typed key-value maps | `Record<ProfileStatusValue, string>` |
| `Partial<T>` | Test factory overrides only | `mockProfile(overrides?: Partial<IProfile>)` |
| `NonNullable<T>` | Strip null/undefined from a generic | `NonNullable<ReturnType<typeof useGetProfile>['data']>` |
| `Pick<T, K>` | Expose a subset of an interface | `Pick<IProfile, 'id' | 'name'>` |
| `Omit<T, K>` | Strip internal fields | `Omit<IProfile, 'internalField'>` |
| `ReturnType<T>` | Type the return of a function | `ReturnType<typeof useGetProfile>` |
| `Parameters<T>` | Type a function's parameters | `Parameters<typeof formatDate>[0]` |

---

## Type Guards

Write named predicate functions at system boundaries — not inline `as` casts.

```ts
// Correct — reusable, testable
export const isErrorResponse = (e: unknown): e is IErrorResponse =>
  typeof e === 'object' && e !== null && 'response' in e

// Usage
catch (error: unknown) {
  if (isErrorResponse(error)) errorHandler(error)
}

// Wrong — silently bypasses the type system
catch (error) {
  errorHandler(error as IErrorResponse)
}
```

---

## Non-Null Assertion vs Narrowing

```ts
// Wrong — hides bugs
const name = profile!.name

// Correct — narrow explicitly
if (!profile) return null
const name = profile.name

// Also correct — optional chaining when absence is expected
const name = profile?.name ?? TextContent.UNKNOWN
```

---

## Anti-Patterns

| Anti-pattern | Fix |
|---|---|
| `as SomeType` on a value that might not match | Write a type guard or fix the model |
| `any` | Use `unknown` at boundaries, narrow before use |
| Duplicate string union that mirrors a constant | Derive with `typeof X[keyof typeof X]` |
| Optional props to avoid filling required fields | Fix the model or provide proper defaults |
| `// @ts-ignore` without a comment explaining why | `// @ts-expect-error: <reason>` or fix the type |
| `export * from './module'` in barrel index | Explicit named exports only |
