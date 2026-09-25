# Artifact Naming — Timecode + Slug Conventions

**Used by**: `spec-orchestrator` (timecode + slug derivation, Station 0); inline publish step, Station 10

---

## Output Structure

Each pipeline run produces a **folder** in `.spec/spec/`. The app slug stays stable across features.
Which folder is current lives in `.spec/app/current.json` (`app-state.md`), not in "latest timecode".

```
.spec/spec/spec-{YYYYMMDD-HHmmss}_{app-slug}/
  spec.md                ← hybrid spec (YAML front matter + Markdown body)
  base.spec.md           ← previous spec, only when this run continues an app
  artifacts/prior-index.json
  artifacts/delta.yaml   ← add, modify, and remove, continue runs
  artifacts/delta.md     ← narrative replacement, only when it changes
  artifacts/changes.json ← merge-spec.mjs: added, modified, removed ids
  artifacts/prior-items.yaml ← full prior items for modified ids
```

### Examples

```
.spec/spec/spec-20240115-143022_campus/
  spec.md

.spec/spec/spec-20240201-091500_campus/
  spec.md
  base.spec.md
```

---

## Timecode Format

**Pattern**: `YYYYMMDD-HHmmss`

- `YYYY` — 4-digit year
- `MM` — 2-digit month (01–12)
- `DD` — 2-digit day (01–31)
- `-` — literal separator
- `HH` — 2-digit hour, 24h format (00–23)
- `mm` — 2-digit minutes (00–59)
- `ss` — 2-digit seconds (00–59)

**Timezone**: UTC always. Never local time — prevents drift across team members.

**Generated once** at Station 0 (context discovery) and frozen for the entire pipeline run. All agents in one run use the same timecode.

---

## Slug Derivation

The slug identifies the feature/app being specced. It is derived by `spec-orchestrator` at Station 0 using this priority order:

### Priority 1: Explicit filename match
If `.spec/context/` contains a file like:
- `{feature-name}.md` → use `feature-name`
- `req-{feature-name}.md` → use `feature-name`
- `notes-{feature-name}.md` → use `feature-name`

Strip known prefixes: `req-`, `notes-`, `spec-`, `feature-`, `requirements-`

### Priority 2: First H1 heading in intake report
Extract the first `# Heading` found across all context files. Normalize to slug format.

### Priority 3: Most frequent entity name
From `intake_report.consolidated_entities[]`, use the most frequently mentioned entity name.

### Priority 4: Fallback
Use `untitled-{YYYYMMDD}`.

---

## Slug Normalization Rules

```
1. Lowercase all characters
2. Replace spaces with hyphens
3. Replace underscores with hyphens
4. Remove special characters (keep only a-z, 0-9, -)
5. Collapse multiple hyphens to single hyphen
6. Strip leading/trailing hyphens
7. Maximum length: 50 characters (truncate at word boundary)
```

**Examples**:
```
"Profile Management"         → "profile-management"
"Invoice Approval Workflow"  → "invoice-approval-workflow"
"User Auth & SSO"            → "user-auth-sso"
"FEATURE: New Dashboard V2"  → "feature-new-dashboard-v2" → "new-dashboard-v2" (strip known prefix)
"   Spaces everywhere   "    → "spaces-everywhere"
```

---

## Spec File Format

Each `spec.md` is a **hybrid spec**: YAML front matter followed by Markdown body.

```
---
# YAML front matter (as defined in references/spec-schema.md)
spec-version: "1.0"
timecode: "20240115-143022"
...
---

# Markdown body (as defined in templates/spec-body.md)
## Problem Statement
...
```

---

## Versioning Within a Run

Each `/generate-spec` publish writes a new folder. It does not overwrite the previous spec.
`continue-spec.mjs` copies the spec named by `current.json` and continues `US` / `SCR` / `AC` ids.
Downstream kits load `current.json` `spec_path`. They do not pick the newest timecode themselves.

---

## Context Snapshot (Optional)

The publisher MAY also write a context snapshot inside the output folder:

```
.spec/processed/spec-{YYYYMMDD-HHmmss}_{slug}/   ← the inbox files moved here on publish
```

This file contains the raw text of all `.spec/context/` files as they existed at run time — a snapshot for reproducibility. This is not required for pipeline operation but recommended for audit purposes.

---

## Feature-Dev-Kit Spec Path

When `feature-dev-kit` creates its blackboard file, it SHOULD record the source spec path:

```markdown
---
# In .spec/features/{slug}.md front matter:
spec-source: ".spec/spec/spec-20240115-143022_campus/spec.md"
---
```

This maintains the traceability chain from context → spec → feature blackboard → code.
