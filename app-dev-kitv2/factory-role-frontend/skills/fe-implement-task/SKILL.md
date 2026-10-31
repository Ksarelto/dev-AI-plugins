---
name: fe-implement-task
description: Procedure for the factory frontend builder — make one task's red tests pass in the React Feature-Sliced Design stack with the smallest change, matching the golden file and keeping typecheck, lint, layer rules and build clean. Preloaded by fe-builder; not for direct use.
user-invocable: false
---

# Implement one frontend task (green phase)

## Before writing

1. Read the red tests first: they are the specification. Then the golden file named in T0 and the
   stack skill for the task type (T0 "Procedure").
2. Check the component map for reuse decisions: extend what it says to extend, never fork it.

## Writing

- Stay inside the files in T0. A slice exposes only what other layers need through its `index.ts`;
  imports go downward only (`app → pages → widgets → features → entities → shared`) and never into
  another slice's internals — the architecture check enforces it.
- Smallest change that makes the tests pass, then refactor while they stay green: names, small
  functions, no dead code. No new dependencies, no speculative options.
- UI states from the UX notes (empty, loading, error, success) are part of the task when its ACs
  mention them.
- User-visible strings follow the project's i18n setup when it has one.

## Exit

Run the exit check (`gate impl`): the red tests unchanged, all tests passing, typecheck, lint,
architecture and build clean. On a retry, fix only what T3 lists.

If a red test contradicts the criteria or cannot pass without breaking another one, do not edit it:
return `"test_dispute": { "test": "<file>", "reason": "<what is wrong and the AC it contradicts>" }`.
The test author gets one round to revise; a second dispute goes to the human.
