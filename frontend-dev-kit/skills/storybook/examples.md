# Storybook Examples

One story per shared primitive, one story per feature public entry. No stories under `components/`, no `features/auth`, no per-part feature stories.

```tsx
// shared/ui/button/button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './index';

const meta = {
  title: 'Shared/Button',
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'Save' } };
```

```tsx
// features/orders/orders.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { OrdersFeature } from './index';

const meta = {
  title: 'Features/Orders',
  component: OrdersFeature,
} satisfies Meta<typeof OrdersFeature>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/v1/orders', () => HttpResponse.json([])),
      ],
    },
  },
};
```

MSW paths match `api/endpoints.ts`. Session in a story comes from a fake `Session` provider, not a Zustand auth store.
