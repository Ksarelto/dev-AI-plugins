---
name: antd-form
description: Build antd forms with validation, typed fields, and react-query mutations. Use when creating or updating forms, adding field validation, or wiring form submit to API mutations.
---

# antd Form

## When to use

- Creating a create/edit form
- Adding validation rules to form fields
- Wiring form submission to a mutation hook
- User mentions forms, inputs, validation, or CRUD create/update

## Instructions

1. **Define form values type** — `CreateXxxInput` or `UpdateXxxInput` in `types.ts`
2. **Create mutation hook** — `useCreateXxx` or `useUpdateXxx` with invalidation
3. **Build form component:**
   ```tsx
   const [form] = Form.useForm<FormValues>();
   ```
4. **Add fields** — each field in `Form.Item` with `name`, `label`, and `rules`
5. **Pre-populate for edit** — `useEffect` + `form.setFieldsValue(data)` when detail query resolves
6. **Handle submit** — `onFinish` calls `mutate(values)`; use `isPending` for button loading
7. **Error display** — server errors via `message.error()` or map to `form.setFields()` for field-level errors
8. **Style** — colocate form layout styles in `{FormName}.css.ts`

## Checklist

- [ ] Form typed with `Form.useForm<T>()`
- [ ] All fields have labels (not placeholder-only)
- [ ] Validation rules on required/format fields
- [ ] Submit uses mutation hook, not direct fetch
- [ ] Loading state on submit button
- [ ] Success feedback and form reset or navigation
- [ ] Edit forms pre-populated from detail query

See [examples.md](examples.md) for few-shot templates.
