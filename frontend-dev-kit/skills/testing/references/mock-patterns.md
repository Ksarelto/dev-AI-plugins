# Mock Patterns

## API Hooks (TanStack Query)

```ts
import { useProfiles } from '@/features/profiles/hooks/useProfiles'

vi.mock('@/features/profiles/hooks/useProfiles')

const mockUseProfiles = vi.mocked(useProfiles)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseProfiles.mockReturnValue({
    data: mockProfiles,
    isPending: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useProfiles>)
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

Mock the child in the test file. Do not add a shared `@/mocks` helper.

```ts
vi.mock('./child-card', () => ({
  ChildCard: ({ title }: { title: string }) => <div>{title}</div>,
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
vi.mock('@/shared/config/env', () => ({
  env: { reportsEnabled: false },
}))
```

## Icon-only buttons

An icon-only button has an `aria-label`. Query it by role and name. Do not add `@/components/Icons` or a `data-testid` to reach it.

```ts
const editButton = screen.getByRole('button', { name: 'Edit' })
await userEvent.click(editButton)
expect(mockOnEdit).toHaveBeenCalled()
```

## General Mocking Rules

- **Never add extra test-only providers** to satisfy third-party libraries — mock the library instead
- **Keep `render` from `@/shared/lib/rendererRTL`** as the entry point; it already wraps necessary providers
- Full integration with the real library belongs in E2E tests, not component tests
