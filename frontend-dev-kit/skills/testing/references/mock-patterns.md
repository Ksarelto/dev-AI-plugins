# Mock Patterns

## API Hooks (TanStack Query)

```ts
import { useGetProfiles } from '@/api/profiles/profiles.hooks'

vi.mock('@/api/profiles/profiles.hooks')

const mockUseGetProfiles = vi.mocked(useGetProfiles)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseGetProfiles.mockReturnValue({
    data: mockProfiles,
    isPending: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useGetProfiles>)
})
```

For mutations:

```ts
const mockMutate = vi.fn()

mockUseCreateProfile.mockReturnValue({
  mutate: mockMutate,
  isPending: false,
} as ReturnType<typeof useCreateProfile>)
```

## Child Components

Use `mockComponent` helper from `@/mocks` — preferred:

```ts
import { mockComponent } from '@/mocks'

vi.mock('./ChildComponent', () => ({ ChildComponent: mockComponent('child-component') }))
```

Or inline when you need to assert props:

```ts
vi.mock('./ChildComponent', () => ({
  ChildComponent: ({ title }: { title: string }) => <div data-testid="child-component">{title}</div>,
}))
```

**When to shallow-mock child components:**
- Components tested separately in their own test file
- Components that don't affect the behavior being tested
- Complex components that would slow tests down

## Custom Hooks

```ts
vi.mock('./hooks/useFeatureData', () => ({
  useFeatureData: vi.fn(() => ({
    data: mockData,
    isLoading: false,
    handleAction: vi.fn(),
  })),
}))
```

Use `mockReturnValueOnce` to override per-test:

```ts
vi.mocked(useFeatureData).mockReturnValueOnce({
  data: null,
  isLoading: true,
  handleAction: vi.fn(),
})
```

## Context Hooks

When the component uses a context hook (`useXxxContext`), **mock the hook module** — do NOT render the real Provider tree.

```ts
const mockGoNext = vi.fn()

vi.mock('@/containers/MyFeature/hooks/useMyFeatureContext', () => ({
  useMyFeatureContext: vi.fn(() => ({
    stepIndex: 1,
    goNext: mockGoNext,
  })),
}))
```

Rules:
- Return only the properties the component under test **actually reads**
- Use `vi.fn()` for methods you need to assert (`goNext`, `setField`, etc.)
- Override per-test with `mockReturnValueOnce` when context data changes behavior
- Do NOT build a second test Provider that mirrors the real context implementation

## React Router

```ts
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: vi.fn(),
    useParams: vi.fn().mockReturnValue({ id: '123' }),
    useSearchParams: vi.fn().mockReturnValue([new URLSearchParams(), vi.fn()]),
  }
})
```

## React Hook Form

```ts
vi.mock('react-hook-form', async () => {
  const actual = await vi.importActual('react-hook-form')
  return {
    ...actual,
    useForm: vi.fn().mockReturnValue({
      handleSubmit: vi.fn((fn) => fn),
      register: vi.fn(),
      watch: vi.fn().mockReturnValue(mockFormValues),
      getValues: vi.fn().mockReturnValue(mockFormValues),
      formState: { errors: {}, isValid: true, isDirty: true },
      setValue: vi.fn(),
      reset: vi.fn(),
    }),
  }
})
```

## Environment

```ts
vi.mock('@/utils/env')

vi.mocked(ENV).mockReturnValue({ API_URL: 'http://test.api' })
```

## Icon / IconButton Components

When a component contains icon-only buttons (no accessible text), mock them with a `data-testid` so they can be found and clicked in tests:

```ts
const mockIconBtn = 'edit-icon-btn'

vi.mock('@/components/Icons', () => ({
  EditIcon: () => <span data-testid={mockIconBtn} />,
}))

// In test
const editButton = screen.getByTestId(mockIconBtn)
await userEvent.click(editButton)
expect(mockOnEdit).toHaveBeenCalled()
```

Rules:
- Use consistent naming: `mock${Name}Icon` / `mock${Name}Btn`
- Preserve `onClick` handler so interactions can be tested
- Use `mockShallowComponent` from `@/mocks` for simple icon-only cases

## General Mocking Rules

- **Never add extra test-only providers** to satisfy third-party libraries — mock the library instead
- **Keep `render` from `@/utils/rendererRTL`** as the entry point; it already wraps necessary providers
- Full integration with the real library belongs in E2E tests, not component tests
