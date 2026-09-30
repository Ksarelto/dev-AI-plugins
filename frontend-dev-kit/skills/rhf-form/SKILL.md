---
name: rhf-form
description: Build forms with react-hook-form + zod validation, shadcn/ui form components, and react-query mutations. Use when creating or updating forms, adding validation, or wiring form submission to API mutations.
---

# Form (react-hook-form + zod)

## When to use

- Creating a create/edit form
- Adding field validation rules
- Wiring form submission to a mutation hook
- User mentions forms, inputs, validation, or CRUD create/update

## Shared `Form` compound component

Every form composes a shared `Form` compound component instead of hand-wiring shadcn's `FormField` + `FormItem` + `FormLabel` + `FormControl` + `FormMessage` at each field. It lives once at `src/shared/ui/form/` and every feature imports `@/shared/ui/form`.

```
shared/ui/form/
  primitives.tsx   — the registry `form` source, re-homed verbatim (rules/shadcn.mdc)
  form.tsx         — the compound: Form + Form.Field
  styles.ts
  types.ts
  constants.ts     — FieldOrientation
  form.test.tsx
  index.ts         — exports Form, and FieldOrientation when a caller uses it
```

1. **Check first** — if `src/shared/ui/form/` exists, reuse it. Otherwise add the registry `form` item with `shadcn add`, re-home it into `primitives.tsx`, and scaffold the compound from [examples.md](examples.md#example-0--shared-form-compound-component-scaffold-once).
2. `form.tsx` imports the parts from `./primitives` — never from `@/shared/ui/form`, which is its own public entry.
3. The only edit to the registry source: `FormMessage` passes the error through `translateMessage` (`i18n` skill), so zod messages written as keys render as copy.
4. `Form` is the `<form>` root bound to a `UseFormReturn`; `Form.Field` is one field (`FormItem` + optional `FormLabel` + `FormControl` + optional `FormDescription` + `FormMessage`), with the control passed as a render-prop child.

## Instructions

1. **Define the schema** in the form's `types.ts`. Every message is a translation key: `z.string().min(1, usersKeys.form.errors.nameRequired)` — never English. Business invariants call `models/` pure functions. Wire-shape zod stays in `api/`.
2. **Create the mutation hook** — `useCreateXxx` / `useUpdateXxx` with cache invalidation.
3. **Build the form component**: `useForm<FormValues>({ resolver: zodResolver(schema), defaultValues })`. Default values live in the folder's `constants.ts`.
4. **Bind fields** with `<Form.Field>`. `label`, `description`, `placeholder`, and option text are `t(key)`. Closed-set props are constants: `type={InputType.Email}`, `orientation={FieldOrientation.Horizontal}`.
5. **Pre-populate for edit** — `form.reset(data)` in a `useEffect` when the detail query resolves.
6. **Handle submit** with a named `handleSubmit` declared above the return and passed as `onSubmit={handleSubmit}` — never an inline arrow on `<Form>`.
7. **Errors** — `AppError` with `kind === 'validation'` maps per field via `mapServerErrorsToForm(err.data, form.setError, form.getValues)` from `@/shared/lib/form`. Other kinds go to the global handler; a specific toast is `notify.error(t(key))`.
8. **Submit button** — `<Button type={ButtonType.Submit} disabled={isPending}>`. Its label is computed before the return (`const submitKey = isPending ? keys.submitting : keys.submit`), never a ternary inside JSX.
9. **Styles** — the form's layout classes live in its `styles.ts`. No `className="…"` in the component.

## Checklist

- [ ] Zod schema defined; `z.infer` used for form values type; every message is a key
- [ ] Fields use the shared `Form.Field`, not hand-wired `FormField`/`FormItem`
- [ ] `shared/ui/form/form.tsx` imports parts from `./primitives`, not from its own index
- [ ] All labels, placeholders, descriptions, option text, button text, and toasts go through `t()`
- [ ] All fields have a `label` (not placeholder-only) unless intentionally inline (a checkbox)
- [ ] Submit uses the mutation hook, not a direct fetch
- [ ] Named `handleSubmit`; no inline arrow in `onSubmit` or any `on*` prop
- [ ] `ButtonType.Submit` / `InputType.Email` constants — no literal `type="submit"` / `type="email"`
- [ ] Submit label computed before return; no ternary in JSX
- [ ] Submit button disabled while `isPending`
- [ ] Edit forms pre-populated via `form.reset()` when data loads
- [ ] Server 422 errors mapped to fields with `form.setError()`
- [ ] HTTP failures narrow with `isAppError` — not `ApiError`, not a raw status code
- [ ] A test renders the form with the real `react-hook-form` and `zod`, types into fields, and mocks only the fetcher

See [examples.md](examples.md) for few-shot templates.
