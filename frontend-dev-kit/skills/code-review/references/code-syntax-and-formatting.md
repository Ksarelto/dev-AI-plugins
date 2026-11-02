# Syntax and formatting — examples

Examples and edge cases for the syntax statements in `rules/general-coding-principles.mdc`. The
feature-dev conventions gate checks most of them (`arrow-body`, `max-len`, `block-gap`, `wrapped-expr`).

## Arrow bodies and braces

An arrow that does more than return uses a block too. A function whose only statement would be `return`
does not use `return`; it is an expression body.

```ts
export const isDocumentTypeErrorCode = (code: string): code is DocumentTypeErrorCodeValue => documentTypeErrorCodes.has(code)
```

Reserve `function` declarations for places the runtime or tooling requires one (none currently in this
codebase).

## Line length

The project ESLint config enforces 160 characters:
`'max-len': ['error', { code: 160, ignoreUrls: true, ignoreStrings: false, ignoreTemplateLiterals: false }]`.
Strings count.

## Blank lines and wrapped values

The blank line before `return` separates the setup from the result. Skip the gap around a block when it is
the only statement in its block. A wrapped value moves the expression to the next line(s) and puts `)` on
its own line.

```ts
let tableLabel: string | undefined

if (table.showSkeleton) {
  tableRole = TableRegionRole.Status
  tableLabel = loadingLabel
}

const withRouteBoundary = (page: ReactNode): JSX.Element => (
  <ErrorBoundary>
    {page}
  </ErrorBoundary>
)

let variant: (typeof ButtonVariant)['Ghost'] | (typeof ButtonVariant)['Outline'] = (
  ButtonVariant.Ghost
)
```

## Objects, arrays, and imports

Two or fewer properties, items, or import specifiers may stay on one line. The same applies to
`import type`.

```ts
// ❌ Avoid
const userFixture = { id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin' }

// ✅ Prefer
const userFixture = {
  id: '1',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'admin',
}
```
