# Form (react-hook-form + zod) — Few-shot Examples

## Example 0 — Shared `Form` compound component (scaffold once)

Build this once at `src/shared/ui/form/`. `primitives.tsx` is the registry `form` item re-homed verbatim (`rules/shadcn.mdc`); the compound below composes it.

```ts
// shared/ui/form/constants.ts
export const FieldOrientation = {
  Vertical: 'vertical',
  Horizontal: 'horizontal',
} as const;

export type FieldOrientationValue = (typeof FieldOrientation)[keyof typeof FieldOrientation];
```

```ts
// shared/ui/form/types.ts
import type { ReactNode } from 'react';
import type { ControllerRenderProps, FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import type { FieldOrientationValue } from './constants';

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
  orientation?: FieldOrientationValue;
  children: (field: ControllerRenderProps<TValues, TName>) => ReactNode;
}
```

```ts
// shared/ui/form/styles.ts
import { cn } from '@/shared/lib/utils';

export const root = (className?: string): string => cn('space-y-4', className);

export const item = (isHorizontal: boolean, className?: string): string =>
  cn(isHorizontal && 'flex items-center gap-2', className);

export const inlineLabel = 'font-normal';
```

```tsx
// shared/ui/form/form.tsx
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';
import { FieldOrientation } from './constants';
import {
  Form as FormProvider,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './primitives';
import * as styles from './styles';
import type { FormFieldProps, FormProps } from './types';

const FormRoot = <TValues extends FieldValues>({
  form,
  onSubmit,
  className,
  children,
}: FormProps<TValues>): JSX.Element => {
  const handleSubmit = form.handleSubmit(onSubmit);

  return (
    <FormProvider {...form}>
      <form
        className={styles.root(className)}
        onSubmit={handleSubmit}
      >
        {children}
      </form>
    </FormProvider>
  );
};

const Field = <TValues extends FieldValues, TName extends FieldPath<TValues>>({
  name,
  label,
  description,
  className,
  orientation = FieldOrientation.Vertical,
  children,
}: FormFieldProps<TValues, TName>): JSX.Element => {
  const { control } = useFormContext<TValues>();
  const isHorizontal = orientation === FieldOrientation.Horizontal;
  const hasLabel = Boolean(label);
  const hasDescription = Boolean(description);
  const showLabelBefore = hasLabel && !isHorizontal;
  const showLabelAfter = hasLabel && isHorizontal;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={styles.item(isHorizontal, className)}>
          {showLabelBefore && <FormLabel>{label}</FormLabel>}
          <FormControl>{children(field)}</FormControl>
          {showLabelAfter && <FormLabel className={styles.inlineLabel}>{label}</FormLabel>}
          {hasDescription && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export const Form = Object.assign(FormRoot, { Field });
```

```ts
// shared/ui/form/index.ts
export { Form } from './form';
export { FieldOrientation } from './constants';
```

Notes:

- `render` and `children(field)` are render props, not event handlers — the inline-handler rule does not apply to them.
- `primitives.tsx` is the only file that touches the registry parts. Feature code imports `Form` from `@/shared/ui/form`.
- `FieldOrientation` is exported only because the checkbox example below imports it; if no caller does, drop the re-export.

---

## Example 1 — Create form

**Request:** "Add a form to create a new user"

`features/users/locales/en.json` (excerpt):

```json
{
  "form": {
    "name": "Name",
    "email": "Email",
    "role": "Role",
    "rolePlaceholder": "Select role",
    "errors": {
      "nameRequired": "Name is required",
      "emailInvalid": "Enter a valid email"
    }
  },
  "roles": { "admin": "Admin", "member": "Member" },
  "create": { "submit": "Create", "submitting": "Creating…", "success": "User created" }
}
```

```ts
// features/users/ui/create-user-form/types.ts
import { z } from 'zod';
import { UserRole } from '@/entities/user';
import { usersKeys } from '../../locales/keys';

export const createUserSchema = z.object({
  name: z.string().min(1, usersKeys.form.errors.nameRequired),
  email: z.string().email(usersKeys.form.errors.emailInvalid),
  role: z.enum([UserRole.Admin, UserRole.Member]),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;

export interface CreateUserFormProps {
  onSuccess: () => void;
}
```

```ts
// features/users/ui/create-user-form/constants.ts
import { UserRole } from '@/entities/user';
import type { CreateUserFormValues } from './types';

export const DEFAULT_VALUES: CreateUserFormValues = {
  name: '',
  email: '',
  role: UserRole.Member,
};
```

```tsx
// features/users/ui/create-user-form/create-user-form.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { UserRole } from '@/entities/user';
import { isAppError } from '@/shared/api/errors';
import { mapServerErrorsToForm } from '@/shared/lib/form';
import { notify } from '@/shared/lib/notify';
import { Button, ButtonType } from '@/shared/ui/button';
import { Form } from '@/shared/ui/form';
import { Input, InputType } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useCreateUser } from '../../hooks/use-create-user';
import { usersKeys } from '../../locales/keys';
import { DEFAULT_VALUES } from './constants';
import { createUserSchema, type CreateUserFormProps, type CreateUserFormValues } from './types';

export const CreateUserForm = ({ onSuccess }: CreateUserFormProps): JSX.Element => {
  const { t } = useTranslation();
  const { mutate, isPending } = useCreateUser();
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const handleSubmit = (values: CreateUserFormValues): void => {
    mutate(values, {
      onSuccess: () => {
        notify.success(t(usersKeys.create.success));
        onSuccess();
      },
      onError: (err) => {
        if (isAppError(err) && err.kind === 'validation') {
          mapServerErrorsToForm(err.data, form.setError, form.getValues);
        }
      },
    });
  };

  const submitKey = isPending ? usersKeys.create.submitting : usersKeys.create.submit;

  return (
    <Form
      form={form}
      onSubmit={handleSubmit}
    >
      <Form.Field
        name="name"
        label={t(usersKeys.form.name)}
      >
        {(field) => <Input {...field} />}
      </Form.Field>
      <Form.Field
        name="email"
        label={t(usersKeys.form.email)}
      >
        {(field) => (
          <Input
            type={InputType.Email}
            {...field}
          />
        )}
      </Form.Field>
      <Form.Field
        name="role"
        label={t(usersKeys.form.role)}
      >
        {(field) => (
          <Select
            value={field.value}
            onValueChange={field.onChange}
          >
            <SelectTrigger>
              <SelectValue placeholder={t(usersKeys.form.rolePlaceholder)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UserRole.Member}>
                {t(usersKeys.roles.member)}
              </SelectItem>
              <SelectItem value={UserRole.Admin}>
                {t(usersKeys.roles.admin)}
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </Form.Field>
      <Button
        type={ButtonType.Submit}
        disabled={isPending}
      >
        {t(submitKey)}
      </Button>
    </Form>
  );
};
```

`name="email"` is a field path of the schema, not a closed-set UI prop, so it stays a literal (type-checked by `FieldPath`). `onValueChange={field.onChange}` passes a reference — not an inline handler.

---

## Example 2 — Edit form (pre-populated)

**Request:** "Add a form to edit user profile"

```ts
// features/settings/ui/profile-form/types.ts
import { z } from 'zod';
import { settingsKeys } from '../../locales/keys';

export const profileSchema = z.object({
  name: z.string().min(1, settingsKeys.profile.errors.nameRequired),
  email: z.string().email(settingsKeys.profile.errors.emailInvalid),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
```

```ts
// features/settings/ui/profile-form/styles.ts
export const skeleton = 'h-40 w-full';
```

```tsx
// features/settings/ui/profile-form/profile-form.tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { notify } from '@/shared/lib/notify';
import { Button, ButtonType } from '@/shared/ui/button';
import { Form } from '@/shared/ui/form';
import { Input, InputType } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useProfile } from '../../hooks/use-profile';
import { useUpdateProfile } from '../../hooks/use-update-profile';
import { settingsKeys } from '../../locales/keys';
import { DEFAULT_VALUES } from './constants';
import * as styles from './styles';
import { profileSchema, type ProfileFormValues } from './types';

export const ProfileForm = (): JSX.Element => {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useProfile();
  const { mutate, isPending } = useUpdateProfile();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (profile) {
      form.reset(profile);
    }
  }, [profile, form]);

  const handleSaved = (): void => {
    notify.success(t(settingsKeys.profile.saved));
  };

  const handleSubmit = (values: ProfileFormValues): void => {
    mutate(values, { onSuccess: handleSaved });
  };

  if (isLoading) {
    return <Skeleton className={styles.skeleton} />;
  }

  const submitKey = isPending ? settingsKeys.profile.saving : settingsKeys.profile.save;

  return (
    <Form
      form={form}
      onSubmit={handleSubmit}
    >
      <Form.Field
        name="name"
        label={t(settingsKeys.profile.name)}
      >
        {(field) => <Input {...field} />}
      </Form.Field>
      <Form.Field
        name="email"
        label={t(settingsKeys.profile.email)}
      >
        {(field) => (
          <Input
            type={InputType.Email}
            {...field}
          />
        )}
      </Form.Field>
      <Button
        type={ButtonType.Submit}
        disabled={isPending}
      >
        {t(submitKey)}
      </Button>
    </Form>
  );
};
```

`className={styles.skeleton}` on `Skeleton` is size/layout only — allowed at a call site (`rules/styling.mdc`).

---

## Example 3 — Checkbox

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
  label={t(settingsKeys.notifications.email)}
  orientation={FieldOrientation.Horizontal}
>
  {(field) => (
    <Checkbox
      checked={field.value}
      onCheckedChange={field.onChange}
    />
  )}
</Form.Field>
```

`FieldOrientation.Horizontal` renders the label after the control with `font-normal`.

---

## Example 4 — Server 422 error mapping

Map field-level server errors returned as `{ fieldName: string[] }` once, in `shared/lib/form/` (with its test in `shared/lib/form/tests/`):

```ts
// shared/lib/form/map-server-errors.ts
import type { FieldValues, Path, UseFormGetValues, UseFormSetError } from 'react-hook-form';

const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

const isFieldOf = <TValues extends FieldValues>(
  field: string,
  values: TValues,
): field is Path<TValues> => field in values;

export const mapServerErrorsToForm = <TValues extends FieldValues>(
  data: unknown,
  setError: UseFormSetError<TValues>,
  getValues: UseFormGetValues<TValues>,
): void => {
  if (!isRecord(data)) {
    return;
  }

  const values = getValues();

  for (const [field, messages] of Object.entries(data)) {
    const [message] = Array.isArray(messages) ? messages : [];

    if (isFieldOf(field, values) && typeof message === 'string') {
      setError(field, { type: 'server', message });
    }
  }
};
```

Type guards narrow the server's field names to the form's own `Path` without a cast; unknown fields are ignored. The server message is human text, not a key, so `translateMessage` in `FormMessage` renders it unchanged. Call it as `mapServerErrorsToForm(err.data, form.setError, form.getValues)`.

---

## Example 5 — Test with the real form

```tsx
// features/users/ui/create-user-form/create-user-form.test.tsx
vi.mock('@/entities/user/api/fetchers', () => ({
  createUser: vi.fn(),
}));

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUser } from '@/entities/user/api/fetchers';
import { render } from '@/shared/lib/rendererRTL';
import { CreateUserForm } from './create-user-form';

describe('CreateUserForm', () => {
  it('shows the required message when name is empty', async () => {
    render(<CreateUserForm onSuccess={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });
});
```

Only the fetcher is mocked. `react-hook-form`, `zod`, the shared `Form`, `Input`, and i18n are real; assertions use the English copy from `en.json`.
