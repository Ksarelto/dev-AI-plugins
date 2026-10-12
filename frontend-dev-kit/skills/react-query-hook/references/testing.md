# React Query — Testing Reference

Hooks run for real through `rendererRTL`'s `QueryClient` (`retry: false`). Mock the HTTP boundary
below them, never the hook (`rules/testing.mdc`). Full patterns: `frontend-dev-kit:testing` →
`references/mock-patterns.md`.

## Inside the slice that owns the fetcher

Mock this slice's own `api/fetchers` by relative path, keeping the rest real:

```ts
vi.mock('../../api/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/fetchers')>()),
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchUsers).mockResolvedValue([mockUser])
})
```

## A query another slice owns

A feature, widget, page, or route test mocks `httpClient` in `@/shared/api/base`. Never mock
`@/entities/x/api/fetchers` (deep import) or `@/entities/x` (replaces the real hook):

```ts
const mockGetJson = vi.hoisted(() => vi.fn())

vi.mock('@/shared/api/base', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/base')>()),
  httpClient: { get: vi.fn(() => ({ json: mockGetJson })) },
}))
```

## States

```ts
it('shows the error state when the request fails', async () => {
  vi.mocked(fetchUsers).mockRejectedValueOnce(new Error('boom'))
  render(<UserList />)

  const alert = await screen.findByRole('alert')

  expect(alert).toBeInTheDocument()
})

it('disables submit while the mutation is pending', async () => {
  vi.mocked(createUser).mockReturnValue(new Promise(() => {}))
  render(<CreateUserForm />)
  await userEvent.type(screen.getByLabelText('Name'), 'Alice')

  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
})
```

Loading: assert the skeleton or `status` role before awaiting data. Mutation payload: assert the
fetcher mock was called with it (`expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }))`).

## Rules

- Never mock a query or mutation hook — it forces a cast (`as ReturnType<typeof useX>`) or a full `UseQueryResult` stub
- Type mock data as the fetcher's wire type once; `mockResolvedValue` checks it without a cast
- Vary state per test with `mockResolvedValueOnce` / `mockRejectedValueOnce` on the fetcher or `httpClient`
