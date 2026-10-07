---
# SHAPE REFERENCE — an excerpt, not a target length.
# Every section a 2.0 spec may carry appears here exactly once or twice so you can see its field
# set and how ids cross-reference. A real spec has as many entries per section as the source
# requires: all of them. Match the shape and the level of detail per entry, never the entry count.
spec-version: "2.0"
timecode: "20260101-000001"
type: app
status: approved
metadata:
  slug: shelf-share
  title: Shelf Share
  created: "2026-01-01T00:00:00Z"
  updated: "2026-01-01T00:00:00Z"
  source-files: [requirements.md]
  pipeline-rounds: { clarification: 1, completeness: 0, review: 1 }
context:
  problem: Residents of one building lend tools through a group chat, so nobody can tell what is free, requests vanish, and lenders are chased for answers.
  goal: Residents see an honest status for every item, ask and answer in one place, and nothing waits longer than a day for an answer.
  target-users: [Resident, Manager]
  existing-system: None — greenfield
  constraints:
    - One building only; accounts are created by the manager, never by self-signup.
  non-goals:
    - Payments, deposits, or late fees
  success-metrics:
    - id: KPI-001
      metric: Distinct items listed
      target: ">= 40"
      window: first 3 months
glossary:
  - term: Hold
    meaning: The period after a lender accepts, when the item is promised to one borrower.
requirements:
  - id: REQ-001
    text: Only admitted residents and the manager can see the catalogue.
    kind: rule
    source: stated
    source-ref: requirements.md#L12
    priority: must
    scope: in
    covered-by: [PERM-001, AC-002]
  - id: REQ-002
    text: Every item shows its status as a word (Free, Promised, Paused).
    kind: behavior
    source: stated
    source-ref: requirements.md#L20
    priority: must
    scope: in
    covered-by: [AC-001]
  - id: REQ-003
    text: A resident may have at most three active borrows.
    kind: rule
    source: answered
    source-ref: qa-log.md#Q-002
    priority: must
    scope: in
    covered-by: [BR-001]
roles:
  - name: Resident
    description: An adult who lives in the building and was admitted by the manager.
  - name: Manager
    description: The building manager; admits residents and looks after the catalogue.
  - name: Outsider
    description: Anyone without access; sees only the private-register page.
permissions:
  - id: PERM-001
    action: Browse the catalogue
    allow: [Resident, Manager]
    denied-behavior: Outsiders see the private-register page, never item names or units.
    refs: [API-001, SCR-001]
    ac-refs: [AC-002]
entities:
  - name: Listing
    description: One item a resident offers to lend.
    retention: Kept while active; retired listings stay on past borrows by name.
    fields:
      - name: id
        type: string
        required: true
        description: Stable identifier, never reused
      - name: name
        type: string
        required: true
        description: Item name as other residents see it, e.g. "cordless drill"
      - name: status
        type: ListingStatus
        required: true
        values: [FREE, PAUSED, RETIRED]
        description: Lifecycle value from SM-001
    derived:
      - name: displayStatus
        from: status plus any open request
        description: The status word shown in the catalogue (REQ-002)
state-machines:
  - id: SM-001
    entity: Listing
    field: status
    initial: FREE
    states: [FREE, PAUSED, RETIRED]
    transitions:
      - from: FREE
        to: PAUSED
        trigger: Lender pauses the listing
        actor: Resident
        api-ref: API-003
        ac-refs: [AC-003]
      - from: PAUSED
        to: FREE
        trigger: Lender resumes the listing
        actor: Resident
        api-ref: API-003
        ac-refs: [AC-003]
      - from: FREE
        to: RETIRED
        trigger: Manager or lender retires the listing for good
        actor: Manager
        api-ref: API-003
        ac-refs: [AC-003]
business-rules:
  - id: BR-001
    name: active-borrow-cap
    rule: A resident may have at most 3 active borrows (promised or out).
    params: { max: 3 }
    applies-to: [Listing, API-002]
    on-violation: Request refused; say the three-borrow limit is in the way and that returning an item frees a place.
    ac-refs: [AC-004]
user-stories:
  - id: US-001
    as: Resident
    i-want: see every item in the building with an honest status
    so-that: I know what I can borrow without asking in the chat
    priority: must
  - id: US-002
    as: Resident
    i-want: list an item I own
    so-that: neighbours can borrow it instead of buying one
    priority: must
acceptance-criteria:
  - id: AC-001
    story-ref: US-001
    kind: happy
    given: a signed-in resident and a catalogue with items
    when: they open the catalogue
    then: each item shows its name in full and a status word (Free, Promised, Paused)
    testable: true
  - id: AC-002
    story-ref: US-001
    kind: permission
    given: a person who has not been admitted
    when: they open any catalogue address
    then: they see the private-register page and no item names, photos, or units
    testable: true
  - id: AC-003
    story-ref: US-002
    kind: happy
    given: a resident who owns a Free listing
    when: they pause it
    then: the catalogue shows Paused and no new request can be sent
    testable: true
  - id: AC-004
    story-ref: US-002
    kind: error
    given: a resident with three active borrows
    when: they request a fourth item
    then: the request is refused and names the three-borrow limit
    testable: true
api-surface:
  endpoints:
    - id: API-001
      method: GET
      path: /v1/listings
      description: List the catalogue with each item's display status
      auth-required: true
      roles: [Resident, Manager]
      story-refs: [US-001]
      request: { path-params: {}, query-params: { q: string }, body: {} }
      response:
        success: { status: 200, schema: "Listing[]" }
        errors:
          - { status: 401, code: NOT_ADMITTED, message: This is a private building register., when: no session }
    - id: API-002
      method: POST
      path: /v1/listings
      description: Create a listing
      auth-required: true
      roles: [Resident]
      story-refs: [US-002]
      request: { path-params: {}, query-params: {}, body: { name: string, description: string } }
      response:
        success: { status: 201, schema: Listing }
        errors:
          - { status: 422, code: LISTING_INCOMPLETE, message: "Add a description before listing.", when: a required field is missing }
    - id: API-003
      method: POST
      path: /v1/listings/:id/pause
      description: Pause a listing the caller owns
      auth-required: true
      roles: [Resident]
      story-refs: [US-002]
      request: { path-params: { id: string }, query-params: {}, body: {} }
      response:
        success: { status: 200, schema: Listing }
        errors:
          - { status: 403, code: NOT_THE_LENDER, message: Only the lender can pause this item., when: caller does not own the listing }
ui-surface:
  screens:
    - id: SCR-001
      title: Catalogue
      route: /catalogue
      page-type: list
      primary-entity: Listing
      roles: [Resident, Manager]
      story-refs: [US-001]
      api-refs: [API-001]
      states: [loading, empty, error, success]
      components: [CatalogueSearchField, CatalogueList, ListingStatusWord, EmptyCatalogueInvitation]
      notes: List and search all Listings in the building; each row opens the listing detail.
    - id: SCR-002
      title: List an item
      route: /listings/new
      page-type: form
      primary-entity: Listing
      roles: [Resident]
      story-refs: [US-002]
      api-refs: [API-002]
      states: [loading, empty, error, success]
      components: [ListingCreateForm, ListingValidationSummary]
      notes: Create a new Listing with the required fields.
  interactions:
    - id: INT-001
      trigger: taps an item row
      response: opens the listing detail
      screen-ref: SCR-001
      target-screen: SCR-002
notifications:
  - id: NTF-001
    event: Someone requests my item
    recipients: [lender]
    channels: [in-app]
    mandatory: false
    timing: immediately
    copy: Marta in 4B asked for the drill, Saturday 10:00–12:00, back by Sunday 18:00.
    ac-refs: [AC-001]
non-functional:
  performance: [Catalogue status visible in under 1 s at p95 on a phone]
  accessibility: [WCAG 2.2 AA on catalogue and listing flows; status shown as words, not colour alone]
  security: [Every call except the private-register page needs an admitted session]
  scalability: [About 100 items and 150 residents]
  observability: [Manager can see who listed, paused, or retired an item, and when]
boundaries:
  always: [Show status as words]
  ask-first: [Adding a notification channel outside the app]
  never: [Take payments, Add a waiting list]
delivery-plan:
  strategy: Access and the catalogue first, so every later slice has signed-in residents and items to borrow.
  slices:
    - id: SL-001
      title: Access and catalogue
      goal: The manager admits residents, residents list items, and everyone admitted sees an honest catalogue.
      depends-on: []
      tracks: [backend, frontend]
      story-refs: [US-001, US-002]
      entity-refs: [Listing]
      api-refs: [API-001, API-002, API-003]
      screen-refs: [SCR-001, SCR-002]
      agent-refs: []
      rule-refs: [BR-001]
      state-machine-refs: [SM-001]
      notification-refs: [NTF-001]
      permission-refs: [PERM-001]
      done-when: [AC-001, AC-002, AC-003, AC-004]
      steps:
        - track: backend
          do: Model Listing with its SM-001 lifecycle and the derived displayStatus, enforcing BR-001 on request.
          refs: [Listing, SM-001, BR-001]
        - track: frontend
          do: Build the private-register gate and the catalogue with all four states.
          refs: [SCR-001, PERM-001]
risks:
  - id: RISK-001
    description: Two residents request the same free item at the same moment.
    likelihood: medium
    impact: medium
    mitigation: At most one open request per listing; the second caller gets the item's current status.
assumptions:
  - id: ASSM-001
    description: The pause notice is shown in the app the next time each person opens it; no outside channel in v1.
    source: enricher
    confidence: medium
    requires-confirmation: true
    affects: [NTF-001]
open-questions:
  - id: Q-001
    question: Should the manager be able to un-retire a listing, or must the lender list it again?
    raised-by: analyst
    blocking: false
    affects: [US-002]
    status: open
    answer: ""
traceability:
  decisions:
    - id: DEC-001
      decision: Pausing a listing hides it from new requests but keeps it in the catalogue as Paused.
      rationale: Removing it entirely would make neighbours think the item was gone for good.
      alternatives-considered: [Hide paused items — rejected, residents would re-ask in the chat]
      source: qa
      affects: [SM-001, AC-003]
---

# Shelf Share

## Problem Context

Residents already lend drills and folding chairs through the building chat. Nobody can tell what is free, requests scroll away, and lenders get chased for answers.

## Solution Overview

Admitted residents see one catalogue with an honest status for each item. The build starts with access and the catalogue (SL-001).

## User Flows

### Flow 1: List and pause an item (US-002)

**Actor**: Resident
**Precondition**: signed in and admitted (PERM-001)

**Happy path**
1. The resident fills in a name and description and submits (AC-003 precondition).
2. The item appears in the catalogue as Free.
3. The lender pauses it; the catalogue shows Paused and no new request can be sent (AC-003, SM-001).

**Error path — incomplete listing** (API-002)
1. A required field is missing.
2. The form says "Add a description before listing." and nothing is created.

## Design Rationale

### Paused stays visible (DEC-001)

Hiding a paused item would send residents back to the chat to ask about it, which is the problem this replaces.

## Schema History

| Version | Date | Change |
|---------|------|--------|
| 2.0 | 2026-01-01 | Initial spec |
