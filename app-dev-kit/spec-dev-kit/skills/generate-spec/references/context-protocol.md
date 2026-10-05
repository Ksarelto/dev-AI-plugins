# Context Protocol — Reading `.spec/context/` Files

**Used by**: `generate-spec` skill, Station 1 (intake) and Station 0 (context discovery)

---

## Purpose

Defines how the pipeline discovers, reads, normalizes, and traces requirements from arbitrary markdown files dropped into `.spec/context/`.

---

## Discovery

1. Glob `.spec/context/*.md` (flat — no subdirectory recursion on first pass).
2. Sort files by modification time descending (newest first = highest signal).
3. If zero files found: the `generate-spec` skill stops and tells the user to drop requirement files in `.spec/context/`.
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

## Normalization at Station 1

For each file, the `generate-spec` skill extracts:

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

## Atomic Extraction Rules

`raw_requirements[]` is the register every later station is checked against (Station 5 fidelity,
Station 7 `REQUIREMENT_UNCOVERED`). `scripts/extract-intake.mjs` applies these rules — the skill
does not copy requirements by hand. It emits one entry per table row, bullet (lead-in bullets
ending in `:` prefix their children), and requirement-bearing sentence, routes sections by heading
(glossary, decisions, success measures, out of scope, copy, open questions, narrative), and sets
`kind_hint` / `role_hint` / `scope_hint` / `confidence` by keyword. The skill then fills only
`type_hint`, `consolidated_entities`, `consolidated_user_roles`, `potential_conflicts`, and
`terminology_drift`. Compound statements ("A and B") stay one entry; the enricher splits them.

The rules the script implements:

- Every MUST / MUST NOT / "may" / "cannot" sentence → one entry. Split "A and B" into two.
- Every **table row** (roles × actions matrix, "who is told" table, edge-case table, status list)
  → one entry quoting the whole row (a row maps to one structured item later: one permission row,
  one notification, one edge-case AC). Do not split a row into cells.
- Every **number** — limits, timers, windows, retention, sizes, counts — is kept verbatim in the
  entry text (`"at most three active borrows"`, `"lapses after 24 hours"`).
- Glossary rows → `glossary[]` (also one entry each when they define behaviour).
- "Decisions already made" lists → entries, with their ids in `decisions_already_made[]`. If a
  decision only repeats a rule already extracted, list that rule's id instead of a new entry.
- Success measures → entries with `kind_hint: metric`, ids in `success_metrics[]`.
- Narrative (pain points, background) is not a requirement — it feeds `context.problem` only.
- Lists ("payments, invoices, claims") split into one entry per item; "A or B" stays one entry.
- Out-of-scope lists → entries with `scope_hint: non-goal`.
- Copy / voice examples ("Good: …", "Bad: …") → `copy_examples[]`.

Do not summarise and do not merge near-duplicates across sections — the analyst deduplicates with
both source lines kept. A long structured PRD legitimately yields hundreds of entries.

---

## Intake Report Structure

After processing all files, the skill writes `artifacts/intake.json`:

```json
{
  "timecode": "YYYYMMDD-HHmmss",
  "source_files": ["file1.md", "file2.md"],
  "slug_hint": "kebab-case-derived-from-most-prominent-title",
  "type_hint": "feature | app",
  "raw_requirements": [
    {
      "id": "R-001",                      // stable; later stations reference this, never the array index
      "text": "...",
      "source_file": "file1.md",
      "source_line": 12,
      "section": "10.1 When a request is allowed",
      "kind_hint": "rule | behavior | constraint | nfr | data | copy | metric",
      "role_hint": "authoritative | discussion",     // per source file; analyst weights conflicts
      "scope_hint": "in | non-goal",
      "confidence": "high | medium | low"
    }
  ],
  "glossary": [{ "term": "...", "meaning": "...", "source_line": 0 }],
  "decisions_already_made": ["R-090"],          // ids of raw_requirements entries
  "success_metrics": ["R-003"],                 // ids (kind_hint: metric)
  "copy_examples": [{ "good": "...", "bad": "...", "source_line": 0 }],
  "consolidated_entities": [{ "name": "Session", "salience": "primary | secondary", "source_lines": [40] }],
  "consolidated_user_roles": [{ "role": "Patient", "definition": "...", "source_lines": [28] }],
  "potential_conflicts": [{ "conflict_id": "C-001", "statement_a": "...", "lines_a": [84], "statement_b": "...", "lines_b": [85], "severity": "high" }],
  "terminology_drift": [{ "concept": "...", "terms": ["move", "reschedule"], "source_lines": [55, 66] }],
  "context_starved_categories": ["Observability"]   // completeness categories with zero signal in the source
  "raw_open_questions": ["…"]       // TBD / "?" / unclear statements, verbatim
}
```

Hints (UI, API, NFR, constraint) are not separate arrays — they are `kind_hint` values on the
requirement itself, so nothing is stored twice.

```
```

---

## Conflict Detection During Intake

The skill flags obvious surface-level conflicts (same assertion stated differently):

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

This traceability is preserved through all pipeline stages and appears in the final spec as
`requirements[].source-ref` (`file#Lline`).

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
