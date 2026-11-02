---
name: be-implement-task
description: Procedure for the factory backend builder — routes map paths, controllers parse with Zod and call one service, services hold the rules, only repositories touch Drizzle, dependencies are wired in the composition root and errors leave as problem+json. Preloaded by be-builder; not for direct use.
user-invocable: false
---

# Implement one backend task (green phase)

Runs on: be-builder (sonnet) — one green-phase task of the layered Express stack (endpoint, service, validation, repository, auth, error-mapping, resilience, openapi, config, fix, refactor) within the task's file budget.

The red tests are the specification and they are read-only. Build order per task type:
[be-file-order.md](references/be-file-order.md). Defects that always cost a retry:
[be-must-fix.md](references/be-must-fix.md).

## 1. Orient (before any edit)

1. T0: the task, its type, "Satisfies" (AC text), "Definition of done", the red tests, the files you
   may write, the exit check. T3 on a retry: fix only what it lists (rung 1), state a one-sentence
   root-cause hypothesis first (rung 2), or apply the diagnosis file in T1 (rung 3).
2. T1: load every stack skill it lists with the Skill tool and read every `Rule: … [READ]` file. The
   golden file in T2 is the shape to match — open the section for your task type.
3. Read the red tests fully. Write down, per test, the status, `code`, DTO fields and side effect it
   expects. That list is your scope.
4. Read the contract operation in `03-architecture/api-contract.yaml` and the existing code of the
   layers you will touch (router, controller, service, repository type, container). Reuse an existing
   function before writing a new one.
5. Map the build order of your task type onto T0's files. A needed file missing from "You may write
   only" → stop with `needs_scope_change`; a file already finished by an earlier task → leave it.

## 2. Layer rules (dependency-cruiser fails `lint` otherwise)

| Layer | Does | Never |
|---|---|---|
| route | path → `authenticate` → `requireRole` → `validate(request)` → handler | call a service, repository or `db` |
| controller | `validated(res, request)`, `requirePrincipal(res)`, one service call, DTO + status | import a repository or `db`; `try/catch` to set a status |
| service | rules, ownership, transactions, `AppError` with codes, row → domain object | import Express; touch `req`/`res` |
| repository | Drizzle queries, `executor: DbExecutor = db` last | open a transaction; throw an HTTP error |
| container | every concrete `create*` call | business logic |

Details and the rationale: `rules/layered-architecture.mdc`, `rules/database.mdc`, `rules/error-handling.mdc`.

## 3. Write

1. Follow the order; run `npm run typecheck` after the repository, after the controller and at the end.
2. Smallest change that turns the tests green, then tidy while they stay green. No speculative
   options, no refactor of code the task does not own, no new library.
3. Errors: pick the `AppError` subclass and the code the contract names; a stranger's row is
   `NotFoundError`; unique violations map to `ConflictError` in the service.
4. Lists: keyset pagination with a bounded `limit` (1–100, default 20) and `nextCursor`.
5. Config: from `Env`; never `process.env` outside `src/config/env.ts`; never a literal secret.
6. Logging: `req.log` / injected child logger, object first, no tokens or bodies.
7. New route → its `registerPath` in `src/openapi/document.ts` when that file is in your list. If it
   is not, say so in `follow_up_suggested`: the engine's OpenAPI audit flags the gap at verification.

Worked mini-example — red test "AC-0004 returns 409 PROJECT_NAME_TAKEN for a duplicate name":
the schema already has the unique index; the service wraps `projects.create(...)` in
`try/catch`, `isUniqueViolation(error)` → `throw new ConflictError('Project name already in use.',
'PROJECT_NAME_TAKEN')`, anything else rethrown; the controller is unchanged. One file touched.

## 4. Verify locally, then the exit check

1. `npx vitest run --project unit <each red test>` until green.
2. Self-check your files with the scoped searches in [be-must-fix.md](references/be-must-fix.md).
3. Run the exit check (`gate impl`). It checks, in this order of importance:
   - every red test file is byte-identical to its locked hash from `gate red` (and acceptance tests
     to theirs);
   - the tests the change touches pass (`test:unit --changed`; the whole suite when this is the
     role's last open task), and the task's own test files ran with none skipped;
   - typecheck, lint (ESLint + dependency-cruiser), the architecture check and the build are clean;
   - the role's migration check: any `drizzle/*.sql` in your files needs a journal entry, a real
     rollback and approved destructive statements (you should have none — migrations are
     migration-author's).
4. Read each failure line, fix, re-run. Never edit a red test, never relax an ESLint or
   dependency-cruiser rule, never add `// eslint-disable`.

## 5. When the red test is wrong

Dispute instead of editing: `"test_dispute": { "test": "<file>", "reason": "…" }` with status `done`.
Dispute only when the test contradicts the AC text, the contract, or a stack rule — e.g. it expects
403 for another user's row where `rules/auth-security.mdc` and the contract say 404, it asserts a
log line, or it needs a file outside the task. The engine sends the task back to the test author
once; a second dispute goes to a human. "Hard to make pass" is not a reason.

## 6. Human-owned decisions

A new package, a destructive migration or the removal of a public API (`policy.human_owned`) is
never yours to decide: return `needs_clarification` with the question, the options and the cost of
each. See the dependency section of [be-must-fix.md](references/be-must-fix.md).

## Done when

- [ ] Every red test passes unchanged; no other test broke
- [ ] Each layer does only its job; lint and the architecture check are clean
- [ ] Codes, statuses and DTOs match the contract; secrets never leave the service
- [ ] Protected routes have guards, the service checks ownership, the body carries no role or owner
- [ ] No `any`, `console`, `process.env`, empty `catch`, raw SQL or unbounded list in your diff
- [ ] Only T0's files changed; no dependency added; `gate impl` passed and is in the envelope
