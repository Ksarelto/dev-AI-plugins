---
name: abort
description: "Stop a factory feature for good and write a post-mortem. Use for /factory:abort only when the human decides the feature will not continue."
argument-hint: "\"<reason>\" [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:abort

Engine: `node "${CLAUDE_SKILL_DIR}/../../scripts/factory.mjs"` (call it `F`). Arguments: `$ARGUMENTS`.

Confirm with the human first: aborting is terminal. Then run `F abort --reason "<reason>"`.

Report the post-mortem path (`.factory/features/<FEAT>/post-mortem.md`). Artifacts, envelopes and
the event log stay on disk for later analysis; nothing is deleted.
