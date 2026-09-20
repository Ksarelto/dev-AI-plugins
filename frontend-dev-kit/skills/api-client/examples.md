# API Client Examples

## Example 1 — Basic GET and POST

```typescript
// src/api/client.ts (full file)
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly data: unknown) {
    super(`API error ${status}`);
    this.name = 'ApiError';
  }
}

const NO_CONTENT_STATUS = 204;

const request = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  if (res.status === NO_CONTENT_STATUS) return undefined as T;

  return res.json() as Promise<T>;
};

export const api = {
  get:   <T>(url: string, init?: RequestInit) => request<T>(url, { method: 'GET', ...init }),
  post:  <T>(url: string, body: unknown, init?: RequestInit) => request<T>(url, { method: 'POST', body: JSON.stringify(body), ...init }),
  put:   <T>(url: string, body: unknown, init?: RequestInit) => request<T>(url, { method: 'PUT', body: JSON.stringify(body), ...init }),
  patch: <T>(url: string, body: unknown, init?: RequestInit) => request<T>(url, { method: 'PATCH', body: JSON.stringify(body), ...init }),
  del:   <T>(url: string, init?: RequestInit) => request<T>(url, { method: 'DELETE', ...init }),
};
```

---

## Example 2 — Query hook using api.get

```typescript
// features/projects/api/useProjects.ts
export const useProjects = (filters: ProjectFilters): UseQueryResult<Project[]> => {
  const params = new URLSearchParams(filters as Record<string, string>).toString();

  return useQuery({
    queryKey: queryKeys.projects.list(filters),
    queryFn: () => api.get<Project[]>(`/projects?${params}`),
    staleTime: 30_000,
  });
};
```

---

## Example 3 — Mutation with 422 field-error handling

```typescript
// features/projects/api/useCreateProject.ts
const UNPROCESSABLE_ENTITY_STATUS = 422;
const UNAUTHORIZED_STATUS = 401;

export const useCreateProject = (): UseMutationResult<Project, ApiError, CreateProjectInput> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectInput) => api.post<Project>('/projects', data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      message.success(`Project "${project.name}" created`);
    },
    onError: (err, _vars, _ctx) => {
      if (err instanceof ApiError && err.status === UNPROCESSABLE_ENTITY_STATUS) {
        return; // caller's onError maps field errors to the form
      }
      if (err instanceof ApiError && err.status === UNAUTHORIZED_STATUS) {
        useAuthStore.getState().logout();
        return;
      }
      notification.error({ message: 'Failed to create project', description: err.message });
    },
  });
};
```

---

## Example 4 — File upload with FormData (no JSON content-type)

```typescript
export const useUploadAvatar = (): UseMutationResult<{ url: string }, ApiError, File> => {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('avatar', file);

      return api.post<{ url: string }>('/me/avatar', form, {
        headers: {}, // omit Content-Type — browser sets multipart boundary
      });
    },
  });
};
```
