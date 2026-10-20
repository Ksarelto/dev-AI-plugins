# Form examples

Bad/Good pairs for `references/shared-form.md` and `references/feature-form.md`. Copy the Good side. Function bodies use braces. Class strings live in `styles.ts`. Copy is `t(key)` at the render site.

## Example 1 — shared `FormItem`

```tsx
export const FormItem = ({ className, field, ...props }: FormItemProps): JSX.Element => {
  const id = useId()
  const {
    field: { disabled: fieldDisabled, name, onChange, ref, value },
    fieldState,
  } = useController({
    name: field.code,
    rules: field.rules,
  })

  const handleChange = (next: unknown): void => {
    onChange(next)
    field.handler?.onChange?.(next)
  }

  const errorMessage = fieldState.error?.message
  const hasError = Boolean(errorMessage)
  const errorId = hasError ? `${id}${FormMessageIdSuffix.ERROR}` : undefined

  const renderProps: FieldRenderProps = {
    'aria-describedby': errorId,
    'aria-invalid': hasError,
    disabled: field.disabled ?? fieldDisabled,
    id,
    name,
    onChange: handleChange,
    placeholder: field.placeholder,
    ref,
    value,
  }

  const control = field.render?.(renderProps) ?? (
    <FormInputRenderer {...renderProps} options={field.options} type={field.type} />
  )

  const label = field.label ? (
    <FormLabel hasError={hasError} hint={field.hint} htmlFor={id} required={field.requiredMark}>
      {field.label}
    </FormLabel>
  ) : null

  return (
    <div className={formItemStyles(field.type === FormFieldType.CHECKMARK, className)} {...props}>
      {label}
      {control}
      <FormErrorMessage id={errorId} message={errorMessage} />
    </div>
  )
}
```

`label` is already a translated string or a key passed through `translateMessage` on the error path. Do not take `value` from props.

## Example 2 — feature fields

```tsx
export const SplitFileForm = (): JSX.Element => {
  const { t } = useTranslation()
  const { watch } = useFormContext<SplitFileValues>()
  const engine = watch(FieldCode.ENGINE)

  const fields: FormFieldConfig[] = [
    {
      code: FieldCode.GROUP,
      label: t(splitFileKeys.fields.group),
      requiredMark: true,
      rules: requiredRule(),
      render: GroupSelect,
    },
    {
      code: FieldCode.REVIEW,
      label: t(splitFileKeys.fields.review),
      type: FormFieldType.CHECKMARK,
    },
  ]

  return (
    <div className={styles.root}>
      {fields.map((field) => (
        <FormItem key={field.code} field={field} />
      ))}
      <EngineFeatures engine={engine} />
    </div>
  )
}
```

`GroupSelect` is a named component. It is not an arrow written inside the array.

## Example 3 — button owns the form

```tsx
export const SplitFileButton = ({ file }: SplitFileButtonProps): JSX.Element => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { mutate, isPending } = useSplitFile()
  const form = useForm<SplitFileValues>({
    mode: FormValidationMode.ON_CHANGE,
    shouldUnregister: true,
    defaultValues: mapToFormValues(file),
  })

  const handleClose = (): void => {
    form.reset()
    setOpen(false)
  }

  const handleSubmit = (): void => {
    const values = form.getValues()
    mutate(
      { fileId: file.id, ...values },
      { onSuccess: handleClose },
    )
  }

  const submitKey = isPending ? splitFileKeys.actions.splitting : splitFileKeys.actions.split

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <FormProvider {...form}>
        <SplitFileForm />
      </FormProvider>
      <Button type={ButtonType.Submit} disabled={isPending || !form.formState.isValid} onClick={handleSubmit}>
        {t(submitKey)}
      </Button>
    </Drawer>
  )
}
```

The pending label passes a key into `t()` at the button. It does not store the translated string. The form file does not contain this submit handler.
