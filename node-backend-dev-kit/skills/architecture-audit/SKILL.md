---
name: architecture-audit
description: Audit an Express 5 + TypeScript backend against its layered architecture — routes, controllers, services, repositories, db, schemas, middleware, lib — run dependency-cruiser, report layer violations, cycles and misplaced business logic, then fix after confirmation. Use when checking layer boundaries or import direction, or asking whether the current code matches the intended structure.
argument-hint: "[src-path]"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# Architecture audit (layered Express service)

Check the current tree against the layer model. Report first. Edit only after confirmation, or when the user already asked to fix.

**REPORT_ONLY.** If the prompt contains `REPORT_ONLY`, run steps 1–5 and stop. Do not edit and do not ask which findings to fix.

Not this skill: building a resource (`express-resource`); reviewing a diff against every rule (`code-review`).

Hard constraints: `rules/layered-architecture.mdc` (the canonical layer table), `rules/stack.mdc`. Layer table, import matrix and grep checks: [references/layers.md](references/layers.md). Reference config: [references/dependency-cruiser.md](references/dependency-cruiser.md).

## Procedure

1. **Scope.** Default `src/`. If the user names a resource or folder, audit it and everything that imports it.
2. **Inventory.** List the layer folders and the files per resource (`<resource>.routes.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `<entity>.schema.ts`, `db/schema/<table>.ts`). Note folders outside the model (`utils/`, `helpers/`, `models/`, `handlers/`, `dal/`) and resources missing a layer.
3. **Mechanical first.** Run `npx depcruise src --config .dependency-cruiser.cjs` (or `npm run lint`) and `npx tsc --noEmit`. Keep every hit. No config or not wired into `lint` → a hard finding; do not skip silently.
4. **Semantic checks.** Run the greps in [references/layers.md](references/layers.md#semantic-checks); read each hit before reporting. Then read every controller and service in scope for the "read, not grep" items.
5. **Report**, then stop (format below). Do not edit in this step.
6. **Fix** only for confirmed findings (skip entirely with `REPORT_ONLY`). Move code to its layer rather than loosening a rule; keep behaviour identical; add or move tests with it. Re-run step 3 and `npm run test:unit` on touched files. Add the extra depcruise rules from the reference only when that finding was confirmed.

## Hard invariants

- Import direction `routes → controllers → services → repositories → db`; `lib/` and `config/` import no layer; no cycles
- Services never import `express` or touch `req`/`res`; controllers never import repositories or `db`
- Repositories take `executor: DbExecutor = db` and never open transactions; services own them
- Only `container.ts` calls factories with concrete dependencies; only `routes/index.ts` mounts versioned routers
- Controllers read input only via `validated(res, …)` and never map errors to statuses
- No `process.env` outside `config/env.ts` (seed excepted); no `console`

## Report

```
## Architecture audit (<scope>)

### Mechanical
- depcruise: <n violations | clean | not configured>
- tsc: <clean | n errors>

### Hard violations
- [<layer>] `path:line` — invariant broken → proposed move

### Judgment calls
- [<layer>] `path` — smell → suggestion

### Missing / skipped
- <check>: reason

### Summary
N hard, M judgment, K skipped
```

After the report, ask which findings to fix unless the user already said to fix them, or the prompt contains `REPORT_ONLY`.

## Checklist

- [ ] depcruise and tsc run, output kept verbatim
- [ ] Every grep hit read before being reported
- [ ] Each finding names the file, the broken invariant and the target layer
- [ ] No edits before confirmation; fixes re-verified with depcruise, tsc and tests
