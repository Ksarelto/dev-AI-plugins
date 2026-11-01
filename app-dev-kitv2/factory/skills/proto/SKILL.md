---
name: proto
description: "Force or skip the optional prototype stage (S2.5) for a factory feature. Use for /factory:proto --force or --skip."
argument-hint: "--force | --skip | --clear [--feature FEAT-NNN]"
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

Pass `--feature` through when given. Report the feature's overrides from the output. The setting
applies the next time the pipeline reaches the prototype stage; it does not re-run a passed stage.
Without an override the stage runs only when its `when:` flag is set; the automatic trigger rules
arrive with the frontend role pack.
