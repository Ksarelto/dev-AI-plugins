# Spec Schema — YAML Front Matter

**Version**: 2.0
**Written by**: `spec-synthesizer` (Station 6), `merge-spec.mjs` (continue runs)
**Validated by**: `scripts/validate-spec.mjs` (Station 7 and publish)
**Read by**: every downstream kit — see `consumer-contract.md` for who reads which section and in what order

---

## Design rules

1. **The YAML is the contract.** Everything a build kit needs is in the front matter. The Markdown
   body holds only narrative that cannot live in YAML (problem, solution overview, flows, rationale).
2. **One home per fact.** Each requirement, rule, decision, assumption, and question is written
   once, in its own section, and referenced by id everywhere else. Never restate an item in a second
   section. A risk that depends on an open question says `Q-001`; it does not repeat the question.
3. **Stated is not assumed.** A rule that appears in `.spec/context/` is a `requirements[]` entry
   with `source: stated`. `assumptions[]` holds only what the pipeline inferred.
4. **Everything is addressable.** Every list item has an id (or, for entities, a unique `name`).
   Downstream kits pass ids, not prose.
5. **Human views are generated, not written.** Tables (coverage, permissions, API list, screen
   inventory, delivery checklist) come from `scripts/render-spec-views.mjs` into `spec.views.md`.
   The synthesizer never hand-writes them.

---

## Id kinds

| Prefix | Section | Prefix | Section |
|--------|---------|--------|---------|
| `REQ-` | `requirements[]` | `SCR-` | `ui-surface.screens[]` |
| `KPI-` | `context.success-metrics[]` | `INT-` | `ui-surface.interactions[]` |
| `PERM-` | `permissions[]` | `API-` | `api-surface.endpoints[]` |
| `BR-` | `business-rules[]` | `AGT-` / `TOOL-` / `KB-` | `agent-surface.*` |
| `SM-` | `state-machines[]` | `NTF-` | `notifications[]` |
| `US-` | `user-stories[]` | `RISK-` | `risks[]` |
| `AC-` | `acceptance-criteria[]` | `ASSM-` | `assumptions[]` |
| `SL-` | `delivery-plan.slices[]` | `Q-` / `DEC-` | `open-questions[]` / `traceability.decisions[]` |

Ids are 3-digit zero-padded, sequential, never reused. Continue runs take the next free number from
`artifacts/prior-index.json` (`next`). Entities and roles are referenced by `name`.

---

## Full schema

```yaml
---
spec-version: "2.0"                      # Schema version — see Schema Evolution
timecode: "YYYYMMDD-HHmmss"              # Pipeline run timestamp
type: feature                            # feature | app | domain | integration
status: reviewing                        # See Status Lifecycle

metadata:
  slug: ""                               # kebab-case app slug
  title: ""
  created: "YYYY-MM-DDTHH:mm:ssZ"
  updated: "YYYY-MM-DDTHH:mm:ssZ"
  source-files: []                       # .spec/context/ files consumed
  pipeline-rounds: { clarification: 0, completeness: 0, review: 0 }

context:
  problem: ""                            # 1–3 sentences
  goal: ""                               # what success looks like
  target-users: []                       # role names — each must exist in roles[]
  existing-system: ""                    # "None — greenfield" when applicable
  constraints: []                        # binding technical / legal / organisational limits
  non-goals: []                          # explicit "not doing" list
  success-metrics:                       # measurable outcomes from the source (omit if none stated)
    - id: KPI-001
      metric: ""                         # e.g. "Distinct items listed"
      target: ""                         # e.g. ">= 40"
      window: ""                         # e.g. "first 3 months"

glossary:                                # domain words the build must use consistently
  - term: ""
    meaning: ""

requirements:                            # atomic register — one rule or behaviour per entry
  - id: REQ-001
    text: ""                             # one testable statement, in the source's words
    kind: behavior                       # behavior | rule | constraint | nfr | data | copy | metric
    source: stated                       # stated | answered — inferences live ONLY in assumptions[]
    source-ref: "requirements.md#L264"   # file#Lline for stated; "qa-log Round N Qk" for answered
    priority: must                       # must | should | could | wont
    scope: in                            # in | non-goal | deferred
    covered-by: [AC-011, BR-001]         # ids that implement/test it (AC, BR, SM, NTF, PERM, SCR, API)
                                         # or "non-functional.<category>"

roles:
  - name: ""                             # e.g. "Resident" — referenced by name everywhere
    description: ""

permissions:                             # who may do what; every role not listed is denied
  - id: PERM-001
    action: ""                           # e.g. "Hide or retire any listing"
    allow: []                            # role names, unconditional
    conditional:                         # role name → condition text
      Resident: "only for listings they own"
    denied-behavior: ""                  # what a denied caller sees (optional; default 403 + plain message)
    refs: []                             # API / SCR ids enforcing it
    ac-refs: []                          # ACs proving allow + deny (kind: permission)

entities:
  - name: ""                             # PascalCase, unique
    description: ""                      # what the record means in the domain (not the field name)
    retention: ""                        # how long records are kept / summarised / removed (optional)
    fields:
      - name: ""
        type: ""                         # TypeScript type; enums are <Entity><Field> e.g. ListingStatus
        required: true
        description: ""                  # meaning + constraints; never just the field name
        values: []                       # enum members, required when type is an enum
        derived: false                   # true = computed, not stored (e.g. a display status)
        unique: false                    # optional
    relationships:
      - entity: ""
        type: many-to-one                # one-to-one | one-to-many | many-to-one | many-to-many
        via: ""                          # FK field on this entity (many-to-one / one-to-one), optional
        description: ""

state-machines:                          # one per lifecycle field with 2+ values
  - id: SM-001
    entity: ""                           # entity name
    field: status                        # field on that entity
    initial: ""                          # a value of that field
    states: []                           # must equal the field's values
    transitions:
      - from: ""                         # a state, or "*" for any
        to: ""
        trigger: ""                      # the event, in plain words
        actor: ""                        # role name, list of role names, or "system" for timers / cascades
        api-ref: ""                      # endpoint that causes it (required unless actor is system)
        after: ""                        # ISO-8601 duration for timers (actor: system), e.g. PT24H
        guard: []                        # BR ids or short condition text
        effects: []                      # NTF ids or short side-effect text
        ac-refs: []

business-rules:                          # invariants, limits, timers, eligibility
  - id: BR-001
    name: ""                             # kebab-case handle, e.g. active-borrow-cap
    rule: ""                             # one statement
    params: {}                           # machine-readable numbers/durations, e.g. { max: 3 }, { window: PT12H }
    applies-to: []                       # entity names / API ids
    on-violation: ""                     # what the user sees
    ac-refs: []                          # ≥1 AC that proves it

user-stories:
  - id: US-001
    as: ""                               # a role name
    i-want: ""                           # ONE capability (split stories that need "and")
    so-that: ""
    priority: must                       # must | should | could | wont

acceptance-criteria:
  - id: AC-001
    story-ref: US-001
    kind: happy                          # happy | error | edge | permission | nfr
    given: ""
    when: ""
    then: ""                             # observable outcome, never an implementation detail
    testable: true

api-surface:
  endpoints:                             # ONE list for reads and writes (no `mutations`)
    - id: API-001
      method: GET                        # GET | POST | PUT | PATCH | DELETE
      path: ""                           # /v1/resources/{id} — one spelling per resource
      description: ""
      auth-required: true                # false for public calls such as starting a session
      roles: []                          # role names allowed (omit = any signed-in role)
      story-refs: []
      request:
        path-params: {}
        query-params: {}
        body: {}
      response:
        success: { status: 200, schema: "" }
        errors:
          - status: 409
            code: ""                     # stable machine code, e.g. ACTIVE_BORROW_CAP
            message: ""                  # user-facing text
            when: ""                     # condition or BR id

agent-surface:                           # optional — omit when the product has no AI
  agents:
    - id: AGT-001
      name: ""
      kind: conversational               # conversational | rag | tool-using | graph
      runtime: openai-agents             # openai-agents | langgraph
      description: ""
      tool-refs: []
      knowledge-base-refs: []
      embed: none                        # none | backend-route | frontend-widget
  tools:
    - id: TOOL-001
      name: ""
      description: ""
      api-ref: ""
  knowledge-bases:
    - id: KB-001
      name: ""
      source: ""
      retrieval: hybrid                  # hybrid | dense | keyword

ui-surface:
  screens:
    - id: SCR-001
      title: ""
      route: ""
      page-type: list                    # list | detail | form | dashboard | settings | other
      primary-entity: ""                 # entity name, or "" for pure-content pages
      roles: []                          # who can open it (omit = any signed-in role)
      story-refs: []
      api-refs: []                       # endpoints the screen calls
      states: [loading, empty, error, success]   # all four on data screens
      components: []                     # specific named components, incl. modals/forms
      notes: ""                          # action-oriented one-liner naming the primary entity
  interactions:
    - id: INT-001
      trigger: ""
      response: ""
      screen-ref: SCR-001
      target-screen: ""                  # SCR id when the interaction navigates (optional)

notifications:
  - id: NTF-001
    event: ""                            # what happened
    recipients: []                       # role names or party words (e.g. lender, borrower)
    channels: [in-app]                   # in-app | email | sms | push | external
    mandatory: false                     # true = recipient cannot turn it off
    timing: ""                           # "immediately", "evening 18:00–20:00 local, once per day", …
    copy: ""                             # example message in the product's voice
    ac-refs: []

non-functional:
  performance: []                        # measurable targets
  accessibility: []
  security: []
  scalability: []
  observability: []

boundaries:                              # guardrails for build agents
  always: []
  ask-first: []
  never: []

delivery-plan:                           # the build order downstream kits follow
  strategy: ""                           # one paragraph: why this order
  slices:
    - id: SL-001
      title: ""                          # becomes the feature / task name downstream
      goal: ""                           # user-visible outcome when the slice is done
      depends-on: []                     # earlier SL ids only
      tracks: [backend, frontend]        # backend | frontend | agent — kits that must act
      story-refs: []                     # every must story belongs to exactly one slice
      entity-refs: []
      api-refs: []
      screen-refs: []
      agent-refs: []                     # AGT / TOOL / KB ids
      rule-refs: []                      # BR ids
      state-machine-refs: []             # SM ids
      notification-refs: []              # NTF ids
      permission-refs: []                # PERM ids
      steps:                             # ordered build guidance, one entry per track step
        - track: backend
          do: ""                         # imperative, one sentence
          refs: []                       # ids/entity names this step touches
      done-when: []                      # AC ids that must pass to call the slice done

risks:
  - id: RISK-001
    description: ""
    likelihood: low                      # low | medium | high
    impact: low
    mitigation: ""                       # may reference Q / ASSM / DEC ids instead of restating them

assumptions:                             # ONLY inferences — never a stated rule
  - id: ASSM-001
    description: ""                      # one claim per assumption
    source: enricher                     # analyst | enricher
    confidence: medium                   # low | medium | high
    requires-confirmation: true
    affects: []                          # ids that depend on it

open-questions:
  - id: Q-001
    question: ""
    raised-by: analyst                   # analyst | enricher | user | review
    blocking: false                      # true = a slice cannot start until answered
    affects: []                          # ids / slices blocked
    status: open                         # open | resolved
    answer: ""

traceability:
  decisions:
    - id: DEC-001
      decision: ""
      rationale: ""
      alternatives-considered: []
      source: qa                         # qa | context | review — "context" for decisions the source already made
      affects: []
---
```

Optional sections may be omitted when empty: `glossary`, `context.success-metrics`,
`agent-surface`, `notifications`, `state-machines` (only when no entity has a lifecycle field),
`api-surface` (UI-only / local-only products — say so in `context.constraints`).

---

## Status Lifecycle

```
draft → (awaiting-clarification ⇄ analyzing) → enriching → reviewing → approved → building → done
                                                            └── changes-requested ──┘
```

The synthesizer emits `reviewing`. Only `publish-spec.mjs` (after explicit human approval) sets
`approved`. Downstream kits may set `building` / `done`.

---

## Validation Rules (enforced by `validate-spec.mjs`)

Errors block Station 7 and publish. Warnings are surfaced in the Station 9 review packet.

### Structure (all versions)

| Rule | Code |
|------|------|
| `spec-version` ∈ `1.0`, `1.1`, `1.2`, `2.0` | `SCHEMA_VERSION_INVALID` |
| `timecode` matches `\d{8}-\d{6}` | `TIMECODE_FORMAT_INVALID` |
| `type`, `status` valid | `TYPE_INVALID`, `STATUS_INVALID` |
| `metadata.slug` kebab-case | `SLUG_FORMAT_INVALID` |
| Every id matches its prefix and is unique across the spec | `ID_FORMAT_INVALID`, `DUPLICATE_ID` |
| `acceptance-criteria[].story-ref` resolves | `BROKEN_STORY_REF` |
| `testable` is boolean | `TESTABLE_FLAG_MISSING` |
| HTTP method valid | `HTTP_METHOD_INVALID` |
| `non-functional.performance` and `.accessibility` non-empty | `NFR_INCOMPLETE` |
| Agent / tool / KB refs resolve | `BROKEN_TOOL_REF`, `BROKEN_KB_REF`, `BROKEN_API_REF` |

### Contract quality (`2.0`)

| Rule | Code | Level |
|------|------|-------|
| `api-surface.mutations` is absent — one `endpoints` list | `MUTATIONS_DEPRECATED` | error |
| No two endpoints share `method + path`; no singular/plural spelling of the same path | `DUPLICATE_ENDPOINT` | error |
| Every id referenced anywhere (`covered-by`, `*-refs`, `refs`, `affects`, `guard`, `effects`, `done-when`) resolves | `BROKEN_REF` | error |
| Every role name used (`as`, `allow`, `conditional`, `roles`, `actor`, `target-users`) exists in `roles[]` | `UNKNOWN_ROLE` | error |
| Relationship `type` is one of the four values; `entity` exists | `RELATIONSHIP_INVALID` | error |
| Field descriptions are not placeholders (`Field x.`, empty, or equal to the field name) | `PLACEHOLDER_DESCRIPTION` | error |
| Enum-typed fields (`…Status`, or any field with `values`) list `values` | `ENUM_VALUES_MISSING` | error |
| A lifecycle field with 2+ values has a state machine; its `states` equal the field `values`; transitions use known states | `STATE_MACHINE_MISSING`, `STATE_MACHINE_INVALID` | error |
| Every `must` + `scope: in` requirement has non-empty `covered-by` (`metric` → a `KPI-*`) | `REQUIREMENT_UNCOVERED` | error |
| `requirements[].source` is `stated` or `answered` (an inference is an assumption, never a requirement) | `REQUIREMENT_INVALID` | error |
| Every `must` story has ≥1 `happy` AC and ≥1 non-happy AC | `STORY_UNHAPPY_PATH_MISSING` | error |
| Every business rule has ≥1 `ac-refs` | `RULE_UNTESTED` | error |
| Every `must` story is in exactly one slice; `depends-on` points to earlier slices only | `SLICE_STORY_UNASSIGNED`, `SLICE_STORY_DUPLICATED`, `SLICE_ORDER_INVALID` | error |
| Every screen and endpoint belongs to some slice | `SLICE_COVERAGE_GAP` | warning |
| Slice `tracks` match its refs (API → backend, SCR → frontend, AGT → agent) | `SLICE_TRACK_MISMATCH` | warning |
| An assumption restates a requirement, an open question restates an assumption, or two business rules say the same thing | `DUPLICATE_STATEMENT` | warning |
| A human-triggered transition names no `api-ref` | `TRANSITION_NO_ENDPOINT` | warning |
| A permission has no `ac-refs` | `PERMISSION_UNTESTED` | warning |
| An assumption has empty `affects` | `ASSUMPTION_UNLINKED` | warning |
| A slice lists a permission whose endpoints another slice builds | `SLICE_PERMISSION_MISPLACED` | warning |
| A slice lists a business rule but builds none of its `applies-to` targets (entities, endpoints, its screens' primary entities and api-refs) — the slice that builds them will not implement it | `SLICE_RULE_MISPLACED` | warning |
| `i-want` bundles 3+ capabilities | `STORY_TOO_BIG` | warning |
| Body contains generated-view sections (`## Data Model`, `## API Endpoints Summary`, `## Screen Inventory`, `## Acceptance Criteria Coverage Map`, `## Key Assumptions`) | `BODY_DUPLICATES_YAML` | error |
| Screen lacks `page-type` / `primary-entity` | `SCREEN_UNTYPED` | warning |

`1.x` specs get the structure checks plus warnings for the 2.0 rules, so old specs still validate and
downstream kits still read them (see `consumer-contract.md` § Legacy specs).

---

## Minimum Viable Spec (required for `status: approved`)

- `metadata.title`, `context.problem`, `context.goal` non-empty
- `context.target-users` ≥ 1 and `roles` ≥ 1 (`2.0`)
- `user-stories` ≥ 1, each with ≥ 1 acceptance criterion
- `non-functional.accessibility` and `non-functional.security` ≥ 1
- `requirements` ≥ 1 (`2.0`) — `1.x`: `traceability.source-requirements` ≥ 1
- `delivery-plan.slices` ≥ 1 (`2.0`)

---

## Prototype / HTML consumability

`html-generator-kit` renders one page per screen and one table column / form field per entity field.

- Every entity on a screen has a complete field list with real TypeScript types — never just
  `id` + `name`.
- Enum fields list `values`. For `1.x` readers, also end the description with
  `One of: A, B, C` (the synthesizer writes both).
- Every screen sets `page-type` and `primary-entity` explicitly. `notes` still starts with a
  page-type word (list / view / create / dashboard / settings) for older readers.
- `components[]` are specific named components (`ProfilesTable`, `CreateProfileModal`), never
  `Table` or `Button`.
- `derived: true` fields are shown, never rendered as form inputs.

---

## Schema Evolution

1. Bump `spec-version`: minor for additive optional fields, major for removed or renamed fields.
2. Update this file, `templates/spec-frontmatter.yaml`, `scripts/validate-spec.mjs`
   (`SUPPORTED_SCHEMA_VERSIONS`), `scripts/merge-spec.mjs`, and `consumer-contract.md`.
3. Keep readers tolerant of the previous major version.

| Version | Change |
|---------|--------|
| 1.0 | Initial hybrid spec |
| 1.1 | `context.non-goals[]` |
| 1.2 | optional `agent-surface` |
| 2.0 | `requirements`, `roles`, `permissions`, `business-rules`, `state-machines`, `notifications`, `glossary`, `context.success-metrics`, `boundaries`, `delivery-plan`; `many-to-one`; enum `values`; screen `page-type` / `primary-entity`; AC `kind`; `api-surface.mutations` removed (merged into `endpoints`); `traceability.source-requirements` replaced by `requirements[].source-ref`; generated views moved out of the body |
