---
name: abort
description: "Stop a factory feature for good and write a post-mortem. Use for /factory:abort only when the human decides the feature will not continue."
argument-hint: "\"<reason>\" [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:abort

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

Confirm with the human first: aborting is terminal. Then run `F abort --reason "<reason>"`.

Report the post-mortem path (`.factory/features/<FEAT>/post-mortem.md`). Artifacts, envelopes and
the event log stay on disk for later analysis; nothing is deleted.
