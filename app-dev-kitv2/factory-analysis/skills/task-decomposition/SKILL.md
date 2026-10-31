---
name: task-decomposition
description: Procedure for the factory planner — decompose a feature into small tasks (at most three files each) as a test-first DAG routed by role, with red tests and stubs declared, reuse recorded and every acceptance criterion satisfied. Preloaded by the planner; not for direct use.
user-invocable: false
---

# Task decomposition

Write `04-plan/tasks.yaml` ([fa-tasks.yaml](../../templates/fa-tasks.yaml)).

## Shape of a task

- **One role, one type.** `role` routes the task (frontend, backend, ai-agent); `type` picks the
  procedure (entity-model, feature-ui, endpoint, migration, graph, tool …). A role that is disabled in
  config still gets its tasks; they wait as parked.
- **Small.** At most `quality.task_limits` (default 3 files, 200 lines). Split by layer before
  splitting by screen.
- **Ordered.** Contract and types → data/model → logic → UI → wiring. `depends_on` only when a task
  needs another task's output.
- **Owned files.** `files_expected` lists every file the task creates or changes, all inside the
  role's `owns_paths`. Colocated tests count, and so do generated files: a Drizzle migration task
  lists the schema file, the SQL, `drizzle/meta/_journal.json`, `drizzle/meta/<NNNN>_snapshot.json`
  and its `drizzle/rollback/<NNNN>_<name>.down.sql`.
- **Removals.** Every REQ in the delta-spec's `removed` gets a task that takes the behaviour out,
  naming it in `removes: [REQ-…]` (usually with a test that the behaviour is gone).

## Test-first

Every behaviour-bearing task has `tdd.mode: required`, the `red_tests` (a subset of
`files_expected`) a separate test author writes before the builder starts, and `stubs` — the
signatures the tests import. `tdd.mode: exempt` only for the whitelisted types in
`quality.tdd.exempt_types`, with a reason.

For a change request that modifies behaviour, the first task writes **characterisation tests** for
the current behaviour and nothing else (`type: characterisation`, `characterisation: true`,
`tdd.mode: exempt` — these tests pass by design). The tasks that change the behaviour depend on it.
Every `unchanged_guarantees` entry of the delta-spec is covered by that task's definition of done.

## Traceability and reuse

- `satisfies` lists the ACs a task makes pass; every spec AC is satisfied by some task.
- `reuse.considered` lists what the component map says exists; `reuse_rejected` is `null` when the
  task reuses, a reason when it creates something new.
- `definition_of_done` restates the measurable outcome in the task's own terms.
- Map every open human note your plan carries in the envelope's `notes_mapped`.

Run the exit check from T0 before you return.
