---
name: proto
description: "Force, skip or revert the living app prototype stage (S2.5) for a factory feature. Use for /factory:proto --force, --skip or --revert."
argument-hint: "--force | --skip | --clear | --revert [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:proto

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

| Argument | Run |
|---|---|
| `--force` | `F override prototype force` |
| `--skip` | `F override prototype skip` |
| `--clear` | `F override prototype clear` (back to the stage's `when:` condition) |
| `--revert` | `F proto revert` — puts `.factory/prototype/` back as it was when this feature's prototype stage started and runs the stage again |

Pass `--feature` through when given. Report the feature's overrides (or the revert result) from the
output. An override applies the next time the pipeline reaches the prototype stage; it does not
re-run a passed stage, and a passed stage cannot be reverted (revert it from git instead).
Without an override the stage runs when the feature's stories add, change or remove a user-facing
surface (`prototype.trigger`; `prototype.enabled: false` turns it off, the patch tier never runs it).
