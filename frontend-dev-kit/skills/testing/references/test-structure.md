# Test Structure

## Test Naming Convention

Format: `'[action/behavior] when [condition]'` or `'[what it does] [context]'`

```ts
// Good
it('uploads files with correct data when Upload button is clicked', async () => {})
it('disables Save button when no files are selected', async () => {})
it('shows error message when upload limit is exceeded', async () => {})
it('renders modal with correct default title', () => {})
it('calls setSelectedProfileId when row is clicked', async () => {})

// Bad
it('test upload', () => {})
it('button', () => {})
it('', () => {})
```

## Test Organization Order

Order tests logically within a `describe` block:

1. **Rendering** — component renders correctly with default props
2. **Happy path** — successful user flows
3. **Edge cases** — boundary conditions, empty state, optional props
4. **Error cases** — validation errors, API failures
5. **UI states** — disabled, loading, selected, expanded

## describe Usage

Use `describe` only when:
- A single file tests **multiple distinct entities** (e.g. `profilesApi.test.ts` covering multiple endpoints)
- There are enough test cases that grouping adds clarity

For a single component or hook, a top-level `describe('ComponentName', ...)` wrapping all tests is fine. Do not nest `describe` blocks unnecessarily.

## Default Props Pattern

Always define `defaultProps` outside test cases:

```ts
const mockOnClose = vi.fn()

const defaultProps: MyComponentProps = {
  isVisible: true,
  onClose: mockOnClose,
}
```

## Props Override Pattern

When a test needs **different props**, define a `props` variable by spreading `defaultProps` — never add extra props directly on the JSX element:

```ts
// Good — define props object, spread once on JSX
it('disables submit while loading', () => {
  const props = {
    ...defaultProps,
    isLoading: true,
  }
  render(<MyComponent {...props} />)

  const submit = screen.getByRole('button', { name: TextContent.common.submit })
  expect(submit).toBeDisabled()
})

// Good — no overrides needed, use defaultProps directly
it('renders title', () => {
  render(<MyComponent {...defaultProps} />)
  ...
})

// Bad — mixing props sources on one JSX element
render(<MyComponent {...defaultProps} isLoading={true} extraProp="x" />)
```

## String and Enum Constants

**Never repeat the same literal** across mocks, renders, and `expect` statements.

1. **Use existing symbols first:**
   - UI copy → `TextContent.section.key`
   - Field keys / codes → import from `constants.ts` of the module under test
   - Enum values → import from `@/enums/`

2. **If nothing exists**, define one named constant at the top of the test file:

```ts
const expectedRoutePath = 'profiles'
const mockProfileId = 'profile-id-1'

expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining(expectedRoutePath))
expect(screen.getByText(mockProfileId)).toBeInTheDocument()
```

Anti-patterns:
- Same string literal in render props, mock return, and `expect` on separate lines
- Magic values (`'ACTIVE'`, `404`) inlined instead of importing from the source module

## Test Isolation

```ts
beforeEach(() => {
  vi.clearAllMocks()
})
```

- Always `vi.clearAllMocks()` in `beforeEach` to reset call counts and implementations
- Tests must not depend on execution order
- Each test sets up its own state — do not share mutable state between tests
