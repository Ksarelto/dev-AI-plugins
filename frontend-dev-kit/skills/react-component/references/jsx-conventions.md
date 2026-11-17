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

No nested ternary. No ternary in JSX, and no const that holds an element from a ternary. A string or
a translation key may still be chosen before `return`. A whole-screen swap may be an early `return`.

```tsx
// ❌ Avoid — ternary in JSX, and a const that holds the element
const hintControl = hint ? <InfoMark items={hintItems} label={hint} wide={hintWide} /> : null
const getTips = items ? items.map((item) => <p key={item.label}>{item.label}</p>) : null

<span>
  {label}
  {hintControl}
  {loaded && detail ? <OverviewHeader record={detail} /> : <span className={styles.headerSpacer} />}
</span>

// ✅ Prefer — condition in JSX, list as a function, two branches as if/return
const getTips = () => items?.map((item) => <p key={item.label}>{item.label}</p>)

const renderHeader = () => {
  if (loaded && detail) {
    return <OverviewHeader record={detail} />
  }

  return <span className={styles.headerSpacer} />
}

<span>
  {label}
  {hint && <InfoMark items={hintItems} label={hint} wide={hintWide} />}
  {items && getTips()}
  {renderHeader()}
</span>

// ✅ Prefer — a translation key is not an element
const submitKey = isPending ? usersKeys.form.saving : usersKeys.form.save

<Button disabled={isPending}>{t(submitKey)}</Button>

// ✅ Prefer — a whole-screen swap is an early return
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
