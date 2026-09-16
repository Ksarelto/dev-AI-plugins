# Accessibility Examples

Bad/Good pairs for the constraints in the `accessibility` rule. Copy the Good side.

## Semantic HTML first

Use the correct HTML element before reaching for ARIA. A `<button>` is already keyboard-accessible; a `<div onClick>` is not.

```tsx
// Bad
<div onClick={handleSave} className="button">Save</div>

// Good
<button onClick={handleSave}>
  Save
</button>
```

## Every interactive element must be keyboard-accessible

- All clickable elements must be `<button>` or `<a href>` (or shadcn equivalents like `<Button>`)
- Never attach `onClick` to `<div>`, `<span>`, or `<li>` without `role` + `tabIndex` + `onKeyDown`
- Test with Tab key: every interactive control must be reachable

## Labels for form inputs

Every input must have an associated label. shadcn `<FormItem>` with `<FormLabel>` renders the correct `<label>` element.

```tsx
// Bad — no label, placeholder is not a label
<Input placeholder="Enter name" />

// Good
<FormField
  control={form.control}
  name="name"
  render={({ field }) => (
    <FormItem>
      <FormLabel>
        Name
      </FormLabel>
      <FormControl>
        <Input {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

## Icon-only buttons need aria-label

```tsx
// Bad
<Button size="icon" onClick={handleDelete}><Trash2 /></Button>

// Good
<Button
  size="icon"
  onClick={handleDelete}
  aria-label="Delete user"
>
  <Trash2 />
</Button>
```

## Images need alt text

```tsx
// Bad
<img src={user.avatar} />

// Good — descriptive
<img
  src={user.avatar}
  alt={`Avatar of ${user.name}`}
/>

// Good — decorative (empty string intentional)
<img
  src={divider}
  alt=""
  role="presentation"
/>
```

## Focus management after modal/dialog open

When a dialog opens, focus must move inside it. shadcn `<Dialog>` does this automatically — do not prevent it with `autoFocus={false}` unless there is a specific reason.

After closing, return focus to the trigger element.

## Color is not the only visual indicator

Never rely on color alone to convey state (error, warning, success). Pair color with an icon or text label.

```tsx
// Bad — only red color signals the error
<span className="text-destructive">{error}</span>

// Good — icon + text
<span className="flex items-center gap-1 text-destructive">
  <XCircle
    className="h-4 w-4"
    aria-hidden
  />
  {error}
</span>
```

## ARIA — use only when semantic HTML is not enough

Prefer `<nav>`, `<main>`, `<header>`, `<section>`, `<article>` over `role="navigation"` etc. Add `aria-*` attributes when:
- A custom widget doesn't have a semantic HTML equivalent
- Screen reader context needs clarification (e.g. `aria-live` for dynamic content)
- A relationship between elements isn't implied by the DOM structure

Do not add `role="button"` to a `<button>`. Do not add `aria-label` to elements that already have visible text.

## The four states of a data surface

Every surface backed by a query has four states, and each must be announced, not just rendered. Wrap the region in a live region so a screen reader user learns that content changed without moving focus.

```tsx
// Good — one live region owning all four states
<div
  aria-live="polite"
  aria-busy={isPending}
>
  {isPending && <Skeleton className="h-64 w-full" />}
  {isError && (
    <p className="flex items-center gap-1 text-destructive">
      <XCircle
        className="h-4 w-4"
        aria-hidden
      />
      {t('users.list.loadFailed')}
    </p>
  )}
  {isSuccess && data.length === 0 && <EmptyState title={t('users.list.emptyState')} />}
  {isSuccess && data.length > 0 && <UserTable users={data} />}
</div>
```

Rules:
- `aria-live="polite"` for content updates; `role="alert"` (implicitly assertive) only for errors that interrupt a task.
- Set `aria-busy` while pending so assistive tech does not announce a half-rendered tree.
- The live region must exist in the DOM *before* the content changes — conditionally rendering the whole `<div aria-live>` announces nothing.
- One live region per surface, never nested. The four branches above are mutually exclusive by construction.
