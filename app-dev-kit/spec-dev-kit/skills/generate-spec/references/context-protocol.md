# Context Protocol — Reading `.spec/context/` Files

**Used by**: orchestrator inline intake step, Station 1 (primary); `spec-orchestrator` context discovery, Station 0

---

## Purpose

Defines how the pipeline discovers, reads, normalizes, and traces requirements from arbitrary markdown files dropped into `.spec/context/`.

---

## Discovery

1. Glob `.spec/context/*.md` (flat — no subdirectory recursion on first pass).
2. Sort files by modification time descending (newest first = highest signal).
3. If zero files found: `spec-orchestrator` stops the pipeline and prompts user.
4. If a file is empty (0 bytes): skip with warning, do not fail.
5. If a file is binary or unreadable: skip with warning, do not fail.

---

## Supported File Types

Any `.md` file is valid input. The pipeline is designed to handle:

| File Type | Expected Content |
|-----------|-----------------|
| Feature request | Raw description: "I want a feature that..." |
| User notes | Bullet points, observations, pain points |
| Meeting notes | Q&A format, decisions, action items |
| Partial spec | Previous unfinished spec attempt |
| Screenshots-to-text | OCR output of UI mockups or wireframes |
| Email/Slack transcript | Conversation exports |

---

## Normalization by `spec-intake`

For each file, `spec-intake` extracts:

```json
{
  "source_file": "filename.md",
  "modified_at": "ISO 8601",
  "raw_text": "...",
  "extracted": {
    "title_hints": [],        // Any headings found
    "feature_statements": [], // "I want", "The system should", "As a user"
    "constraints": [],        // "must", "cannot", "always", "never"
    "entities_mentioned": [], // Nouns that could be domain entities
    "user_roles_mentioned": [],
    "acceptance_hints": [],   // "should pass", "must work when", "verify that"
    "open_questions": [],     // "?", "TBD", "unclear", "TODO"
    "non_functional_hints": [],
    "api_hints": [],          // URL patterns, HTTP verbs, "endpoint", "API"
    "ui_hints": []            // "screen", "button", "modal", "table", "form"
  }
}
```

---

## Intake Report Structure

After processing all files, `spec-intake` produces a single `intake_report`:

```json
{
  "timecode": "YYYYMMDD-HHmmss",
  "source_files": ["file1.md", "file2.md"],
  "slug_hint": "kebab-case-derived-from-most-prominent-title",
  "type_hint": "feature | app",
  "raw_requirements": [
    {
      "text": "...",
      "source_file": "file1.md",
      "source_line": 12,
      "confidence": "high | medium | low"
    }
  ],
  "source_map": {
    "requirement-text": {
      "file": "file1.md",
      "line": 12
    }
  },
  "consolidated_entities": [],
  "consolidated_user_roles": [],
  "raw_constraints": [],
  "raw_open_questions": [],
  "raw_ui_hints": [],
  "raw_api_hints": [],
  "raw_nfr_hints": []
}
```

---

## Conflict Detection During Intake

`spec-intake` flags obvious surface-level conflicts (same assertion stated differently):

```json
{
  "potential_conflicts": [
    {
      "conflict_id": "C-001",
      "file_a": "file1.md",
      "statement_a": "Users can delete profiles",
      "file_b": "file2.md",
      "statement_b": "Profiles cannot be deleted, only archived",
      "severity": "high"
    }
  ]
}
```

`spec-analyst` performs deep conflict analysis in Station 2.

---

## Source Traceability

Every requirement extracted MUST carry:
- `source_file` — which `.spec/context/` file it came from
- `source_line` — approximate line number (for reference)

This traceability is preserved through all pipeline stages and appears in the final spec's `traceability.source-requirements[]` YAML field.

**Rule**: If a requirement cannot be traced to a source file, it MUST be marked as an `assumption` (added by `spec-enricher`), NOT as a source requirement.

---

## Multi-File Merge Strategy

When multiple files describe the same feature:

1. **Deduplication**: identical statements (>85% text similarity) are merged into one, keeping both source references.
2. **Augmentation**: complementary statements from different files are combined.
3. **Conflict escalation**: contradictory statements are preserved both with `conflict_id` reference and escalated to `spec-analyst`.

Latest file wins on factual conflicts (e.g., version numbers), but the older statement is preserved in `open-questions[]`.

---

## Context File Naming Conventions (Recommended, Not Enforced)

Users are not required to name files in any specific way. However, these conventions help the intake agent produce better slugs:

| Pattern | Example | Effect |
|---------|---------|--------|
| `{feature-name}.md` | `profile-management.md` | Slug derived from filename |
| `{date}-{name}.md` | `2024-01-15-profile-management.md` | Date stripped, slug from name |
| `notes-{name}.md` | `notes-profile-management.md` | "notes-" prefix stripped |
| `req-{name}.md` | `req-profile-management.md` | "req-" prefix stripped |
| `REQUIREMENTS.md` | `REQUIREMENTS.md` | Generic — slug derived from content |
