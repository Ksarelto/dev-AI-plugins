---
name: resume
description: "Clear a halt of a blocked factory feature and run the same phase again at the same escalation rung, without wiping tasks or attempts. Use for /factory:resume after fixing what the halt names (a plugin installed, a budget raised, a skill made available)."
argument-hint: "[TASK-NNN] [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:resume

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

A feature is `blocked` when an agent returned `blocked`, skills were unavailable, the ladder was exhausted or
a budget ran out. `/factory:diagnose`, `/factory:scope`, `/factory:split` and `/factory:replay` change the plan;
this command changes nothing but the halt.

1. Read the halt (`F state --brief`) and make sure its cause is fixed: install the plugin the agent could not
   load a skill from, raise the budget (`F budget raise <key> <value>`, e.g. `F budget raise feature.dispatches 120` or `F budget raise stage.dispatches_max_by_stage.implementation 80`; a `--kind process` note only records that you asked and raises nothing), and so on.
2. Run `F resume` (add `--task TASK-NNN` to resume one blocked task only). The feature becomes `active`;
   blocked tasks become `pending`; tasks, attempts, red locks and findings stay as they are.
3. Run one iteration of [the Conductor loop](../next/references/factory-conductor-loop.md): the same phase is
   dispatched again at the same rung.

If the cause is not fixed, the next attempt halts again and uses up an attempt. No agent can run this command.
