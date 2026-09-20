# Storybook Examples

## Example 1 — Simple presentational component

```typescript
// features/users/components/UserAvatar/UserAvatar.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { UserAvatar } from './index';

const meta = {
  title: 'Features/Users/UserAvatar',
  component: UserAvatar,
  argTypes: {
    size: { control: { type: 'select' }, options: ['small', 'medium', 'large'] },
  },
} satisfies Meta<typeof UserAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: 'Alice Johnson', size: 'medium' },
};

export const Small: Story = { args: { name: 'Alice Johnson', size: 'small' } };
export const Large: Story = { args: { name: 'Alice Johnson', size: 'large' } };
export const WithImage: Story = {
  args: { name: 'Alice Johnson', imageUrl: 'https://i.pravatar.cc/150', size: 'medium' },
};
```

---

## Example 2 — Data-fetching component with MSW

```typescript
// features/users/components/UserCard/UserCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { UserCard } from './index';

const meta = {
  title: 'Features/Users/UserCard',
  component: UserCard,
  args: { userId: '1' },
} satisfies Meta<typeof UserCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const userFixture = {
  id: '1',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'admin',
};

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [http.get('/api/users/1', () => HttpResponse.json(userFixture))],
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/users/1', async () => {
          await new Promise(() => {}); // hangs — shows loading state
        }),
      ],
    },
  },
};

export const NotFound: Story = {
  parameters: {
    msw: {
      handlers: [http.get('/api/users/1', () => new HttpResponse(null, { status: 404 }))],
    },
  },
};
```

---

## Example 3 — Form with play function

```typescript
// features/users/components/CreateUserForm/CreateUserForm.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
import { http, HttpResponse } from 'msw';
import { CreateUserForm } from './index';

const meta = {
  title: 'Features/Users/CreateUserForm',
  component: CreateUserForm,
} satisfies Meta<typeof CreateUserForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/users', () =>
          HttpResponse.json({ id: '1', name: 'Alice' }, { status: 201 }),
        ),
      ],
    },
  },
};

export const ValidationError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/users', () =>
          HttpResponse.json({ email: ['Email already taken'] }, { status: 422 }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Name'), 'Alice');
    await userEvent.type(canvas.getByLabelText('Email'), 'taken@example.com');
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));
    await expect(canvas.findByText('Email already taken')).resolves.toBeInTheDocument();
  },
};
```

---

## Example 4 — Component with Zustand store

```typescript
// features/auth/components/UserMenu/UserMenu.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { useAuthStore } from '@/stores/authStore';
import { UserMenu } from './index';

const meta = {
  title: 'Features/Auth/UserMenu',
  component: UserMenu,
  decorators: [
    (Story) => {
      // Clear store so stories don't bleed into each other
      useAuthStore.setState({ user: null, isAuthenticated: false });

      return <Story />;
    },
  ],
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};  // unauthenticated — base decorator clears the store

export const Authenticated: Story = {
  decorators: [
    (Story) => {
      useAuthStore.setState({
        user: {
          id: '1',
          name: 'Alice Johnson',
          role: 'admin',
        },
        isAuthenticated: true,
      });

      return <Story />;
    },
  ],
};
```

---

## Example 5 — Component with React Router

```typescript
// features/users/components/UserBreadcrumb/UserBreadcrumb.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { UserBreadcrumb } from './index';

const meta = {
  title: 'Features/Users/UserBreadcrumb',
  component: UserBreadcrumb,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/users/123']}>
        <Routes>
          <Route
            path="/users/:id"
            element={<Story />}
          />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof UserBreadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/users/123', () =>
          HttpResponse.json({ id: '123', name: 'Alice Johnson' }),
        ),
      ],
    },
  },
};
```

---

## Example 6 — Accessibility testing

```typescript
// features/shared/components/Modal/Modal.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
import { Modal } from './index';

const meta = {
  title: 'Shared/Modal',
  component: Modal,
  parameters: {
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: true }] } },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    open: true,
    title: 'Confirm deletion',
    children: 'Are you sure you want to delete this item?',
    onOk: () => {},
    onCancel: () => {},
  },
  play: async ({ canvasElement }) => {
    // Modal is a portal — query from document.body
    const dialog = await within(document.body).findByRole('dialog');
    await expect(dialog).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'OK' })).toBeInTheDocument();

    // Escape closes the modal
    await userEvent.keyboard('{Escape}');
    await expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument();
  },
};
```
