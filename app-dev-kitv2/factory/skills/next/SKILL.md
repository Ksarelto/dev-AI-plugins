---
name: next
description: "Advance the factory pipeline by exactly one step: ask the engine what is next, dispatch the agents it names, and record their results. Use for /factory:next."
argument-hint: "[--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Agent, Read
---

# /factory:next — one step

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).
(pass `--feature` through to every `F` call when given).

Read [references/factory-conductor-loop.md](references/factory-conductor-loop.md) and run **one**
iteration of it: one `F step`, the dispatches it returns, and one `F record` per result.

Stop after that iteration and report in at most five lines:

- what was dispatched and each agent's one-line result;
- the verdict (`advance`, `retry`, `diagnose`, …) and the stage the feature is in now;
- the next thing to do (`/factory:next`, `/factory:run`, or the gate command).
