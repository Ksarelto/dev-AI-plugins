---
name: code-review
description: Review a Node.js backend diff or branch against this kit's rules — layering, Zod validation, AppError handling, auth guards and ownership, SQL, migrations and transactions, resilience, logging redaction, tests — and report severity-tagged findings. Use before merging, when auditing a PR, or when asked to review Express API changes against a base ref.
argument-hint: "[base-ref]"
allowed-tools: [Read, Glob, Grep, Bash]
---

# Code review (Express backend)

Review the diff between a base ref and `HEAD` against this kit's rules. Report findings with a severity; do not edit unless the user asks for fixes afterwards.

`BASE` is the ref the user passes, else the merge base with the default branch (`git merge-base HEAD origin/develop`, then `origin/main`). Ask once if neither resolves.

Not this skill: a whole-tree structural check (`architecture-audit`).

## 1. Diff and mechanical checks

```bash
git rev-parse --verify "$BASE"
git diff --name-status "$BASE"...HEAD
npm run typecheck
npm run lint            # ESLint strictTypeChecked + dependency-cruiser layer rules
npm run test:unit
npm run test:integration   # needs Docker; if it cannot run, say so in the report — never assume it passes
```

Every compiler, lint or test failure is a **blocker** finding with its output line. A check you could not run is listed under "Not verified".

## 2. Read the rules for what changed

Claude Code does not load `.mdc` files, so read them yourself. The rule files are in this kit's `rules/` directory (two levels above this `SKILL.md`: `../../rules/<name>.mdc`). Read only the rows whose paths the diff touches.

| Changed path | Rule files |
|---|---|
| `src/routes/**`, `src/controllers/**` | `layered-architecture`, `validation`, `api-design`, `auth-security`, `error-handling`, `typescript-node` |
| `src/services/**` | `layered-architecture`, `error-handling`, `typescript-node` (+ `auth-security` for `auth*`) |
| `src/repositories/**`, `src/db/**`, `drizzle/**`, `drizzle.config.ts` | `database`, `layered-architecture`, `typescript-node` |
| `src/schemas/**`, `src/middleware/validate.ts`, `src/config/**` | `validation`, `api-design`, `stack` |
| `src/middleware/**`, `src/app.ts` | `auth-security`, `error-handling`, `observability`, `stack` |
| `src/lib/{resilience,http-client,health,shutdown,lifecycle}.ts`, `src/middleware/timeout.ts`, `Dockerfile`, `docker-compose.yml` | `resilience` |
| `src/lib/logger.ts`, `src/middleware/request-logger.ts`, any new log call | `observability` |
| `src/openapi/**` | `api-design` |
| `tests/**`, or any `src/**` file without a matching test change | `testing` |
| `package.json` | `stack` |

## 3. Review each file

- Diff over ~15 source files: split by layer (routes+controllers, services, repositories+db+migrations, schemas+openapi, middleware+lib+app, tests) and review the groups in parallel subagents. Give each the file list and the rule paths to read, not the rule text. Each returns one line per file: `path: clean` or `path: <findings>`.
- Read every changed source file in full, not only the hunks; check its callers when a signature changed.
- Walk [references/checklist.md](references/checklist.md) for the areas the file touches. Tag each finding with a severity from [references/severity.md](references/severity.md).
- A finding names `path:line`, the rule (`rules/<name>.mdc` bullet or checklist item), why it matters, and the concrete fix.
- Flag missing pieces, not only wrong ones: a route without `validate()`, a new endpoint without OpenAPI or tests, a table without a migration, a migration without `drizzle/meta`.

## 4. Report

```
## Review <BASE>...HEAD (<n> files)

### Mechanical
typecheck: pass|fail · lint: pass|fail · unit: pass|fail · integration: pass|fail|not run (reason)

### Blockers
- `path:line` [rule] — problem → fix

### Major
- …

### Minor / nits
- …

### Not verified
- <what could not be checked and why>

### Verdict
approve | approve with nits | changes requested
```

Any blocker or major → `changes requested`. Do not soften a blocker because the change is small.

## Checklist

- [ ] Base resolved; diff non-empty; typecheck, lint and tests run (or listed as not verified)
- [ ] Matching rule files read for every touched area
- [ ] Every changed source file read in full; one line per file in subagent output
- [ ] Each finding has path:line, rule, severity, fix
- [ ] Missing tests, OpenAPI entries, migrations and guards reported as findings
