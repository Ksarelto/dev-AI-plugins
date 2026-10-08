# Artifact Naming — Timecode + Slug Conventions

**Used by**: `generate-spec` skill (timecode + slug derivation, Station 0; publish, Station 10)

---

## Output Structure

Each pipeline run produces a **folder** in `.spec/spec/`. The app slug stays stable across features.
Which folder is current lives in `.spec/app/current.json` (`app-state.md`), not in "latest timecode".

```
.spec/spec/spec-{YYYYMMDD-HHmmss}_{app-slug}/
  spec.md                    ← hybrid spec (YAML front matter + Markdown body) — the contract
  requirements.yaml          ← one-line-per-requirement register (build-requirements.mjs)
  spec.views.md              ← generated tables (render-spec-views.mjs); never edited by hand
  slices/SL-NNN.yaml         ← one build brief per delivery slice (write-slice-briefs.mjs, at publish)
  kit-result.json            ← path-only envelope for parent orchestrators
  artifacts/intake.json      ← Station 1
  artifacts/analysis.json    ← Station 2 / 2b
  artifacts/qa-log.md        ← every human round
  artifacts/enriched.json    ← Station 4
  artifacts/completeness.json← Station 5
  artifacts/prior-index.json ← continue runs: parent path, ids, and next free numbers
  artifacts/prior-items.yaml ← continue runs: full prior items for modified ids
  artifacts/coverage.yaml    ← synthesizer: REQ-id → covering ids
  artifacts/removed.yaml     ← continue runs: ids dropped from the parent
  artifacts/changes.json     ← write-changes.mjs: added / modified / removed ids per section
```

### Examples

```
.spec/spec/spec-20240115-143022_campus/
  spec.md
  spec.views.md
  slices/SL-001.yaml
  slices/SL-002.yaml

.spec/spec/spec-20240201-091500_campus/
  spec.md
  requirements.yaml
  …
```

---

## Timecode Format

**Pattern**: `YYYYMMDD-HHmmss` — UTC, generated once at Station 0 by `continue-spec.mjs` and frozen
for the whole run. All agents in one run use the same timecode.

---

## Slug Derivation

The slug identifies the app. On a continue run `continue-spec.mjs` keeps the slug from
`current.json`; the argument only matters for the first feature. Priority order:

1. **Explicit argument** — `/generate-spec profile-management`.
2. **Filename** — `{name}.md`, `req-{name}.md`, `notes-{name}.md` → `name`
   (strip `req-`, `notes-`, `spec-`, `feature-`, `requirements-`).
3. **First H1** across the context files.
4. **Most frequent entity name** in `intake.json.consolidated_entities`.
5. **Fallback** — `untitled-{YYYYMMDD}`.

## Slug Normalization Rules

```
1. Lowercase            4. Keep only a-z, 0-9, -
2. Spaces → hyphens     5. Collapse repeated hyphens; strip leading/trailing
3. Underscores → hyphens 6. Max 50 characters, cut at a word boundary
```

```
"Profile Management"         → "profile-management"
"User Auth & SSO"            → "user-auth-sso"
"FEATURE: New Dashboard V2"  → "new-dashboard-v2" (known prefix stripped)
```

---

## Spec File Format

YAML front matter per `spec-schema.md` (`spec-version: "2.0"`), then the Markdown body per
`templates/spec-body.md` (`## Problem Context`, `## Solution Overview`, `## User Flows`,
`## Design Rationale`, optional `## Implementation Notes`, `## Schema History`). Diagrams live in the
generated `spec.views.md`, not in the body.

---

## Versioning Across Runs

Each publish writes a new folder; the previous spec stays on disk. `continue-spec.mjs` writes
`prior-index.json` (parent path + next free ids) and does not copy the previous spec. The new
`spec.md` is feature-only (`metadata.parent-spec`). Downstream kits load `current.json`
`spec_path`; they never pick the newest timecode themselves. On publish the inbox moves to
`.spec/processed/{spec-id}/` — that folder is the context snapshot.

---

## Downstream Traceability

Build kits record the spec they built from. feature-dev-kit writes `upstream-spec:` in
`.spec/features/{slug}.md` front matter, plus `slice-ref:` when it built a delivery slice — the
chain context → spec → slice brief → blackboard → code.
