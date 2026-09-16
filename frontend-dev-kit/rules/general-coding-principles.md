# General Coding Principles

**Project**: iv-frontend
**Language**: TypeScript 5.7+ | **Linter**: ESLint 8 | **Formatter**: ESLint (no Prettier)

High-level clean code and convention defaults for iv-frontend. For React-specific rules (hooks, effects, state, JSX) see [react-coding-principles.md](react-coding-principles.md). For styling see the component/styling docs. For stack-specific conventions, follow the architecture, API, and testing guides.

---

## Core Principles

Apply these based on the circumstances — they can pull in different directions, so use judgment rather than applying one dogmatically at the expense of readability.

- **KISS** (Keep It Simple): prefer the straightforward solution over the clever one. Simple code is easier to review, test, and change.
- **YAGNI** (You Aren't Gonna Need It): don't build for hypothetical future requirements. Solve the problem in front of you.
- **DRY** (Don't Repeat Yourself): extract shared logic once it's genuinely duplicated — not on the first repetition. See [Minimal Code](#minimal-code) for when three similar lines beat a premature abstraction.
- **SOLID**, applied pragmatically to functions/modules/hooks rather than only classes:
  - **S**ingle Responsibility — a function, module, or hook has one reason to change.
  - **O**pen/Closed — extend behavior via composition/params/new functions rather than editing a stable function's internals for every new case.
  - **L**iskov Substitution — a more specific implementation (e.g. a variant) must honor the contract of the general one it replaces.
  - **I**nterface Segregation — prefer small, focused prop/param interfaces over one large interface consumers only partially use.
  - **D**ependency Inversion — depend on the abstraction (a hook's return type, an injected callback) rather than reaching into a concrete implementation.

---

## Design Patterns First

Before writing new plain code for a recurring problem, check whether an existing pattern in the codebase already solves it (see [architecture.md](architecture.md) for the patterns in use — Strategy, Singleton, Observer, Proxy, Facade, etc.) and reuse or extend it rather than inventing a parallel approach.

- Search for a similar existing implementation before writing new logic — match its shape.
- Prefer composition over inheritance: build behavior by combining small functions/modules, not by extending base classes or deep hierarchies.
- Introducing a genuinely new pattern is fine when nothing existing fits — but justify it, don't default to it.

---

## Naming

| Element | Convention | Example |
|---------|------------|---------|
| Component files | kebab-case `.tsx` | `button.tsx`, `custom-button.tsx` |
| Other files | `camelCase.ts` | `apiRequest.ts` |
| Hooks | `use` prefix + camelCase | `useGetProfiles`, `useTableSettings` |
| Interfaces | No `I` prefix for new interfaces | `IProfile`, `IEnvValues` (legacy) |
| Types (unions/mapped) | `type` keyword, descriptive | `RefetchIntervalType`, `NotificationLevelValue` |
| Constants | `UPPER_SNAKE_CASE` | `REFRESH_INTERVAL`, `REQUEST_TIMEOUT` |
| Enum values | `PascalCase` | `ProfileStatus.New` |

- Use descriptive, self-explanatory names for all identifiers — methods, variables, types, files.
- Avoid abbreviations unless widely understood (`id`, `url`, `api` are fine; `usrSvc`, `rsp` are not).
- Method names: verbs for actions (`handleSubmit`, `formatDate`), nouns for values (`profileId`, `isLoading`).
- Variables: never single-letter names except trivial loop indices in tiny scopes.
- Types and interfaces: describe domain meaning, not implementation (`IProfile`, not `IObj`).
- **Use domain terminology**: name things after the business concept they represent (`profile`, `reconciliation`, `declineReason`), not generic technical nouns (`item`, `data`, `obj`). Match the vocabulary already used in the domain (API types, product copy) so code reads consistently with the problem it solves.

### Exports

- **Named exports only** — everywhere except pages (default exports allowed for pages).
- `index.ts` in each folder exports only the public API.

---

## Magic Numbers and Strings

- No unexplained literals in logic — extract to a named constant that states what the value means (`REQUEST_TIMEOUT`, `ProfileStatus.Declined`) instead of inlining `30000` or `'declined'`.
- Reuse existing enums/constants (`src/enums/`, `src/api/constants.ts`, `TextContent`) before adding a new one.
- A literal used exactly once in an obviously self-describing spot (e.g. `array.length - 1`) doesn't need extraction — use judgment, don't over-extract trivial values.

---

## Minimal Code

- Write the **minimum code that solves the task**. No speculative features, no "we might need this later" abstractions.
- Keep functions small with one clear responsibility.
- Three similar lines of code is better than a premature abstraction.
- Avoid feature flags or backwards-compat shims when you can just change the code.

---

## Function Design

- **Keep functions small and reusable**: extract logic that's used more than once, or that has a clear independent meaning, into its own named function.
- **One thing per function**: if a function does more than one thing (e.g. validates *and* transforms *and* logs), split it into smaller functions, each named for the single thing it does.
- **Command–Query Separation (CQS)**: a function either performs an action and returns nothing meaningful (a command), or returns a value with no observable side effect (a query) — never both. A function named `getX` or `isX` must not mutate state or trigger effects.
- **Minimize side effects**: keep data transforms, formatters, and validators pure (see [Functional Style](#functional-style)). Where a side effect is unavoidable (API call, storage write, navigation), isolate it in one clearly named function/hook rather than scattering it through logic that looks pure.
- Prefer a single options object over long positional parameter lists (3+ params) — see [typescript.md](typescript.md).

---

## Syntax Conventions

- **Always use curly braces** for `if`/`else`, loops, and function bodies — even for single-statement blocks. Don't rely on implicit single-statement syntax; it's easy to misread and error-prone when a second statement is added later.
- **Omit braces only for true one-liners with no block body**: an arrow function returning a single expression (`const double = (x: number) => x * 2`) or a single-line early return guard (`if (!id) return null`) — nested or multi-statement bodies must use braces.
- **Arrow functions over `function` declarations** for all new code — hooks, callbacks, helpers. Reserve `function` only where required by the runtime/tooling (none currently in this codebase).
- Max line length: **160 characters**.
- **`null` over `undefined`** for an intentionally empty/absent value. Use `undefined` only when there's no reasonable way to avoid it (an optional prop/param, a third-party API that returns it).
- **Blank line before `return`** when the block has preceding statements — separates the setup from the result. Skip it when `return` is the only line in the block.
- **Objects and arrays with more than 2 properties/items**: one per line, trailing comma. Two or fewer can stay on one line.

```ts
// ❌ Avoid
const userFixture = { id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin' }

// ✅ Prefer
const userFixture = {
  id: '1',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'admin',
}
```

---

## No Comments

- Do not write comments in application code.
- Use descriptive naming, clear structure, and meaningful file organization instead.
- Exception: non-obvious complex logic (e.g. a subtle algorithm or a known browser quirk) may have a single-line explanation.

---

## Functional Style

- Prefer **pure functions** for data transforms, formatters, and validators — no hidden side effects.
- Treat inputs as read-only; return new objects/arrays instead of mutating.
- Prefer `map`/`filter`/`reduce` over manual index loops when intent reads more clearly.
- Logging, fetching, and navigation belong at the edges (event handlers, hooks), not inside generic helpers.
- Early returns and small helpers beat deeply nested conditionals.
- Favor a "functional core, imperative shell": push pure logic (calculations, formatting, validation) into plain functions; keep side effects (API calls, storage) at the outer layer that calls into that core.

---

## Code Organization

- Group related functionality. Keep modules focused on a single responsibility.
- Clear separation: data vs side effects vs pure transforms.
- When adding code, **match nearby patterns** — naming, file layout, error handling. Don't introduce a second style inside the same feature.
- Single level of abstraction per function: don't mix "parse HTTP response" and "format table row" in one unit.

---

## Error Handling

```ts
// Source: src/utils/errorHandler.ts:9
export const errorHandler = (
  error: IErrorResponse | null,
  defaultMessage?: string,
  notificationLevel?: NotificationLevelValue,
): void => {
  const errorMessage = error?.response?.data?.message ?? defaultMessage
  MAP_NOTIFICATION_LEVEL_TO_NOTIFIER[notificationLevel](errorMessage)
}
```

**Rule**: Always use `isErrorResponse` type guard before calling `errorHandler`:

```ts
import { isErrorResponse } from '@/utils/types/errorHandler.types'

if (isErrorResponse(error)) {
  errorHandler(error)
}
```

**Notifications:**
- `notifySuccess(message)` — green notification
- `notifyWarning(message)` — orange notification (default in `errorHandler`)
- Import from `@/utils/notification`

---

## Environment Variables

```ts
// Source: src/utils/env.ts:15
const ENV = new Proxy<IEnvValues>({}, handler)

// Usage — always this way:
import { ENV } from '@/utils/env'
const url = ENV.PROFILES_URL
```

Add new variables to `src/utils/types/env.types.ts` interface first. Never use `process.env.X` directly.

---

## Quality Bar

- **Validate at boundaries**: narrow or guard unknown data before it enters the domain model; trust internal code.
- **No `console.log`** — only `console.warn` and `console.error` are permitted.
- No credentials, tokens, or secrets in source files.
- User-controlled data must never be passed to `dangerouslySetInnerHTML`.
- No hardcoded UI strings in components — use `TextContent` from `src/constants/textContent.ts`.

```ts
console.warn('Non-critical issue:', detail)
console.error('Critical error:', error)
```

---

## Dependencies

```bash
yarn add [package]           # Production
yarn add -D [package]        # Dev dependency
```

Always commit `yarn.lock`. Check `resolutions` in `package.json` for forced versions.

---

## Tooling

| Action | Command | Auto-fix |
|--------|---------|----------|
| Lint all | `yarn lint` | `yarn lint:fix` |
| ESLint only | `yarn eslint` | `yarn eslint:fix` |
| Type check | `yarn typecheck` | — |

| Tool | Config File |
|------|-------------|
| ESLint | `.eslintrc` (project root) |
| TypeScript | `tsconfig.json` |

**Pre-push hook**: runs automatically `yarn lint && yarn build`. Fix lint errors before pushing.

---

## Don't Do

| ❌ Avoid | ✅ Instead | Why |
|----------|-----------|-----|
| Default exports in modules/containers | Named exports | Consistent imports, tree-shaking |
| `I` prefix on new interfaces | No prefix | Codebase convention (rename script was run) |
| `console.log` | `console.warn` / `console.error` | ESLint `no-console` rule |
| `process.env.X` | `ENV.X` | Runtime env support |
| `jest.mock()` | `vi.mock()` | Vitest |
| `any` | `unknown` + type guard | Type safety at boundaries |
| `undefined` for an intentionally empty value | `null` | Explicit "no value" vs. an unset/missing one |
| Objects/arrays of 3+ props on one line | One property per line | Readable diffs, easy to scan |
