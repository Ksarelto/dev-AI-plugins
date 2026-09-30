# Routing and data loading

Page data is a feature hook (`features/{name}/hooks/`) backed by TanStack Query. The page in `pages/` composes that hook's component. It does not live at `features/{name}/pages/`.

Do not fetch the session in a React Router loader (`getToken()` there reintroduces the token singleton). Do not replace the feature hook with `useLoaderData` for the screen's primary data.

Query keys come from `@/shared/api/query-keys/{domain}`. Errors are `AppError`, not `ApiError`.
