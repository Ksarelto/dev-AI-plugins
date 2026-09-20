# Artifact Naming — Timecode + Slug Conventions

**Used by**: `spec-orchestrator` (timecode + slug derivation, Station 0); inline publish step, Station 10

---

## Output Structure

Each pipeline run produces a **folder** in `.spec/app/`:

```
.spec/app/spec-{YYYYMMDD-HHmmss}_{slug}/
  spec.md                ← hybrid spec (YAML front matter + Markdown body)
  context-snapshot.md    ← optional: raw content of all .spec/context/ files at run time
```

### Examples

```
.spec/app/spec-20240115-143022_profile-management/
  spec.md
  context-snapshot.md

.spec/app/spec-20240201-091500_invoice-approval-workflow/
  spec.md

.spec/app/spec-20240215-163045_user-authentication/
  spec.md
  context-snapshot.md
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

Each `.spec.md` file in `.spec/app/` is a **hybrid spec**: YAML front matter followed by Markdown body.

```
---
# YAML front matter (as defined in rules/spec-schema.md)
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

If the same slug is specced multiple times (e.g., multiple `/generate-spec` runs for the same feature), **each run produces a new folder** with a different timecode. Do not overwrite.

```
.spec/app/spec-20240115-143022_profile-management/   ← first run
.spec/app/spec-20240115-170000_profile-management/   ← revised run
.spec/app/spec-20240116-090000_profile-management/   ← next day revision
```

The **latest timecode** is the authoritative spec. Older folders are historical record.

**When downstream kits load a spec by slug**, they MUST load the folder with the latest timecode for that slug:
```
Glob(".spec/app/spec-*_{slug}/spec.md") → sort by timecode descending → take first
```

---

## Context Snapshot (Optional)

The publisher MAY also write a context snapshot inside the output folder:

```
.spec/app/spec-{YYYYMMDD-HHmmss}_{slug}/context-snapshot.md
```

This file contains the raw text of all `.spec/context/` files as they existed at run time — a snapshot for reproducibility. This is not required for pipeline operation but recommended for audit purposes.

---

## Feature-Dev-Kit Spec Path

When `feature-dev-kit` creates its blackboard file, it SHOULD record the source spec path:

```markdown
---
# In .spec/features/{slug}.md front matter:
spec-source: ".spec/app/spec-20240115-143022_profile-management/spec.md"
---
```

This maintains the traceability chain from context → spec → feature blackboard → code.
