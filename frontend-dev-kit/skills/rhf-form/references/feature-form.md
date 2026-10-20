# Feature form

One user action that opens a form. The public export is the guard. The button owns the form instance. The nested form only lists fields.

```
features/<slice>/ui/<action>/
  index.ts
  constants.ts
  <action>-button.tsx
  styles.ts
  tests/<action>-button.test.tsx
  lib/map-to-form-values.ts
  ui/<action>-guard/
  ui/<action>-form/
```

## Guard

`index.ts` exports the guard, not the button. The guard reads the availability rules from `constants.ts`. When a rule matches, it renders a disabled control and the reason (`t(key)`). Otherwise it renders the button.

## Button

Owns `useForm`, open/close, and submit.

```ts
const form = useForm({
  mode: FormValidationMode.ON_CHANGE,
  shouldUnregister: true,
  defaultValues: mapToFormValues(record),
})
```

Wrap the form body in `FormProvider`. Submit from the footer with `getValues()` into the mutation hook. Do not put `onSubmit` on an inline arrow. Reset and close together. The button does not declare the fields array.

## Form

`useFormContext` only. A `fields` array of `FormFieldConfig`, mapped to `<FormItem key={field.code} field={field} />`.

- Built-in controls set `type: FormFieldType.STRING` (or `NUMBER`, `TEXTAREA`, `ENUM`, `CHECKMARK`).
- A custom control sets `render` to a named component or a named function declared above the array. `render` receives `FieldRenderProps`.
- `rules` come from `@/shared/ui/form` (`requiredRule`, `maxLengthRule`, `patternRule`). Messages are translation keys.
- Labels and placeholders are `t(key)` at the field, not a local that stores the translation.

The form component does not call `useForm`, does not import `api/`, and does not submit.

## Mapper and constants

`lib/map-to-form-values.ts` turns the domain record into `defaultValues`. It does not import a fetcher. `constants.ts` holds `FIELD_CODE` and the availability rules for this action. Class strings stay in `styles.ts`. A closed set and its maps stay in one file (slice `config/` when the map holds keys).

## Tests

Render the guard and the button with the real `react-hook-form`. Type into a field, submit, and assert the mutation payload. Mock only the fetcher. The form test asserts that a required rule surfaces the translated message.
