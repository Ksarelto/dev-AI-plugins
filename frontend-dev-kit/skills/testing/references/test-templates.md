# Test Templates

## Component Test

```tsx
// vi.mock() calls first — hoisted by Vitest
vi.mock('@/api/profiles/profiles.hooks')
vi.mock('./ChildComponent', () => ({ ChildComponent: mockComponent('child-component') }))

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockComponent } from '@/mocks'
import { render } from '@/utils/rendererRTL'
import { TextContent } from '@/constants/textContent'
import { MyComponent } from './MyComponent'
import type { MyComponentProps } from './MyComponent'

const mockOnSubmit = vi.fn()

const defaultProps: MyComponentProps = {
  title: 'Test Title',
  onSubmit: mockOnSubmit,
}

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title', () => {
    render(<MyComponent {...defaultProps} />)

    const title = screen.getByText(TextContent.myComponent.title)

    expect(title).toBeInTheDocument()
  })

  it('calls onSubmit when form is submitted', async () => {
    render(<MyComponent {...defaultProps} />)

    const submitButton = screen.getByRole('button', { name: TextContent.common.submit })
    await userEvent.click(submitButton)

    expect(mockOnSubmit).toHaveBeenCalledOnce()
  })

  it('disables submit button while loading', () => {
    const props = { ...defaultProps, isLoading: true }
    render(<MyComponent {...props} />)

    const submitButton = screen.getByRole('button', { name: TextContent.common.submit })

    expect(submitButton).toBeDisabled()
  })

  it('shows error message when submission fails', async () => {
    render(<MyComponent {...defaultProps} />)

    await waitFor(() => {
      const errorMessage = screen.getByText(TextContent.myComponent.errorMessage)
      expect(errorMessage).toBeInTheDocument()
    })
  })
})
```

## Hook Test

```tsx
import { act } from '@testing-library/react'
import { renderHook } from '@/utils/rendererRTL'
import { useMyHook } from './useMyHook'

describe('useMyHook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial state', () => {
    const { result } = renderHook(() => useMyHook())

    expect(result.current.value).toBe(null)
    expect(result.current.isLoading).toBe(false)
  })

  it('updates state on action', async () => {
    const { result } = renderHook(() => useMyHook())

    await act(async () => {
      result.current.doSomething('input')
    })

    expect(result.current.value).toBe('expected')
  })
})
```

## Utility Test

```ts
import { myUtil } from './utils'

describe('myUtil', () => {
  it('transforms data correctly', () => {
    const input = { id: '1', name: 'Test' }

    const result = myUtil(input)

    expect(result).toEqual({ formattedName: 'Test', id: '1' })
  })

  it('returns null for missing input', () => {
    const result = myUtil(null)

    expect(result).toBeNull()
  })
})
```

## What NOT to Test

- Implementation details (internal state, private methods)
- Tailwind class output or CSS values
- Third-party library internals (shadcn component rendering)
- Pure pass-through props with no logic
