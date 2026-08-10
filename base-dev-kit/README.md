# Base Dev Kit

Language-agnostic rules and skills for honesty, security, and core engineering practices — applicable to any stack.

## Rules (always/auto-applied)

| Rule | Description |
|------|-------------|
| `honesty` | Ground claims in verified sources, flag uncertainty, never fabricate APIs, packages, or results. Always applied. |
| `security` | Access control, secrets, injection prevention, supply chain, and safe handling of untrusted content — aligned to OWASP Top 10:2025. |

## Skills (invoked on demand)

| Skill | Description |
|-------|-------------|
| `clean-code` | Naming, function size, complexity, magic values, dead code, and comment discipline. |
| `dependencies` | Evaluating a new package, lockfile discipline, semver, upgrade cadence, and pinning. |
| `documentation` | When a README/ADR/docstring is required vs. skipped, and sweeping docs for stale values after a change. |
| `git-workflow` | Commit message format, branch naming, atomic commits, PR conventions, and code review etiquette. |
| `tdd` | Red/green/refactor, reproduction tests for bug fixes, the test pyramid, and mocking discipline. |

Rules marked `alwaysApply: true` (`honesty`) attach to every request; others attach on file-glob match.
Skills are invoked automatically by the agent when relevant to the task — no manual setup required
beyond installing the plugin.
