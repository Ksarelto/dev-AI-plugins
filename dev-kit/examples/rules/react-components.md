# React Components — Few-shot Examples

## Example 1: Presentational vs container split

### Bad

```tsx
export function UserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      {loading ? <Spin /> : users.map((u) => <div key={u.id}>{u.name}</div>)}
    </div>
  );
}
```

Data fetching, inline styles, and rendering mixed in one component.

### Good

```tsx
// features/users/components/UserList/index.tsx
import { useUsers } from '../../api/useUsers';
import { UserListView } from './UserListView';

export function UserList() {
  const { data: users, isLoading } = useUsers();
  return <UserListView users={users ?? []} loading={isLoading} />;
}

// features/users/components/UserList/UserListView.tsx
import * as styles from './UserList.css';

interface UserListViewProps {
  users: User[];
  loading: boolean;
}

export function UserListView({ users, loading }: UserListViewProps) {
  if (loading) return <Spin />;
  return (
    <ul className={styles.list}>
      {users.map((user) => (
        <li key={user.id} className={styles.item}>{user.name}</li>
      ))}
    </ul>
  );
}
```

Container handles data; presentational component is pure and styled via vanilla-extract.

---

## Example 2: Props interface

### Bad

```tsx
export function UserCard(props: any) {
  return <Card title={props.user.name} />;
}
```

Untyped props; no IDE support or compile-time checks.

### Good

```tsx
// features/users/components/UserCard/types.ts
export interface UserCardProps {
  user: User;
  onEdit: (id: string) => void;
}

// features/users/components/UserCard/index.tsx
export function UserCard({ user, onEdit }: UserCardProps) {
  return (
    <Card
      title={user.name}
      extra={<Button onClick={() => onEdit(user.id)}>Edit</Button>}
    />
  );
}
```

Explicit interface colocated with the component.

---

## Example 3: Custom hook extraction

### Bad

```tsx
export function UserFilters() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  // 40 more lines of filter logic and URL sync...
}
```

All filter state and logic embedded in the component.

### Good

```tsx
// features/users/hooks/useUserFilters.ts
export function useUserFilters() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  return { search, setSearch, role, setRole, debouncedSearch };
}

// features/users/components/UserFilters/index.tsx
export function UserFilters() {
  const { search, setSearch, role, setRole } = useUserFilters();
  return (/* render filter UI */);
}
```

Reusable hook; component stays focused on rendering.
