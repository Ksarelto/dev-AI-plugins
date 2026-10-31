---
name: status
description: "Show where every factory feature stands — stage, pending gate, budgets, blocked items, open human notes — and the next command. Use for /factory:status or after a break or compaction."
argument-hint: "[--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:status

Engine: `node "${CLAUDE_SKILL_DIR}/../../scripts/factory.mjs"` (call it `F`).

Run `F state --markdown $ARGUMENTS` and show its output as is. It is built from `.factory/` only, so
it is correct even after a compaction or in a new chat.

When the user asks how the factory is performing (first-pass rates, escalations, red-phase validity,
tokens), also run `F metrics --md $ARGUMENTS` and show the tables; the targets come from
Suggestions/12.

The output already lists the files to review when a feature waits at a gate. Do not run `F step`
(it dispatches work) and do not read artifact bodies or source code for this command.
