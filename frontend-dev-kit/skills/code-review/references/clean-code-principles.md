# Clean-code principles — detail

The judgment calls, naming table, and rationale behind `rules/general-coding-principles.mdc`. The rule
holds the binding statements and is not repeated here. Syntax and formatting examples are in
[code-syntax-and-formatting.md](code-syntax-and-formatting.md).

## Core principles

Apply these based on the circumstances — they can pull in different directions, so use judgment rather
than applying one dogmatically at the expense of readability.

- **KISS** (Keep It Simple): prefer the straightforward solution over the clever one. Simple code is easier to review, test, and change.
- **YAGNI** (You Aren't Gonna Need It): don't build for hypothetical future requirements. Solve the problem in front of you.
- **DRY** (Don't Repeat Yourself): extract shared logic once it's genuinely duplicated — not on the first repetition. Three similar lines of code is better than a premature abstraction.
- **SOLID**, applied pragmatically to functions/modules/hooks rather than only classes:
  - **S**ingle Responsibility — a function, module, or hook has one reason to change. The component-file split is in the rule.
  - **O**pen/Closed — extend behavior via composition/params/new functions rather than editing a stable function's internals for every new case.
  - **L**iskov Substitution — a more specific implementation (e.g. a variant) must honor the contract of the general one it replaces.
  - **I**nterface Segregation — prefer small, focused prop/param interfaces over one large interface consumers only partially use.
  - **D**ependency Inversion — depend on the abstraction (a hook's return type, an injected callback) rather than reaching into a concrete implementation.

## Design patterns first

- Search for a similar existing implementation before writing new logic — match its shape. Slice ownership is the `architecture-audit` skill.
- Prefer composition over inheritance: build behavior by combining small functions/modules, not by extending base classes or deep hierarchies.
- Introducing a genuinely new pattern is fine when nothing existing fits — but justify it, don't default to it.

## Naming

| Element | Convention | Example |
|---------|------------|---------|
| Component files | kebab-case folder and file | `button/button.tsx`, `custom-button/custom-button.tsx` |
| Other modules | `camelCase.ts` | `formatDate.ts` |
| Hooks | `use` prefix + camelCase | `useGetProfiles`, `useTableSettings` |
| Interfaces | No `I` prefix for new interfaces | `IProfile`, `IEnvValues` (legacy) |
| Types (unions/mapped) | `type` keyword, descriptive | `RefetchIntervalType`, `NotificationLevelValue` |
| Constants | `UPPER_SNAKE_CASE` | `REFRESH_INTERVAL`, `REQUEST_TIMEOUT` |
| Enum values | `PascalCase` | `ProfileStatus.New` |

- Method names: verbs for actions (`handleSubmit`, `formatDate`), nouns for values (`profileId`, `isLoading`).
- Types and interfaces describe domain meaning, not implementation (`IProfile`, not `IObj`).
- Match the vocabulary already used in the domain (API types, product copy) so code reads consistently with the problem it solves.

## Function design

- Keep functions small and reusable: extract logic that's used more than once, or that has a clear independent meaning, into its own named function.
- One thing per function: if a function validates *and* transforms *and* logs, split it into smaller functions, each named for the single thing it does.
- Command–query separation means a function either performs an action and returns nothing meaningful (a command), or returns a value with no observable side effect (a query) — never both.
- Where a side effect is unavoidable (API call, storage write, navigation), isolate it in one clearly named function/hook rather than scattering it through logic that looks pure.
- Single level of abstraction per function: don't mix "parse HTTP response" and "format table row" in one unit.

## Functional style and organization

- Return new objects/arrays instead of mutating inputs.
- Prefer `map`/`filter`/`reduce` over manual index loops when intent reads more clearly.
- Logging, fetching, and navigation belong at the edges (event handlers, hooks), not inside generic helpers.
- Favor a "functional core, imperative shell": push pure logic (calculations, formatting, validation) into plain functions; keep side effects (API calls, storage) at the outer layer that calls into that core.
- Group related functionality. Keep data, side effects, and pure transforms apart.
- When adding code, match nearby patterns — naming, file layout, error handling. Don't introduce a second style inside the same feature.

## Literals

The second-pass scan covers more than closed-set prop strings: timeouts, page sizes, status strings, and
z-index numbers are the rest. Use judgment on trivial values — `array.length - 1`, `0`, or `1` in an
obviously self-describing spot does not need extraction.

## Comments

The ban covers section labels (`// handlers`), restated code (`// fetch users`), and `// Arrange/Act/Assert`.
Use descriptive naming, clear structure, and meaningful file organization instead. If a block needs a
comment to be understood, extract it into a function whose name says it. The feature-dev conventions gate
fails on any comment in a changed file other than the tool directive.

## Copy and logging

User-facing copy is `t(usersKeys....)` or `commonKeys` (`i18n` skill). No `TextContent` module, no
`LABELS`/`MESSAGES` object of English strings, no `src/constants/textContent.ts`. Server-provided values
render as-is.

```ts
console.warn('Non-critical issue:', detail)
console.error('Critical error:', error)
```

## Dependencies and tooling

```bash
yarn add [package]           # Production
yarn add -D [package]        # Dev dependency
```

Always commit `yarn.lock`. Check `resolutions` in `package.json` for forced versions.

| Action | Command | Auto-fix |
|--------|---------|----------|
| Lint all | `yarn lint` | `yarn lint:fix` |
| ESLint only | `yarn eslint` | `yarn eslint:fix` |
| Type check | `yarn typecheck` | — |

| Tool | Config File |
|------|-------------|
| ESLint | project ESLint config (`eslint.config.*` or `.eslintrc`). Required: `max-len` at 160, strings included |
| TypeScript | `tsconfig.json` |

**Pre-push hook**: runs automatically `yarn lint && yarn build`. Fix lint errors before pushing.

## Why each ban exists

| ❌ Avoid | ✅ Instead | Why |
|----------|-----------|-----|
| Default exports in modules/containers | Named exports | Consistent imports, tree-shaking |
| `I` prefix on new interfaces | No prefix | Codebase convention (rename script was run) |
| `console.log` | `console.warn` / `console.error` | ESLint `no-console` rule |
| `process.env` / `import.meta.env` in a feature | `shared/config/env.ts` | One parser |
| `jest.mock()` | `vi.mock()` | Vitest |
| `any` | `unknown` + type guard | Type safety at boundaries |
| `undefined` for an intentionally empty value | `null` | Explicit "no value" vs. an unset/missing one |
| Objects/arrays of 3+ props on one line | One property per line | Readable diffs, easy to scan |
| Block glued to the next statement, or `=\n  value` | Blank line around the block; wrap the value in `( )` | The block and the wrapped value stay scannable |
| Any comment in app or test code | A better name or an extracted function | Comments drift; names are checked |
| `export` on a file-local helper or type | No `export` | Unused exports widen the public surface |
| `<Button type="button" variant="outline">` | `<Button variant={ButtonVariant.Outline}>` | One source for closed sets; defaults stay implicit |
| `const LABELS = { save: 'Save' }` | `t(formKeys.save)` from `locales/` | All copy is translatable |
