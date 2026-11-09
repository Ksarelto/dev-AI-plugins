---
name: split
description: "Ask the factory planner to replace one implementation task that is really two unrelated behaviours with two or three smaller ones. A task that only keeps failing is amended in place by the engine (rung 4), not split. Use for /factory:split TASK-NNN."
argument-hint: "TASK-NNN [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Agent, Read
---

# /factory:split

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

1. Run `F split <TASK>`. The task gets `split_pending`; any dispatch in flight is dropped.
2. Run one iteration of [the Conductor loop](../next/references/factory-conductor-loop.md): `step`
   dispatches the planner with the task, its gate history and its diagnosis file (if one exists).
3. Report the new task IDs from the planner's envelope. The engine re-checks the whole plan with
   gate-plan before the new tasks run; the old task is marked `replaced`.

A task is a vertical slice: do not split one for having many files or segments. A task that still fails after diagnosis is not split either: the Loop Warden asks the planner to amend its scope or definition (rung 4). A missing file of the slice is `/factory:scope`.
