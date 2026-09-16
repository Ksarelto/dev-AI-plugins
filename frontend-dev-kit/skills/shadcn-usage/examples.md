# shadcn/ui Usage Examples

Bad/Good pairs for the constraints in the `shadcn-usage` rule.

## Composing with asChild

```tsx
// Bad — two focusable/interactive elements nested, accessible name is ambiguous
<Button onClick={() => navigate('/orders')}>
  <Link to="/orders">View orders</Link>
</Button>

// Good — one element, the button's styling and semantics, the link's navigation
<Button asChild>
  <Link to="/orders">View orders</Link>
</Button>
```

## Wrapper spreads props and merges className last

```tsx
// Bad — caller's className is overridden by the wrapper's own classes
const IconButton = ({ className, ...props }: ButtonProps): JSX.Element => {
  return <Button className="h-8 w-8 p-0" {...props} />;
};

// Good — cn() merges, caller's utility wins the Tailwind-merge conflict
const IconButton = ({ className, ...props }: ButtonProps): JSX.Element => {
  return <Button className={cn('h-8 w-8 p-0', className)} {...props} />;
};
```

## Don't wrap for a single preset prop

```tsx
// Bad — a whole component just to set one variant
const DangerButton = (props: ButtonProps): JSX.Element => {
  return <Button variant="destructive" {...props} />;
};

// Good — pass the prop at the call site
<Button
  variant="destructive"
  onClick={handleDelete}
>
  Delete
</Button>
```

## Portal boundaries break descendant CSS

```tsx
// Bad — SelectContent renders in a portal at document.body; this selector never matches
// .order-card .select-content { background: var(--muted); }

// Good — style the content component directly
<SelectContent className="bg-muted">
  ...
</SelectContent>
```

## Portal boundaries break event delegation

```tsx
// Bad — click inside the portalled DropdownMenuContent never reaches this listener
<div onClick={closeParentPanel}>
  <DropdownMenu>
    <DropdownMenuTrigger asChild><Button>Actions</Button></DropdownMenuTrigger>
    <DropdownMenuContent>...</DropdownMenuContent>
  </DropdownMenu>
</div>

// Good — use the primitive's own callback
<DropdownMenu onOpenChange={(open) => !open && closeParentPanel()}>
  ...
</DropdownMenu>
```

## Controlled Select converts at the boundary

```tsx
// Bad — passing the enum value directly, and mixing value/defaultValue
<Select value={status} defaultValue={Status.Open}>

// Good — convert to string going in, back to the enum coming out; pick controlled only
<Select value={String(status)} onValueChange={(v) => setStatus(Number(v) as Status)}>
```
