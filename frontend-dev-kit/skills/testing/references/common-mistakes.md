# Common Mistakes & Anti-Patterns

## Using Jest Instead of Vitest

| Wrong | Correct |
|-------|---------|
| `jest.fn()` | `vi.fn()` |
| `jest.mock(...)` | `vi.mock(...)` |
| `jest.spyOn(...)` | `vi.spyOn(...)` |
| `jest.clearAllMocks()` | `vi.clearAllMocks()` |
| `jest.mocked(...)` | `vi.mocked(...)` |

## Render & Interaction

| Wrong | Correct |
|-------|---------|
| `import { render } from '@testing-library/react'` | `import { render } from '@/shared/lib/rendererRTL'` |
| `fireEvent.click(button)` | `await userEvent.click(button)` |
| `userEvent.click(button)` (not awaited) | `await userEvent.click(button)` |
| `import { renderHook } from '@testing-library/react'` | `import { renderHook } from '@/shared/lib/rendererRTL'` |

## Query & Assertion Patterns

| Wrong | Correct |
|-------|---------|
| `expect(screen.getByText('x')).toBeInTheDocument()` | `const el = screen.getByText('x'); expect(el).toBeInTheDocument()` |
| `screen.getByText((_, el) => el.textContent.includes('x'))` | Use string, RegExp, or `exact: false` |
| Multiple `expect` inside one `waitFor` | One `expect` per `waitFor` |
| Query directly inside `waitFor`'s `expect` | Create constant inside `waitFor` before `expect` |
| `getBy*` for negative assertions | Use `queryBy*` + `.not.toBeInTheDocument()` |

## Props & Test Data

| Wrong | Correct |
|-------|---------|
| `<Component {...defaultProps} extraProp="x" />` | `const props = { ...defaultProps, extraProp: 'x' }; <Component {...props} />` |
| A `TextContent` module or `src/constants/textContent.ts` | The English string from `en.json` that the component renders |
| Same literal repeated in mock + render + expect | Define one named constant, reuse it |
| Mock data defined inside test cases | Define outside tests for reusability |
| Empty tests: `it('test', () => {})` | Always include at least one `expect` |

## Mocking

| Wrong | Correct |
|-------|---------|
| `vi.mock('./child-card')` — mocking the component's own children | Render children for real |
| `vi.mock('react-hook-form')` / a stubbed `useForm` | Type into the real inputs and submit |
| `vi.mock('@/shared/ui/button')`, `vi.mock('react-i18next')`, `vi.mock('@/shared/lib/utils')` | Real primitives, real i18n (`rendererRTL` loads `en`), real `cn` |
| `vi.mock('../hooks/useProfiles')` + `as ReturnType<typeof useProfiles>` | Mock the fetcher; let the real hook run |
| `vi.mock(path, () => ({ onlyThis: vi.fn() }))` wiping the module | `importOriginal` partial mock |
| A mocked hook/context returning fields nobody reads | Return only what the code under test reads |
| Wrapping the component in an extra test-only Provider | `rendererRTL` already wraps the app providers |
| Mocking at bottom of file | `vi.mock()` calls at the top (before imports) |
| `// Arrange` / `// Act` / `// Assert` or any comment in the test | No comments — blank lines separate the phases |
| Using `require` to import | Use ES module `import` |

## Coverage of files

| Wrong | Correct |
|-------|---------|
| A new hook, fetcher, model function, store, or component with no test in the change | Every executable file ships its test (`rules/testing.mdc`) |
| One page-level test standing in for every child component | Each component folder has its own `{name}.test.tsx` |
| A test that only asserts "renders" or "is defined" | Assert what the user sees, what was called, or what was returned |

## Test Organization

| Wrong | Correct |
|-------|---------|
| Missing `vi.clearAllMocks()` in `beforeEach` | Always add to `beforeEach` |
| Tests that depend on each other's execution order | Each test is fully independent |
| No `beforeEach` setup, copy-pasted `vi.clearAllMocks()` in each test | Use `beforeEach` for shared cleanup |
| Unnamed or vague test names: `'button'`, `''` | `'disables submit button when loading is true'` |
| Deeply nested `describe` blocks | Flat or single-level `describe` |
