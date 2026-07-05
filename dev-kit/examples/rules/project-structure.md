# Project Structure — Few-shot Examples

## Example 1: Feature folder layout

### Bad

```
src/
├── UsersList.tsx
├── UsersApi.ts
├── UserForm.tsx
├── useUsers.ts
└── userTypes.ts
```

Flat structure with mixed concerns; no colocation; hard to scale.

### Good

```
src/features/users/
├── api/
│   ├── useUsers.ts
│   ├── useCreateUser.ts
│   └── fetchUsers.ts
├── components/
│   ├── UserList/
│   │   ├── index.tsx
│   │   ├── UserList.css.ts
│   │   └── types.ts
│   └── UserForm/
│       ├── index.tsx
│       ├── UserForm.css.ts
│       └── types.ts
├── types.ts
└── index.ts
```

Feature-scoped with clear separation of api, components, and types.

---

## Example 2: Barrel exports

### Bad

```tsx
// pages/UsersPage.tsx
import { UserList } from '../../features/users/components/UserList/index';
import { useUsers } from '../../features/users/api/useUsers';
```

Deep imports bypass the public API; refactoring breaks consumers.

### Good

```tsx
// features/users/index.ts
export { UserList } from './components/UserList';
export { UserForm } from './components/UserForm';
export { useUsers, useCreateUser } from './api/useUsers';
export type { User, CreateUserInput } from './types';

// pages/UsersPage.tsx
import { UserList, useUsers } from '@/features/users';
```

Public barrel hides internals; pages import from one path.

---

## Example 3: Shared vs feature components

### Bad

```tsx
// features/orders/components/StatusBadge/index.tsx
// Duplicated badge logic also exists in features/invoices/components/StatusBadge/
```

Copy-pasted component across features.

### Good

```
src/components/StatusBadge/
├── index.tsx
├── StatusBadge.css.ts
└── types.ts

// features/orders/components/OrderRow/index.tsx
import { StatusBadge } from '@/components/StatusBadge';
```

Reusable UI lives in `src/components/`; features compose shared pieces.
