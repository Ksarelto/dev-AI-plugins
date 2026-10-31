---
name: note
description: "Store a human instruction for a factory feature as an HD note before anything acts on it, or decline or close an existing note. Instructions given only in chat can be lost to compaction; notes cannot. Use for /factory:note."
argument-hint: "\"<instruction>\" | decline HD-n \"<reason>\" | done HD-n"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:note

Engine: `node "${CLAUDE_SKILL_DIR}/../../scripts/factory.mjs"` (call it `F`). Arguments: `$ARGUMENTS`.

| The human wants to | Run |
|---|---|
| add an instruction | `F note "<their words, verbatim>"` |
| drop a note (only the human decides) | `F note decline HD-n --reason "<why>"` |
| mark a note as delivered | `F note done HD-n` |

Report the note ID. A new note is `open` until an agent maps it to a requirement, criterion or task;
the plan gate fails while a note is unmapped, and the PR gate fails while any note is still open.
