# Stack Docs — Few-shot Examples

## Example 1: antd Form validation

**Request:** "Add async email uniqueness validation to the registration form"

**Steps:**
1. `resolve-library-id` → `libraryName: "antd"`, `query: "Form async validator rules"`
2. `query-docs` → `libraryId: "/ant-design/ant-design"`, `query: "Form.Item rules async validator"`
3. Apply the documented `validator` / `rules` pattern in `CreateUserForm`

---

## Example 2: react-query mutation options

**Request:** "Implement optimistic update when toggling a todo"

**Steps:**
1. `resolve-library-id` → `libraryName: "@tanstack/react-query"`, `query: "optimistic update mutation"`
2. `query-docs` → query about `onMutate`, `onError` rollback, `setQueryData`
3. Implement `useToggleTodo` following current v5 API from docs

---

## Example 3: vanilla-extract recipe variants

**Request:** "Create a button with primary, secondary, and ghost variants"

**Steps:**
1. `resolve-library-id` → `libraryName: "@vanilla-extract/css"`, `query: "recipe variants"`
2. `query-docs` → query about `@vanilla-extract/recipes` `recipe()` API
3. Create `{Button}.css.ts` with `recipe({ variants: { intent: { ... } } })`
