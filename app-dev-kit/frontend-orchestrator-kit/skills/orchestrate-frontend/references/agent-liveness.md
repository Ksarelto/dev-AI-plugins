# Agent liveness

Canonical ping for `/orchestrate-app`, `/orchestrate-frontend`, and the kits they call. A hung
`Agent` call never returns, so the waiter must background the agent it owns and poll a pulse file.

`check-pulse.mjs` (this skill's `scripts/check-pulse.mjs`) is the checker. Spec and html
orchestrators have no `Write` tool — they update the pulse only through this script.

If this file is missing (a kit invoked on its own), use the defaults in the skill's own Liveness
section. Those defaults match this file.

---

## Files

| File | Who writes it | When |
|------|---------------|------|
| `.spec/app/watch/current.json` | `/orchestrate-frontend`, or the callee once `RUN_DIR` exists | before the nested orchestrator is spawned |
| `{RUN_DIR}/watch/spec-orchestrator.json` | `generate-spec` / `spec-orchestrator` | Station 1 |
| `{dirname(SPEC_PATH)}/watch/html-orchestrator.json` | `generate-html` / `html-orchestrator` | Station 2 |
| `.spec/features/{slug}.context/pulse.json` | `feature-dev` / `feature-orchestrator` | Station 3 |
| `.spec/backend/{slug}.context/pulse.json` | `backend-dev` / `backend-orchestrator` | App Station 3 |
| `.spec/agents/{slug}.context/pulse.json` | `agent-dev` / `agent-dev-orchestrator` | App Station 4 |

`current.json` is not a checklist field. Shape:

```json
{
  "station": "3",
  "pulse": ".spec/features/sign-in.context/pulse.json",
  "feature_id": "F-001",
  "rebuilds": 0,
  "updated_at": "YYYY-MM-DDTHH:mm:ssZ"
}
```

Omit `feature_id` on Stations 1 and 2. `rebuilds` counts station-level rebuilds for this watch.

Pulse shape (workers share the file via `workers[]`):

```json
{
  "role": "feature-orchestrator",
  "agent_id": "",
  "station": "6",
  "status": "working",
  "updated_at": "YYYY-MM-DDTHH:mm:ssZ",
  "progress_at": "YYYY-MM-DDTHH:mm:ssZ",
  "artifact": ".spec/features/sign-in.context/composition-engineer-6.md",
  "detail": "",
  "workers": []
}
```

`status` is `working`, `awaiting-human`, or `done`. `progress_at` changes only when `station` or
`artifact` changes. The script maintains it. A worker `--touch` updates that worker's entry only —
it does not refresh the parent `updated_at`.

Before returning a packet, write it beside the pulse and mark the gate:

```bash
node {PULSE_SCRIPT} --touch --pulse {PULSE} --role {role} --status awaiting-human \
  --packet-json '{"type":"REVIEW_PACKET","review_path":"..."}'
```

That writes `{dirname(PULSE)}/packet.json` (paths and packet fields — not a spec or prototype
body) and sets `artifact` to that file. `done` is the same touch with `--status done` when the
station finished and no human question is pending.

---

## Checker

```bash
node {PULSE_SCRIPT} --check --pulse {PULSE} --stale-after 180 --stall-after 900
node {PULSE_SCRIPT} --check --pulse {PULSE} --worker {worker id}
```

| Exit | Label | Meaning |
|------|-------|---------|
| 0 | `fresh` | `working` and recent, or `done` |
| 2 | `awaiting-human` | Human gate. Do not resume or rebuild. |
| 3 | `not-responding` | `working` and `updated_at` older than 3 minutes |
| 4 | `missing` | No file, corrupt JSON, or unknown worker |
| 5 | `stalled` | Pulse is fresh but `station` and `artifact` are unchanged for 15 minutes |

`awaiting-human` and `done` ignore age.

```bash
node {PULSE_SCRIPT} --watch .spec/app/watch/current.json --station 3 --pulse {PULSE} --feature-id F-001
node {PULSE_SCRIPT} --touch --pulse {PULSE} --role {role} --agent-id {id} --station {n} --status working --artifact {path}
```

Resolve `{PULSE_SCRIPT}` in this order:

1. The `PULSE_SCRIPT` argument passed by `/orchestrate-frontend`.
2. `app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/check-pulse.mjs` under the workspace root.
3. `{this kit's directory}/../frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/check-pulse.mjs`.

---

## Parent loop

The skill in the main conversation runs this while its nested orchestrator (or, on a patch, the
single worker) is in flight. This is `/orchestrate-frontend`'s periodic check: the callee skill is
loaded inline, so the loop runs during the station.

1. Spawn with `run_in_background: true`. Pass `PULSE` and `PULSE_SCRIPT`. Do not block on the Agent call. Do not end the turn while `status` is `working`.
2. Record `agent_id`. Touch `--status working` for that role.
3. Every 60 seconds, run `--check`. One `sleep 60` per iteration.

| Exit | Action |
|------|--------|
| 0 | Keep waiting. |
| 2 | Stop. Read `{dirname(PULSE)}/packet.json`. Handle it with the skill's packet table. |
| 3, 4, or 5 | Recovery below. |

A completion notice from the background agent is the same as a returned packet: if `packet.json`
exists, use it; otherwise use the return message. Then touch `--status done` if the packet is not
a human gate.

### Recovery (one agent id)

1. `resume` that id, without `interrupt`: "Update the pulse and continue from {checkpoint}. Do not restart finished work."
2. Wait 60 seconds and `--check` again. A pulse that moved, or a packet, means the same agent is alive — keep it.
3. If the resume failed because the id is still running, or the pulse did not move: `resume` with `interrupt: true` only to abandon that id, then spawn a **new** agent from the checkpoint path (and the station card). Do not paste the dead transcript.
4. At most **two** fresh spawns. Then stop. Write this kit's `kit-result.json` with `--outcome error --reason stale-agent` and return. Do not start the next station.

`awaiting-human` is never a reason to resume or rebuild.

---

## Nested orchestrator — ping workers

Same recovery, with a turn cap. Background each worker (`run_in_background: true`). Pass `PULSE`,
`PULSE_SCRIPT`, and tell it to `--touch --worker {role}` on start and after each file it writes.

On every poll, `--touch` this orchestrator's own pulse (`--station` current station) so the parent
sees it alive. A worker touch does not do that.

Poll at most **6** times, 60 seconds apart. Earlier if `--check --worker {id}` exits 3, 4, or 5.
Then run Recovery for that worker only. A parallel batch (html Station 4) polls every worker in
the batch; rebuild only the stale or failed ones. Do not poll forever — six waits then recovery
is the budget.

The worker's checkpoint is the handoff path it was told to write, plus the orchestrator checkpoint
when one exists. A fresh spawn gets those paths, not the chat so far.

After two fresh spawns still fail the check, return `ESCALATION_PACKET` with `reason: stale-agent`.
Before any packet, `--touch --status awaiting-human --packet-json '…'` (or `done` when the packet
is `READY_TO_PUBLISH` and the skill does not need a question).

---

## Top level — after the skill returns

`/orchestrate-frontend` and `/orchestrate-app` run `--check` on the pulse in `current.json` before
trusting an envelope. The callee skill already polled while the agent was in flight. This check
is for a return that brought no envelope.

| What came back | Checklist |
|----------------|-----------|
| Envelope `approved` | `done`, as today. The envelope is still required. |
| Envelope `error` with `reason` `stale-agent` | `blocked`, `blocked-reason: stale-agent`. Ask once. Do not start the next feature or the next work-plan task. |
| Missing envelope, and the pulse check is 3, 4, or 5 | Leave `in-progress`. Rebuild this station **once** (`rebuilds` 0 → 1, same feature or task, `RESUME` / checkpoint). Log it. |
| That rebuild also returns no envelope and a stale or missing pulse | `blocked`, `blocked-reason: stale-agent`. Ask once. Stop. |

Station 0, for an `in-progress` feature: check `.spec/features/{slug}.context/pulse.json`. Exit 2
→ re-offer the pending packet (`packet.json`), do not rebuild. Exit 3, 4, or 5 → rebuild as above,
do not treat the feature as finished. Exit 0 → re-offer as a crashed run that was recently alive;
do not mark `done`.
