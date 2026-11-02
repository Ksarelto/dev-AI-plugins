---
name: feature-docs
description: Procedure for the factory tech writer — write the feature doc with every acceptance criterion, promote the feature's ADRs to docs/adr, add a CHANGELOG entry and a docs report. Preloaded by the tech-writer; not for direct use.
user-invocable: false
---

# Feature docs (S8a)

Runs on: tech-writer (haiku) — one mechanical documentation pass per finished feature, from its artifacts, before the commit plan.

You update the application's living documentation from the feature's records: the spec, stories,
component map, ADRs, contract, change set and review. You do not read source code beyond the file
names the change set lists, and you change no product code, tests or `.factory/` artifacts.

## What gate-docs checks

| Rule | Fails when |
|---|---|
| `no-feature-doc` | no `docs/features/*.md` contains the feature ID |
| `ac-missing` | an AC ID of the spec, or a removed REQ ID of the delta-spec, is not in that file |
| `adr-not-promoted` | a feature ADR's `id` appears in no `docs/adr/*.md` |
| `no-changelog` | `CHANGELOG.md` does not contain the feature ID |
| `no-report` | `08-delivery/docs-report.md` is missing |

It does not check prose quality, links or OpenAPI — those are yours to get right.

## Procedure

1. **Read the pack.** T0: outputs `feature-doc`, `adr-doc`, `changelog`, `docs-report`, the paths
   you may write and the exit check. T2: the spec (`prd.md` or `delta-spec.yaml`), `stories.yaml`,
   `component-map.md`, `adr-*.md`, `api-contract.yaml`, `06-verify/change-set.yaml`,
   `06-verify/review.md`. T1: for a backend feature, `node-backend-dev-kit:openapi-docs` as
   reference.
2. **Find the doc.** A change request updates the existing doc of the feature it changes (the
   delta-spec's `base`, or the same feature ID; `ls docs/features/` and match by ID or title);
   otherwise create `docs/features/<FEAT-id>-<slug>.md`.
3. **Write the feature doc** with the structure in
   [fd-feature-doc.md](references/fd-feature-doc.md): intro, every AC verbatim, removed REQs with
   what was taken out, unchanged guarantees, screens and endpoints, how to test it, configuration,
   API documentation (backend), decisions with ADR links and the human notes that shaped behaviour,
   known limitations from non-blocking review findings and open S3+ defects.
4. **Promote every ADR** of the feature to `docs/adr/` — same file name, front matter turned into
   a heading and a status line, decision text unchanged, supersession recorded in both files
   ([fd-adr-changelog.md](references/fd-adr-changelog.md#promoting-adrs)).
5. **Add the CHANGELOG entry** under `## Unreleased`, in the group the feature's shape calls for,
   ending with the feature ID ([fd-adr-changelog.md](references/fd-adr-changelog.md#the-changelog-entry)).
6. **OpenAPI and README.** Backend: list the operations added/changed/removed and where the
   generated docs are served; note a stale committed export. README: only if T0 lets you write it;
   otherwise suggest the change in the docs report.
7. **Write the docs report** `08-delivery/docs-report.md`: every file written (new/updated), what
   you could not document and why, what needs a human.
8. **Self-check**: grep your feature doc for each AC ID and removed REQ ID of the spec
   (`grep -c "AC-0003" docs/features/FEAT-001-…md`); every ADR ID in `docs/adr/`; the feature ID in
   `CHANGELOG.md`.
9. **Run the exit check** from T0 (`gate docs`) and return.

## Mini-example

Delta-spec FEAT-004 changes FEAT-001: AC-0012 (new), AC-0003 (modified), `removed: [REQ-0007
"Export to CSV"]`, one ADR (adr-004). Result: `docs/features/FEAT-001-coupons-at-checkout.md`
updated (AC-0012 added, AC-0003 text replaced, a `## Removed` line for REQ-0007 naming the export
button and `GET /api/v1/orders/export`); `docs/adr/adr-004-….md` promoted; CHANGELOG `### Changed`
and `### Removed` lines both ending `(FEAT-004)`; docs report lists the three files.

Note that gate-docs looks for the doc that names FEAT-004: add the change request's ID to the
updated doc's title line or intro (`… (FEAT-001, changed by FEAT-004)`).

## Return

The envelope: `artifacts_written` (every file), `gate_result` from the exit check, `summary` (≤200
words: files written, ACs documented, anything left for a human). `done` when the gate passes;
`blocked` with `error` when an input the doc needs is missing (no spec); never invent behaviour to
fill a gap — record it in the docs report instead.
