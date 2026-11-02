---
name: split
description: "Ask the factory planner to replace one stuck or oversized implementation task with two or three smaller ones (escalation rung 4). Use for /factory:split TASK-NNN."
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

The Loop Warden also requests a split by itself when a task still fails after diagnosis.
