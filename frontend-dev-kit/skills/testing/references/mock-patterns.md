# Mock Patterns

Mock the boundary the test cannot run in jsdom — nothing else. Everything the component owns runs for real (`rules/testing.mdc`).

| Mock | Keep real |
|------|-----------|
| The slice's `api/` fetchers, or `@/shared/api/base` | Query and mutation hooks the component owns (they run through `rendererRTL`'s `QueryClient`) |
| `useNavigate` (and `useParams` when the test sets a route param) | The rest of `react-router` |
| Browser APIs jsdom lacks (`matchMedia`, `ResizeObserver`, `scrollIntoView`) | `@/shared/ui/*` primitives, Radix |
| Time (`vi.useFakeTimers()`) | `react-hook-form`, `zod`, i18n (`rendererRTL` loads `en`) |
| `@/shared/config/env` when a flag changes behavior | `cn`, `styles.ts`, the component's own children, its `model/` functions, the store it owns |

Before writing `vi.mock`, answer: *what breaks if this runs for real?* If the answer is "nothing", do not mock it.

## Fetchers (preferred over mocking a query hook)

```ts
vi.mock('../../api/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/fetchers')>()),
  fetchProfiles: vi.fn(),
}))

import { screen } from '@testing-library/react'
import { ProfileStatus, type Profile } from '@/entities/profile'
import { render } from '@/shared/lib/rendererRTL'
import { fetchProfiles } from '../../api/fetchers'
import { ProfilesList } from './profiles-list'

const mockFetchProfiles = vi.mocked(fetchProfiles)

const mockProfile: Profile = {
  id: '1',
  displayName: 'Ada Lovelace',
  status: ProfileStatus.Active,
  createdAt: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchProfiles.mockResolvedValue([mockProfile])
})

it('shows each profile name when the list loads', async () => {
  render(<ProfilesList />)

  const name = await screen.findByText('Ada Lovelace')

  expect(name).toBeInTheDocument()
})

it('shows the error state when the request fails', async () => {
  mockFetchProfiles.mockRejectedValueOnce(new Error('boom'))
  render(<ProfilesList />)

  const alert = await screen.findByRole('alert')

  expect(alert).toHaveTextContent('Could not load profiles')
})
```

The real `useProfiles` runs, so loading, error, and data states are exercised the way users see them. `importOriginal` keeps the fetchers this test does not touch real. `mockProfile` is typed as the fetcher's wire type once at the top, and `mockResolvedValue` checks it, with no cast. `rendererRTL`'s `QueryClient` must set `retry: false` so the error test does not wait on retries.

## Mutations

```ts
vi.mock('../../api/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/fetchers')>()),
  declineProfile: vi.fn(),
}))

it('calls the decline endpoint with the profile id', async () => {
  vi.mocked(declineProfile).mockResolvedValue(undefined)
  render(<DeclineProfile profileId="1" />)

  await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

  expect(declineProfile).toHaveBeenCalledWith('1')
})
```

## A query the component does not own

A widget or page test that consumes an entity's query still mocks the **entity's fetcher**, not its hook. The real hook runs and the test needs no `UseQueryResult` stub:

```ts
vi.mock('@/entities/profile/api/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/profile/api/fetchers')>()),
  fetchProfile: vi.fn(),
}))
```

Mocking a query hook forces a full `UseQueryResult` shape or a cast (`as ReturnType<typeof useProfile>`). Both are wrong — mock one level lower.

## React Router

```ts
const mockNavigate = vi.fn()

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mockNavigate,
}))
```

Mock `useParams` only in a test that needs a param. Prefer rendering at a route (`render(<Page />, { route: '/profiles/1' })`) when `rendererRTL` supports it.

## Environment

```ts
vi.mock('@/shared/config/env', () => ({
  env: { reportsEnabled: false },
}))
```

## Browser APIs

```ts
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})
```

Put shared polyfills (`ResizeObserver`, `matchMedia`, pointer capture for Radix) in the Vitest setup file once, not in each test.

## Forms

Do not mock `react-hook-form` or `zod`. Type into the real inputs and submit; assert the validation copy or the fetcher call. See `rhf-form` examples § Example 5.

## Icon-only buttons

An icon-only button has an `aria-label`. Query it by role and name — no `data-testid`:

```ts
const editButton = screen.getByRole('button', { name: 'Edit' })
await userEvent.click(editButton)
expect(mockOnEdit).toHaveBeenCalled()
```

## Never

- `vi.mock('./child-card')` or any child component of the unit under test.
- `vi.mock('@/shared/ui/...')`, `vi.mock('react-hook-form')`, `vi.mock('react-i18next')`, `vi.mock('@/shared/lib/utils')`.
- A mocked module or hook that returns fields the code under test never reads. Wire data passed to a typed fetcher mock is the exception — its type requires the full shape.
- A second "test provider" that re-implements a real provider — `rendererRTL` already wraps the app providers.
- `as ReturnType<typeof useX>` / `as unknown as` to force a mock's type.
