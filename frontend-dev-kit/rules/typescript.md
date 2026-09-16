# TypeScript Guide

**Project**: iv-frontend
**TypeScript**: 5.7+ | **Mode**: `strict` (see `tsconfig.json`)

Stack-agnostic TypeScript conventions. For project-specific naming/exports see
[general-coding-principles.md](general-coding-principles.md).

---

## Type vs Interface

| Use | For |
|-----|-----|
| `interface` | Object shapes, component props, class contracts — supports declaration merging & extends |
| `type` | Unions, intersections, mapped types, tuples, function signatures |

```ts
interface IProfile {
  id: string
  name: string
}

type ProfileStatus = 'new' | 'active' | 'declined'
type WithLoading<T> = T & { isLoading: boolean }
```

No `I` prefix on new interfaces (project convention — see general-coding-principles.md).

---

## Strictness — Don't Weaken It

- Never introduce `any`. Use `unknown` and narrow with a type guard at the boundary.
- Never use unchecked `as Foo` casts to silence errors — fix the type or narrow safely.
- `as const` is fine (literal narrowing); `as unknown as Foo` is not.
- Don't add `// @ts-ignore` / `// @ts-expect-error` to hide real errors — fix the underlying type.
- Keep `strictNullChecks` honest: don't use non-null assertions (`!`) to bypass a null check — guard instead.

```ts
// ❌ Avoid
const data = response as IProfile

// ✅ Prefer
const isProfile = (value: unknown): value is IProfile =>
  typeof value === 'object' && value !== null && 'id' in value

if (isProfile(response)) {
  // response is IProfile here
}
```

---

## Narrowing & Discriminated Unions

Model state as a discriminated union instead of optional fields that can drift out of sync.

```ts
// ❌ Avoid — invalid states are representable (both set, or neither)
interface IRequestState {
  isLoading: boolean
  data?: IProfile
  error?: string
}

// ✅ Prefer — each variant only carries what's valid for it
type RequestState =
  | { status: 'loading' }
  | { status: 'success', data: IProfile }
  | { status: 'error', error: string }
```

Use exhaustiveness checks so a new union member fails to compile until handled:

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

---

## Utility Types

Derive types instead of duplicating them.

| Utility | Use case |
|---------|----------|
| `Pick<T, K>` / `Omit<T, K>` | Reuse part of an existing shape |
| `Partial<T>` / `Required<T>` | Form drafts vs. submitted payloads |
| `Readonly<T>` | Enforce immutability on a returned object |
| `Record<K, V>` | Lookup maps, keyed by a union |
| `ReturnType<typeof fn>` / `Parameters<typeof fn>` | Derive types from existing functions instead of re-declaring |
| `satisfies` | Validate a literal against a type without widening it |

```ts
const STATUS_LABELS = {
  new: 'New',
  active: 'Active',
  declined: 'Declined',
} satisfies Record<ProfileStatus, string>
// STATUS_LABELS.new is typed as 'New', not string — satisfies keeps literal inference
```

Derive unions from runtime constants instead of maintaining both by hand:

```ts
export const ProfileStatus = {
  New: 'new',
  Active: 'active',
  Declined: 'declined',
} as const

export type ProfileStatusValue = (typeof ProfileStatus)[keyof typeof ProfileStatus]
```

---

## Function & Component Types

- Exported functions and components must have explicit return types — don't let inference leak into the public API.
- Type props with an `interface`, not inline object types, once there is more than one prop.
- Prefer a single options object over long positional parameter lists (3+ params).

```ts
interface IFormatDateOptions {
  locale?: string
  includeTime?: boolean
}

export const formatDate = (date: Date, options: IFormatDateOptions = {}): string => {
  // ...
}
```

---

## Generics

- Name generics for what they represent when it isn't obvious (`TData`, `TError`) — `T` alone is fine for a single, obvious generic.
- Constrain generics (`<T extends object>`) instead of leaving them unbounded when the body relies on shape.
- Prefer `const` type parameters (TS 5.0+) when you want literal inference preserved without an `as const` at every call site:

```ts
const first = <const T extends readonly unknown[]>(arr: T): T[0] => arr[0]
```

---

## Template Literal Types

Use them to model structured strings instead of a bare `string`.

```ts
type QueryKey = `profiles.${string}`
type EventName = `on${Capitalize<'success' | 'error'>}`  // 'onSuccess' | 'onError'
```

---

## Branded / Nominal Types

For primitive values that must not be interchanged (IDs, currency), brand them instead of relying on structural typing.

```ts
type ProfileId = string & { readonly __brand: 'ProfileId' }

const toProfileId = (value: string): ProfileId => value as ProfileId
```

Use sparingly — only where mixing up two `string`-typed IDs is a real bug risk.

---

## Enums vs Union + Const Object

This codebase uses `enum` under `src/enums/` (see architecture.md) — keep using enums there for consistency.

For new, module-local constants that don't need to live in `src/enums/`, prefer a `const` object + derived union (shown above under Utility Types) over introducing a new enum — it tree-shakes better and avoids enum-specific pitfalls (reverse mapping, `const enum` isolatedModules issues). Don't mix the two styles for the same concept.

---

## Don't Do

| ❌ Avoid | ✅ Instead | Why |
|----------|-----------|-----|
| `any` | `unknown` + type guard | Preserves type safety at boundaries |
| `as Foo` unchecked cast | Type guard or safe narrowing | Casts lie to the compiler silently |
| `value!` non-null assertion | Explicit null check / guard | Assertions hide real runtime nulls |
| Optional fields for mutually exclusive state | Discriminated union | Prevents invalid state combinations |
| Duplicating a type by hand | `Pick`/`Omit`/`ReturnType`/etc. | Single source of truth, stays in sync |
| `function foo(a, b, c, d)` | Single options object | Readable call sites, easy to extend |
| `// @ts-ignore` | Fix the type | Ignoring errors accumulates real bugs |

---

## Quick Reference

| Need | Location |
|------|----------|
| Compiler options | `tsconfig.json` |
| Env var types | `src/utils/types/env.types.ts` |
| Error response guard | `src/utils/types/errorHandler.types.ts` |
| App-wide enums | `src/enums/` |
| General naming/style | [general-coding-principles.md](general-coding-principles.md) |
