# JSX conventions — Bad/Good pairs

Examples and rationale for the JSX statements in `rules/react.mdc`: prop layout, element content, named
handlers, conditionals, and closed-set props. The rule holds the binding statements.

## Callback props

Avoid passing callbacks as props where composition or a shared store/context can carry the interaction
instead — a callback prop couples parent and child and tends to fan out down the tree. Reach for it only for
genuine leaf-level event notification (`onChange`, `onClick`) where there's no other consumer of that event.

## Props and element content

```tsx
// ❌ Avoid
<Input value={search} onChange={handleSearchChange} />

// ✅ Prefer
<Input
  value={search}
  onChange={handleSearchChange}
/>
```

```tsx
// ❌ Avoid
<SelectItem value={UserRole.Admin}>{t(usersKeys.roles.admin)}</SelectItem>

// ✅ Prefer
<SelectItem value={UserRole.Admin}>
  {t(usersKeys.roles.admin)}
</SelectItem>
```

## Handlers

A render prop (`render={({ field }) => …}`, `children` as a function) returns JSX and is not a handler.

```tsx
// ❌ Avoid
<Dialog
  open={open}
  onOpenChange={(nextOpen) => {
    if (!nextOpen) {
      setDraft(localeBadge)
    }

    onOpenChange(nextOpen)
  }}
>

// ✅ Prefer
const handleOpenChange = (nextOpen: boolean): void => {
  if (!nextOpen) {
    setDraft(localeBadge)
  }

  onOpenChange(nextOpen)
}

<Dialog
  open={open}
  onOpenChange={handleOpenChange}
>
```

## Conditionals

The nested-ternary ban covers the values JSX renders, not only the JSX itself. A lookup map keyed by a
union handles an N-way choice.

```tsx
// ❌ Avoid
<Button disabled={isPending}>
  {isPending ? t(usersKeys.form.saving) : t(usersKeys.form.save)}
</Button>
{isLoading ? <UsersSkeleton /> : isError ? <UsersError /> : <UsersTable users={users} />}

// ✅ Prefer — value computed before return
const submitLabel = isPending ? t(usersKeys.form.saving) : t(usersKeys.form.save)

<Button disabled={isPending}>
  {submitLabel}
</Button>

// ✅ Prefer — branch swap as early returns
if (isLoading) {
  return <UsersSkeleton />
}

if (isError) {
  return <UsersError />
}

return <UsersTable users={users} />
```

## Closed-set props

The constant comes from the primitive's `constants.ts`; reuse it across the app. A plain button writes
neither `type` nor `variant`.

```tsx
// ❌ Avoid
<Button type="button" variant="outline" onClick={handleCancel}>

// ✅ Prefer
<Button
  variant={ButtonVariant.Outline}
  onClick={handleCancel}
>
```

## Nested components and names

An inline JSX block over ~20 lines that becomes `{component}/ui/{child}/` appears in DevTools and narrows
the re-render scope. Folder and file are the kebab-case of the export (`CustomButton` →
`custom-button/custom-button.tsx`) because the DevTools tree shows the export, not the filename.
