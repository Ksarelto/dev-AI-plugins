---
description: Review React FSD code — standards, architecture, design principles, pattern usage, and best practices — for a branch diff, uncommitted work, or named paths.
argument-hint: "[base-ref | path...] [--spec <file>] [--focus all|architecture|design|standards]"
allowed-tools: [Read, Glob, Grep, Bash]
---

Run a full code review with the `code-review` skill of this plugin.

Arguments: `$ARGUMENTS`

1. Load the `code-review` skill and follow it end to end.
2. Resolve scope from the arguments. A ref reviews `<ref>...HEAD` plus uncommitted changes. Paths
   review those files whole. No argument reviews against the merge base with `origin/develop`, then
   `origin/main`, then `origin/master`; with none of those, the uncommitted changes.
3. `--spec <file>` adds the spec-compliance axis. `--focus` narrows the axes; the default is all.
4. Cover every axis the focus allows: standards, architecture (through `architecture-audit` in
   report-only mode), design principles and smells, pattern usage, and best practices.
5. Report severity-tagged findings with `path:line`, the rule or principle, the cost, and the fix,
   ending with a verdict. Do not edit files. Offer to fix Blockers and Must-fix items afterwards.
