---
name: replay
description: "Re-run an earlier factory stage (requirements, stories, architecture, planning) — send it back for rework with human feedback, resetting the stages after it. Use for /factory:replay when an approved artifact needs rework."
argument-hint: "<stage> \"<feedback>\" [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:replay

Engine: `node "${CLAUDE_SKILL_DIR}/../../scripts/factory.mjs"` (call it `F`). Arguments: `$ARGUMENTS`.

1. Store the feedback first: `F note "<feedback>"`. Note the HD ID.
2. Run `F replay <stage> --with "<feedback> (HD-n)"`. The stage and every stage after it return to
   `pending`; their earlier outputs stay on disk until the agents rewrite them.
3. Report the stage the feature is in now and suggest `/factory:run`.

Use `/factory:gate reject` instead when the feature is waiting at the gate of that same stage.
