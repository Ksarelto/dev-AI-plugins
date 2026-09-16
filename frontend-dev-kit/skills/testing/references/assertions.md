# Assertions

## Query Constants Rule

**Always store query results in a constant before asserting.** Never inline queries inside `expect`.

```ts
// Good
const title = screen.getByText(TextContent.myComponent.title)
expect(title).toBeInTheDocument()

const submitButton = screen.getByRole('button', { name: TextContent.common.submit })
expect(submitButton).toBeDisabled()

// Bad
expect(screen.getByText(TextContent.myComponent.title)).toBeInTheDocument()
expect(screen.getByRole('button', { name: TextContent.common.submit })).toBeDisabled()
```

Why: improves readability, easier debugging, clearer error messages, allows reusing the reference.

## Element Selection Priority

1. **`getByRole`** — always prefer semantic selectors
```ts
screen.getByRole('button', { name: TextContent.common.submit })
screen.getByRole('dialog', { name: TextContent.modal.title })
```

2. **`getByLabelText`** — for form inputs
```ts
screen.getByLabelText(TextContent.form.nameLabel)
```

3. **`getByText`** — for visible text
```ts
screen.getByText(TextContent.section.heading)
```

4. **`getByTestId`** — last resort only; add `data-testid` only when no semantic selector works
```ts
screen.getByTestId('progress-bar')
```

**Never pass a function/callback matcher** to query methods — use string or RegExp only:
```ts
// Good
screen.getByText(/Full Name/)
screen.queryByText(TextContent.error.message)

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
const button = screen.getByRole('button', { name: TextContent.common.submit })
expect(button).toBeInTheDocument()

// Negative assertion
const error = screen.queryByText(TextContent.error.notFound)
expect(error).not.toBeInTheDocument()

// Async appearance
const result = await screen.findByText(TextContent.status.success)
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
  const successMessage = screen.getByText(TextContent.status.success)
  expect(successMessage).toBeInTheDocument()
})

await waitFor(() => {
  const submitButton = screen.getByRole('button', { name: TextContent.common.submit })
  expect(submitButton).toBeEnabled()
})

// Bad — query directly in expect inside waitFor
await waitFor(() => {
  expect(screen.getByText(TextContent.status.success)).toBeInTheDocument()
})

// Bad — multiple expects in one waitFor
await waitFor(() => {
  const msg = screen.getByText(TextContent.status.success)
  expect(msg).toBeInTheDocument()
  const btn = screen.getByRole('button', { name: TextContent.common.close })
  expect(btn).toBeEnabled()
})
```

With custom timeout when needed:
```ts
await waitFor(() => {
  const element = screen.getByText(TextContent.status.success)
  expect(element).toBeInTheDocument()
}, { timeout: 3000 })
```
