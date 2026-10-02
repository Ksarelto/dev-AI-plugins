---
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
    - No money changes hands.
  non-goals:
    - Payments, deposits, or late fees
    - Waiting lists or queues
  success-metrics:
    - id: KPI-001
      metric: Distinct items listed
      target: ">= 40"
      window: first 3 months
glossary:
  - term: Hold
    meaning: The period after a lender accepts, when the item is promised to one borrower.
  - term: Lapse
    meaning: A request that closes because the lender did not answer within 24 hours.
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
    text: Every item shows its status as a word (Free, Asked for, Promised, Out, Paused).
    kind: behavior
    source: stated
    source-ref: requirements.md#L20
    priority: must
    scope: in
    covered-by: [AC-001]
  - id: REQ-003
    text: A listing needs a name, a description, and a longest borrow length before it is shown.
    kind: data
    source: stated
    source-ref: requirements.md#L31
    priority: must
    scope: in
    covered-by: [AC-003, AC-004]
  - id: REQ-004
    text: A resident may have at most three active borrows.
    kind: rule
    source: stated
    source-ref: requirements.md#L40
    priority: must
    scope: in
    covered-by: [BR-001]
  - id: REQ-005
    text: A resident cannot request their own item.
    kind: rule
    source: stated
    source-ref: requirements.md#L41
    priority: must
    scope: in
    covered-by: [BR-003]
  - id: REQ-006
    text: The lender must answer within 24 hours or the request lapses and both people are told.
    kind: rule
    source: stated
    source-ref: requirements.md#L47
    priority: must
    scope: in
    covered-by: [BR-002, NTF-003]
  - id: REQ-007
    text: The lender may accept or decline; the borrower is told either way.
    kind: behavior
    source: stated
    source-ref: requirements.md#L45
    priority: must
    scope: in
    covered-by: [AC-008, AC-013, AC-016, NTF-002]
  - id: REQ-008
    text: The manager may retire a listing; retired items leave the catalogue but keep their history.
    kind: behavior
    source: stated
    source-ref: requirements.md#L58
    priority: should
    scope: in
    covered-by: [AC-010]
  - id: REQ-009
    text: The manager admits residents and ends access on move-out.
    kind: behavior
    source: stated
    source-ref: requirements.md#L8
    priority: must
    scope: in
    covered-by: [AC-011, AC-012]
  - id: REQ-010
    text: The borrower may cancel a waiting request.
    kind: behavior
    source: stated
    source-ref: requirements.md#L50
    priority: must
    scope: in
    covered-by: [AC-014]
  - id: REQ-011
    text: Catalogue status is visible in under one second on a phone.
    kind: nfr
    source: stated
    source-ref: requirements.md#L70
    priority: must
    scope: in
    covered-by: [non-functional.performance]
  - id: REQ-012
    text: A waiting list for popular items.
    kind: behavior
    source: stated
    source-ref: requirements.md#L80
    priority: wont
    scope: non-goal
    covered-by: []
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
  - id: PERM-002
    action: Retire any listing
    allow: [Manager]
    refs: [API-003]
    ac-refs: [AC-010]
  - id: PERM-003
    action: Answer a request
    conditional:
      Resident: only as the lender of that item
    refs: [API-005, SCR-004]
    ac-refs: [AC-016]
  - id: PERM-004
    action: Admit a resident or end their access
    allow: [Manager]
    denied-behavior: Refused in plain words; residents are told to ask the manager.
    refs: [API-008, API-009, SCR-005]
    ac-refs: [AC-012]
entities:
  - name: Resident
    description: One admitted adult. A household with two adults has two residents.
    retention: Kept while active; ended residents stay on past borrows by display name.
    fields:
      - name: id
        type: string
        required: true
        description: Stable identifier, never reused
      - name: displayName
        type: string
        required: true
        description: First name plus unit as other residents see it, e.g. "Marta 4B"
      - name: unitLabel
        type: string
        required: true
        description: Home number the manager already uses, e.g. 4B
      - name: role
        type: ResidentRole
        required: true
        values: [RESIDENT, MANAGER]
        description: What this person may do. One of RESIDENT, MANAGER
      - name: status
        type: ResidentStatus
        required: true
        values: [ACTIVE, ENDED]
        description: Access lifecycle; see SM-001. One of ACTIVE, ENDED
    relationships:
      - entity: Listing
        type: one-to-many
        description: Items this resident lends
  - name: Listing
    description: One lendable item in the catalogue.
    retention: Retired listings are hidden from residents and kept 12 months for the manager.
    fields:
      - name: id
        type: string
        required: true
        description: Stable identifier, never reused
      - name: lenderId
        type: string
        required: true
        description: The Resident who owns and lends the item
      - name: name
        type: string
        required: true
        description: Short name a neighbour would recognise, shown in full (never truncated)
      - name: description
        type: string
        required: true
        description: What is included and what complete means
      - name: longestBorrowLength
        type: BorrowLength
        required: true
        values: [SAME_DAY, ONE_NIGHT, ONE_WEEK]
        description: Longest period a request may ask for. One of SAME_DAY, ONE_NIGHT, ONE_WEEK
      - name: status
        type: ListingStatus
        required: true
        values: [FREE, PAUSED, RETIRED]
        description: Stored listing lifecycle; see SM-002. One of FREE, PAUSED, RETIRED
      - name: displayStatus
        type: ListingDisplayStatus
        required: true
        derived: true
        values: [FREE, ASKED_FOR, PROMISED, OUT, PAUSED]
        description: Word shown in the catalogue, computed from status and the open request. One of FREE, ASKED_FOR, PROMISED, OUT, PAUSED
    relationships:
      - entity: Resident
        type: many-to-one
        via: lenderId
        description: Each listing has exactly one lender
      - entity: BorrowRequest
        type: one-to-many
        description: Requests made for this item
  - name: BorrowRequest
    description: A borrower's ask for one listing, from request until return or close.
    retention: Kept 12 months after it closes, then reduced to item, two units, and dates.
    fields:
      - name: id
        type: string
        required: true
        description: Stable identifier, never reused
      - name: listingId
        type: string
        required: true
        description: The Listing asked for; at most one open request per listing
      - name: borrowerId
        type: string
        required: true
        description: The Resident asking; never the lender of the listing (BR-003)
      - name: collectFrom
        type: string
        required: true
        description: Start of the collect window, ISO-8601 local building time
      - name: returnBy
        type: string
        required: true
        description: Agreed return time; after collectFrom and within the listing's longest length
      - name: answerBy
        type: string
        required: true
        description: Created time plus 24 hours (BR-002)
      - name: status
        type: BorrowStatus
        required: true
        values: [WAITING, PROMISED, OUT, RETURNED, DECLINED, LAPSED, CANCELLED]
        description: Request lifecycle; see SM-003. One of WAITING, PROMISED, OUT, RETURNED, DECLINED, LAPSED, CANCELLED
    relationships:
      - entity: Listing
        type: many-to-one
        via: listingId
        description: The item asked for
      - entity: Resident
        type: many-to-one
        via: borrowerId
        description: The borrower
state-machines:
  - id: SM-001
    entity: Resident
    field: status
    initial: ACTIVE
    states: [ACTIVE, ENDED]
    transitions:
      - from: ACTIVE
        to: ENDED
        trigger: Manager ends access on move-out
        actor: Manager
        api-ref: API-009
        ac-refs: [AC-012]
  - id: SM-002
    entity: Listing
    field: status
    initial: FREE
    states: [FREE, PAUSED, RETIRED]
    transitions:
      - from: FREE
        to: PAUSED
        trigger: Lender pauses the listing
        actor: Resident
        api-ref: API-010
        ac-refs: [AC-003]
      - from: PAUSED
        to: FREE
        trigger: Lender resumes the listing
        actor: Resident
        api-ref: API-010
        ac-refs: [AC-003]
      - from: "*"
        to: RETIRED
        trigger: Manager retires the listing
        actor: Manager
        api-ref: API-003
        ac-refs: [AC-010]
  - id: SM-003
    entity: BorrowRequest
    field: status
    initial: WAITING
    states: [WAITING, PROMISED, OUT, RETURNED, DECLINED, LAPSED, CANCELLED]
    transitions:
      - from: WAITING
        to: PROMISED
        trigger: Lender accepts
        actor: Resident
        api-ref: API-005
        effects: [NTF-002]
        ac-refs: [AC-008]
      - from: WAITING
        to: DECLINED
        trigger: Lender declines
        actor: Resident
        api-ref: API-005
        effects: [NTF-002]
        ac-refs: [AC-013]
      - from: WAITING
        to: LAPSED
        trigger: No answer within 24 hours
        actor: system
        after: PT24H
        guard: [BR-002]
        effects: [NTF-003]
        ac-refs: [AC-009]
      - from: WAITING
        to: CANCELLED
        trigger: Borrower cancels
        actor: Resident
        api-ref: API-006
        ac-refs: [AC-014]
      - from: PROMISED
        to: OUT
        trigger: Both parties confirm collect
        actor: Resident
        api-ref: API-007
        ac-refs: [AC-015]
      - from: OUT
        to: RETURNED
        trigger: Both parties confirm return
        actor: Resident
        api-ref: API-007
        ac-refs: [AC-015]
business-rules:
  - id: BR-001
    name: active-borrow-cap
    rule: A resident may have at most 3 active borrows (waiting, promised, or out).
    params: { max: 3 }
    applies-to: [BorrowRequest, API-004]
    on-violation: Request refused; say the three-borrow limit is in the way and that returning an item frees a place.
    ac-refs: [AC-006]
  - id: BR-002
    name: answer-window
    rule: A waiting request lapses 24 hours after it was made if the lender has not answered.
    params: { window: PT24H }
    applies-to: [BorrowRequest]
    on-violation: A late accept or decline is refused with "This request already lapsed."
    ac-refs: [AC-009]
  - id: BR-003
    name: no-self-borrow
    rule: A resident cannot request a listing they lend.
    params: {}
    applies-to: [BorrowRequest, API-004]
    on-violation: Request refused; "This is your own item."
    ac-refs: [AC-007]
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
  - id: US-003
    as: Resident
    i-want: request a free item for a time window
    so-that: I get a clear yes or no
    priority: must
  - id: US-004
    as: Resident (lender)
    i-want: accept or decline a request for my item
    so-that: I answer once instead of being chased
    priority: must
  - id: US-005
    as: Manager
    i-want: retire an unsafe or abandoned listing
    so-that: it can no longer be requested
    priority: should
  - id: US-006
    as: Manager
    i-want: admit residents and end their access
    so-that: only people who live here use the catalogue
    priority: must
  - id: US-007
    as: Resident
    i-want: confirm collect and return with the other person
    so-that: we agree on who has the item
    priority: should
acceptance-criteria:
  - id: AC-001
    story-ref: US-001
    kind: happy
    given: a signed-in resident and a catalogue with items
    when: they open the catalogue
    then: each item shows its name in full and a status word (Free, Asked for, Promised, Out, Paused)
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
    given: a resident with name, description, and longest borrow length filled in
    when: they submit the listing
    then: the item appears in the catalogue as Free, and the lender can pause or resume it later
    testable: true
  - id: AC-004
    story-ref: US-002
    kind: error
    given: a listing form with the description missing
    when: the resident submits it
    then: the form names the missing field and nothing is shown in the catalogue
    testable: true
  - id: AC-005
    story-ref: US-003
    kind: happy
    given: a Free item that another resident lends
    when: the resident sends a request with a collect time and return-by within the longest length
    then: the request is Waiting, the item shows Asked for, and the lender is told
    testable: true
  - id: AC-006
    story-ref: US-003
    kind: error
    given: a resident with three active borrows
    when: they send another request
    then: the request is refused with the three-borrow message and nothing changes on the item
    testable: true
  - id: AC-007
    story-ref: US-003
    kind: edge
    given: a resident looking at an item they lend
    when: they try to request it
    then: the request is refused with "This is your own item."
    testable: true
  - id: AC-008
    story-ref: US-004
    kind: happy
    given: a waiting request less than 24 hours old
    when: the lender accepts
    then: the request is Promised, the item shows Promised, and the borrower is told
    testable: true
  - id: AC-009
    story-ref: US-004
    kind: edge
    given: a waiting request with no answer
    when: 24 hours pass
    then: the request lapses, the item is Free again, and both people are told it lapsed because there was no answer
    testable: true
  - id: AC-010
    story-ref: US-005
    kind: happy
    given: a manager viewing any listing
    when: they retire it
    then: residents no longer see it and the manager can still see its past requests
    testable: true
  - id: AC-011
    story-ref: US-006
    kind: happy
    given: a manager with a new resident's display name and unit
    when: they admit the resident
    then: the resident is Active and can sign in
    testable: true
  - id: AC-012
    story-ref: US-006
    kind: permission
    given: a resident who is not the manager
    when: they try to admit someone or end someone's access
    then: the action is refused in plain words and they are told to ask the manager
    testable: true
  - id: AC-013
    story-ref: US-004
    kind: happy
    given: a waiting request
    when: the lender declines with an optional reason
    then: the request is Declined, the item is Free, and the borrower sees the reason without blame
    testable: true
  - id: AC-014
    story-ref: US-003
    kind: edge
    given: a waiting request
    when: the borrower cancels it
    then: the request is Cancelled, the item is Free, and the lender is told
    testable: true
  - id: AC-016
    story-ref: US-004
    kind: permission
    given: a waiting request for someone else's item
    when: a resident who is not the lender tries to accept or decline it
    then: the action is refused with "Only the lender can answer this request."
    testable: true
  - id: AC-015
    story-ref: US-007
    kind: happy
    given: a promised request
    when: both people confirm collect, and later both confirm return
    then: the request moves Out and then Returned, and the item is Free again
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
      request: { path-params: {}, query-params: {}, body: { name: string, description: string, longestBorrowLength: BorrowLength } }
      response:
        success: { status: 201, schema: Listing }
        errors:
          - { status: 422, code: LISTING_INCOMPLETE, message: "Add a description before listing.", when: a required field is missing }
    - id: API-003
      method: POST
      path: /v1/listings/{id}/retirement
      description: Retire a listing
      auth-required: true
      roles: [Manager]
      story-refs: [US-005]
      request: { path-params: { id: string }, query-params: {}, body: { reason: string } }
      response:
        success: { status: 200, schema: Listing }
        errors:
          - { status: 403, code: MANAGER_ONLY, message: Only the manager can retire a listing., when: PERM-002 }
    - id: API-004
      method: POST
      path: /v1/requests
      description: Request a free item
      auth-required: true
      roles: [Resident]
      story-refs: [US-003]
      request: { path-params: {}, query-params: {}, body: { listingId: string, collectFrom: string, returnBy: string } }
      response:
        success: { status: 201, schema: BorrowRequest }
        errors:
          - { status: 409, code: ACTIVE_BORROW_CAP, message: You already have three items on the go. Return one to ask for another., when: BR-001 }
          - { status: 409, code: OWN_LISTING, message: This is your own item., when: BR-003 }
    - id: API-005
      method: POST
      path: /v1/requests/{id}/decision
      description: Accept or decline a waiting request
      auth-required: true
      roles: [Resident]
      story-refs: [US-004]
      request: { path-params: { id: string }, query-params: {}, body: { accept: boolean, reason: string } }
      response:
        success: { status: 200, schema: BorrowRequest }
        errors:
          - { status: 409, code: REQUEST_LAPSED, message: This request already lapsed., when: BR-002 }
          - { status: 403, code: NOT_LENDER, message: Only the lender can answer this request., when: PERM-003 }
    - id: API-006
      method: POST
      path: /v1/requests/{id}/cancellation
      description: Borrower cancels a waiting request
      auth-required: true
      roles: [Resident]
      story-refs: [US-003]
      request: { path-params: { id: string }, query-params: {}, body: {} }
      response:
        success: { status: 200, schema: BorrowRequest }
        errors:
          - { status: 409, code: NOT_WAITING, message: This request is no longer waiting., when: status is not WAITING }
    - id: API-007
      method: POST
      path: /v1/requests/{id}/handoffs
      description: Record or confirm a collect or return
      auth-required: true
      roles: [Resident]
      story-refs: [US-007]
      request: { path-params: { id: string }, query-params: {}, body: { kind: string } }
      response:
        success: { status: 200, schema: BorrowRequest }
        errors:
          - { status: 409, code: HANDOFF_OUT_OF_ORDER, message: Confirm collect before return., when: kind does not match status }
    - id: API-008
      method: POST
      path: /v1/residents
      description: Admit a resident
      auth-required: true
      roles: [Manager]
      story-refs: [US-006]
      request: { path-params: {}, query-params: {}, body: { displayName: string, unitLabel: string } }
      response:
        success: { status: 201, schema: Resident }
        errors:
          - { status: 403, code: MANAGER_ONLY, message: Ask the manager to add someone., when: PERM-004 }
    - id: API-010
      method: POST
      path: /v1/listings/{id}/pause
      description: Pause or resume a listing the caller lends
      auth-required: true
      roles: [Resident]
      story-refs: [US-002]
      request: { path-params: { id: string }, query-params: {}, body: { paused: boolean } }
      response:
        success: { status: 200, schema: Listing }
        errors:
          - { status: 403, code: NOT_LENDER, message: Only the lender can pause this listing., when: caller is not the lender }
    - id: API-009
      method: PATCH
      path: /v1/residents/{id}
      description: End a resident's access
      auth-required: true
      roles: [Manager]
      story-refs: [US-006]
      request: { path-params: { id: string }, query-params: {}, body: { status: ResidentStatus } }
      response:
        success: { status: 200, schema: Resident }
        errors:
          - { status: 403, code: MANAGER_ONLY, message: Ask the manager to change access., when: PERM-004 }
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
    - id: SCR-003
      title: Listing detail
      route: /listings/:id
      page-type: detail
      primary-entity: Listing
      roles: [Resident, Manager]
      story-refs: [US-003, US-005]
      api-refs: [API-004, API-003, API-010]
      states: [loading, empty, error, success]
      components: [ListingDetailHeader, RequestThisItemForm, RetireListingConfirmModal]
      notes: View a single Listing; residents request it, the manager can retire it.
    - id: SCR-004
      title: Request
      route: /requests/:id
      page-type: detail
      primary-entity: BorrowRequest
      roles: [Resident]
      story-refs: [US-004, US-007, US-003]
      api-refs: [API-005, API-006, API-007]
      states: [loading, empty, error, success]
      components: [RequestReadback, AcceptDeclineActions, CancelRequestAction, HandoffConfirmActions]
      notes: View a single BorrowRequest; the lender answers, the borrower cancels, both confirm handoffs.
    - id: SCR-005
      title: Residents
      route: /manager/residents
      page-type: list
      primary-entity: Resident
      roles: [Manager]
      story-refs: [US-006]
      api-refs: [API-008, API-009]
      states: [loading, empty, error, success]
      components: [ResidentsTable, AdmitResidentModal, EndAccessConfirmModal]
      notes: List all Residents by unit; admit new ones and end access.
    - id: SCR-006
      title: Private register
      route: /private-register
      page-type: other
      primary-entity: ""
      roles: [Outsider]
      story-refs: [US-001]
      api-refs: []
      states: [success]
      components: [PrivateRegisterExplanation]
      notes: View the private-register explanation for people without access.
  interactions:
    - id: INT-001
      trigger: taps an item row
      response: opens the listing detail
      screen-ref: SCR-001
      target-screen: SCR-003
    - id: INT-002
      trigger: sends a request
      response: shows the request as Waiting
      screen-ref: SCR-003
      target-screen: SCR-004
notifications:
  - id: NTF-001
    event: Someone requests my item
    recipients: [lender]
    channels: [in-app]
    mandatory: false
    timing: immediately
    copy: Marta in 4B asked for the drill, Saturday 10:00–12:00, back by Sunday 18:00.
    ac-refs: [AC-005]
  - id: NTF-002
    event: My request was accepted or declined
    recipients: [borrower]
    channels: [in-app]
    mandatory: false
    timing: immediately
    copy: Tom in 2A said yes — collect Saturday 10:00–12:00.
    ac-refs: [AC-008, AC-013]
  - id: NTF-003
    event: A request lapsed with no answer
    recipients: [lender, borrower]
    channels: [in-app]
    mandatory: true
    timing: when the 24 hours end
    copy: Your request for the drill closed because there was no answer. The item is free again.
    ac-refs: [AC-009]
non-functional:
  performance: [Catalogue status visible in under 1 s at p95 on a phone]
  accessibility: [WCAG 2.2 AA on catalogue, request, and answer flows; status shown as words, not colour alone]
  security: [Every call except the private-register page needs an admitted session]
  scalability: [About 100 items and 150 residents]
  observability: [Manager can see who requested, answered, retired, or ended access, and when]
boundaries:
  always: [Show status as words, Tell both people when a request closes]
  ask-first: [Adding a notification channel outside the app]
  never: [Take payments, Add a waiting list]
delivery-plan:
  strategy: Access and the catalogue first, so every later slice has signed-in residents and items to borrow; then the request loop.
  slices:
    - id: SL-001
      title: Access and catalogue
      goal: The manager admits residents, residents list items, and everyone admitted sees an honest catalogue.
      depends-on: []
      tracks: [backend, frontend]
      story-refs: [US-006, US-001, US-002, US-005]
      entity-refs: [Resident, Listing]
      api-refs: [API-008, API-009, API-001, API-002, API-003, API-010]
      screen-refs: [SCR-005, SCR-006, SCR-001, SCR-002, SCR-003]
      agent-refs: []
      rule-refs: []
      state-machine-refs: [SM-001, SM-002]
      notification-refs: []
      permission-refs: [PERM-001, PERM-002, PERM-004]
      steps:
        - track: backend
          do: Model Resident and Listing with their SM-001 and SM-002 lifecycles and the derived displayStatus.
          refs: [Resident, Listing, SM-001, SM-002]
        - track: backend
          do: Implement admit / end-access and listing create / retire, enforcing PERM-002 and PERM-004.
          refs: [API-008, API-009, API-002, API-003, PERM-002, PERM-004]
        - track: backend
          do: Implement the catalogue read with display status; reject calls without an admitted session.
          refs: [API-001, PERM-001]
        - track: frontend
          do: Build the private-register gate, the residents screen, and the catalogue with all four states.
          refs: [SCR-006, SCR-005, SCR-001]
        - track: frontend
          do: Build list-an-item and listing detail (retire action for the manager only).
          refs: [SCR-002, SCR-003]
      done-when: [AC-011, AC-012, AC-001, AC-002, AC-003, AC-004, AC-010]
    - id: SL-002
      title: Request and answer
      goal: Residents request free items, lenders answer within a day, and both confirm handoffs.
      depends-on: [SL-001]
      tracks: [backend, frontend]
      story-refs: [US-003, US-004, US-007]
      entity-refs: [BorrowRequest, Listing]
      api-refs: [API-004, API-005, API-006, API-007]
      screen-refs: [SCR-003, SCR-004]
      agent-refs: []
      rule-refs: [BR-001, BR-002, BR-003]
      state-machine-refs: [SM-003]
      notification-refs: [NTF-001, NTF-002, NTF-003]
      permission-refs: [PERM-003]
      steps:
        - track: backend
          do: Model BorrowRequest with the SM-003 lifecycle, including the PT24H lapse timer.
          refs: [BorrowRequest, SM-003, BR-002]
        - track: backend
          do: Implement request, decision, cancellation, and handoff endpoints enforcing BR-001, BR-003, and PERM-003; emit NTF-001..003.
          refs: [API-004, API-005, API-006, API-007, BR-001, BR-003, PERM-003, NTF-001, NTF-002, NTF-003]
        - track: frontend
          do: Add the request form to listing detail and build the request screen with answer, cancel, and handoff actions.
          refs: [SCR-003, SCR-004, API-004, API-005, API-006, API-007]
      done-when: [AC-005, AC-006, AC-007, AC-008, AC-009, AC-013, AC-014, AC-015, AC-016]
risks:
  - id: RISK-001
    description: Two residents request the same free item at the same moment.
    likelihood: medium
    impact: medium
    mitigation: At most one open request per listing (BorrowRequest.listingId); the second caller gets the item's current status.
assumptions:
  - id: ASSM-001
    description: The lapse notice is shown in the app the next time each person opens it; no outside channel in v1.
    source: enricher
    confidence: medium
    requires-confirmation: true
    affects: [NTF-003]
open-questions:
  - id: Q-001
    question: Should the manager be able to un-retire a listing, or must the lender list it again?
    raised-by: analyst
    blocking: false
    affects: [US-005]
    status: open
    answer: ""
traceability:
  decisions:
    - id: DEC-001
      decision: Accepting a request promises the item immediately; there is no second confirmation from the borrower.
      rationale: A second yes would leave the item neither free nor promised.
      alternatives-considered: [Borrower confirms the accepted times — rejected, the item would hang]
      source: qa
      affects: [SM-003, AC-008]
---

# Shelf Share

## Problem Context

Residents already lend drills and folding chairs through the building chat. Nobody can tell what is free, requests scroll away, and lenders get chased for answers.

## Solution Overview

Admitted residents see one catalogue with an honest status for each item, ask for a time window, and get a yes or no within a day. The build runs in two slices: access and catalogue (SL-001), then request and answer (SL-002).

## User Flows

### Flow 1: Request a free item (US-003, US-004)

**Actor**: Resident
**Precondition**: signed in, fewer than three active borrows (BR-001)

**Happy path**
1. The resident opens a Free item and sends a request (AC-005).
2. The lender is told (NTF-001) and accepts (AC-008); the borrower is told (NTF-002).

**Error path — no answer** (AC-009, BR-002)
1. 24 hours pass with no answer.
2. Both people see "Your request for the drill closed because there was no answer."
3. The item is Free; the borrower may ask again.

## Design Rationale

### Accept means promised (DEC-001)

A second confirmation would leave the item in limbo, so the lender's yes starts the hold.

## Schema History

| Version | Date | Change |
|---------|------|--------|
| 2.0 | 2026-01-01 | Initial spec |
