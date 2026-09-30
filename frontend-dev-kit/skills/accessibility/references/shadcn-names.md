# Accessible Names for shadcn/ui Primitives

shadcn primitives wrap Radix, which enforces some naming requirements at runtime and silently drops others. These are the ones that get missed. Names are copy — every one is `t(key)`.

### Dialog — `DialogTitle` is mandatory, `DialogDescription` is near-mandatory

Radix logs a console error and the dialog has no accessible name when `DialogTitle` is absent. If the design has no visible title, render it visually hidden — never omit it.

```tsx
// Bad — no accessible name; Radix warns at runtime
<DialogContent><UserForm /></DialogContent>

// Good — visible title, registry part order
<DialogContent>
  <DialogHeader>
    <DialogTitle>{t(usersKeys.edit.title)}</DialogTitle>
    <DialogDescription>{t(usersKeys.edit.description)}</DialogDescription>
  </DialogHeader>
  <UserForm />
</DialogContent>

// Good — title required by a11y but not by the design
<DialogContent aria-describedby={undefined}>
  <VisuallyHidden>
    <DialogTitle>{t(commandKeys.palette.title)}</DialogTitle>
  </VisuallyHidden>
  <CommandPalette />
</DialogContent>
```

The same applies to `Sheet` (`SheetTitle`), `AlertDialog` (`AlertDialogTitle`), and `Drawer`. When you deliberately render no description, pass `aria-describedby={undefined}` so the pointer does not dangle at a missing id.

### Select and Combobox — the trigger needs a name

`SelectTrigger` renders a button whose only content is the current value plus a chevron. Inside a form, `Form.Field`'s label supplies the name through `FormControl`. Standalone, it does not — the accessible name becomes "United States" (the value) instead of "Country" (the purpose).

```tsx
// Bad — standalone select, no name for the control itself
<SelectTrigger><SelectValue /></SelectTrigger>

// Good
<SelectTrigger aria-label={t(addressKeys.country.label)}>
  <SelectValue placeholder={t(addressKeys.country.placeholder)} />
</SelectTrigger>
```

Combobox (`Popover` + `Command`) needs both: `aria-label` on the trigger, and a label or instructional `placeholder` on `CommandInput`. Popover contents are not in the accessibility tree while closed, so they cannot name the trigger.

### Tooltip is not an accessible name

A `Tooltip` describes; it does not name. It is not exposed while the control is unfocused, and touch users never see it. An icon button with a tooltip still needs `aria-label`.

```tsx
// Bad — tooltip is the only name
<TooltipTrigger asChild><Button size="icon"><Download /></Button></TooltipTrigger>

// Good — aria-label names, tooltip reinforces visually; both read the same key
<TooltipTrigger asChild>
  <Button
    size={ButtonSize.Icon}
    aria-label={t(reportsKeys.actions.exportCsv)}
  >
    <Download aria-hidden />
  </Button>
</TooltipTrigger>
<TooltipContent>{t(reportsKeys.actions.exportCsv)}</TooltipContent>
```

Using one key for both keeps the visible tooltip and the accessible name identical, so voice control ("click Export CSV") works.

Any lucide icon rendered next to visible text is decorative — mark it `aria-hidden`. The registry `Button` already sizes and spaces child SVGs, so do not add `mr-2 h-4 w-4` at the call site:

```tsx
<Button>
  <Plus aria-hidden />
  {t(usersKeys.actions.add)}
</Button>
```

### Other primitives worth checking

| Primitive | Requirement |
|---|---|
| `Tabs` | `TabsTrigger` text is the name; do not use icon-only triggers without `aria-label` |
| `Checkbox` / `Switch` / `RadioGroupItem` | Not a real `<input>` — pair with `<Label htmlFor>` or `Form.Field` |
| `Table` | Needs a `<caption>` or `aria-label` on `<table>` when more than one table is on the page |
| `Progress` | Set `aria-label`; the value is announced but the purpose is not |
| `Toast` (sonner) | Already a live region — do not wrap it in another `aria-live` |
| `Skeleton` | Decorative; give the *container* the live-region semantics, not the skeleton |
| `Dialog` / `Sheet` close button | The registry `sr-only` "Close" is translated when the base is re-homed (`rules/shadcn.mdc`) |
