# frontend-dev-kit rules

## Honesty and proactive feedback

Always tell the truth, even when it's uncomfortable. Flag potential issues immediately — do not wait for them to become problems.

When reviewing or working with code, always flag:
- Code smells (long methods, complex conditionals, magic numbers), potential bugs, performance bottlenecks, security vulnerabilities
- Tight coupling, missing or excessive abstraction, violations of established patterns
- Missing test coverage for critical paths, flaky or unreliable test patterns
- Unclear code, missing documentation for complex business logic, inconsistent patterns

Be specific: explain why something is a problem and what the impact is. Provide alternatives. Speak up about performance, scalability, security, and maintainability concerns — even if the code "works".

---

## Component file names

- One folder per component under `ui/`. Folder and implementation file are kebab-case of the export: `Button` → `button/button.tsx`, `CustomButton` → `custom-button/custom-button.tsx`.
- Same stem for the colocated test: `custom-button.test.tsx`. Every component folder ships its test in the same change.
- `styles.ts`, `index.ts`, `types.ts`, and `constants.ts` keep those exact names.
- The named export is PascalCase (`export const CustomButton`). Import the folder through `index.ts`, never the `.tsx` file.
- A component folder's `index.ts` exports the component. It exports the props type or a constant only when a file outside the folder imports it. Nothing else is exported "for later".

---

## General coding principles

Apply these based on the circumstances — they can pull in different directions, so use judgment:
- **KISS**: prefer the straightforward solution over the clever one.
- **YAGNI**: don't build for hypothetical future requirements.
- **DRY**: extract shared logic once it's genuinely duplicated — not on the first repetition.

### Naming

| Element | Convention |
|---------|------------|
| Component files | kebab-case `.tsx` |
| Other files | `camelCase.ts` |
| Hooks | `use` prefix + camelCase |
| Constants | `UPPER_SNAKE_CASE` |

- Named exports only — everywhere except pages.
- Export only what another file imports. Tests do not justify an export.
- `index.ts` re-exports only symbols a file outside that folder already imports. No `export *`.

### Syntax conventions

- Always use curly braces for `if`/`else`, loops, and function bodies.
- Arrow functions over `function` declarations for all new code.
- `null` over `undefined` for an intentionally empty/absent value.
- Objects and arrays with more than 2 properties/items: one per line, trailing comma.
- No nested conditions — flatten with early returns.

### No comments

Do not write comments in application or test code — no `//`, `/* */`, JSDoc, or `{/* */}` in JSX. Use descriptive naming, clear structure, and meaningful file organization instead.

### Quality bar

- No `console.log` — only `console.warn` and `console.error` are permitted.
- No credentials, tokens, or secrets in source files.
- User-controlled data must never be passed to `dangerouslySetInnerHTML`.
- No hardcoded UI strings — use `t(key)`. No `const LABELS = { save: 'Save' }` objects.

---

## User-visible copy (i18n)

- Every string a user can see is `t(key)`: JSX text, `aria-label`, `alt`, `title`, `placeholder`, `label`, toasts, zod validation messages, error states.
- Used by more than one slice → `shared/lib/i18n/locales/common/{en.json,keys.ts}`. Owned by one slice → that slice's `locales/`.
- No string maps. Map the union to a **key** and call `t()` at render.
- Keys are typed. Call `t(usersKeys.list.title)`, never a raw `'list.title'` literal.
- `models/` never imports keys or calls `t()` — it returns a union; `ui/` maps it to a key.

---

## React 19

### Rules of React

- Render is idempotent and pure. No mutation of props, state, or context during render.
- Side effects belong in event handlers or `useEffect`, never the render body.
- Hooks are called at the top level only — never in conditions, loops, callbacks, or after an early return.
- Never call a component as a function (`Foo()`). Render `<Foo />`.

### State ownership

- One source of truth per piece of state. Derive one from the other when two can disagree.
- Keep state in the component that uses it until a second consumer appears; then lift exactly one level.
- Prop drilling stops at 2 levels. Past that, compose with `children` or read from a store or context.
- Server state lives in the react-query cache. Never mirror it into `useState` or a store.

### Effects

- Do not use an Effect for derived state — compute it inline.
- Do not fetch in an Effect — react-query owns server state.
- Every async Effect guards against out-of-order resolution — an `ignore` flag or `AbortController`.
- An Effect must not write state that its own dependency array reads. That is a render loop.

### Memoization

This stack runs React 19 with the React Compiler. **Do not add `React.memo`, `useMemo`, or `useCallback` preemptively.** Add them only when an Effect dependency would otherwise retrigger every render, or profiling identified a hotspot.

### JSX formatting

- More than one prop: one prop per line, closing `/>` or `>` on its own line.
- JSX references handlers; it never defines them. Every `on*` prop receives a named function declared in the component body before `return`. No arrow or function expression inside an `on*` prop.
- No nested ternaries in JSX. Compute the value before `return`, early-return a whole-branch swap, use `&&` for show/hide.
- The left side of `&&` is a boolean — never a number that can render `0`.

---

## shadcn/ui

- Use existing components first. Compose, don't reinvent.
- The `style` in `components.json` is the app's only style. Add every primitive with `shadcn add` against that config. Never paste a component from another style or a blog post.
- Keep every exported part, prop, `data-slot` attribute, and Radix import exactly as generated.
- A new look is a new `cva` variant in the base's `styles.ts` — never a call-site `className` override of color, radius, border, shadow, padding, or typography.
- Use semantic colors: `bg-primary`, `text-muted-foreground` — never raw values like `bg-blue-500`.

---

## Component styling

Every component folder has a `styles.ts`. The component file owns structure and behavior; `styles.ts` owns every Tailwind class, `cva()` variant, and shadcn `className`.

- No string, template, or `cn('…')` literal in a `className` prop in JSX.
- No `style={{}}`, CSS Modules, styled-components, or `!important`.
- A conditional class is a function in `styles.ts` — never a ternary in the `className` prop.
- A `className` passed to a `@/shared/ui/<name>` primitive is layout only: margin, width/height, grid or flex placement. Never color, radius, border, shadow, typography, padding, or motion.
- Outside `shared/ui/`, no `animate-*`, `transition-*`, `duration-*` utilities.

---

## Tests

- Every executable file — component, hook, fetcher, model or lib function — has a behavior test in the same change.
- A test asserts behavior (what the user sees, what was called, what was returned). "Renders without crashing" is not a test.
- Mock only what the test cannot run in jsdom: the HTTP layer, navigation, browser APIs jsdom lacks, and time.
- Never mock `@/shared/ui/*` primitives, `react-hook-form`, `zod`, i18n, `cn`, or the component's own children.
- Assert on the English copy from `en.json`, not on translation keys.

---

## TypeScript

- `strict: true`. No `any`. No `as` casts to silence errors.
- `interface` for object shapes, component props; `type` for unions, intersections, mapped types.
- No `I` prefix on new interfaces.
- Exported functions and components must have explicit return types.
- Use discriminated unions to model state instead of optional fields that can drift out of sync.
