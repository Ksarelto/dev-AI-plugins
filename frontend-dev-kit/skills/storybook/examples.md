# Storybook Examples

One `{name}.stories.tsx` beside each component. No stories under `components/`.

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
// features/orders/ui/order-list/order-list.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { OrderList } from './index';

const meta = {
  title: 'Features/Orders/OrderList',
  component: OrderList,
} satisfies Meta<typeof OrderList>;

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
