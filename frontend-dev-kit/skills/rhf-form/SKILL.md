---
name: rhf-form
description: Build forms with react-hook-form, zod field rules, shadcn inputs, and react-query mutations. Use when creating or updating forms, adding validation, or wiring form submission to API mutations.
---

# Form (react-hook-form)

## When to use

- Creating or editing a form
- Adding field validation
- Wiring submit to a mutation hook
- The user mentions forms, inputs, validation, or a create/update flow

Hard constraints: `rules/api-contract.mdc`, `rules/i18n.mdc`. Procedures: [references/shared-form.md](references/shared-form.md) and [references/feature-form.md](references/feature-form.md). Copy the shapes in [examples.md](examples.md).

## Shared form

Every feature imports `@/shared/ui/form`. The folder is created once from [references/shared-form.md](references/shared-form.md). Do not run `shadcn add form`. Do not hand-wire a `Form.Field` compound. `FormItem` reads `value` from `useController`. `field.render` overrides `FormInputRenderer`.

## Feature form

Follow [references/feature-form.md](references/feature-form.md):

1. The public export is the guard. Availability rules live in `constants.ts`.
2. The button owns `useForm({ mode: FormValidationMode.ON_CHANGE, shouldUnregister: true, defaultValues })`, `FormProvider`, open/close, and submit via `getValues()` into the mutation hook.
3. The nested form calls `useFormContext` and maps a fields array to `<FormItem field={field} />`. It does not call `useForm`, import `api/`, or submit.
4. Field rules come from `@/shared/ui/form` (`requiredRule` and the rest). Messages are translation keys. There is no `ui/<form>/schema.ts` and no `zodResolver` on the default path.
5. A cross-field check uses the zod helpers from `@/shared/ui/form` inside the button's `useForm` resolver. It is not `api/schema.ts`.
6. `lib/map-to-form-values.ts` builds `defaultValues` and does not import a fetcher.
7. Copy is `t(key)` at the label, placeholder, toast, and button. Do not store `t(...)` in a local.

## Checklist

- [ ] `shared/ui/form` is the boilerplate shape — `Form`, `FormItem`, `FormInputRenderer`, `FormLabel`, `FormErrorMessage`
- [ ] `FormItem` uses the controller `value`, not a `value` prop
- [ ] Feature entry exports the guard; the button owns `useForm`; the form only lists fields
- [ ] Fields are `<FormItem field={field} />` with `requiredRule` / `maxLengthRule` / `patternRule`
- [ ] No `schema.ts` next to the form and no `zodResolver` unless the button needs a cross-field check
- [ ] `api/schema.ts` is still the only server-entity schema
- [ ] Labels, placeholders, toasts, and button text are `t(key)` at the render site
- [ ] Named handlers; no inline arrow on `onClick` or `onSubmit`
- [ ] Submit is disabled while the mutation is pending
- [ ] A test uses the real `react-hook-form` and mocks only the fetcher
