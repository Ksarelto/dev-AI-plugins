---
name: doctor
description: "Check that the installed factory packs, manifests and config fit together and explain each fix — a stage that is not provided, a broken pack or manifest, a missing agent, gate, role, stack or adapter, a version mismatch. Use for /factory:doctor."
argument-hint: "[--register <plugin-root>]"
disable-model-invocation: true
context: fork
allowed-tools: Bash(node:*), Read, Glob
---

# /factory:doctor

Runs in a forked context: you may read manifests to explain problems without filling the main
conversation. Return only the short report at the end.

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

1. Run `F doctor $ARGUMENTS`. `ok: true` means every stage of the active profile resolves, every
   agent and gate a manifest names exists, stage inputs are produced upstream, enabled roles have
   their role and stack packs, and pack versions match the engine.
2. For each error, find the cause (open the named `stage.yaml`, `role.yaml`, `stack.yaml` or
   `.factory/factory.config.yaml`) and give the one-line fix. Typical fixes:
   - stage not provided → install the pack that ships it, or set `packs.<name>: <path>` in config;
   - a pack missing right after installing it → restart the session (packs register at start);
   - duplicate stage → set `pipeline.stages.<id>.pack` to the pack that should provide it.
3. Summarise warnings in one line each; they don't block a run.

Report format:

```
Doctor: OK | N errors
<error> → <fix>
Packs: <name@version (source)>, …
```
