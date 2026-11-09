---
name: note
description: "Store a human instruction for a factory feature as an HD note before anything acts on it, or decline or close an existing note. Instructions given only in chat can be lost to compaction; notes cannot. Use for /factory:note."
argument-hint: "\"<instruction>\" | decline HD-n \"<reason>\" | done HD-n"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /factory:note

Engine: `node "<engine>/scripts/factory.mjs"` (call it `F`); `<engine>` is `${CLAUDE_SKILL_DIR}/../..` — in Cursor, which leaves that placeholder unfilled, `{this SKILL.md's folder}/../..`.
Arguments: `$ARGUMENTS` (in Cursor: the text typed after the command).

| The human wants to | Run |
|---|---|
| add an instruction | `F note "<their words, verbatim>"` |
| add an instruction about the run itself (a budget raise, "stop asking", "keep going") | `F note "<their words>" --kind process` |
| point notes at a task that was split or replaced | `F note remap TASK-005=TASK-019` |
| drop a note (only the human decides) | `F note decline HD-n --reason "<why>"` |
| mark a note as delivered | `F note done HD-n` |

The output echoes the kind the engine chose (`kind`, `kind_source`: auto or explicit). A note counts as `process` only
when every clause of it is one ("raise the dispatch budget, and keep going"); one product clause makes the whole note product.

Report the note ID. A new note is `open` until an agent maps it to a requirement, criterion or task;
the plan gate fails while a note is unmapped, and the PR gate fails while any note is still open.

A `process` note steers the run, not the product: it is stored as done at once, never reaches an agent's
pack, never becomes a fix item and no gate waits for it. The engine also recognises the usual wordings
(budget raises, "stop asking"); say `--kind product` to override that for a note it misreads.
