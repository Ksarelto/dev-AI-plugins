# TypeScript React — Few-shot Examples

## Example 1: Typed event handlers

### Bad

```tsx
function SearchInput({ onSearch }: { onSearch: (value: string) => void }) {
  const handleChange = (e: any) => {
    onSearch(e.target.value);
  };
  return <Input onChange={handleChange} />;
}
```

Untyped event; `any` defeats strict mode.

### Good

```tsx
import type { ChangeEvent } from 'react';

interface SearchInputProps {
  onSearch: (value: string) => void;
}

function SearchInput({ onSearch }: SearchInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onSearch(e.target.value);
  };
  return <Input onChange={handleChange} />;
}
```

React's typed `ChangeEvent` with explicit props interface.

---

## Example 2: Generic list component

### Bad

```tsx
interface DataListProps {
  items: any[];
  renderItem: (item: any) => ReactNode;
}

function DataList({ items, renderItem }: DataListProps) {
  return <ul>{items.map((item, i) => <li key={i}>{renderItem(item)}</li>)}</ul>;
}
```

`any` items; index keys; no type safety for consumers.

### Good

```tsx
interface DataListProps<T extends { id: string }> {
  items: T[];
  renderItem: (item: T) => ReactNode;
}

function DataList<T extends { id: string }>({ items, renderItem }: DataListProps<T>) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

// Usage — types flow through
<DataList items={users} renderItem={(user) => <span>{user.name}</span>} />
```

Generic constraint ensures `id` for keys; consumer gets full inference.

---

## Example 3: API response typing

### Bad

```tsx
async function fetchUsers() {
  const res = await fetch('/api/users');
  return res.json(); // unknown shape
}

const users = await fetchUsers();
users.map((u) => u.name); // no type error, runtime crash possible
```

Untyped JSON response.

### Good

```tsx
// features/users/types.ts
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface UsersResponse {
  data: User[];
  total: number;
}

// features/users/api/fetchUsers.ts
export async function fetchUsers(params: UserListParams): Promise<UsersResponse> {
  const res = await apiClient.get<UsersResponse>('/users', { params });
  return res.data;
}
```

Explicit types for entities and API responses; typed client wrapper.
