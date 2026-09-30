# Test Templates

Templates carry no comments — the generated test file must not either (`rules/general-coding-principles.mdc`). Mock only the boundary (`mock-patterns.md`).

## Component Test

```tsx
vi.mock('../../api/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/fetchers')>()),
  submitReview: vi.fn(),
}))

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/shared/lib/rendererRTL'
import { submitReview } from '../../api/fetchers'
import { ReviewForm } from './review-form'
import type { ReviewFormProps } from './types'

const mockSubmitReview = vi.mocked(submitReview)
const mockOnDone = vi.fn()

const defaultProps: ReviewFormProps = {
  listingId: 'listing-1',
  onDone: mockOnDone,
}

describe('ReviewForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubmitReview.mockResolvedValue(undefined)
  })

  it('shows the heading from the locale file', () => {
    render(<ReviewForm {...defaultProps} />)

    const heading = screen.getByRole('heading', { name: 'Leave a review' })

    expect(heading).toBeInTheDocument()
  })

  it('submits the review and calls onDone when the form is valid', async () => {
    render(<ReviewForm {...defaultProps} />)

    await userEvent.type(screen.getByLabelText('Comment'), 'Great drill')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(mockSubmitReview).toHaveBeenCalledWith('listing-1', { comment: 'Great drill' })
    expect(mockOnDone).toHaveBeenCalledOnce()
  })

  it('shows the validation message when comment is empty', async () => {
    render(<ReviewForm {...defaultProps} />)

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    const message = await screen.findByText('Comment is required')

    expect(message).toBeInTheDocument()
    expect(mockSubmitReview).not.toHaveBeenCalled()
  })

  it('keeps the form open when the request fails', async () => {
    mockSubmitReview.mockRejectedValueOnce(new Error('boom'))
    render(<ReviewForm {...defaultProps} />)

    await userEvent.type(screen.getByLabelText('Comment'), 'Great drill')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    const submitButton = await screen.findByRole('button', { name: 'Submit' })

    expect(submitButton).toBeEnabled()
    expect(mockOnDone).not.toHaveBeenCalled()
  })
})
```

The real form, `zod`, shared `Form`, `Button`, `Input`, i18n, and query client run. Only the fetcher is mocked. Children of `ReviewForm` render for real.

## Hook Test

```tsx
vi.mock('../api/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/fetchers')>()),
  fetchReviews: vi.fn(),
}))

import { waitFor } from '@testing-library/react'
import { renderHook } from '@/shared/lib/rendererRTL'
import { fetchReviews } from '../api/fetchers'
import { useReviews } from '../hooks/use-reviews'

const mockFetchReviews = vi.mocked(fetchReviews)

describe('useReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the reviews for a listing', async () => {
    mockFetchReviews.mockResolvedValue([mockReview])

    const { result } = renderHook(() => useReviews('listing-1'))

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual([mockReview])
    expect(mockFetchReviews).toHaveBeenCalledWith('listing-1')
  })
})
```

`mockReview` is typed as the wire type once at the top of the file.

## Utility / model Test

```ts
import { canDecline } from '../models/can-decline'

describe('canDecline', () => {
  it('returns true when the profile is new', () => {
    const result = canDecline({ status: ProfileStatus.New })

    expect(result).toBe(true)
  })

  it('returns false when the profile is already declined', () => {
    const result = canDecline({ status: ProfileStatus.Declined })

    expect(result).toBe(false)
  })
})
```

Pure functions need no mocks at all.

## What NOT to Test

- Implementation details (internal state, private methods)
- Tailwind class output or CSS values
- Third-party library internals (shadcn component rendering)
- Pure pass-through props with no logic
