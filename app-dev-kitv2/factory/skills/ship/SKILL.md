---
name: ship
description: "Commit a verified factory feature on its branch from the release manager's plan and open the pull request through the adapter — a dry run by default that only records the gh commands. Use for /factory:ship, e.g. to re-run delivery after enabling real PRs."
argument-hint: "[--feature FEAT-NNN]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Read
---

# /factory:ship

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

The delivery stage ships automatically when its gate passes, before GATE-C. Use this command to
ship again — for example after `delivery.dry_run: false` was set — never to skip the gate.

1. Check `delivery.dry_run` with `F config explain delivery.dry_run`. When it is `false`, this pushes
   a branch and opens a real pull request: **ask the human to confirm before running step 2.**
2. Run `F ship`. It creates or reuses the feature branch, makes one commit per entry in
   `08-delivery/commits.yaml`, commits the feature's `.factory/` record, and runs the adapter.
3. Report the branch, the commits (short SHA and subject) and the PR: the URL, or the recorded
   command when it was a dry run (`08-delivery/ship.json`).
