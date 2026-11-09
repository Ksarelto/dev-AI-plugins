---
name: init
description: "Set up the AI factory in this repo — the starting point: create .factory/ with config, state and an inbox for requirements, and register the installed factory packs. Use for /factory:init before the first intake."
argument-hint: "[--roles frontend,backend,ai-agent] [--mode greenfield|brownfield-extend|change-request]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Read, Edit
---

# /factory:init

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

1. Run `F init $ARGUMENTS`. It creates `.factory/` (config, state, inbox, `.gitignore`) and records
   the factory packs it can find. It does nothing if `.factory/state.json` already exists.
2. Open `.factory/factory.config.yaml` and confirm with the human, in one short table:
   - which roles are enabled (`roles.<role>.enabled`), each role's package folder (`roles.<role>.path`,
     `"."` for the project root; backend defaults to `apps/api`) and the paths it owns (`owns_paths`);
   - the frontend boilerplate pointer (`roles.frontend.boilerplate`). When it is empty, say that a frontend greenfield skips scaffold until it is set (a git URL or a local folder); implementation then has nothing to typecheck;
   - `project.default_branch` and `flow.policy` (kanban or iterations).
   Edit only the keys the human changes. Every other value comes from the engine defaults;
   `F config explain <key>` shows the merged value and which layer set it.
3. Run `F doctor`. If it reports errors, show them and stop.
4. Tell the human the next step. `.factory/requirements.template.md` is the brief shape: fill it (keep the headings; one fact per bullet; blockquotes are hints, not requirements) and move it to `.factory/inbox/`, then run `/factory:intake`. Any other prose in the inbox still works. For a one-line change, `/factory:intake --text "…"`. If `F init` printed a note that frontend boilerplate is unset, repeat that note.

Packs installed after this point register themselves at the next session start; restart the
session if `doctor` says a pack is missing that you just installed.
