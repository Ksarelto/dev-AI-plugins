---
name: diagnose
description: "Send a stuck factory stage straight to escalation rung 3, so the read-only diagnostician writes a root-cause file before the next attempt. Use for /factory:diagnose <stage> when a stage is blocked or keeps failing."
argument-hint: "<stage> [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Agent, Read
---

# /factory:diagnose

Engine: `node "${CLAUDE_SKILL_DIR}/../../scripts/factory.mjs"` (call it `F`). Arguments: `$ARGUMENTS`.

1. Run `F diagnose --stage <stage>`. This also reopens a blocked feature at that stage.
2. Run one iteration of [the Conductor loop](../next/references/factory-conductor-loop.md): `step`
   dispatches `factory:diagnostician` (opus, read-only), which writes `diagnosis/<stage>.md`.
3. Show the root cause from the diagnostician's envelope summary and the path of the diagnosis file.
   The next `/factory:next` re-runs the stage with that file in its pack.
