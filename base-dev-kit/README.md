# Base Dev Kit

Language- and stack-agnostic rules and skills for honesty, security, and core engineering practice.
Nothing in it assumes a framework, a package manager, or a language.

## Install

```bash
# Claude Code
/plugin marketplace add Ksarelto/dev-cusor-plugins
/plugin install base-dev-kit@dev-cursor-plugins
```

For Cursor, see the [repo README](../README.md#install--cursor).

## Rules

Rules load automatically — no invocation needed.

| Rule | Attaches | Covers |
|------|----------|--------|
| `honesty` | Every turn (`alwaysApply: true`) | Ground claims in verified sources, flag uncertainty, never fabricate APIs, packages, or results. |
| `security` | On glob match (`**/*`) | Access control, secrets, injection prevention, supply chain, and safe handling of untrusted content — aligned to OWASP Top 10:2025. |

## Skills

Skills load on demand — the agent picks one when the task matches its description, or you invoke it
directly as `/base-dev-kit:<skill-name>`.

| Skill | Covers |
|-------|--------|
| `clean-code` | Naming, function size, complexity, magic values, dead code, comment discipline. |
| `dependencies` | Evaluating a new package, lockfile discipline, semver, upgrade cadence, pinning. |
| `documentation` | When a README/ADR/docstring is required vs. skipped, and sweeping docs for stale values after a change. |
| `git-workflow` | Commit message format, branch naming, atomic commits, PR conventions, code review etiquette. |
| `tdd` | Red/green/refactor, reproduction tests for bug fixes, the test pyramid, mocking discipline. |
