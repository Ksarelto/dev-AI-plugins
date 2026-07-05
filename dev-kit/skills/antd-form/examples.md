# antd Form — Few-shot Examples

## Example 1: Create form

**Request:** "Add a form to create a new product"

**Files:**

```ts
// features/products/types.ts
export interface CreateProductInput {
  name: string;
  price: number;
  category: string;
  description?: string;
}
```

```tsx
// features/products/components/CreateProductForm/index.tsx
import { Form, Input, InputNumber, Select, Button, message } from 'antd';
import { useCreateProduct } from '../../api/useCreateProduct';
import type { CreateProductInput } from '../../types';

interface CreateProductFormProps {
  onSuccess: () => void;
}

export function CreateProductForm({ onSuccess }: CreateProductFormProps) {
  const [form] = Form.useForm<CreateProductInput>();
  const { mutate, isPending } = useCreateProduct();

  const handleFinish = (values: CreateProductInput) => {
    mutate(values, {
      onSuccess: () => {
        message.success('Product created');
        form.resetFields();
        onSuccess();
      },
    });
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish}>
      <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name="price"
        label="Price"
        rules={[{ required: true, message: 'Price is required' }]}
      >
        <InputNumber min={0} precision={2} style={{ width: '100%' }} addonBefore="$" />
      </Form.Item>
      <Form.Item
        name="category"
        label="Category"
        rules={[{ required: true, message: 'Category is required' }]}
      >
        <Select options={CATEGORY_OPTIONS} />
      </Form.Item>
      <Form.Item name="description" label="Description">
        <Input.TextArea rows={4} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={isPending}>
        Create Product
      </Button>
    </Form>
  );
}
```

---

## Example 2: Edit form with pre-population

**Request:** "Add a form to edit an existing user"

**Files:**

```tsx
// features/users/components/EditUserForm/index.tsx
export function EditUserForm({ userId }: { userId: string }) {
  const [form] = Form.useForm<UpdateUserInput>();
  const { data: user, isLoading } = useUser(userId);
  const { mutate, isPending } = useUpdateUser();

  useEffect(() => {
    if (user) {
      form.setFieldsValue({ name: user.name, email: user.email, role: user.role });
    }
  }, [user, form]);

  if (isLoading) return <Spin />;

  const handleFinish = (values: UpdateUserInput) => {
    mutate({ id: userId, ...values }, {
      onSuccess: () => message.success('User updated'),
    });
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish}>
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
        <Input />
      </Form.Item>
      <Form.Item name="role" label="Role" rules={[{ required: true }]}>
        <Select options={ROLE_OPTIONS} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={isPending}>
        Save Changes
      </Button>
    </Form>
  );
}
```

---

## Example 3: Form with server-side field errors

**Request:** "Handle duplicate email error from the API on the registration form"

**Files:**

```tsx
// features/auth/components/RegisterForm/index.tsx
export function RegisterForm() {
  const [form] = Form.useForm<RegisterInput>();
  const { mutate, isPending } = useRegister();

  const handleFinish = (values: RegisterInput) => {
    mutate(values, {
      onSuccess: () => message.success('Account created'),
      onError: (error: ApiError) => {
        if (error.field === 'email') {
          form.setFields([{ name: 'email', errors: [error.message] }]);
        } else {
          message.error(error.message ?? 'Registration failed');
        }
      },
    });
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish}>
      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name="password"
        label="Password"
        rules={[{ required: true, min: 8, message: 'Minimum 8 characters' }]}
      >
        <Input.Password />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={isPending} block>
        Register
      </Button>
    </Form>
  );
}
```

**Pattern:** Map API field errors to `form.setFields()` for inline validation; generic errors via `message.error()`.
