---
name: intake
description: "Start the factory on new requirements: normalise everything in .factory/inbox/ (briefs, emails, tickets, screenshots) into source-tagged context, detect the mode (new app, extend an app, change a feature) and open a feature. Use for /factory:intake, with --text for a one-liner or --interview when little is written down."
argument-hint: "[--text \"…\"] [--interview] [--new] [--title T] [--mode greenfield|brownfield-extend|change-request] [--tier patch]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Read
---

# /factory:intake

Engine: `node "${CLAUDE_SKILL_DIR}/../../scripts/factory.mjs"` (call it `F`). Arguments: `$ARGUMENTS`.

1. If `.factory/` does not exist, tell the human to run `/factory:init` first and stop.
2. Run `F intake $ARGUMENTS`. It gives every new inbox file a normalised copy with a source ID per
   paragraph, then opens a feature unless one is already open (`--new` forces another).
   - `--text "…"` stores a one-line request in the inbox first. For a small fix, add `--tier patch`.
   - `--interview` starts even with an empty inbox: the intake agent will ask the questions it needs.
3. Report in a short table: files added (and how many source IDs each got), the feature, the detected
   mode and its reason. If the mode looks wrong: `/factory:abort` the new feature, then
   `/factory:intake --new --mode <mode>` (the normalised sources are kept).
4. Next step: `/factory:run`. The intake stage runs first: it describes non-text files, checks that
   users, goals, scope, data, rules, NFRs and acceptance are covered, and asks the human about any
   blocker gap before requirements are written.
