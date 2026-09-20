# Spec Schema — YAML Front Matter

**Version**: 1.1
**Consumed by**: `spec-synthesizer` (write), `scripts/validate-spec.mjs` (validate), `feature-dev-kit/spec-analyst` (read), `html-generator-kit` (read)

---

## Full Schema

```yaml
---
spec-version: "1.1"                      # Schema version — bump on breaking changes
timecode: "YYYYMMDD-HHmmss"              # Pipeline run timestamp (ISO 8601 compact)
type: feature                            # feature | app | domain | integration
status: draft                            # See Status Lifecycle below

metadata:
  slug: ""                               # kebab-case identifier derived from title
  title: ""                              # Human-readable feature/app name
  created: "YYYY-MM-DDTHH:mm:ssZ"       # ISO 8601 — set at first publish
  updated: "YYYY-MM-DDTHH:mm:ssZ"       # ISO 8601 — updated on each revision
  source-files: []                       # List of .spec/context/ files consumed
  pipeline-rounds:                       # Audit trail
    clarification: 0                     # How many clarification rounds ran
    completeness: 0                      # How many completeness rounds ran
    review: 0                            # How many review cycles ran

context:
  problem: ""                            # What problem does this solve? (1–3 sentences)
  goal: ""                               # What does success look like?
  target-users: []                       # Who uses this feature/app?
  existing-system: ""                    # What currently exists that this extends/replaces?
  constraints: []                        # Tech/time/budget/legal constraints
  non-goals: []                          # v1.1 — explicit "Not Doing" list; machine-visible form of
                                         # the Markdown "Out of Scope" section. Optional but recommended.

entities:
  - name: ""                             # PascalCase entity name
    description: ""
    fields:
      - name: ""
        type: ""                         # TypeScript type
        required: true
        description: ""
    relationships:
      - entity: ""
        type: one-to-one | one-to-many | many-to-many
        description: ""

user-stories:
  - id: US-001                           # Sequential, never reuse
    as: ""                               # Role/persona
    i-want: ""                           # Capability
    so-that: ""                          # Benefit/outcome
    priority: must                       # must | should | could | wont

acceptance-criteria:
  - id: AC-001                           # Sequential, never reuse
    story-ref: US-001                    # Links to user-stories[].id
    given: ""                            # Precondition
    when: ""                             # Action
    then: ""                             # Observable outcome
    testable: true                       # Can be automated? true | false

api-surface:
  endpoints:
    - id: API-001
      method: GET                        # GET | POST | PUT | PATCH | DELETE
      path: ""                           # e.g. /v1/profiles/{id}
      description: ""
      auth-required: true
      request:
        path-params: {}
        query-params: {}
        body: {}
      response:
        success: {}
        errors: []
  mutations: []                          # Same shape as endpoints, for write ops

ui-surface:
  screens:
    - id: SCR-001
      title: ""
      route: ""                          # e.g. /profiles/:id
      states:                            # Required 4 states per data screen
        - loading
        - empty
        - error
        - success
      components: []                     # Key UI components on this screen
      notes: ""
  interactions:
    - id: INT-001
      trigger: ""                        # User action
      response: ""                       # System response
      screen-ref: SCR-001

non-functional:
  performance:
    - ""                                 # e.g. "List loads in < 500ms at p95"
  accessibility:
    - ""                                 # e.g. "WCAG 2.2 AA compliance"
  security:
    - ""                                 # e.g. "All endpoints require Bearer token"
  scalability:
    - ""
  observability:
    - ""                                 # e.g. "Log all mutations with userId + timestamp"

risks:
  - id: RISK-001
    description: ""
    likelihood: low                      # low | medium | high
    impact: low                          # low | medium | high
    mitigation: ""

assumptions:
  - id: ASSM-001
    description: ""                      # What was assumed to fill a gap
    source: analyst                      # user | analyst | enricher
    confidence: medium                   # low | medium | high
    requires-confirmation: true          # Should human verify before build?

open-questions:
  - id: Q-001
    question: ""
    raised-by: ""                        # analyst | enricher | user
    status: open                         # open | resolved
    answer: ""                           # Populated when resolved

traceability:
  source-requirements:
    - file: ""                           # .spec/context/ filename
      section: ""                        # Heading or line ref
      maps-to: []                        # US/AC/API IDs derived from this source
  decisions:
    - id: DEC-001
      decision: ""
      rationale: ""
      alternatives-considered: []
---
```

---

## Status Lifecycle

```
draft
  │
  ├─► awaiting-clarification  (gap_score > 25 detected)
  │         │
  │         ▼
  │       analyzing           (user answered, re-running analysis)
  │         │
  ├─◄───────┘
  │
  ├─► enriching               (enricher running)
  │
  ├─► reviewing               (presented to user for approval)
  │
  ├─► approved                (user approved, ready for downstream kits)
  │
  └─► (downstream kits set:)
      building | done
```

---

## Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| `spec-version` | Must be `"1.0"` or `"1.1"` (semver string) | `SCHEMA_VERSION_INVALID` |
| `timecode` | Must match `\d{8}-\d{6}` | `TIMECODE_FORMAT_INVALID` |
| `type` | Must be one of: `feature`, `app`, `domain`, `integration` | `TYPE_INVALID` |
| `status` | Must be valid lifecycle value | `STATUS_INVALID` |
| `metadata.slug` | Must be kebab-case, no spaces, no uppercase | `SLUG_FORMAT_INVALID` |
| `user-stories[].id` | Must start with `US-`, sequential | `STORY_ID_FORMAT_INVALID` |
| `acceptance-criteria[].story-ref` | Must reference existing `user-stories[].id` | `BROKEN_STORY_REF` |
| `acceptance-criteria[].testable` | Must be `true` or `false` | `TESTABLE_FLAG_MISSING` |
| `api-surface.endpoints[].method` | Must be HTTP verb | `HTTP_METHOD_INVALID` |
| `non-functional` | At minimum, `performance` and `accessibility` must be non-empty | `NFR_INCOMPLETE` |

---

## Minimum Viable Spec (required fields for `status: approved`)

A spec cannot be set to `approved` unless ALL of the following are populated:

- `metadata.title` — non-empty
- `context.problem` — non-empty
- `context.goal` — non-empty
- `context.target-users` — at least 1 entry
- `user-stories` — at least 1 story
- `acceptance-criteria` — at least 1 criterion per user story
- `non-functional.accessibility` — at least 1 constraint
- `non-functional.security` — at least 1 constraint
- `traceability.source-requirements` — at least 1 entry

---

## Prototype / HTML Consumability

The downstream `html-generator-kit` reads a subset of this schema to build a clickable prototype.
It reads **only** `entities[]` and `ui-surface.screens[]` (plus `metadata` and `context`), and its
screen layout is chosen by **keyword-matching the screen description**. The following rules ensure
the frontmatter is rich enough for that kit to render accurate screens instead of generic guesses.
These are hard expectations for any spec that will be prototyped.

### Entities

- Every entity that appears on any screen MUST have a **complete field list** with real TypeScript
  types — never just `id` + `name`. The prototype renders one table column / form field per entity
  field, so a sparse entity produces a thin, useless table.
- Any entity with lifecycle states MUST expose a status field named `status`, typed
  `<Entity>Status` (e.g. `ProfileStatus`), whose `description` **enumerates the allowed values**,
  e.g. `"One of: NEW, ACTIVE, DECLINED"`. The prototype detects the badge column by the `Status`
  type suffix and reads the enum values from this description.

### Screens (`ui-surface.screens[]`)

- `notes` MUST be an **action-oriented one-liner** that (a) names the screen's **primary entity**,
  and (b) begins with a phrase that reveals the page type using this vocabulary (the prototype keys
  on these words to pick the layout):

  | Page type | Trigger words to start `notes` with |
  |-----------|-------------------------------------|
  | list      | list, browse, filter, "all {Entity}s", search |
  | detail    | view, detail, manage, "single {Entity}" |
  | form      | create, add, new, register |
  | dashboard | dashboard, overview, summary |
  | settings  | settings, configuration, preferences |

  Example: `"List and filter all Profiles; each row opens the profile detail."`

- `components[]` MUST be **specific, named components** (e.g. `ProfilesTable`,
  `StatusFilterDropdown`, `CreateProfileModal`) — including any modal or form present on the
  screen. Generic entries like `"Table"` or `"Button"` provide no signal.

---

## Schema Evolution

When the schema changes:
1. Bump `spec-version` (semver: patch for additive, minor for new required fields, major for breaking).
2. Update this file.
3. Update `scripts/validate-spec.mjs` (`SUPPORTED_SCHEMA_VERSIONS`) to accept both old and new versions.
4. Add migration note in the spec body `## Schema History` section.

Current version `1.1` — additive over `1.0` (added optional `context.non-goals[]`). `1.0` specs
remain valid; the validator accepts both.
