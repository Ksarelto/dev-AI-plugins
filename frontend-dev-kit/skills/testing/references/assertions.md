# Assertions

## Query Constants Rule

**Always store query results in a constant before asserting.** Never inline queries inside `expect`.

```ts
// Good
const title = screen.getByText('Title')
expect(title).toBeInTheDocument()

const submitButton = screen.getByRole('button', { name: 'Submit' })
expect(submitButton).toBeDisabled()

// Bad
expect(screen.getByText('Title')).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
```

Why: improves readability, easier debugging, clearer error messages, allows reusing the reference.

## Element Selection Priority

1. **`getByRole`** — always prefer semantic selectors
```ts
screen.getByRole('button', { name: 'Submit' })
screen.getByRole('dialog', { name: 'Title' })
```

2. **`getByLabelText`** — for form inputs
```ts
screen.getByLabelText('Name Label')
```

3. **`getByText`** — for visible text
```ts
screen.getByText('Heading')
```

4. **`getByTestId`** — last resort only; add `data-testid` only when no semantic selector works
```ts
screen.getByTestId('progress-bar')
```

**Never pass a function/callback matcher** to query methods — use string or RegExp only:
```ts
// Good
screen.getByText(/Full Name/)
screen.queryByText('Message')

// Bad — callback matcher
screen.getByText((_, element) => element?.textContent?.includes('Full Name'))
```

## Query Method Guide

| Method | Element exists | Element missing | When to use |
|--------|---------------|-----------------|-------------|
| `getBy*` | Returns element | Throws | Element must be present |
| `queryBy*` | Returns element | Returns `null` | Negative assertions (`not.toBeInTheDocument`) |
| `findBy*` | Returns `Promise<el>` | Rejects | Wait for async element to appear |

```ts
// Must exist now
const button = screen.getByRole('button', { name: 'Submit' })
expect(button).toBeInTheDocument()

// Negative assertion
const error = screen.queryByText('Not Found')
expect(error).not.toBeInTheDocument()

// Async appearance
const result = await screen.findByText('Success')
expect(result).toBeInTheDocument()
```

## DOM Assertions

```ts
// Presence
expect(element).toBeInTheDocument()
expect(element).not.toBeInTheDocument()

// Visibility
expect(element).toBeVisible()
expect(element).not.toBeVisible()

// State
expect(button).toBeDisabled()
expect(button).toBeEnabled()
expect(checkbox).toBeChecked()

// Content
expect(element).toHaveTextContent('expected text')
expect(input).toHaveValue('expected value')
```

## Mock Function Assertions

```ts
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledTimes(1)
expect(mockFn).toHaveBeenCalledWith({ id: 'test' })
expect(mockFn).toHaveBeenCalledOnce()                          // vitest helper

// Specific call verification
expect(mockFn).toHaveBeenNthCalledWith(1, expectedArg)

// Partial argument matching
expect(mockFn).toHaveBeenCalledWith(
  expect.objectContaining({ id: 'test' })
)
```

## Async Assertions — waitFor

Use `waitFor` for state changes that happen after user interaction or async effects.

Rules:
- **One `expect` per `waitFor`** — split into separate `waitFor` calls if needed
- **Create a constant inside `waitFor`** before the `expect` — same rule as regular assertions

```ts
// Good — constant inside waitFor, one expect per call
await waitFor(() => {
  const successMessage = screen.getByText('Success')
  expect(successMessage).toBeInTheDocument()
})

await waitFor(() => {
  const submitButton = screen.getByRole('button', { name: 'Submit' })
  expect(submitButton).toBeEnabled()
})

// Bad — query directly in expect inside waitFor
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument()
})

// Bad — multiple expects in one waitFor
await waitFor(() => {
  const msg = screen.getByText('Success')
  expect(msg).toBeInTheDocument()
  const btn = screen.getByRole('button', { name: 'Close' })
  expect(btn).toBeEnabled()
})
```

With custom timeout when needed:
```ts
await waitFor(() => {
  const element = screen.getByText('Success')
  expect(element).toBeInTheDocument()
}, { timeout: 3000 })
```
