---
name: storybook
description: Write Storybook stories using CSF3 format with TypeScript. One story file per shared/ui primitive, and one story for a feature's public entry — not for inner feature parts. Use when documenting a shared component or a whole feature, building in isolation, or adding visual regression baselines.
---

# Storybook

## When to use

- Documenting a `shared/ui` primitive (one story file in that component folder)
- Documenting a feature as a whole (one story at `features/<slice>/<slice>.stories.tsx` for the public entry)
- Building that surface in isolation before wiring to the backend
- Writing interaction tests via `play` functions
- Verifying component variants across states (loading, empty, error, populated)

## Format

CSF3 (Component Story Format 3) with TypeScript `satisfies Meta<typeof Component>`.

## Instructions

1. Place the story by scope:
   - Shared primitive: `shared/ui/<name>/<name>.stories.tsx` (`shared/ui/button/button.stories.tsx`)
   - Feature: `features/<slice>/<slice>.stories.tsx` for the public entry and its states. Do not add stories for inner feature parts
   - Entity and widget component folders do not get stories. They still get behavior tests
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
// features/orders/orders.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { OrdersFeature } from './index';

const meta = {
  title: 'Features/Orders',
  component: OrdersFeature,
  args: {
    orderId: 'ord-1',
  },
} satisfies Meta<typeof OrdersFeature>;

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

- [ ] Shared primitive: `shared/ui/<name>/<name>.stories.tsx`. Feature: one `features/<slice>/<slice>.stories.tsx`. No stories for inner parts, entities, or widgets
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
