# Routing — Testing Reference

## Mocking useNavigate, useParams, useSearchParams

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

const mockNavigate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useNavigate).mockReturnValue(mockNavigate)
})
```

## Asserting navigation after an action

```ts
it('navigates to user detail after successful creation', async () => {
  const mockMutate = vi.fn((_input, options) => options?.onSuccess?.({ id: 'new-id' }))
  vi.mocked(useCreateUser).mockReturnValue({ mutate: mockMutate, isPending: false } as ReturnType<typeof useCreateUser>)

  render(<CreateUserForm />)

  const nameInput = screen.getByLabelText('Name')
  await userEvent.type(nameInput, 'Alice')
  await userEvent.click(screen.getByRole('button', { name: /create/i }))

  expect(mockNavigate).toHaveBeenCalledWith('/users/new-id')
})
```

## Testing with different params

Override `useParams` per-test when the component behaviour changes by route param:

```ts
it('renders not found when id is missing', () => {
  vi.mocked(useParams).mockReturnValueOnce({ id: undefined })

  render(<UserDetail />)

  expect(screen.getByText(/user not found/i)).toBeInTheDocument()
})
```

## Testing search params updates

```ts
it('updates role filter in URL when role is selected', async () => {
  const mockSetSearchParams = vi.fn()
  vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(), mockSetSearchParams])

  render(<UsersPage />)

  const roleSelect = screen.getByRole('combobox', { name: /role/i })
  await userEvent.selectOptions(roleSelect, 'admin')

  expect(mockSetSearchParams).toHaveBeenCalled()
})
```

## Testing ProtectedRoute redirect in isolation

Use `MemoryRouter` only when testing the route component itself (e.g. `ProtectedRoute`), not for components that happen to call navigation hooks.

```ts
import { MemoryRouter, Route, Routes } from 'react-router'

it('redirects to /login when not authenticated', () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route
            path="/dashboard"
            element={<div>Dashboard</div>}
          />
        </Route>
        <Route
          path="/login"
          element={<div>Login Page</div>}
        />
      </Routes>
    </MemoryRouter>
  )

  expect(screen.getByText('Login Page')).toBeInTheDocument()
})
```

## Rules

- Mock `useNavigate`, `useParams`, `useSearchParams` at the module level (before imports)
- Re-assign `mockNavigate` via `vi.mocked(useNavigate).mockReturnValue(...)` in `beforeEach`
- Override `useParams` per-test with `mockReturnValueOnce` for param-sensitive components
- Use `MemoryRouter` only for testing route components themselves — not for incidental navigation
