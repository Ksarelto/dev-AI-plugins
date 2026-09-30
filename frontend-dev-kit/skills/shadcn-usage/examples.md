# shadcn/ui Usage Examples

Bad/Good pairs for `rules/shadcn.mdc` and `rules/styling.mdc`. Copy the Good side.

## Re-homing keeps the registry classes

```ts
// Bad — motion and state classes dropped while moving to styles.ts; the dialog pops in with no animation
export const content = 'fixed top-1/2 left-1/2 grid w-full max-w-lg gap-4 rounded-lg border bg-background p-6 shadow-lg';

// Good — the CLI string, verbatim and in order
export const content =
  'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg';
```

The Good string is illustrative — copy the one your installed version generated, not this one.

## No motion or look override at the call site

```ts
// Bad — features/listings/ui/listing-dialog/styles.ts fights the base's data-state animation
export const content = 'animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-3xl shadow-2xl';

// Good — layout only; look and motion come from shared/ui/dialog
export const content = 'sm:max-w-xl';
```

Need a different look everywhere? Add a `cva` variant to `shared/ui/dialog/styles.ts` through the shared-UI step.

## Closed-set props

```tsx
// Bad — magic strings, and a default restated
<Button
  type="button"
  variant="outline"
  size="sm"
  onClick={handleCancel}
>

// Good — constants from shared/ui/button; `type` omitted because Button defaults to ButtonType.Button
<Button
  variant={ButtonVariant.Outline}
  size={ButtonSize.Small}
  onClick={handleCancel}
>
```

## Composing with asChild

```tsx
// Bad — two nested interactive elements, ambiguous accessible name
<Button onClick={handleOpenOrders}>
  <Link to={routes.orders}>
    {t(ordersKeys.list.open)}
  </Link>
</Button>

// Good — one element, the button's look, the link's navigation
<Button asChild>
  <Link to={routes.orders}>
    {t(ordersKeys.list.open)}
  </Link>
</Button>
```

## Wrapper merges className last

```tsx
// Bad — inline classes, and the caller's className is overridden
export const IconAction = ({ className, ...props }: IconActionProps): JSX.Element => (
  <Button className="h-8 w-8 p-0" {...props} />
);

// Good — classes in styles.ts, caller's layout utility wins the merge
export const IconAction = ({ className, ...props }: IconActionProps): JSX.Element => (
  <Button
    size={ButtonSize.Icon}
    className={styles.root(className)}
    {...props}
  />
);
```

## Don't wrap for a single preset prop

```tsx
// Bad — a whole component just to set one variant
export const DangerButton = (props: ButtonProps): JSX.Element => (
  <Button
    variant={ButtonVariant.Destructive}
    {...props}
  />
);

// Good — pass the constant at the call site
<Button
  variant={ButtonVariant.Destructive}
  onClick={handleDelete}
>
  {t(usersKeys.actions.delete)}
</Button>
```

## Portal boundaries break descendant CSS

```tsx
// Bad — SelectContent renders in a portal at document.body; this selector never matches
// .order-card .select-content { … }

// Good — style the content component directly, from styles.ts
<SelectContent className={styles.selectContent}>
  …
</SelectContent>
```

## Portal boundaries break event delegation

```tsx
// Bad — a click inside the portalled DropdownMenuContent never reaches this listener
<div onClick={handleClosePanel}>
  <DropdownMenu>…</DropdownMenu>
</div>

// Good — the primitive's own callback, as a named handler
const handleMenuOpenChange = (nextOpen: boolean): void => {
  if (!nextOpen) {
    closeParentPanel();
  }
};

<DropdownMenu onOpenChange={handleMenuOpenChange}>
  …
</DropdownMenu>
```

## Controlled Select converts at the boundary

```tsx
// Bad — enum passed straight through, value mixed with defaultValue
<Select
  value={status}
  defaultValue={Status.Open}
>

// Good — string in, enum out, controlled only
const handleStatusChange = (value: string): void => {
  setStatus(toOrderStatus(value));
};

<Select
  value={String(status)}
  onValueChange={handleStatusChange}
>
```
