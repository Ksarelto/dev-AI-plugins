# Shared form

Create `src/shared/ui/form/` once. Do not run `shadcn add form`. Inputs are the existing primitives: `Input`, `Textarea`, `Checkbox`, `ControlledSelect`, `Label`.

```
shared/ui/form/
  form.tsx
  constants.ts
  types.ts
  styles.ts
  index.ts
  lib/validators.ts
  lib/toValue.ts
  ui/form-item-content/
  ui/form-label/
  ui/form-message/
  ui/form-input-renderer/
  tests/form.test.tsx
```

If the folder already exists, reuse it. Do not add a second form compound.

## Public API

`index.ts` exports `Form`, `FormItem`, `FormLabel`, `FormErrorMessage`, `FormInputRenderer`, `FormFieldType`, `FormValidationMode`, the validator helpers, and the types `FormFieldConfig`, `FieldRenderProps`, `SelectOption`.

## `Form`

A `<form>` bound to `UseFormReturn`. `onSubmit` goes through `form.handleSubmit`. The handler is a named function, not an inline arrow.

## `FormItem`

`useController({ name: field.code, rules: field.rules })`. Read `value` from the controller field. Do not take `value` as a prop — a fields array cannot thread it.

`field.render` receives `FieldRenderProps` and replaces `FormInputRenderer`. Without `render`, `FormInputRenderer` switches on `FormFieldType`: `STRING`, `NUMBER`, `TEXTAREA`, `ENUM`, `CHECKMARK`.

`label`, `requiredMark`, `hint`, `placeholder`, `options`, `disabled`, and `rules` live on `FormFieldConfig`. `FormLabel` binds `htmlFor` to the control id. `FormErrorMessage` renders when `fieldState.error.message` is set, with `role="alert"` and an id referenced by `aria-describedby`.

## Errors and copy

A message that is a translation key goes through `translateMessage` inside `FormErrorMessage`. Callers pass keys (`commonKeys.errors.required`), not English. `FormErrorMessage` does not call `t()` itself beyond that helper.

## Validators

`lib/validators.ts` exports `requiredRule`, `maxLengthRule`, and `patternRule` (`RegisterOptions` fragments) and the zod helpers `requiredString`, `maxLength`, and `pattern`. Default messages are translation keys. Feature forms use the rule helpers on `field.rules`. A cross-field check uses the zod helpers inside the button's `useForm` resolver. That resolver is not a `schema.ts` file and it is not `api/schema.ts`.

## Values

`toInputValue` returns a string or number, otherwise `''`. `toSelectValue` returns a string, otherwise `undefined`.

## Tests

`tests/form.test.tsx` renders `Form` inside `FormProvider` with the real `react-hook-form`. Assert a field from `FormFieldConfig`, a validation message, and `onSubmit` with the values. Mock only what jsdom cannot run.
