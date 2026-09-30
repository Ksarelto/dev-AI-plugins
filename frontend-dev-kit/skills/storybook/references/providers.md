# Storybook — Provider Patterns

## Global providers in preview.tsx

Set up once and apply to every story. Add only providers that every component needs.

```typescript
// .storybook/preview.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { Toaster } from 'sonner';

initialize();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});

export const decorators = [
  (Story) => (
    <QueryClientProvider client={queryClient}>
      <Story />
      <Toaster />
    </QueryClientProvider>
  ),
];

export const loaders = [mswLoader];
```

## Per-story provider override

When a story needs specific route context:

```typescript
import { MemoryRouter, Route, Routes } from 'react-router';

export const WithRoute: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/users/42']}>
        <Routes>
          <Route
            path="/users/:id"
            element={<Story />}
          />
        </Routes>
      </MemoryRouter>
    ),
  ],
};
```

## Session in stories

Session is a fake `Session` value from `shared/lib/auth`, not a Zustand auth store and not `src/stores/`. A feature draft store, if the story needs one, comes from `createDraftStore(sessionKey)` inside the story decorator.

## Decorator order

Decorators wrap the component in array order — last entry is outermost. Match the app's real provider nesting.

```typescript
export const decorators = [
  withI18n,        // innermost — closest to Story
  withQueryClient,
  withRouter,      // outermost
];
```

## MSW per-story handler override

Per-story handlers are merged with global handlers — more specific handlers take precedence.

```typescript
export const ServerError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/users', () => new HttpResponse(null, { status: 500 })),
      ],
    },
  },
};
```
