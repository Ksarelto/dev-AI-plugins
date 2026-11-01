---
name: diagnose
description: "Send a stuck factory stage straight to escalation rung 3, so the read-only diagnostician writes a root-cause file before the next attempt. Use for /factory:diagnose <stage> when a stage is blocked or keeps failing."
argument-hint: "<stage | TASK-NNN> [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Agent, Read
---

# /factory:diagnose

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

1. Run `F diagnose --task <TASK-NNN>` when the argument is a task, else `F diagnose --stage <stage>`.
   This also reopens a blocked feature there.
2. Run one iteration of [the Conductor loop](../next/references/factory-conductor-loop.md): `step`
   dispatches `factory:diagnostician` (opus, read-only), which writes `diagnosis/<stage>.md`.
3. Show the root cause from the diagnostician's envelope summary and the path of the diagnosis file.
   The next `/factory:next` re-runs the stage with that file in its pack.
