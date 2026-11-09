---
name: scope
description: "Widen one factory implementation task's scope by hand: add the files or the folder glob a builder reported with needs_scope_change to the task's files_expected or write_scope, without a planner run. Use for /factory:scope TASK-NNN add <file or glob>."
argument-hint: "TASK-NNN add [<file or glob> ...] [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Read
---

# /factory:scope

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

A builder returned `needs_scope_change` because the plan left out a file its slice needs (a `styles.ts`, a
barrel, a component-named test). When the file lies inside the task's slice folder the engine says so in the
question it asks you. That is a mechanical fix, not a planning question:

1. Look at the question (`F state --brief`) and the files it names.
2. Run `F scope add <TASK> <file or glob> [...]`. A plain path goes to `files_expected`, a glob
   (`src/features/x/ui/panel/**`) to `write_scope`. With no paths it adds the files the builder named.
3. The engine re-runs gate-plan. If the plan would break (a file outside the role's `owns_paths`, the task now
   over its size limit) it refuses and leaves `tasks.yaml` untouched; say why and, if the plan itself is wrong,
   use `/factory:replay planning` or `/factory:split` instead.
4. The same task continues from the same phase with its red tests and attempts reset; run one iteration of
   [the Conductor loop](../next/references/factory-conductor-loop.md).

No agent can run this command (the write guard blocks it): it is the human's approval of the wider scope.
