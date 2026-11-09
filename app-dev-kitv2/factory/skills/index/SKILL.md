---
name: index
description: "Rebuild the factory's component inventory of the app — every slice with its public exports and how often it is used — so planning and reuse checks see the current code. Use for /factory:index after a merge or when the index is stale."
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:index

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.

Run `F index`. The Cartographer writes `.factory/_index/component-inventory.yaml` with the git commit
it was built from, using the index adapter of each enabled role's stack (FSD today).

Report the number of components and the commit. The inventory is read by planning (reuse
decisions) and by reviewers; it never changes
source code. The capability map written at discovery is the human-confirmed view; the inventory is
the mechanical one.
