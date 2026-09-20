# Form (react-hook-form + zod) — Few-shot Examples

## Example 0 — Shared `Form` compound component (scaffold once)

Build this once at `src/shared/ui/Form/` (per the `react-component` skill's folder convention). It
wraps shadcn's `Form` primitives so every feature form composes `<Form>` / `<Form.Field>` instead
of repeating `FormField` + `FormItem` + `FormLabel` + `FormControl` + `FormMessage` at every field.

```ts
// shared/ui/Form/types.ts
import type { ReactNode } from 'react';
import type { ControllerRenderProps, FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

export interface FormProps<TValues extends FieldValues> {
  form: UseFormReturn<TValues>;
  onSubmit: (values: TValues) => void;
  className?: string;
  children: ReactNode;
}

export interface FormFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> {
  name: TName;
  label?: string;
  description?: string;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
  children: (field: ControllerRenderProps<TValues, TName>) => ReactNode;
}
```

```tsx
// shared/ui/Form/index.tsx
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';
import {
  Form as ShadcnForm,
  FormControl,
  FormDescription,
  FormField as ShadcnFormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { FormFieldProps, FormProps } from './types';

const FormRoot = <TValues extends FieldValues>({
  form,
  onSubmit,
  className,
  children,
}: FormProps<TValues>): JSX.Element => {
  return (
    <ShadcnForm {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('space-y-4', className)}
      >
        {children}
      </form>
    </ShadcnForm>
  );
};

const Field = <TValues extends FieldValues, TName extends FieldPath<TValues>>({
  name,
  label,
  description,
  className,
  orientation = 'vertical',
  children,
}: FormFieldProps<TValues, TName>): JSX.Element => {
  const { control } = useFormContext<TValues>();

  return (
    <ShadcnFormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn(orientation === 'horizontal' && 'flex items-center gap-2', className)}
        >
          {orientation === 'vertical' && label && <FormLabel>{label}</FormLabel>}
          <FormControl>{children(field)}</FormControl>
          {orientation === 'horizontal' && label && (
            <FormLabel className="font-normal">{label}</FormLabel>
          )}
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export const Form = Object.assign(FormRoot, { Field });
```

Notes:

- `Form.Field`'s `children` is a render-prop receiving the RHF `field` object, so any control —
  `Input`, `Select`, `Checkbox`, a custom widget — composes the same way; the field wires its own
  `value`/`onChange` inside the render prop rather than the compound component guessing the
  control's shape.
- `orientation="horizontal"` covers the checkbox/switch case (control before label); default
  `"vertical"` covers the standard label-above-control layout.
- This is the only place shadcn's raw `Form`/`FormField`/`FormItem` primitives are imported —
  feature code imports `Form` from `@/shared/ui/Form` and never touches the shadcn primitives
  directly, per the `shadcn-usage` rule's wrapper guidance.
- No `forwardRef`, no `React.memo`/`useMemo`/`useCallback` added preemptively — same constraints
  as any other shared component (`react-component` skill checklist).

---

## Example 1 — Create form

**Request:** "Add a form to create a new user"

```ts
// features/users/ui/CreateUserForm/types.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  role: z.enum(['admin', 'member']),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
```

```tsx
// features/users/ui/CreateUserForm/index.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form } from '@/shared/ui/Form';
import { createUserSchema, type CreateUserFormValues } from './types';
import { useCreateUser } from '../../api/useCreateUser';
import { ApiError } from '@/api/client';

const UNPROCESSABLE_ENTITY_STATUS = 422;

export const CreateUserForm = ({ onSuccess }: { onSuccess: () => void }): JSX.Element => {
  const { mutate, isPending } = useCreateUser();
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'member',
    },
  });

  const onSubmit = (values: CreateUserFormValues): void => {
    mutate(values, {
      onSuccess: () => {
        toast.success('User created');
        onSuccess();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === UNPROCESSABLE_ENTITY_STATUS) {
          const data = err.data as Record<string, string[]>;
          Object.entries(data).forEach(([field, messages]) => {
            form.setError(field as keyof CreateUserFormValues, { message: messages[0] });
          });
        }
      },
    });
  };

  return (
    <Form form={form} onSubmit={onSubmit}>
      <Form.Field
        name="name"
        label="Name"
      >
        {(field) => <Input {...field} />}
      </Form.Field>
      <Form.Field
        name="email"
        label="Email"
      >
        {(field) => <Input type="email" {...field} />}
      </Form.Field>
      <Form.Field
        name="role"
        label="Role"
      >
        {(field) => (
          <Select
            onValueChange={field.onChange}
            defaultValue={field.value}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">
                Member
              </SelectItem>
              <SelectItem value="admin">
                Admin
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </Form.Field>
      <Button
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Creating…' : 'Create'}
      </Button>
    </Form>
  );
};
```

Compare to the raw shadcn wiring this replaces: each field previously needed its own `FormField` +
`FormItem` + `FormLabel` + `FormControl` + `FormMessage` block (see `Form.Field`'s definition in
Example 0) — `Form.Field` now carries that structure once, and every field call is three lines.

---

## Example 2 — Edit form (pre-populated)

**Request:** "Add a form to edit user profile"

```ts
// features/settings/ui/ProfileForm/types.ts
import { z } from 'zod';

export const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
```

```tsx
// features/settings/ui/ProfileForm/index.tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form } from '@/shared/ui/Form';
import { Skeleton } from '@/components/ui/skeleton';
import { profileSchema, type ProfileFormValues } from './types';
import { useProfile } from '../../api/useProfile';
import { useUpdateProfile } from '../../api/useUpdateProfile';

export const ProfileForm = (): JSX.Element => {
  const { data: profile, isLoading } = useProfile();
  const { mutate, isPending } = useUpdateProfile();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '', email: '' },
  });

  useEffect(() => {
    if (profile) form.reset(profile);
  }, [profile, form]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Form
      form={form}
      onSubmit={(values) => mutate(values, { onSuccess: () => toast.success('Profile saved') })}
    >
      <Form.Field
        name="name"
        label="Name"
      >
        {(field) => <Input {...field} />}
      </Form.Field>
      <Form.Field
        name="email"
        label="Email"
      >
        {(field) => <Input type="email" {...field} />}
      </Form.Field>
      <Button
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </Form>
  );
};
```

---

## Example 3 — Checkbox group / multi-select

```ts
export const notificationsSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
  sms: z.boolean(),
});
export type NotificationsFormValues = z.infer<typeof notificationsSchema>;
```

```tsx
<Form.Field
  name="email"
  label="Email notifications"
  orientation="horizontal"
>
  {(field) => (
    <Checkbox
      checked={field.value}
      onCheckedChange={field.onChange}
    />
  )}
</Form.Field>
```

`orientation="horizontal"` renders the label after the control with `font-normal`, matching the
inline checkbox layout — no need to hand-roll `FormItem`'s `className` per field.

---

## Example 4 — Server 422 error mapping

Map field-level server errors returned as `{ fieldName: string[] }`:

```tsx
const UNPROCESSABLE_ENTITY_STATUS = 422;

onError: (err) => {
  if (err instanceof ApiError && err.status === UNPROCESSABLE_ENTITY_STATUS) {
    const data = err.data as Record<string, string[]>;
    Object.entries(data).forEach(([field, messages]) => {
      form.setError(field as keyof FormValues, {
        type: 'server',
        message: messages[0],
      });
    });
  }
},
```

`Form.Field`'s `FormMessage` automatically renders the error set via `form.setError` — no change
needed at the call site once the mutation's `onError` sets it.
