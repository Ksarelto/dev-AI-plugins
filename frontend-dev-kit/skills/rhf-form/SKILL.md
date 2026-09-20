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

Every form built with this skill composes a shared `Form` compound component instead of
hand-wiring shadcn's `FormField` + `FormItem` + `FormLabel` + `FormControl` + `FormMessage` at each
field. It is generic and business-agnostic, so per the `architecture` rule's layer table it lives
once at `src/shared/ui/Form/` and every feature imports it — never copy-paste the boilerplate into
a feature's `ui/` folder.

1. **Check first** — if `src/shared/ui/Form/` already exists, reuse it; do not create a second
   implementation. If it doesn't exist yet, scaffold it once from the template in
   [examples.md](examples.md#example-0--shared-form-compound-component-scaffold-once), following
   the `react-component` skill's folder convention (`index.tsx` + `types.ts`, no barrel inside).
2. It exposes `Form` (the `<form>` root bound to a `UseFormReturn`) and `Form.Field` (one field's
   `FormItem` + optional `FormLabel` + `FormControl` + optional `FormDescription` + `FormMessage`),
   with the field's control passed as a render-prop child so any input/select/checkbox composes
   the same way.

## Instructions

1. **Define schema** — create a zod schema and infer the type in `types.ts`
2. **Create mutation hook** — `useCreateXxx` or `useUpdateXxx` with cache invalidation
3. **Build form component:**
   ```tsx
   const form = useForm<FormValues>({ resolver: zodResolver(schema) });
   ```
4. **Bind fields** — use the shared `<Form>` / `<Form.Field>` compound component (see above), not
   raw shadcn `<FormField>` + `<FormItem>` wiring
5. **Pre-populate for edit** — call `form.reset(data)` inside a `useEffect` when the detail query resolves
6. **Handle submit** — pass `onSubmit` to `<Form>`; it calls `form.handleSubmit(onSubmit)` internally
7. **Error display** — server 422 errors mapped per field via `form.setError('fieldName', { message })`; global errors via `toast.error()`
8. **Disable submit** — use `isPending` from the mutation hook

## Checklist

- [ ] Zod schema defined; `z.infer` used for form values type
- [ ] Fields use the shared `Form.Field` compound component, not hand-wired `FormField`/`FormItem`
- [ ] All fields have a `label` (not placeholder-only) unless intentionally inline (e.g. a checkbox)
- [ ] Submit uses mutation hook, not direct fetch
- [ ] Submit button disabled while `isPending`
- [ ] Edit forms pre-populated via `form.reset()` when data loads
- [ ] Server 422 errors mapped to fields with `form.setError()`
- [ ] No second `Form`/`Form.Field` implementation added to a feature — the shared one under
      `src/shared/ui/Form/` is reused

See [examples.md](examples.md) for few-shot templates.
