# React Query — Testing Reference

## Mocking query hooks

Always mock the hook module, not the fetcher or `queryClient`. Mirror the full shape the component reads.

```ts
import { useUsers } from '@/features/users/api/useUsers';

vi.mock('@/features/users/api/useUsers')

const mockUseUsers = vi.mocked(useUsers)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseUsers.mockReturnValue({
    data: mockUsers,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useUsers>)
})
```

## Mocking mutation hooks

```ts
import { useCreateUser } from '@/features/users/api/useCreateUser';

vi.mock('@/features/users/api/useCreateUser')

const mockMutate = vi.fn()

vi.mocked(useCreateUser).mockReturnValue({
  mutate: mockMutate,
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  reset: vi.fn(),
} as ReturnType<typeof useCreateUser>)
```

## Testing loading state

```ts
it('shows loading spinner while fetching', () => {
  mockUseUsers.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  } as ReturnType<typeof useUsers>)

  render(<UserList />)

  const spinner = screen.getByRole('status')
  expect(spinner).toBeInTheDocument()
})
```

## Testing error state

```ts
it('shows error message when fetch fails', () => {
  mockUseUsers.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
  } as ReturnType<typeof useUsers>)

  render(<UserList />)

  const errorMsg = screen.getByText(TextContent.users.loadError)
  expect(errorMsg).toBeInTheDocument()
})
```

## Testing mutation call

```ts
it('calls mutate with correct payload when form is submitted', async () => {
  render(<CreateUserForm />)

  const nameInput = screen.getByLabelText(TextContent.form.nameLabel)
  await userEvent.type(nameInput, 'Alice')

  const submitButton = screen.getByRole('button', { name: TextContent.common.submit })
  await userEvent.click(submitButton)

  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Alice' })
  )
})
```

## Per-test override

```ts
it('disables submit while mutation is pending', () => {
  vi.mocked(useCreateUser).mockReturnValueOnce({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: true,
    isError: false,
    reset: vi.fn(),
  } as ReturnType<typeof useCreateUser>)

  render(<CreateUserForm />)

  const submitButton = screen.getByRole('button', { name: TextContent.common.submit })
  expect(submitButton).toBeDisabled()
})
```

## Rules

- Mock at the **hook level**, not the fetcher or `queryClient`
- Always mirror **all properties the component reads** — missing keys cause runtime errors
- Use `vi.mocked(hook).mockReturnValueOnce(...)` to vary state between tests
- Never wrap components in a real `QueryClientProvider` in unit tests — mock the hooks instead
- Full integration (real `QueryClientProvider` + MSW) belongs in Storybook or E2E, not component tests
