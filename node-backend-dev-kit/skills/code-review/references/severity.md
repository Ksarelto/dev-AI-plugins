# Severity

| Severity | Meaning | Examples |
|---|---|---|
| **blocker** | Must be fixed before merge: security, data loss, broken build or contract | typecheck/lint/test failure; route that should be protected without `authenticate`; ownership not enforced (IDOR); unvalidated input reaching a query; `sql.raw` with user input; secret, token or password hash logged or returned; edited already-applied migration; schema change without a migration; `drizzle-kit push` in a script; 5xx body exposing internals; `jwtVerify` without pinned algorithms |
| **major** | Contract or reliability defect; fix in this PR | wrong status (201/204/404 vs 403); `AppError` without a specific code or a reused code; controller `try/catch` or `res.status(4xx)`; read-then-write uniqueness instead of a constraint; multi-write without a transaction or a call inside it missing `tx`; outbound call without timeout; retrying a non-idempotent call; unbounded list or `OFFSET` paging; missing index for a new FK or list order; new code without tests; route without OpenAPI entry; `process.env` outside `config/env.ts`; new dependency duplicating a stack library |
| **minor** | Convention drift that will spread if copied | file or factory naming; missing `export type X = ReturnType<…>`; log message with interpolated data; missing `.max()` on a string; `z.string().email()` instead of `z.email()`; test asserting only `toBeDefined()` |
| **nit** | Taste; mention once, do not block | wording of `detail` messages; ordering of imports Prettier does not fix |

When in doubt between two levels, pick the higher one and say why.
