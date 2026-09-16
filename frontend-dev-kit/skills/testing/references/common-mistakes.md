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
| `import { render } from '@testing-library/react'` | `import { render } from '@/utils/rendererRTL'` |
| `fireEvent.click(button)` | `await userEvent.click(button)` |
| `userEvent.click(button)` (not awaited) | `await userEvent.click(button)` |
| `import { renderHook } from '@testing-library/react'` | `import { renderHook } from '@/utils/rendererRTL'` |

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
| Hardcoded UI strings in assertions: `'Upload Files'` | `TextContent.section.uploadFiles` |
| Same literal repeated in mock + render + expect | Define one named constant, reuse it |
| Mock data defined inside test cases | Define outside tests for reusability |
| Empty tests: `it('test', () => {})` | Always include at least one `expect` |

## Mocking

| Wrong | Correct |
|-------|---------|
| Wrapping component in real Provider to satisfy a library | `vi.mock()` the library or context hook |
| Building a second "test provider" component | Mock the hook the component calls |
| Mocking at bottom of file | `vi.mock()` calls at the top (before imports) |
| Not including all properties the component uses in hook mock | Mirror the full shape the component reads |
| Using `require` to import | Use ES module `import` |

## Test Organization

| Wrong | Correct |
|-------|---------|
| Missing `vi.clearAllMocks()` in `beforeEach` | Always add to `beforeEach` |
| Tests that depend on each other's execution order | Each test is fully independent |
| No `beforeEach` setup, copy-pasted `vi.clearAllMocks()` in each test | Use `beforeEach` for shared cleanup |
| Unnamed or vague test names: `'button'`, `''` | `'disables submit button when loading is true'` |
| Deeply nested `describe` blocks | Flat or single-level `describe` |
