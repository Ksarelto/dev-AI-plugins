---
name: storybook
description: Write Storybook stories for components using CSF3 format with TypeScript. Stories are colocated in the component folder alongside styles.ts and the component file. Use when documenting a new component, building in isolation, or adding visual regression baselines.
---

# Storybook

## When to use

- Documenting a new shared or feature component
- Building a component in isolation before wiring to the backend
- Writing interaction tests via `play` functions
- Verifying component variants across states (loading, empty, error, populated)

## Format

CSF3 (Component Story Format 3) with TypeScript `satisfies Meta<typeof Component>`.

## Instructions

1. Create `{name}/{name}.stories.tsx` colocated in the kebab-case component folder (`custom-button/custom-button.stories.tsx`)
2. Define `meta` with `satisfies Meta<typeof Component>`
3. Create a `Default` story; add named stories per significant variant
4. Cover all **four required data states** for data-fetching components: `Loading`, `Error`, `Empty`, `Populated`
5. Wrap with providers via `decorators` — always include `QueryClientProvider`
6. Use MSW addon (`msw-storybook-addon`) for stories that need API data
7. Add `play` function for interaction tests on forms and multi-step flows

## Provider decorator (set globally or per-story)

```typescript
// .storybook/preview.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initialize, mswLoader } from 'msw-storybook-addon';

initialize();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export const decorators = [
  (Story) => (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  ),
];

export const loaders = [mswLoader];
```

## Story template

```typescript
// features/orders/ui/OrderCard/OrderCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { OrderCard } from './index';

const meta = {
  title: 'Features/Orders/OrderCard',
  component: OrderCard,
  args: {
    orderId: 'ord-1',
  },
} satisfies Meta<typeof OrderCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/v1/orders/ord-1', () =>
          HttpResponse.json({ order_id: 'ord-1', status: 'pending', total_amount: 9900 }),
        ),
      ],
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/v1/orders/ord-1', async () => {
          await new Promise(() => {}); // never resolves — stays in loading state
        }),
      ],
    },
  },
};

export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/v1/orders/ord-1', () => new HttpResponse(null, { status: 500 })),
      ],
    },
  },
};

export const Empty: Story = {
  name: 'No data',
  args: { orderId: undefined },
};
```

## Play function (interaction test)

```typescript
import { within, userEvent, expect } from '@storybook/test';

export const SubmitForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Quantity'), '5');
    await userEvent.click(canvas.getByRole('button', { name: 'Place Order' }));
    await expect(canvas.getByText('Order placed')).toBeInTheDocument();
  },
};
```

## Checklist

- [ ] Story file colocated in the component folder: `{Name}/{Name}.stories.tsx`
- [ ] `meta` uses `satisfies Meta<typeof Component>`
- [ ] All four data states covered (Loading, Error, Empty, Default/Populated) for data-fetching components
- [ ] MSW handlers use the actual API paths from `api/endpoints.ts` (not hardcoded strings)
- [ ] `play` function on any form story
- [ ] No `dark:` variants or dark-mode-specific stories — one light palette only

## References

| Topic | File |
|-------|------|
| Few-shot implementation examples | [examples.md](examples.md) |
| Global vs per-story providers, Zustand/Router decorators | [references/providers.md](references/providers.md) |
| Play function patterns, portals, keyboard nav, a11y | [references/play-functions.md](references/play-functions.md) |
