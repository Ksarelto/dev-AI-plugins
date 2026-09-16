---
name: api-client
description: Set up the HTTP layer using ky (httpClient from shared/api/base.ts), AppError normalization, and the central query-key registry. Use when establishing the HTTP layer, adding new API endpoints, or wiring auth headers. Never use raw fetch, axios, or import ky directly in feature code.
---

# API Client

## When to use

- Establishing the HTTP layer from scratch (`shared/api/base.ts`)
- Adding a new API endpoint integration inside a feature's `api/` segment
- Wiring auth token headers into requests
- Normalizing HTTP errors into `AppError`

## Architecture rules

- The **only** HTTP client is `httpClient` exported from `shared/api/base.ts`. Features never call `fetch()`, never import `ky`, never import `axios`.
- All HTTP errors are normalized to `AppError` at the boundary in `shared/api/base.ts` via the `beforeError` hook — feature code only sees `AppError`.
- Auth token is read from `shared/lib/auth/token.ts` (a module-level accessor, not a React hook).
- The API base URL comes from `shared/api/config.ts` (`API_BASE.v1` / `API_BASE.v2`) — features never read `import.meta.env` for the URL.
- Feature query keys are defined in `shared/api/query-keys/` (one file per business domain), never hand-typed inline.

## Shared API setup

### `shared/api/config.ts` — single source of gateway URLs

```typescript
// shared/api/config.ts
export const API_BASE = {
  v1: `${import.meta.env.VITE_API_BASE_URL}/api/v1`,
  v2: `${import.meta.env.VITE_API_BASE_URL}/api/v2`,
} as const;
```

### `shared/api/errors.ts` — normalized error type

```typescript
// shared/api/errors.ts
export type AppErrorKind =
  | 'network'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'server'
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status?: number;

  constructor(kind: AppErrorKind, message: string, status?: number, cause?: unknown) {
    super(message, { cause });
    this.name = 'AppError';
    this.kind = kind;
    this.status = status;
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;

export const toAppError = async (error: unknown): Promise<AppError> => {
  if (error instanceof AppError) return error;

  if (error instanceof HTTPError) {
    const status = error.response.status;
    let message = error.message;
    try {
      const body = await error.response.clone().json<{ message?: string }>();
      if (body?.message) message = body.message;
    } catch { /* ignore parse failure */ }

    if (status === 401) return new AppError('unauthorized', message, status, error);
    if (status === 403) return new AppError('forbidden',     message, status, error);
    if (status === 404) return new AppError('not-found',     message, status, error);
    if (status === 422) return new AppError('validation',    message, status, error);
    if (status >= 500)  return new AppError('server',        message, status, error);
    return new AppError('unknown', message, status, error);
  }

  if (error instanceof TimeoutError) return new AppError('network', 'Request timed out', undefined, error);
  if (error instanceof Error && error.name === 'AbortError') return new AppError('network', 'Request aborted', undefined, error);
  return new AppError('unknown', 'Unknown error', undefined, error);
};
```

### `shared/api/base.ts` — one-time project setup

```typescript
// shared/api/base.ts
import ky, { type KyInstance, HTTPError, TimeoutError } from 'ky';
import { getToken } from '@/shared/lib/auth/token';
import { API_BASE } from './config';
import { toAppError } from './errors';

export const httpClient: KyInstance = ky.create({
  prefixUrl: API_BASE.v1,
  timeout: 15_000,
  retry: 0, // TanStack Query owns retry logic
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = getToken();
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
      },
    ],
    beforeError: [
      async ({ error }) => toAppError(error),
    ],
  },
});
```

### `shared/lib/auth/token.ts` — module-level accessor for non-React callers

```typescript
// shared/lib/auth/token.ts
// httpClient reads this; React code uses useSession() instead
let _token: string | null = null;

export const setToken = (t: string | null): void => { _token = t; };
export const getToken = (): string | null => _token;
```

## Query-key registry — `shared/api/query-keys/`

One file per business domain. Key literals like `['orders', 'list']` are **banned** in feature code.

```typescript
// shared/api/query-keys/orders.ts
import type { OrderFilters } from '@/features/orders/api/dto';

export const orderKeys = {
  all:     ['orders'] as const,
  lists:   () => [...orderKeys.all, 'list'] as const,
  list:    (filters?: OrderFilters) => [...orderKeys.lists(), filters] as const,
  detail:  (id: string) => [...orderKeys.all, 'detail', id] as const,
  mutations: {
    place: () => [...orderKeys.all, 'mutation', 'place'] as const,
  },
} as const;
```

## Feature API segment

Features use `httpClient` directly — no per-feature `ky.create()`.

### `features/orders/api/endpoints.ts` — backend path map

```typescript
// features/orders/api/endpoints.ts
export const ORDERS_ENDPOINTS = {
  list:   'orders',
  detail: (id: string) => `orders/${id}`,
  place:  'orders',
} as const;
```

### `features/orders/api/dto.ts` — wire shape and mapper

```typescript
// features/orders/api/dto.ts
// Wire shape (snake_case from server)
export interface OrderDto {
  order_id:     string;
  status:       string;
  total_amount: number;
}

// Domain type (camelCase, what the app uses)
export interface Order {
  id:          string;
  status:      string;
  totalAmount: number;
}

export interface OrderFilters {
  status?: string;
  page?:   number;
}

export const mapOrder = (dto: OrderDto): Order => ({
  id:          dto.order_id,
  status:      dto.status,
  totalAmount: dto.total_amount,
});
```

### `features/orders/api/fetchers.ts` — pure async functions

```typescript
// features/orders/api/fetchers.ts
import { httpClient } from '@/shared/api/base';
import { ORDERS_ENDPOINTS } from './endpoints';
import { mapOrder, type Order, type OrderFilters, type OrderDto } from './dto';

export const fetchOrders = async (filters?: OrderFilters): Promise<Order[]> => {
  const dtos = await httpClient
    .get(ORDERS_ENDPOINTS.list, { searchParams: filters as Record<string, string | number> })
    .json<OrderDto[]>();
  return dtos.map(mapOrder);
};

export const fetchOrder = async (id: string): Promise<Order> => {
  const dto = await httpClient.get(ORDERS_ENDPOINTS.detail(id)).json<OrderDto>();
  return mapOrder(dto);
};

export const placeOrder = async (payload: PlaceOrderInput): Promise<Order> => {
  const dto = await httpClient.post(ORDERS_ENDPOINTS.place, { json: payload }).json<OrderDto>();
  return mapOrder(dto);
};
```

## Error narrowing in hooks

```typescript
import { isAppError } from '@/shared/api/errors';
import type { AppErrorKind } from '@/shared/api/errors';

onError: (err) => {
  if (!isAppError(err)) return;
  if (err.kind === 'validation') {
    mapServerErrorsToForm(err.status, form);
    return;
  }
  // Generic errors handled by the global QueryClient onError — no duplication
},
```

## Checklist

- [ ] `httpClient` is the only HTTP client — no `fetch()`, no `ky.create()`, no `axios` in features
- [ ] `shared/api/config.ts` defines `API_BASE` — features never read `import.meta.env` for the URL
- [ ] `base.ts` uses `beforeError` hook (not `afterResponse`) to call `toAppError`
- [ ] `AppErrorKind` is a string union type — not an `enum`
- [ ] `AppError` constructor is `(kind, message, status?, cause?)` — not `(kind, status, data)`
- [ ] `toAppError` helper exists in `errors.ts` and handles `HTTPError`, `TimeoutError`, and network errors
- [ ] All feature API calls go through `features/{name}/api/fetchers.ts`
- [ ] `endpoints.ts` holds all backend paths relative to `API_BASE.v1` — no full URLs in hooks
- [ ] `dto.ts` holds wire shapes (DTOs) and domain types + mapper functions
- [ ] Query keys come from `shared/api/query-keys/{domain}.ts` — no inline array literals
- [ ] `getToken()` called from `shared/lib/auth/token.ts` in `httpClient`'s `beforeRequest` hook

See [examples.md](examples.md)
