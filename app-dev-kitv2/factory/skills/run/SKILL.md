---
name: run
description: "Run the factory pipeline continuously — keep going step after step until it needs a human (a gate or a question), halts, or finishes. Use for /factory:run, e.g. to go from intake to the spec approval."
argument-hint: "[--feature FEAT-NNN] [--max-steps N]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Agent, Read
---

# /factory:run — until the next human gate

Engine: `node "${CLAUDE_SKILL_DIR}/../../scripts/factory.mjs"` (call it `F`). Arguments: `$ARGUMENTS`.

Read [the Conductor loop](../next/references/factory-conductor-loop.md) and repeat its iteration
until `step` or `record` returns `ask_human`, `wait`, `halt` or `done`, or after `--max-steps` iterations
(default 25).

Between iterations, print one line per recorded result (`<dispatch id> → <verdict>`), nothing more.

At the end, print:

```
Stopped at: <ask_human GATE-X | wait: reason | halt: reason | done>
Feature: FEAT-NNN · stage <stage> · dispatches <n> · tokens <n>
Next: <the exact command for the human>
```

If the human types anything while you run, store it with `F note "<text>"` before continuing.
