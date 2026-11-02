# TypeScript patterns — examples

Examples, rationale, and the optional patterns behind `rules/typescript.mdc`. The rule holds the binding
statements and is not repeated here.

## Type vs interface

`interface` supports declaration merging and `extends`.

```ts
interface Profile {
  id: string
  name: string
}

type ProfileStatus = 'new' | 'active' | 'declined'
type WithLoading<T> = T & { isLoading: boolean }
```

## Strictness

```ts
// ❌ Avoid — a cast, and a handwritten shape check for a server entity
const data = response as Profile

// ✅ Prefer — the entity schema. An invalid body returns null (rules/api-contract.mdc)
const profile = parseEntity(profileSchema, response)
```

## Discriminated unions and exhaustiveness

```ts
// ❌ Avoid — invalid states are representable (both set, or neither)
interface RequestShape {
  isLoading: boolean
  data?: Profile
  error?: string
}

// ✅ Prefer — each variant only carries what's valid for it
type RequestState =
  | { status: 'loading' }
  | { status: 'success', data: Profile }
  | { status: 'error', error: string }
```

The exhaustiveness check makes a new union member fail to compile until it is handled:

```ts
const assertNever = (value: never): never => {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}

switch (state.status) {
  case 'loading': return <Spin />
  case 'success': return <Profile data={state.data} />
  case 'error': return <ErrorMessage message={state.error} />
  default: return assertNever(state)
}
```

## Utility types

| Utility | Use case |
|---------|----------|
| `Pick<T, K>` / `Omit<T, K>` | Reuse part of an existing shape |
| `Partial<T>` / `Required<T>` | Form drafts vs. submitted payloads |
| `Readonly<T>` | Enforce immutability on a returned object |
| `Record<K, V>` | Lookup maps, keyed by a union |
| `ReturnType<typeof fn>` / `Parameters<typeof fn>` | Derive types from existing functions instead of re-declaring |
| `satisfies` | Validate a literal against a type without widening it |

```ts
const PROFILE_STATUS_KEY = {
  new: profileKeys.status.new,
  active: profileKeys.status.active,
  declined: profileKeys.status.declined,
} satisfies Record<ProfileStatus, string>

t(PROFILE_STATUS_KEY[profile.status])
```

`satisfies` fails the build when a status is added without a key, and keeps each value's literal key type
from `keys.ts`.

## Enums vs union + const object

A TypeScript `enum` has reverse-mapping and `const enum` / `isolatedModules` pitfalls, so a closed set is a
`const` object with a derived union. The union is derived from the runtime constant instead of being
maintained by hand, and the key map sits in the same file:

```ts
export const ProfileStatus = {
  New: 'new',
  Active: 'active',
  Declined: 'declined',
} as const

export type ProfileStatusValue = (typeof ProfileStatus)[keyof typeof ProfileStatus]

export const PROFILE_STATUS_KEY = {
  [ProfileStatus.New]: profileKeys.status.new,
  [ProfileStatus.Active]: profileKeys.status.active,
  [ProfileStatus.Declined]: profileKeys.status.declined,
} satisfies Record<ProfileStatusValue, string>
```

## Options object

```ts
interface IFormatDateOptions {
  locale?: string
  includeTime?: boolean
}

export const formatDate = (date: Date, options: IFormatDateOptions = {}): string => {
  // ...
}
```

## Generics

Prefer `const` type parameters (TS 5.0+) when you want literal inference preserved without an `as const` at
every call site:

```ts
const first = <const T extends readonly unknown[]>(arr: T): T[0] => arr[0]
```

## Template literal types

Use them to model structured strings instead of a bare `string`.

```ts
type QueryKey = `profiles.${string}`
type EventName = `on${Capitalize<'success' | 'error'>}`  // 'onSuccess' | 'onError'
```

## Branded / nominal types

For primitive values that must not be interchanged (IDs, currency), brand them instead of relying on
structural typing. Use sparingly — only where mixing up two `string`-typed IDs is a real bug risk.

```ts
type ProfileId = string & { readonly __brand: 'ProfileId' }

const toProfileId = (value: string): ProfileId => value as ProfileId
```

## Why each ban exists

| ❌ Avoid | ✅ Instead | Why |
|----------|-----------|-----|
| `any` | `unknown`, then zod or a type guard | Preserves type safety at boundaries |
| `as Foo` unchecked cast | Type guard or safe narrowing | Casts lie to the compiler silently |
| `value!` non-null assertion | Explicit null check / guard | Assertions hide real runtime nulls |
| Optional fields for mutually exclusive state | Discriminated union | Prevents invalid state combinations |
| Duplicating a type by hand | `Pick`/`Omit`/`ReturnType`/etc. | Single source of truth, stays in sync |
| `function foo(a, b, c, d)` | Single options object | Readable call sites, easy to extend |
| `// @ts-ignore` | Fix the type | Ignoring errors accumulates real bugs |

## Where things live

| Need | Location |
|------|----------|
| Compiler options | `tsconfig.json` |
| Env | `shared/config/env.ts` |
| HTTP errors | `shared/api/errors.ts` |
| General naming/style | `rules/general-coding-principles.mdc` |
