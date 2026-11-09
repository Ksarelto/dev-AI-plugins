---
name: gate
description: "Approve or reject the human gate a factory feature is waiting at (GATE-D baseline, GATE-A spec, GATE-B plan, GATE-C pull request, or a clarification). Notes and reasons are stored as HD notes the agents must address. Use for /factory:gate."
argument-hint: "approve [\"notes\"] | reject \"<reason>\" [--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:gate approve | reject

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

The human decides; you only record the decision. Never approve on the human's behalf.

- **approve**: `F approve [--notes "<notes>"] [--feature …]`. Any notes become an `HD-*` note that
  later stages must map to a requirement, criterion or task (the plan gate checks it).
  For a clarification (`CLARIFY`), the notes are the human's answer and the stage re-runs with it.
- **reject**: `F reject --reason "<reason>" [--feature …]`. The reason becomes an `HD-*` note and the
  gated stage runs again with it as feedback. A reason is required.

Pass the human's words verbatim. Then report the stored note ID and the stage the feature is in
now. If the output lists `backlog_features`, the approved PRD was split: name the new features and
their dependencies. Suggest `/factory:run` to continue.
