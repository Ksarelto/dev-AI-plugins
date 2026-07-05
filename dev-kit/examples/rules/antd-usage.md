# antd Usage — Few-shot Examples

## Example 1: Form with validation

### Bad

```tsx
function CreateUserForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = async () => {
    if (!name) return alert('Name required');
    await fetch('/api/users', { method: 'POST', body: JSON.stringify({ name, email }) });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Save</button>
    </form>
  );
}
```

Native form, manual validation, alert feedback, direct fetch.

### Good

```tsx
import { Form, Input, Button, message } from 'antd';
import { useCreateUser } from '../../api/useCreateUser';

interface CreateUserFormProps {
  onSuccess: () => void;
}

export function CreateUserForm({ onSuccess }: CreateUserFormProps) {
  const [form] = Form.useForm<CreateUserInput>();
  const { mutate, isPending } = useCreateUser();

  const handleFinish = (values: CreateUserInput) => {
    mutate(values, {
      onSuccess: () => {
        message.success('User created');
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
        name="email"
        label="Email"
        rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
      >
        <Input />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={isPending}>
        Save
      </Button>
    </Form>
  );
}
```

antd Form with rules, typed values, mutation hook, and proper feedback.

---

## Example 2: Typed Table columns

### Bad

```tsx
const columns = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Email', dataIndex: 'email' },
  {
    title: 'Actions',
    render: (_: any, record: any) => (
      <Button onClick={() => deleteUser(record.id)}>Delete</Button>
    ),
  },
];

<Table dataSource={users} columns={columns} />
```

Untyped columns; no `rowKey`; `any` in render.

### Good

```tsx
import type { ColumnsType } from 'antd/es/table';

const columns: ColumnsType<User> = [
  { title: 'Name', dataIndex: 'name', sorter: true },
  { title: 'Email', dataIndex: 'email' },
  {
    title: 'Actions',
    key: 'actions',
    render: (_, record) => (
      <Button danger onClick={() => onDelete(record.id)} aria-label={`Delete ${record.name}`}>
        Delete
      </Button>
    ),
  },
];

<Table<User>
  rowKey="id"
  columns={columns}
  dataSource={users}
  loading={isLoading}
  pagination={{ total, current: page, pageSize }}
/>
```

Typed columns, rowKey, loading state, server-side pagination.

---

## Example 3: Controlled Modal

### Bad

```tsx
function UserPage() {
  const showDeleteConfirm = (id: string) => {
    Modal.confirm({
      title: 'Delete user?',
      onOk: () => deleteUser(id),
    });
  };
}
```

Imperative modal; hard to test; no React state control.

### Good

```tsx
interface DeleteUserModalProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}

export function DeleteUserModal({ userId, open, onClose }: DeleteUserModalProps) {
  const { mutate, isPending } = useDeleteUser();

  const handleConfirm = () => {
    if (!userId) return;
    mutate(userId, { onSuccess: onClose });
  };

  return (
    <Modal
      title="Delete user?"
      open={open}
      onCancel={onClose}
      onOk={handleConfirm}
      confirmLoading={isPending}
      okButtonProps={{ danger: true }}
    >
      <Typography.Text>This action cannot be undone.</Typography.Text>
    </Modal>
  );
}
```

Declarative modal with typed props, mutation loading, and parent-controlled visibility.
