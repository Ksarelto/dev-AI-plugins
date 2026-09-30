# Accessibility Examples

Bad/Good pairs for the constraints in the `accessibility` rule. Copy the Good side. Every Good side also follows `rules/i18n.mdc` (copy is `t(key)`), `rules/styling.mdc` (classes in `styles.ts`), and `rules/react.mdc` (named handlers, constants for closed-set props).

## Semantic HTML first

Use the correct element before reaching for ARIA. A `<Button>` is already keyboard-accessible; a `<div onClick>` is not.

```tsx
// Bad
<div onClick={handleSave} className="button">Save</div>

// Good
<Button onClick={handleSave}>
  {t(commonKeys.actions.save)}
</Button>
```

## Every interactive element must be keyboard-accessible

- All clickable elements are `<Button>` or `<a href>` (or `<Button asChild><Link …/></Button>`)
- Never attach `onClick` to `<div>`, `<span>`, or `<li>` without `role` + `tabIndex` + `onKeyDown`
- Test with Tab: every interactive control must be reachable

## Labels for form inputs

Every input has an associated label. The shared `Form.Field` (`rhf-form` skill) renders `FormLabel` → a real `<label>` bound to the control.

```tsx
// Bad — no label, placeholder is not a label, English literal
<Input placeholder="Enter name" />

// Good
<Form.Field
  name="name"
  label={t(usersKeys.form.name)}
>
  {(field) => <Input {...field} />}
</Form.Field>
```

## Icon-only buttons need aria-label

```tsx
// Bad — no name, size literal
<Button size="icon" onClick={handleDelete}><Trash2 /></Button>

// Good
<Button
  size={ButtonSize.Icon}
  aria-label={t(usersKeys.actions.delete)}
  onClick={handleDelete}
>
  <Trash2 aria-hidden />
</Button>
```

## Images need alt text

```tsx
// Bad
<img src={user.avatar} />

// Good — descriptive; the name is server data interpolated into a key
<img
  src={user.avatar}
  alt={t(usersKeys.avatarAlt, { name: user.name })}
/>

// Good — decorative (empty string intentional, not copy)
<img
  src={divider}
  alt=""
  role="presentation"
/>
```

## Focus management after modal/dialog open

When a dialog opens, focus must move inside it. shadcn `Dialog` does this automatically — do not prevent it with `autoFocus={false}` unless there is a specific reason. After closing, focus returns to the trigger.

## Color is not the only visual indicator

Never rely on color alone to convey state (error, warning, success). Pair color with an icon or text.

```tsx
// Bad — only red color signals the error
<span className="text-destructive">{error}</span>

// Good — the registry Alert carries icon + text + role="alert"
<Alert variant={AlertVariant.Destructive}>
  <XCircle aria-hidden />
  <AlertTitle>{t(usersKeys.errors.saveFailed)}</AlertTitle>
</Alert>
```

## ARIA — use only when semantic HTML is not enough

Prefer `<nav>`, `<main>`, `<header>`, `<section>`, `<article>` over `role="navigation"` etc. Add `aria-*` attributes when:
- A custom widget doesn't have a semantic HTML equivalent
- Screen reader context needs clarification (e.g. `aria-live` for dynamic content)
- A relationship between elements isn't implied by the DOM structure

Do not add `role="button"` to a `<button>`. Do not add `aria-label` to elements that already have visible text.

## The four states of a data surface

Every surface backed by a query has four states, and each must be announced, not just rendered. The live region stays mounted; the state inside it is picked before the return.

```tsx
const renderState = (): JSX.Element => {
  if (isPending) {
    return <UsersSkeleton />;
  }

  if (isError) {
    return <UsersError onRetry={handleRetry} />;
  }

  if (data.length === 0) {
    return <UsersEmpty />;
  }

  return <UserTable users={data} />;
};

return (
  <div
    className={styles.region}
    aria-live="polite"
    aria-busy={isPending}
  >
    {renderState()}
  </div>
);
```

Rules:
- `aria-live="polite"` for content updates; `role="alert"` (the registry `Alert`) only for errors that interrupt a task.
- Set `aria-busy` while pending so assistive tech does not announce a half-rendered tree.
- The live region must exist in the DOM *before* the content changes — conditionally rendering the whole `<div aria-live>` announces nothing.
- One live region per surface, never nested.
- `aria-live="polite"` is an ARIA token, not copy and not a component prop — it stays a literal.
