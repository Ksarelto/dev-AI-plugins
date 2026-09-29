---
"spec-version": "1.1"
"timecode": "20260917-124658"
"type": "app"
"status": "approved"
"metadata":
  "slug": "building-cupboard"
  "title": "The Building Cupboard"
  "created": "2026-09-17T12:46:58Z"
  "updated": "2026-09-17T13:00:00Z"
  "source-files":
    - "requirements.md"
  "pipeline-rounds":
    "clarification": 1
    "completeness": 0
    "review": 1
"context":
  "problem": "Residents of one apartment building already lend household items to each other, but the arrangement lives in the lobby chat: people cannot tell if a drill is free, who to collect from, or when it must come back; lenders feel responsible after they move out; incomplete returns sour the hallway; and the manager hears disputes too late."
  "goal": "A private, building-only register where signed-in residents can list, find, request, agree times, collect, return, and record condition without money, queues, or a public website — and where the manager can admit people, recover items after move-out, and answer five oversight questions for the committee."
  "target-users":
    - "Resident"
    - "Building manager"
    - "Deputy manager"
    - "Outsider"
  "existing-system": "None - greenfield register. Informal lobby-chat lending, fobs, written notices, and key deposit stay outside this product."
  "constraints":
    - "One building and one Cupboard; no lending across buildings. Homes use unit numbers the manager already uses (about 80 homes, about 150 adults)."
    - "The Cupboard never takes money, deposits, late fees, insurance, tips, buying, selling, or giving away."
    - "Not a public website. Search engines, guests, drivers, children without access, former residents, and the public must not browse items, photos, units, or names."
    - "Joining is manager-mediated. No public self-signup, no SMS or text-message sign-in, no self-serve recover-access. After admit, the adult signs in with a private phrase or code given in person."
    - "Every signed-in person has exactly one role at a time: Resident, Deputy manager, Building manager, or Outsider."
    - "Only residents — adults who live here and have a unit — may list or borrow. There is no Staff lender role. An off-site manager does manager work only unless they also live here and have a unit."
    - "No automatic waitlist. Catalogue copy must say people are not next. Fairness is the three-borrow cap, no featured slots, no friends-only reserve, 24-hour lapse, and manager conversation for repeated declines."
    - "No star ratings of people. Condition notes describe the item, not the person."
    - "English UI at launch. Resident-typed notes may be any language and are not translated. No RTL layout in v1."
    - "Children may use an item in real life; they do not operate the Cupboard. The adult of the home is the person on the record."
    - "Dates and times are this building's local civil time with weekday shown. Overnight windows may cross midnight."
  "non-goals":
    - "Lending or discovery across more than one building"
    - "Accounts for people who neither live here nor work as staff"
    - "Payments, deposits, late fees, insurance, or any exchange of money"
    - "Buying, selling, or giving items away permanently"
    - "Food, medicine, alcohol, weapons, or other forbidden goods as listings"
    - "Staff delivery of items between floors"
    - "Matching people for skills, babysitting, or pet sitting"
    - "A public website that search engines or passers-by can browse"
    - "Public OIDC self-signup, SMS OTP, or a public recover-access page"
    - "Automatic waitlists, queues, featured slots, or league tables"
    - "Star ratings of people, graphs, health scores, or in-product KPI dashboards"
    - "Automatic legal enforcement or prosecution"
    - "Import of lobby-chat history"
    - "Required SMS or email as a notification channel"
"entities":
  - "name": "ResidentAccess"
    "description": "One admitted adult's Cupboard access for this building. Not a household login."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Stable access id."
      - "name": "displayName"
        "type": "string"
        "required": true
        "description": "Name other residents see (typically first name plus unit), not a legal full name."
      - "name": "unitLabel"
        "type": "string"
        "required": false
        "description": "Unit number the manager typed. Empty only for an off-site manager who cannot list or borrow."
      - "name": "role"
        "type": "AccessRole"
        "required": true
        "description": "One of: RESIDENT, DEPUTY_MANAGER, BUILDING_MANAGER. Outsiders have no ResidentAccess row."
      - "name": "status"
        "type": "ResidentAccessStatus"
        "required": true
        "description": "One of: ACTIVE, ENDED"
      - "name": "livesInBuilding"
        "type": "boolean"
        "required": true
        "description": "True when this adult lives on site. Required to list or borrow."
      - "name": "hasUnit"
        "type": "boolean"
        "required": true
        "description": "True when unitLabel is present. Off-site manager: false."
      - "name": "livesInThatUnit"
        "type": "boolean"
        "required": true
        "description": "Manager-recorded fact that this adult lives in that unit."
      - "name": "contactNote"
        "type": "string | null"
        "required": false
        "description": "Optional reachability note typed by this person."
      - "name": "contactNotePublished"
        "type": "boolean"
        "required": true
        "description": "Whether other residents see the contact note on listings."
      - "name": "signInSecretIssued"
        "type": "boolean"
        "required": true
        "description": "True after the manager has given a private phrase or code in person. The secret itself is never shown in the catalogue."
      - "name": "sessionDisplayName"
        "type": "string"
        "required": false
        "description": "Currently-in-use identity shown while signed in on this phone."
      - "name": "sessionUnitLabel"
        "type": "string | null"
        "required": false
        "description": "Currently-in-use unit shown while signed in."
      - "name": "admittedAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when admitted."
      - "name": "admittedByAccessId"
        "type": "string"
        "required": false
        "description": "Manager or deputy who admitted them. Empty for the out-of-band first manager."
      - "name": "endedAt"
        "type": "string | null"
        "required": false
        "description": "Local civil datetime with weekday when access ended, or null if still active."
      - "name": "endedReason"
        "type": "string | null"
        "required": false
        "description": "Move-out or committee decision words."
      - "name": "createdAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record was created."
      - "name": "updatedAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record last changed."
    "relationships":
      - "entity": "Unit"
        "type": "one-to-one"
        "description": "Belongs to a unit when hasUnit is true; many adults may share a unit."
      - "entity": "Listing"
        "type": "one-to-many"
        "description": "Listings this adult owns as lender."
      - "entity": "BorrowRequest"
        "type": "one-to-many"
        "description": "Requests this adult placed as borrower."
      - "entity": "AgreedBorrow"
        "type": "one-to-many"
        "description": "Borrows this adult is a party to."
  - "name": "Unit"
    "description": "A home number in this one building, typed by the manager using existing building numbers."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Stable unit id for this building."
      - "name": "label"
        "type": "string"
        "required": true
        "description": "Unit number as the manager already uses it (for example 4B). Typed by the manager; no unit-admin screen."
      - "name": "status"
        "type": "UnitStatus"
        "required": true
        "description": "One of: IN_USE. Units are not archived in v1; people against the unit are ended instead."
      - "name": "buildingName"
        "type": "string"
        "required": true
        "description": "This one building. Always the same Cupboard; not a multi-building field for v1."
      - "name": "createdAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this label was first used on an admit or listing."
      - "name": "lastCorrectedAt"
        "type": "string | null"
        "required": false
        "description": "When the manager last moved a person onto this unit."
    "relationships":
      - "entity": "ResidentAccess"
        "type": "one-to-many"
        "description": "Adults currently or formerly recorded against this unit."
      - "entity": "Listing"
        "type": "one-to-many"
        "description": "Listings collected from this unit."
  - "name": "Listing"
    "description": "Catalogue record of one household item (or a small set that travels together)."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "shortName"
        "type": "string"
        "required": true
        "description": "Name a neighbor would recognise."
      - "name": "description"
        "type": "string"
        "required": true
        "description": "What is included and what is not; what complete means."
      - "name": "group"
        "type": "ListingGroup"
        "required": true
        "description": "One of: KITCHEN, CLEANING, TOOLS, FURNITURE_AND_HOSTING, CHILDCARE_AND_GUESTS, OUTDOOR, OTHER"
      - "name": "collectUnitLabel"
        "type": "string"
        "required": true
        "description": "Field collectUnitLabel."
      - "name": "pickupGuidance"
        "type": "string"
        "required": true
        "description": "Field pickupGuidance."
      - "name": "usualBorrowLength"
        "type": "BorrowLength"
        "required": true
        "description": "One of: SAME_DAY, ONE_NIGHT, THREE_NIGHTS, ONE_WEEK"
      - "name": "longestBorrowLength"
        "type": "BorrowLength"
        "required": true
        "description": "One of: SAME_DAY, ONE_NIGHT, THREE_NIGHTS, ONE_WEEK. Must not be shorter than usual."
      - "name": "stillHaveItAndSafe"
        "type": "boolean"
        "required": true
        "description": "Field stillHaveItAndSafe."
      - "name": "extraRestrictions"
        "type": "string | null"
        "required": false
        "description": "Field extraRestrictions."
      - "name": "contactNote"
        "type": "string | null"
        "required": false
        "description": "Preferred contact; unpublished unless the lender published it."
      - "name": "contactNotePublished"
        "type": "boolean"
        "required": true
        "description": "Field contactNotePublished."
      - "name": "replacementValue"
        "type": "number | null"
        "required": false
        "description": "Fairness hint in building currency; never a catalogue price."
      - "name": "cautionApplies"
        "type": "boolean"
        "required": true
        "description": "Lender-marked power tool, ladder, or heat appliance."
      - "name": "status"
        "type": "ListingStatus"
        "required": true
        "description": "One of: FREE, ASKED_FOR, PROMISED, OUT, PAUSED, OVERDUE, RETIRED"
      - "name": "hiddenByManager"
        "type": "boolean"
        "required": true
        "description": "Hidden duplicate/nonsense/unsafe; history of past borrows remains."
      - "name": "lenderAccessId"
        "type": "string"
        "required": true
        "description": "Field lenderAccessId."
      - "name": "lenderDisplayName"
        "type": "string"
        "required": true
        "description": "Field lenderDisplayName."
      - "name": "lenderUnitLabel"
        "type": "string"
        "required": true
        "description": "Field lenderUnitLabel."
      - "name": "earliestCollectHint"
        "type": "string | null"
        "required": false
        "description": "Local civil datetime with weekday if not free now."
      - "name": "conditionSummary"
        "type": "string | null"
        "required": false
        "description": "Field conditionSummary."
      - "name": "photoId"
        "type": "string | null"
        "required": false
        "description": "Field photoId."
      - "name": "createdAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record was created."
      - "name": "updatedAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record last changed."
      - "name": "pausedAt"
        "type": "string | null"
        "required": false
        "description": "Field pausedAt."
      - "name": "withdrawnAt"
        "type": "string | null"
        "required": false
        "description": "Field withdrawnAt."
      - "name": "retiredAt"
        "type": "string | null"
        "required": false
        "description": "Field retiredAt."
      - "name": "retiredWhy"
        "type": "string | null"
        "required": false
        "description": "Field retiredWhy."
      - "name": "hiddenWhy"
        "type": "string | null"
        "required": false
        "description": "Field hiddenWhy."
    "relationships":
      - "entity": "ResidentAccess"
        "type": "one-to-one"
        "description": "Listed by one adult lender."
      - "entity": "Unit"
        "type": "one-to-one"
        "description": "Collected from a unit."
      - "entity": "Photograph"
        "type": "one-to-one"
        "description": "At most one optional photo."
      - "entity": "BorrowRequest"
        "type": "one-to-many"
        "description": "Asks for this listing."
      - "entity": "AgreedBorrow"
        "type": "one-to-many"
        "description": "Accepted borrows of this listing."
      - "entity": "ConditionNote"
        "type": "one-to-many"
        "description": "Visible notes for future borrowers."
      - "entity": "Dispute"
        "type": "one-to-many"
        "description": "Disputes freeze new requests on this listing only."
  - "name": "Photograph"
    "description": "Optional picture of the actual item, belonging to a listing."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "listingId"
        "type": "string"
        "required": true
        "description": "Field listingId."
      - "name": "status"
        "type": "PhotographStatus"
        "required": true
        "description": "One of: VISIBLE, HIDDEN, LEFT_CATALOGUE"
      - "name": "altText"
        "type": "string"
        "required": true
        "description": "Item name if the lender left it blank."
      - "name": "hiddenWhy"
        "type": "string | null"
        "required": false
        "description": "Field hiddenWhy."
    "relationships":
      - "entity": "Listing"
        "type": "one-to-one"
        "description": "Belongs to one listing."
  - "name": "BorrowRequest"
    "description": "A borrower's ask for a specific listing, with hoped-for collect and return moments."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "listingId"
        "type": "string"
        "required": true
        "description": "Field listingId."
      - "name": "borrowerAccessId"
        "type": "string"
        "required": true
        "description": "Field borrowerAccessId."
      - "name": "lenderAccessId"
        "type": "string"
        "required": true
        "description": "Field lenderAccessId."
      - "name": "status"
        "type": "BorrowRequestStatus"
        "required": true
        "description": "One of: WAITING, ACCEPTED, ACCEPTED_WITH_CHANGE, DECLINED, LAPSED, CANCELLED"
      - "name": "collectDay"
        "type": "string"
        "required": true
        "description": "Local civil date with weekday."
      - "name": "collectStart"
        "type": "string"
        "required": true
        "description": "Local civil time."
      - "name": "collectEnd"
        "type": "string"
        "required": true
        "description": "Local civil time; may be the next calendar day."
      - "name": "returnByAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday."
      - "name": "purpose"
        "type": "string | null"
        "required": false
        "description": "Field purpose."
      - "name": "reachabilityDuringHold"
        "type": "string"
        "required": true
        "description": "Field reachabilityDuringHold."
      - "name": "declineReason"
        "type": "string | null"
        "required": false
        "description": "Field declineReason."
      - "name": "changedCollectStart"
        "type": "string | null"
        "required": false
        "description": "Field changedCollectStart."
      - "name": "changedCollectEnd"
        "type": "string | null"
        "required": false
        "description": "Field changedCollectEnd."
      - "name": "changedReturnByAt"
        "type": "string | null"
        "required": false
        "description": "Field changedReturnByAt."
      - "name": "createdAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record was created."
      - "name": "answerByAt"
        "type": "string"
        "required": true
        "description": "CreatedAt plus 24 hours elapsed."
      - "name": "answeredAt"
        "type": "string | null"
        "required": false
        "description": "Field answeredAt."
      - "name": "lapsedAt"
        "type": "string | null"
        "required": false
        "description": "Field lapsedAt."
    "relationships":
      - "entity": "Listing"
        "type": "one-to-one"
        "description": "Asks for one listing. At most one WAITING request per listing."
      - "entity": "ResidentAccess"
        "type": "one-to-one"
        "description": "Borrower."
      - "entity": "AgreedBorrow"
        "type": "one-to-one"
        "description": "Created on accept or accept-with-change."
  - "name": "AgreedBorrow"
    "description": "A request the lender accepted, with a collect window and return-by both sides can read back."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "listingId"
        "type": "string"
        "required": true
        "description": "Field listingId."
      - "name": "requestId"
        "type": "string"
        "required": true
        "description": "Field requestId."
      - "name": "lenderAccessId"
        "type": "string"
        "required": true
        "description": "Field lenderAccessId."
      - "name": "borrowerAccessId"
        "type": "string"
        "required": true
        "description": "Field borrowerAccessId."
      - "name": "status"
        "type": "AgreedBorrowStatus"
        "required": true
        "description": "One of: HOLD_PROMISED, OUT, OVERDUE, RETURNED, HOLD_LAPSED, CANCELLED, UNRESOLVED"
      - "name": "agreedCollectStart"
        "type": "string"
        "required": true
        "description": "Field agreedCollectStart."
      - "name": "agreedCollectEnd"
        "type": "string"
        "required": true
        "description": "Field agreedCollectEnd."
      - "name": "agreedReturnByAt"
        "type": "string"
        "required": true
        "description": "Field agreedReturnByAt."
      - "name": "dropOffChangeNote"
        "type": "string | null"
        "required": false
        "description": "One-line different drop-off both parties can see."
      - "name": "pendingTimeChangeNote"
        "type": "string | null"
        "required": false
        "description": "Later proposed change; original times stand until accepted."
      - "name": "countsTowardThreeCap"
        "type": "boolean"
        "required": true
        "description": "Field countsTowardThreeCap."
      - "name": "overdueSince"
        "type": "string | null"
        "required": false
        "description": "Field overdueSince."
      - "name": "eveningNoticesSent"
        "type": "number"
        "required": true
        "description": "Field eveningNoticesSent."
      - "name": "createdAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record was created."
      - "name": "collectedAt"
        "type": "string | null"
        "required": false
        "description": "Field collectedAt."
      - "name": "returnedAt"
        "type": "string | null"
        "required": false
        "description": "Field returnedAt."
    "relationships":
      - "entity": "Listing"
        "type": "one-to-one"
        "description": "The promised or out item."
      - "entity": "BorrowRequest"
        "type": "one-to-one"
        "description": "Originating ask."
      - "entity": "Handoff"
        "type": "one-to-many"
        "description": "Collect and return handoffs."
      - "entity": "Dispute"
        "type": "one-to-many"
        "description": "Optional freeze on this item."
      - "entity": "ConditionNote"
        "type": "one-to-many"
        "description": "Notes after confirmed return."
  - "name": "Handoff"
    "description": "The recorded real-world moment when the item changes hands: collect or return."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "agreedBorrowId"
        "type": "string"
        "required": true
        "description": "Field agreedBorrowId."
      - "name": "kind"
        "type": "HandoffKind"
        "required": true
        "description": "One of: COLLECT, RETURN"
      - "name": "status"
        "type": "HandoffStatus"
        "required": true
        "description": "One of: WAITING_CONFIRMATION, CONFIRMED, LAPSED_UNCONFIRMED"
      - "name": "alreadyHappened"
        "type": "boolean"
        "required": true
        "description": "True when recorded after an outage as already happened."
      - "name": "recordedByAccessId"
        "type": "string"
        "required": true
        "description": "Field recordedByAccessId."
      - "name": "confirmedByAccessId"
        "type": "string | null"
        "required": false
        "description": "Field confirmedByAccessId."
      - "name": "recordedAt"
        "type": "string"
        "required": true
        "description": "Field recordedAt."
      - "name": "confirmByAt"
        "type": "string"
        "required": true
        "description": "RecordedAt plus 12 hours."
      - "name": "confirmedAt"
        "type": "string | null"
        "required": false
        "description": "Field confirmedAt."
    "relationships":
      - "entity": "AgreedBorrow"
        "type": "one-to-one"
        "description": "Belongs to one agreed borrow."
  - "name": "ConditionNote"
    "description": "Short dated remark about completeness or damage after a confirmed return."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "listingId"
        "type": "string"
        "required": true
        "description": "Field listingId."
      - "name": "agreedBorrowId"
        "type": "string"
        "required": true
        "description": "Field agreedBorrowId."
      - "name": "status"
        "type": "ConditionNoteStatus"
        "required": true
        "description": "One of: VISIBLE, HIDDEN"
      - "name": "body"
        "type": "string"
        "required": true
        "description": "Describes the item, not the person. No star scores."
      - "name": "signedDisplayName"
        "type": "string"
        "required": true
        "description": "Field signedDisplayName."
      - "name": "authorAccessId"
        "type": "string"
        "required": true
        "description": "Field authorAccessId."
      - "name": "createdAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record was created."
      - "name": "hiddenAt"
        "type": "string | null"
        "required": false
        "description": "Field hiddenAt."
      - "name": "hiddenWhy"
        "type": "string | null"
        "required": false
        "description": "Field hiddenWhy."
      - "name": "managerRemark"
        "type": "string | null"
        "required": false
        "description": "Field managerRemark."
    "relationships":
      - "entity": "Listing"
        "type": "one-to-one"
        "description": "Shown to future borrowers if VISIBLE."
      - "entity": "AgreedBorrow"
        "type": "one-to-one"
        "description": "Written after that return."
  - "name": "Dispute"
    "description": "Manager-handled freeze on one item when collect, completeness, agreement, or move-out recovery is contested."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "listingId"
        "type": "string"
        "required": true
        "description": "Field listingId."
      - "name": "agreedBorrowId"
        "type": "string | null"
        "required": false
        "description": "Field agreedBorrowId."
      - "name": "status"
        "type": "DisputeStatus"
        "required": true
        "description": "One of: OPEN, DECIDED"
      - "name": "reason"
        "type": "DisputeReason"
        "required": true
        "description": "One of: COLLECT_CONTESTED, COMPLETENESS_CONTESTED, NEVER_AGREED, MOVE_OUT_RECOVERY"
      - "name": "outcome"
        "type": "DisputeOutcome | null"
        "required": false
        "description": "One of: RESTORE_FREE, KEEP_PAUSED, RETIRE, CLEAR_OVERDUE_BLOCK"
      - "name": "freezeNewRequests"
        "type": "boolean"
        "required": true
        "description": "Field freezeNewRequests."
      - "name": "openedByAccessId"
        "type": "string"
        "required": true
        "description": "Field openedByAccessId."
      - "name": "partyNotesInOrder"
        "type": "string"
        "required": true
        "description": "Both people's existing notes in order."
      - "name": "managerRemark"
        "type": "string | null"
        "required": false
        "description": "Field managerRemark."
      - "name": "createdAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record was created."
      - "name": "decidedAt"
        "type": "string | null"
        "required": false
        "description": "Field decidedAt."
    "relationships":
      - "entity": "Listing"
        "type": "one-to-one"
        "description": "Freezes new requests on that listing only."
      - "entity": "AgreedBorrow"
        "type": "one-to-one"
        "description": "Optional originating borrow."
  - "name": "BuildingNotice"
    "description": "The single short building-wide notice at the top of the catalogue."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "status"
        "type": "BuildingNoticeStatus"
        "required": true
        "description": "One of: ACTIVE, ENDED"
      - "name": "body"
        "type": "string"
        "required": true
        "description": "Field body."
      - "name": "startsAt"
        "type": "string"
        "required": true
        "description": "Field startsAt."
      - "name": "endsAt"
        "type": "string | null"
        "required": false
        "description": "Field endsAt."
      - "name": "postedByAccessId"
        "type": "string"
        "required": true
        "description": "Field postedByAccessId."
    "relationships": []
  - "name": "InCupboardNotice"
    "description": "Source-of-record notice a person sees the next time they open the Cupboard."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "recipientAccessId"
        "type": "string"
        "required": true
        "description": "Field recipientAccessId."
      - "name": "status"
        "type": "InCupboardNoticeStatus"
        "required": true
        "description": "One of: UNREAD, READ"
      - "name": "event"
        "type": "NoticeEvent"
        "required": true
        "description": "One of: REQUEST_RECEIVED, REQUEST_ACCEPTED, REQUEST_ACCEPTED_WITH_CHANGE, REQUEST_DECLINED, REQUEST_LAPSED, HANDOFF_WAITING, HANDOFF_CONFIRMED, HOLD_LAPSED, OVERDUE, MANAGER_STEP_IN, LISTING_HIDDEN_OR_RETIRED, ACCESS_GRANTED, ACCESS_ENDED, DISPUTE_OPENED, DISPUTE_DECIDED, TIME_CHANGE_PROPOSED"
      - "name": "body"
        "type": "string"
        "required": true
        "description": "Field body."
      - "name": "listingId"
        "type": "string | null"
        "required": false
        "description": "Field listingId."
      - "name": "agreedBorrowId"
        "type": "string | null"
        "required": false
        "description": "Field agreedBorrowId."
      - "name": "cannotTurnOff"
        "type": "boolean"
        "required": true
        "description": "True for overdue and access-ended."
      - "name": "createdAt"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday when this record was created."
    "relationships":
      - "entity": "ResidentAccess"
        "type": "one-to-one"
        "description": "Recipient."
      - "entity": "Listing"
        "type": "one-to-one"
        "description": "Optional related listing."
  - "name": "ManagerActivityEvent"
    "description": "Twelve-month building-wide activity the manager reads for oversight — not an external APM product."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "at"
        "type": "string"
        "required": true
        "description": "Local civil datetime with weekday."
      - "name": "actorAccessId"
        "type": "string | null"
        "required": false
        "description": "Field actorAccessId."
      - "name": "actorDisplayName"
        "type": "string"
        "required": true
        "description": "Field actorDisplayName."
      - "name": "action"
        "type": "string"
        "required": true
        "description": "What happened in ordinary language."
      - "name": "entityName"
        "type": "string"
        "required": true
        "description": "Field entityName."
      - "name": "entityId"
        "type": "string"
        "required": true
        "description": "Field entityId."
      - "name": "whyWords"
        "type": "string | null"
        "required": false
        "description": "Field whyWords."
      - "name": "status"
        "type": "ManagerActivityEventStatus"
        "required": true
        "description": "Lifecycle status of this activity row. One of: RECORDED"
    "relationships": []
  - "name": "OperationalEvent"
    "description": "Manager-only list when something looks wrong: failed sign-in clustering or forbidden-listing attempts."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "at"
        "type": "string"
        "required": true
        "description": "Field at."
      - "name": "kind"
        "type": "OperationalEventKind"
        "required": true
        "description": "One of: FAILED_SIGN_IN, FORBIDDEN_LISTING_ATTEMPT"
      - "name": "status"
        "type": "OperationalEventStatus"
        "required": true
        "description": "One of: RECORDED"
      - "name": "listingName"
        "type": "string | null"
        "required": false
        "description": "Field listingName."
      - "name": "unitLabel"
        "type": "string | null"
        "required": false
        "description": "Field unitLabel."
      - "name": "doesNotRevealWhetherNameExists"
        "type": "boolean"
        "required": true
        "description": "True for failed sign-in rows."
    "relationships": []
  - "name": "OversightSnapshot"
    "description": "Printable readable page of the five oversight answers for a committee meeting."
    "fields":
      - "name": "id"
        "type": "string"
        "required": true
        "description": "Unique identifier"
      - "name": "generatedAt"
        "type": "string"
        "required": true
        "description": "Field generatedAt."
      - "name": "accessByUnit"
        "type": "string"
        "required": true
        "description": "Who currently has access, by unit."
      - "name": "overdueItems"
        "type": "string"
        "required": true
        "description": "Overdue items, duration, two parties."
      - "name": "openDisputes"
        "type": "string"
        "required": true
        "description": "Field openDisputes."
      - "name": "unitBorrowHistoryThreeMonths"
        "type": "string"
        "required": true
        "description": "Field unitBorrowHistoryThreeMonths."
      - "name": "hiddenOrRetiredThisMonth"
        "type": "string"
        "required": true
        "description": "Field hiddenOrRetiredThisMonth."
      - "name": "omitsUnpublishedContactNotes"
        "type": "boolean"
        "required": true
        "description": "Field omitsUnpublishedContactNotes."
      - "name": "status"
        "type": "OversightSnapshotStatus"
        "required": true
        "description": "Lifecycle status of this printable page. One of: READY"
    "relationships": []
"user-stories":
  - "id": "US-001"
    "as": "Resident"
    "i-want": "browse and search this building's catalogue and see an honest status for each item"
    "so-that": "answer whether it is free, who to collect from, and when it must come back without asking the manager or the lobby chat"
    "priority": "must"
  - "id": "US-002"
    "as": "Resident (lender)"
    "i-want": "list, pause, resume, correct, and withdraw household items they own"
    "so-that": "neighbors can find what they will actually hand over, and the lender can say they are not lending this month without deleting the record"
    "priority": "must"
  - "id": "US-003"
    "as": "Resident (borrower)"
    "i-want": "request a visible free item with a collect window and return-by time"
    "so-that": "get a time-bounded ask without chasing anyone in group chat, and be told which rule stands in the way if they cannot request"
    "priority": "must"
  - "id": "US-004"
    "as": "Resident (lender)"
    "i-want": "accept as requested, accept with a change to times (hold starts now at those times), or decline an incoming request within 24 hours"
    "so-that": "say yes or no without being chased, with unanswered asks lapsing rather than hanging forever"
    "priority": "must"
  - "id": "US-005"
    "as": "Resident (party to the borrow)"
    "i-want": "record and mutually confirm collect and return, including after an outage as already happened"
    "so-that": "both sides share one agreed handoff so the item is accountable without the manager carrying it"
    "priority": "must"
  - "id": "US-006"
    "as": "Resident (party to a confirmed return)"
    "i-want": "leave a dated condition note signed with display name"
    "so-that": "future borrowers know completeness or damage, and resentment has a record instead of a star score of a person"
    "priority": "must"
  - "id": "US-007"
    "as": "Resident (borrower and lender)"
    "i-want": "see overdue state, be blocked from new requests until return or manager exception, and receive evening overdue notices"
    "so-that": "lateness is visible and time-bounded without money, fees, or public shaming"
    "priority": "must"
  - "id": "US-008"
    "as": "Building manager"
    "i-want": "admit adults by display name and unit, give them a private phrase or code in person, correct a wrong unit, and end access on move-out or committee decision"
    "so-that": "the Cupboard stays a private building register, not a public website, and former residents lose the catalogue immediately"
    "priority": "must"
  - "id": "US-009"
    "as": "Building manager"
    "i-want": "hide or retire listings, handle disputes, post one building-wide notice, see overdue/dispute/access lists, and print or save the five oversight answers for the committee — including when the manager is off-site and is not listing or borrowing"
    "so-that": "step in when something is lost, unsafe, or abandoned, with facts instead of hallway gossip"
    "priority": "must"
  - "id": "US-010"
    "as": "Resident"
    "i-want": "sign in on a phone they already use with the private phrase or code the manager gave them in person, and see whose access is currently in use"
    "so-that": "use the Cupboard without a special device, and avoid accepting a request as a partner on a shared phone"
    "priority": "must"
  - "id": "US-011"
    "as": "Outsider (or removed resident)"
    "i-want": "see only a short private-register explanation (or that access has ended), never the catalogue"
    "so-that": "lending stays inside the building; guests, drivers, and the public cannot browse items, photos, units, or names"
    "priority": "must"
  - "id": "US-012"
    "as": "Building manager"
    "i-want": "record move-out, recover items still out, and transfer a listing to a remaining adult in the unit"
    "so-that": "lenders are not responsible forever after they have left, and keys can be chased against a recovery list"
    "priority": "must"
  - "id": "US-013"
    "as": "Resident (party to an agreed borrow)"
    "i-want": "propose a new collect window or return-by before collect, or extend return-by after collect if the lender accepts, within longest length"
    "so-that": "renegotiate before the day ends instead of going quietly overdue or opening an open-ended loan"
    "priority": "should"
  - "id": "US-014"
    "as": "Deputy manager"
    "i-want": "do the same Cupboard work as the manager except remove the manager or name further deputies"
    "so-that": "residents can still browse, request, accept, collect, and return when the manager is away"
    "priority": "should"
"acceptance-criteria":
  - "id": "AC-001"
    "story-ref": "US-001"
    "given": "a signed-in resident with a unit opens the catalogue on ordinary building connectivity"
    "when": "the catalogue finishes loading"
    "then": "each visible Listing shows status as words Free, Asked for, Promised, Out, Paused, or Overdue, plus collect unit, usual period, and pickup guidance, without asking the manager"
    "testable": true
  - "id": "AC-002"
    "story-ref": "US-001"
    "given": "the catalogue has tens to about 100 Listings"
    "when": "the resident types words that match a name or description, or filters by free-to-request-today or an everyday group"
    "then": "matching Listings appear in one scrollable list with no featured slots and no ranking that hides others"
    "testable": true
  - "id": "AC-003"
    "story-ref": "US-001"
    "given": "no Listings are visible in the ordinary catalogue"
    "when": "the resident opens the catalogue"
    "then": "they see the empty-catalogue invitation, not a spinner treated as an error, and they are not told they are next in a queue"
    "testable": true
  - "id": "AC-004"
    "story-ref": "US-001"
    "given": "the resident searches for words that match nothing"
    "when": "they submit the search"
    "then": "the screen says nothing matched and offers clear-search; it does not invent substitute items"
    "testable": true
  - "id": "AC-005"
    "story-ref": "US-002"
    "given": "a resident who lives here and has a unit, and who has confirmed the item is not forbidden"
    "when": "they submit a Listing with required fields (short name, description, group, collect unit, pickup guidance, usual and longest lengths, still-have-it-and-safe)"
    "then": "the Listing is shown as Free and neighbors can open it; an optional photo may be missing if attach failed"
    "testable": true
  - "id": "AC-006"
    "story-ref": "US-002"
    "given": "the lender owns a Listing that is Free with no waiting request and no open hold"
    "when": "they pause it"
    "then": "the Listing status becomes Paused and it receives no new requests"
    "testable": true
  - "id": "AC-007"
    "story-ref": "US-002"
    "given": "the lender owns a Listing that currently has a waiting request or an open hold"
    "when": "they try to pause or withdraw it"
    "then": "the action is blocked until they answer, cancel, or the ask or hold lapses, and they are told which step stands in the way"
    "testable": true
  - "id": "AC-008"
    "story-ref": "US-002"
    "given": "the lender types a name with obvious forbidden-goods words, or does not confirm the forbidden list"
    "when": "they try to show the Listing"
    "then": "the Listing is refused with a reason, the manager is told, and the item is not in the ordinary catalogue"
    "testable": true
  - "id": "AC-009"
    "story-ref": "US-002"
    "given": "an off-site manager who has no unit is signed in"
    "when": "they try to create a Listing"
    "then": "they are refused in ordinary language that listing is for residents who live here and have a unit; manager work remains available"
    "testable": true
  - "id": "AC-010"
    "story-ref": "US-003"
    "given": "a resident in good standing looks at a visible Free Listing they do not own, with fewer than three active borrows"
    "when": "they send a request with collect window, return-by within longest length, and reachability during the hold"
    "then": "the request is WAITING, the Listing status is Asked for, and the borrower sees waiting before leaving the screen"
    "testable": true
  - "id": "AC-011"
    "story-ref": "US-003"
    "given": "the resident already has three active borrows counting toward the cap"
    "when": "they try to request another item"
    "then": "the request is refused and they are told the three-borrow rule is in the way, with return or a manager exception as the next step"
    "testable": true
  - "id": "AC-012"
    "story-ref": "US-003"
    "given": "a Listing is Free and two residents send a request at the same moment"
    "when": "both submits are processed"
    "then": "exactly one WAITING request is recorded; the other person is told the item is already asked for and is not free; they are not queued"
    "testable": true
  - "id": "AC-013"
    "story-ref": "US-003"
    "given": "an off-site manager with no unit is signed in"
    "when": "they try to request a Listing"
    "then": "they are refused in ordinary language that borrowing is for residents who live here and have a unit"
    "testable": true
  - "id": "AC-014"
    "story-ref": "US-004"
    "given": "the lender has a WAITING request still inside 24 hours"
    "when": "they accept as requested"
    "then": "an AgreedBorrow is created, the Listing is Promised, and both people can read back the same collect window and return-by"
    "testable": true
  - "id": "AC-015"
    "story-ref": "US-004"
    "given": "the lender has a WAITING request still inside 24 hours"
    "when": "they accept with a change to collect window or return-by that is still within longest length"
    "then": "the hold starts immediately at those new times, the Listing is Promised, no second yes is required, and the borrower is told at once"
    "testable": true
  - "id": "AC-016"
    "story-ref": "US-004"
    "given": "the lender has a WAITING request"
    "when": "they decline after extra confirmation"
    "then": "the request is DECLINED, the Listing is Free, and the borrower is told (optional reason if the lender wrote one)"
    "testable": true
  - "id": "AC-017"
    "story-ref": "US-004"
    "given": "a request has been WAITING for 24 hours with no answer"
    "when": "the answer deadline passes"
    "then": "the request LAPSES, the Listing is Free, and both people are told"
    "testable": true
  - "id": "AC-018"
    "story-ref": "US-004"
    "given": "the request has already lapsed"
    "when": "the lender tries to accept or decline"
    "then": "they are told the request already lapsed and the item is not promised"
    "testable": true
  - "id": "AC-019"
    "story-ref": "US-005"
    "given": "an AgreedBorrow is HOLD_PROMISED and collect has not been confirmed"
    "when": "either party records collect (optionally as already happened after an outage)"
    "then": "a COLLECT Handoff is WAITING_CONFIRMATION and the other party has 12 hours to confirm"
    "testable": true
  - "id": "AC-020"
    "story-ref": "US-005"
    "given": "a COLLECT Handoff is waiting for the other person"
    "when": "the other party confirms within 12 hours"
    "then": "the Handoff is CONFIRMED, the AgreedBorrow is OUT, and the Listing is Out"
    "testable": true
  - "id": "AC-021"
    "story-ref": "US-005"
    "given": "an AgreedBorrow is OUT and the lender actually has the item"
    "when": "either party records return and the other confirms"
    "then": "the Listing is Free immediately and collect vs return remain separate controls"
    "testable": true
  - "id": "AC-022"
    "story-ref": "US-005"
    "given": "someone tries to mark return from a third unit that does not have the item"
    "when": "they submit return"
    "then": "the Cupboard does not mark return; they are told return is confirmed only when the lender actually has the item"
    "testable": true
  - "id": "AC-023"
    "story-ref": "US-006"
    "given": "an AgreedBorrow has a confirmed return"
    "when": "either party submits a short dated condition note"
    "then": "the note is VISIBLE, signed with their display name, describes the item not the person, and future borrowers can read it on the Listing"
    "testable": true
  - "id": "AC-024"
    "story-ref": "US-006"
    "given": "a ConditionNote has already been sent"
    "when": "the author tries to edit or erase it"
    "then": "the change is refused; only the manager may hide an abusive note or one that names a child, and that hide is recorded"
    "testable": true
  - "id": "AC-025"
    "story-ref": "US-007"
    "given": "an AgreedBorrow is past agreed return-by and not returned"
    "when": "the resident opens their borrows or the catalogue"
    "then": "the AgreedBorrow and Listing show Overdue as words, not colour alone, and the borrower cannot place a new request until return or a manager exception"
    "testable": true
  - "id": "AC-026"
    "story-ref": "US-007"
    "given": "a borrow is overdue"
    "when": "the person opens the Cupboard in the evening window"
    "then": "they see an overdue InCupboardNotice that cannot be turned off"
    "testable": true
  - "id": "AC-027"
    "story-ref": "US-007"
    "given": "the item is still gone after seven days overdue"
    "when": "that threshold is reached"
    "then": "the manager is told, the Listing is paused for new requests, and the borrow can be marked unresolved on the recovery list"
    "testable": true
  - "id": "AC-028"
    "story-ref": "US-008"
    "given": "the signed-in building manager or deputy is admitting an adult who lives in a unit"
    "when": "they record display name, unit, and lives-in-that-unit, then give a private phrase or code in person"
    "then": "a ResidentAccess row is ACTIVE, signInSecretIssued is true, the secret is not shown in the catalogue, and there is no public signup"
    "testable": true
  - "id": "AC-029"
    "story-ref": "US-008"
    "given": "the manager ends access after extra confirmation for move-out or committee decision"
    "when": "the person later opens the Cupboard"
    "then": "they cannot see the catalogue; they see that access has ended and to arrange outstanding returns with the manager"
    "testable": true
  - "id": "AC-030"
    "story-ref": "US-008"
    "given": "a person is recorded against the wrong unit"
    "when": "the manager corrects the unit"
    "then": "listings move with the person; the manager does not pretend to be that resident on a borrow"
    "testable": true
  - "id": "AC-031"
    "story-ref": "US-008"
    "given": "someone who has not been admitted visits a public URL"
    "when": "they try to self-register or recover access"
    "then": "there is no public signup and no self-serve recover-access page; forgotten sign-in is recovered only by the manager issuing a new phrase or code in person"
    "testable": true
  - "id": "AC-032"
    "story-ref": "US-009"
    "given": "the manager finds a duplicate, nonsense, forbidden, or unsafe Listing"
    "when": "they hide or retire it with why-words"
    "then": "the Listing leaves ordinary browsing, past borrow history is not deleted, and if a request was waiting or a hold was open both people are told (manager safety, not a lender pause)"
    "testable": true
  - "id": "AC-033"
    "story-ref": "US-009"
    "given": "either party or the manager opens a Dispute on an item"
    "when": "the dispute is recorded"
    "then": "new requests on that Listing are frozen; other residents see only that the manager is looking into this item"
    "testable": true
  - "id": "AC-034"
    "story-ref": "US-009"
    "given": "the manager needs the five oversight answers for a committee meeting"
    "when": "they print or save the readable page"
    "then": "the page includes who has access by unit, overdue items, open disputes, three-month unit borrow history, and hidden or retired this month, and omits unpublished contact notes"
    "testable": true
  - "id": "AC-035"
    "story-ref": "US-009"
    "given": "an off-site manager with no unit is signed in"
    "when": "they open manager oversight, admit, hide, dispute, notice, or export"
    "then": "those manager tasks succeed; listing and borrowing remain refused"
    "testable": true
  - "id": "AC-036"
    "story-ref": "US-009"
    "given": "the manager posts one short building-wide notice"
    "when": "residents open the catalogue"
    "then": "the notice appears at the top and does not look like an item for borrow"
    "testable": true
  - "id": "AC-037"
    "story-ref": "US-010"
    "given": "an already-admitted adult has the private phrase or code the manager gave in person"
    "when": "they sign in on a phone they already use"
    "then": "a session starts and their display name and unit stay visible while signed in"
    "testable": true
  - "id": "AC-038"
    "story-ref": "US-010"
    "given": "someone types a wrong phrase or code"
    "when": "they submit sign-in"
    "then": "they see a short non-technical explanation and a next step to try again or speak to the manager; the product never reveals whether a given name exists"
    "testable": true
  - "id": "AC-039"
    "story-ref": "US-010"
    "given": "the adult forgot the phrase"
    "when": "they look for SMS, email, or a public recover-access page"
    "then": "those channels are not offered; recovery is only a new phrase or code issued by the manager in person"
    "testable": true
  - "id": "AC-040"
    "story-ref": "US-010"
    "given": "two adults share a phone"
    "when": "one is signed in"
    "then": "the current display name and unit stay visible; switching adult is sign out then sign in with the other adult's own manager-issued phrase or code"
    "testable": true
  - "id": "AC-041"
    "story-ref": "US-011"
    "given": "a guest, driver, or other outsider with no ResidentAccess opens the Cupboard"
    "when": "the product responds"
    "then": "they see only a short private-register explanation to speak to the building manager, and never item names, photos, units, or residents' names"
    "testable": true
  - "id": "AC-042"
    "story-ref": "US-011"
    "given": "a former resident whose access has ENDED opens the Cupboard"
    "when": "the product responds"
    "then": "they see that access has ended and to arrange outstanding returns with the manager, and they cannot browse the catalogue"
    "testable": true
  - "id": "AC-043"
    "story-ref": "US-012"
    "given": "a resident with items still out has access ended"
    "when": "the manager opens the recovery list"
    "then": "AgreedBorrows still out appear so keys and items can be chased; the former resident cannot confirm collect or return in the Cupboard"
    "testable": true
  - "id": "AC-044"
    "story-ref": "US-012"
    "given": "a remaining adult in the unit agrees in person to take over a listing after move-out"
    "when": "the manager transfers the Listing"
    "then": "the Listing belongs to that remaining adult; the former lender name stays on past borrows"
    "testable": true
  - "id": "AC-045"
    "story-ref": "US-013"
    "given": "an AgreedBorrow already exists and a party proposes a new collect window or return-by (or a return-by extension after collect) within longest length"
    "when": "they send the proposal"
    "then": "the other party is told, original times stand until they accept, and this is not treated as accept-with-change"
    "testable": true
  - "id": "AC-046"
    "story-ref": "US-013"
    "given": "the lender just accepted with a change and the hold already started"
    "when": "the borrower cannot make the new times"
    "then": "the borrower may cancel the hold before collect; the Listing becomes Free and the other party is told"
    "testable": true
  - "id": "AC-047"
    "story-ref": "US-014"
    "given": "a deputy manager (always a resident) is signed in while the manager is away"
    "when": "they admit a resident, hide a nonsense listing, or confirm they can complete core manager tasks"
    "then": "those actions succeed and residents can still browse, request, accept, collect, and return"
    "testable": true
  - "id": "AC-048"
    "story-ref": "US-014"
    "given": "a deputy is signed in"
    "when": "they try to remove the manager or name a further deputy"
    "then": "the action is refused in ordinary language"
    "testable": true
"api-surface":
  "endpoints":
    - &a1
      "id": "API-001"
      "method": "POST"
      "path": "/v1/sessions"
      "description": "Start a session with the manager-issued private phrase or code. Never public OIDC."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body":
          "phraseOrCode": "string"
      "response":
        "success":
          "status": 201
          "schema": "ResidentAccess"
        "errors":
          - "status": 401
            "message": "Sign-in did not work. Try again or speak to the manager."
          - "status": 403
            "message": "Access has ended. Arrange outstanding returns with the manager."
    - &a2
      "id": "API-002"
      "method": "DELETE"
      "path": "/v1/sessions/current"
      "description": "End this phone session so another adult can sign in as themselves."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 204
          "schema": "empty"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-003"
      "method": "GET"
      "path": "/v1/session/current"
      "description": "Read whose display name and unit is currently in use on this phone."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "ResidentAccess"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-004"
      "method": "GET"
      "path": "/v1/listings"
      "description": "Browse and filter this building catalogue (words, group, free-today). One scrollable list, not public."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params":
          "q": "string"
          "group": "ListingGroup"
          "freeToday": "boolean"
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "Listing[]"
        "errors":
          - "status": 401
            "message": "This is a private building register. Speak to the building manager."
          - "status": 403
            "message": "Access has ended. Arrange outstanding returns with the manager."
    - "id": "API-005"
      "method": "GET"
      "path": "/v1/listings/{id}"
      "description": "Read one Listing the caller may see, omitting unpublished contact notes for others."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 404
            "message": "Listing not found"
          - "status": 403
            "message": "Insufficient permissions"
    - &a3
      "id": "API-006"
      "method": "POST"
      "path": "/v1/listings"
      "description": "Create a Listing after required fields and forbidden-goods confirmation. Residents with a unit only."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body":
          "shortName": "string"
          "description": "string"
          "group": "ListingGroup"
          "collectUnitLabel": "string"
          "pickupGuidance": "string"
          "usualBorrowLength": "BorrowLength"
          "longestBorrowLength": "BorrowLength"
          "stillHaveItAndSafe": "boolean"
          "cautionApplies": "boolean"
          "forbiddenConfirmed": "boolean"
      "response":
        "success":
          "status": 201
          "schema": "Listing"
        "errors":
          - "status": 403
            "message": "Listing is for residents who live here and have a unit."
          - "status": 422
            "message": "Validation error or forbidden goods refused"
    - &a4
      "id": "API-007"
      "method": "PATCH"
      "path": "/v1/listings/{id}"
      "description": "Correct a Listing the lender owns when no agreed borrow is in progress."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "description": "string"
          "pickupGuidance": "string"
          "photoId": "string | null"
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 409
            "message": "Cannot change collect unit or completeness during an agreed borrow except by agreement."
          - "status": 403
            "message": "Insufficient permissions"
    - &a5
      "id": "API-008"
      "method": "POST"
      "path": "/v1/listings/{id}/pause"
      "description": "Pause a Listing when nothing is waiting or on hold."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 409
            "message": "Cannot pause until you answer, cancel, or the ask lapses. The step in the way is named."
    - &a6
      "id": "API-009"
      "method": "POST"
      "path": "/v1/listings/{id}/resume"
      "description": "Resume a paused Listing."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a7
      "id": "API-010"
      "method": "DELETE"
      "path": "/v1/listings/{id}"
      "description": "Withdraw a Listing after extra confirmation when nothing is on loan and nothing is in-flight."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 409
            "message": "Cannot withdraw until you answer, cancel, or the ask lapses. The step in the way is named."
    - "id": "API-011"
      "method": "GET"
      "path": "/v1/me/listings"
      "description": "List Listings this signed-in adult owns as lender."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "Listing[]"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a8
      "id": "API-012"
      "method": "POST"
      "path": "/v1/listings/{id}/requests"
      "description": "Create a BorrowRequest for a visible Free Listing."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "collectDay": "string"
          "collectStart": "string"
          "collectEnd": "string"
          "returnByAt": "string"
          "purpose": "string | null"
          "reachabilityDuringHold": "string"
      "response":
        "success":
          "status": 201
          "schema": "BorrowRequest"
        "errors":
          - "status": 409
            "message": "This item is already asked for and is not free."
          - "status": 422
            "message": "A named request rule stands in the way."
          - "status": 403
            "message": "Borrowing is for residents who live here and have a unit."
    - "id": "API-013"
      "method": "GET"
      "path": "/v1/requests/{id}"
      "description": "Read a BorrowRequest the caller is a party to."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "BorrowRequest"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a9
      "id": "API-014"
      "method": "POST"
      "path": "/v1/requests/{id}/cancel"
      "description": "Borrower cancels a waiting ask; the Listing becomes Free."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "BorrowRequest"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a10
      "id": "API-015"
      "method": "POST"
      "path": "/v1/requests/{id}/accept"
      "description": "Lender accepts as requested; hold starts; both read back the same times."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow"
        "errors":
          - "status": 409
            "message": "The request already lapsed."
    - &a11
      "id": "API-016"
      "method": "POST"
      "path": "/v1/requests/{id}/accept-with-change"
      "description": "Lender accepts with new times within longest length; hold starts now; borrower is told."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "collectStart": "string"
          "collectEnd": "string"
          "returnByAt": "string"
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow"
        "errors":
          - "status": 409
            "message": "The request already lapsed."
          - "status": 422
            "message": "Times must stay within longest borrow length."
    - &a12
      "id": "API-017"
      "method": "POST"
      "path": "/v1/requests/{id}/decline"
      "description": "Lender declines after extra confirmation; optional reason to the borrower."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "declineReason": "string | null"
      "response":
        "success":
          "status": 200
          "schema": "BorrowRequest"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-018"
      "method": "GET"
      "path": "/v1/me/borrows"
      "description": "List this adult's AgreedBorrows that are promised, out, or overdue."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow[]"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-019"
      "method": "GET"
      "path": "/v1/borrows/{id}"
      "description": "Read one AgreedBorrow the caller is a party to, including agreed times."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a13
      "id": "API-020"
      "method": "POST"
      "path": "/v1/borrows/{id}/cancel-hold"
      "description": "Either party cancels before collect; the other is told; the Listing becomes Free."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow"
        "errors":
          - "status": 409
            "message": "Collect is already confirmed; cancel-hold is not available."
    - &a14
      "id": "API-021"
      "method": "POST"
      "path": "/v1/borrows/{id}/handoffs"
      "description": "Record collect or return. Return only when the lender actually has the item."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "kind": "HandoffKind"
          "alreadyHappened": "boolean"
      "response":
        "success":
          "status": 201
          "schema": "Handoff"
        "errors":
          - "status": 409
            "message": "Hold already lapsed. Open a dispute if the item was taken."
          - "status": 422
            "message": "Return is confirmed only when the lender actually has the item."
    - &a15
      "id": "API-022"
      "method": "POST"
      "path": "/v1/handoffs/{id}/confirm"
      "description": "The other party confirms collect or return within 12 hours."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "Handoff"
        "errors":
          - "status": 409
            "message": "The 12-hour confirmation window has ended."
    - &a16
      "id": "API-023"
      "method": "POST"
      "path": "/v1/borrows/{id}/condition-notes"
      "description": "Leave a dated ConditionNote after confirmed return, signed with display name."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "body": "string"
      "response":
        "success":
          "status": 201
          "schema": "ConditionNote"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a17
      "id": "API-024"
      "method": "POST"
      "path": "/v1/condition-notes/{id}/hide"
      "description": "Manager or deputy hides an abusive note or a note that names a child; the hide is recorded."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "hiddenWhy": "string"
      "response":
        "success":
          "status": 200
          "schema": "ConditionNote"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a18
      "id": "API-025"
      "method": "POST"
      "path": "/v1/borrows/{id}/time-change"
      "description": "Propose a later time change after an agreement exists. Original times stand until the other accepts."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "collectStart": "string | null"
          "collectEnd": "string | null"
          "returnByAt": "string | null"
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a19
      "id": "API-026"
      "method": "POST"
      "path": "/v1/borrows/{id}/time-change/accept"
      "description": "Accept a later proposed time change. Distinct from accept-with-change on a waiting request."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a20
      "id": "API-027"
      "method": "PATCH"
      "path": "/v1/borrows/{id}/drop-off"
      "description": "Record a one-line drop-off change the other party can see. Does not mark return."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "dropOffChangeNote": "string"
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a21
      "id": "API-028"
      "method": "POST"
      "path": "/v1/disputes"
      "description": "Open a Dispute; freeze new requests on that Listing only."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body":
          "listingId": "string"
          "agreedBorrowId": "string | null"
          "reason": "DisputeReason"
          "partyNotesInOrder": "string"
      "response":
        "success":
          "status": 201
          "schema": "Dispute"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a22
      "id": "API-029"
      "method": "PATCH"
      "path": "/v1/disputes/{id}"
      "description": "Manager dated remark and outcome: restore free, keep paused, retire, or clear overdue block."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "managerRemark": "string"
          "outcome": "DisputeOutcome"
      "response":
        "success":
          "status": 200
          "schema": "Dispute"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-030"
      "method": "GET"
      "path": "/v1/people"
      "description": "List ResidentAccess records by unit for manager oversight."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "ResidentAccess[]"
        "errors":
          - "status": 403
            "message": "Ask the manager."
    - &a23
      "id": "API-031"
      "method": "POST"
      "path": "/v1/people"
      "description": "Admit an adult by display name and unit; issue phrase or code in person. No public signup."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body":
          "displayName": "string"
          "unitLabel": "string | null"
          "livesInBuilding": "boolean"
          "livesInThatUnit": "boolean"
          "role": "AccessRole"
      "response":
        "success":
          "status": 201
          "schema": "ResidentAccess"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-032"
      "method": "GET"
      "path": "/v1/people/{id}"
      "description": "Read one ResidentAccess the manager may manage."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "ResidentAccess"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a24
      "id": "API-033"
      "method": "PATCH"
      "path": "/v1/people/{id}"
      "description": "Correct unit or name or remove deputy courtesy (building manager only for deputy changes)."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "unitLabel": "string | null"
          "role": "AccessRole"
      "response":
        "success":
          "status": 200
          "schema": "ResidentAccess"
        "errors":
          - "status": 403
            "message": "A deputy cannot remove the manager or name further deputies."
    - &a25
      "id": "API-034"
      "method": "POST"
      "path": "/v1/people/{id}/end-access"
      "description": "End access after extra confirmation; keep outstanding items on the recovery list."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "endedReason": "string"
      "response":
        "success":
          "status": 200
          "schema": "ResidentAccess"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a26
      "id": "API-035"
      "method": "POST"
      "path": "/v1/people/{id}/reissue-phrase"
      "description": "Issue a new private phrase or code in person after forgotten sign-in. Never SMS."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "ResidentAccess"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a27
      "id": "API-036"
      "method": "POST"
      "path": "/v1/listings/{id}/hide"
      "description": "Manager hide of duplicate or nonsense. May cancel an in-flight ask or hold and tell both people."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "hiddenWhy": "string"
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a28
      "id": "API-037"
      "method": "POST"
      "path": "/v1/listings/{id}/unhide"
      "description": "Unhide a Listing that was hidden as duplicate or nonsense. Safety retirement is not reversed this way."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a29
      "id": "API-038"
      "method": "POST"
      "path": "/v1/listings/{id}/retire"
      "description": "Retire unsafe, abandoned, or disputed Listing. If out, stays out until return; no new requests."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "retiredWhy": "string"
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a30
      "id": "API-039"
      "method": "POST"
      "path": "/v1/listings/{id}/transfer"
      "description": "Transfer a Listing to a remaining adult in the unit after move-out."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "newLenderAccessId": "string"
      "response":
        "success":
          "status": 200
          "schema": "Listing"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a31
      "id": "API-040"
      "method": "PUT"
      "path": "/v1/building-notice"
      "description": "Replace the single BuildingNotice at the top of the catalogue."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body":
          "body": "string"
          "startsAt": "string"
          "endsAt": "string | null"
      "response":
        "success":
          "status": 200
          "schema": "BuildingNotice"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a32
      "id": "API-041"
      "method": "DELETE"
      "path": "/v1/building-notice"
      "description": "End the single BuildingNotice so it disappears from the catalogue."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "BuildingNotice"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-042"
      "method": "GET"
      "path": "/v1/manager/oversight"
      "description": "Read the five oversight answers plus overdue and open-dispute lists."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "OversightSnapshot"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-043"
      "method": "GET"
      "path": "/v1/manager/oversight/print"
      "description": "Readable printable page of the five answers; omit unpublished contact notes. Not a spreadsheet."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "OversightSnapshot"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-044"
      "method": "GET"
      "path": "/v1/manager/activity"
      "description": "Twelve-month building-wide ManagerActivityEvent list (who, when, what, why)."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "ManagerActivityEvent[]"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-045"
      "method": "GET"
      "path": "/v1/manager/operational"
      "description": "Failed sign-in clustering and forbidden-listing attempts. Residents never see this list."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "OperationalEvent[]"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-046"
      "method": "GET"
      "path": "/v1/manager/recovery"
      "description": "AgreedBorrows still out after access ended or seven-day unresolved loss."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "AgreedBorrow[]"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - "id": "API-047"
      "method": "GET"
      "path": "/v1/notices"
      "description": "In-Cupboard notices for the signed-in person, including overdue and access-ended which cannot be turned off."
      "auth-required": true
      "request":
        "path-params": {}
        "query-params": {}
        "body": {}
      "response":
        "success":
          "status": 200
          "schema": "InCupboardNotice[]"
        "errors":
          - "status": 401
            "message": "Sign in required"
          - "status": 403
            "message": "Insufficient permissions"
    - &a33
      "id": "API-048"
      "method": "POST"
      "path": "/v1/listings/{id}/photo"
      "description": "Attach at most one optional photo of the actual item. Listing still saves if attach fails."
      "auth-required": true
      "request":
        "path-params":
          "id": "string"
        "query-params": {}
        "body":
          "altText": "string"
      "response":
        "success":
          "status": 201
          "schema": "Photograph"
        "errors":
          - "status": 422
            "message": "The picture did not attach. The listing was saved without a photo."
  "mutations":
    - *a1
    - *a2
    - *a3
    - *a4
    - *a5
    - *a6
    - *a7
    - *a8
    - *a9
    - *a10
    - *a11
    - *a12
    - *a13
    - *a14
    - *a15
    - *a16
    - *a17
    - *a18
    - *a19
    - *a20
    - *a21
    - *a22
    - *a23
    - *a24
    - *a25
    - *a26
    - *a27
    - *a28
    - *a29
    - *a30
    - *a31
    - *a32
    - *a33
"ui-surface":
  "screens":
    - "id": "SCR-001"
      "title": "Sign in"
      "route": "/sign-in"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "SignInPhraseForm"
        - "SignInFailureBanner"
        - "SpeakToManagerHint"
        - "SessionIdentityPreview"
      "notes": "Create a signed-in session for ResidentAccess with the manager-issued phrase or code."
    - "id": "SCR-002"
      "title": "Private building register"
      "route": "/private-register"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "PrivateRegisterExplanation"
        - "SpeakToManagerNextStep"
      "notes": "View the private-register explanation for an outsider; never list Listings, photos, units, or names."
    - "id": "SCR-003"
      "title": "Access ended"
      "route": "/access-ended"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "AccessEndedBanner"
        - "ArrangeReturnsWithManagerHint"
      "notes": "View the ended-access message for a former ResidentAccess and point outstanding returns to the manager."
    - "id": "SCR-004"
      "title": "Building catalogue"
      "route": "/catalogue"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "BuildingNoticeBanner"
        - "CatalogueSearchField"
        - "FreeTodayFilter"
        - "GroupFilterChips"
        - "CatalogueList"
        - "ListingStatusWord"
        - "EmptyCatalogueInvitation"
        - "ZeroMatchClearSearch"
        - "CurrentSessionIdentityBar"
      "notes": "Browse and filter all Listings in this building; each row opens listing detail."
    - "id": "SCR-005"
      "title": "Listing"
      "route": "/listings/:id"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "ListingDetailHeader"
        - "ListingStatusWord"
        - "PickupGuidanceBlock"
        - "FixedCautionBanner"
        - "ConditionNotesList"
        - "ReplacementValueHint"
        - "RequestThisItemAction"
        - "LenderListingActions"
        - "DisputeOpenBanner"
        - "HiddenContactNoteOmitted"
      "notes": "View a single Listing with status, pickup, caution, and request or lender actions."
    - "id": "SCR-006"
      "title": "List an item"
      "route": "/listings/new"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "ListingCreateForm"
        - "ForbiddenGoodsConfirm"
        - "CautionAppliesToggle"
        - "OptionalPhotoAttach"
        - "ReplacementValueField"
        - "PublishContactNoteToggle"
        - "ListingValidationSummary"
      "notes": "Create a new Listing with required fields, forbidden-goods confirmation, and optional photo."
    - "id": "SCR-007"
      "title": "My listings"
      "route": "/my/listings"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "MyListingsList"
        - "ListingStatusWord"
        - "AddListingAction"
      "notes": "List my own Listings; each row opens manage listing."
    - "id": "SCR-008"
      "title": "Manage listing"
      "route": "/listings/:id/manage"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "ListingEditForm"
        - "PauseListingAction"
        - "ResumeListingAction"
        - "WithdrawListingConfirmModal"
        - "InFlightBlockBanner"
        - "OptionalPhotoAttach"
      "notes": "Manage a single Listing the lender owns: pause, resume, correct, or withdraw."
    - "id": "SCR-009"
      "title": "Request to borrow"
      "route": "/listings/:id/request"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "BorrowRequestForm"
        - "CollectWindowFields"
        - "ReturnByField"
        - "ReachabilityField"
        - "RequestRuleFailureBanner"
        - "SendRequestAction"
      "notes": "Create a BorrowRequest for a free Listing with collect window and return-by."
    - "id": "SCR-010"
      "title": "Incoming request"
      "route": "/requests/:id"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "IncomingRequestReadback"
        - "AcceptAsRequestedAction"
        - "AcceptWithChangeForm"
        - "DeclineRequestConfirmModal"
        - "LapseCountdown"
      "notes": "Manage a waiting BorrowRequest: accept as requested, accept with a change, or decline."
    - "id": "SCR-011"
      "title": "On loan and promised"
      "route": "/my/borrows"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "MyBorrowsList"
        - "AgreedTimesReadback"
        - "OverdueBanner"
        - "OpenHandoffAction"
        - "ProposeTimeChangeAction"
      "notes": "List my AgreedBorrows currently promised, out, or overdue."
    - "id": "SCR-012"
      "title": "Collect or return"
      "route": "/borrows/:id/handoff"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "AgreedTimesReadback"
        - "RecordCollectAction"
        - "ConfirmCollectAction"
        - "RecordReturnAction"
        - "ConfirmReturnAction"
        - "AlreadyHappenedToggle"
        - "DropOffChangeNoteField"
        - "HandoffWaitingBanner"
        - "SeparateCollectReturnControls"
      "notes": "Manage a single Handoff for an AgreedBorrow: record or confirm collect, or record or confirm return."
    - "id": "SCR-013"
      "title": "Condition note"
      "route": "/borrows/:id/condition-note"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "ConditionNoteForm"
        - "DamagedReturnConfirmModal"
        - "SignedDisplayNamePreview"
      "notes": "Create a ConditionNote after confirmed return, signed with display name."
    - "id": "SCR-014"
      "title": "Your notices"
      "route": "/notices"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "NoticeList"
        - "OverdueNoticeCard"
        - "AccessEndedNoticeCard"
        - "BuildingNoticeBanner"
      "notes": "List InCupboardNotice items the signed-in person must see when they open the Cupboard."
    - "id": "SCR-015"
      "title": "Who has access"
      "route": "/manager/people"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "PeopleByUnitList"
        - "AdmitResidentAction"
        - "EndAccessAction"
        - "CorrectUnitAction"
      "notes": "List all ResidentAccess records by unit for manager oversight."
    - "id": "SCR-016"
      "title": "Admit an adult"
      "route": "/manager/people/new"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "AdmitResidentForm"
        - "LivesInUnitConfirm"
        - "IssueSignInPhrasePanel"
        - "OffSiteManagerNoUnitHint"
      "notes": "Register a new ResidentAccess by display name and unit, then issue a phrase or code in person."
    - "id": "SCR-017"
      "title": "Manage access"
      "route": "/manager/people/:id"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "AccessDetailHeader"
        - "CorrectUnitForm"
        - "NameDeputyAction"
        - "RemoveDeputyAction"
        - "EndAccessConfirmModal"
        - "ReissuePhrasePanel"
      "notes": "Manage a single ResidentAccess: correct unit, name or remove deputy, or end access."
    - "id": "SCR-018"
      "title": "Manager oversight"
      "route": "/manager/oversight"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "FiveQuestionsSummary"
        - "OverdueItemsList"
        - "OpenDisputesList"
        - "PrintOversightAction"
      "notes": "Dashboard overview of overdue AgreedBorrows, open Disputes, and the five oversight answers."
    - "id": "SCR-019"
      "title": "Twelve-month activity"
      "route": "/manager/activity"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "ActivityEventList"
        - "ActivityWhoWhenWhatWhy"
      "notes": "List building-wide ManagerActivityEvent rows for the last twelve months."
    - "id": "SCR-020"
      "title": "Something looks wrong"
      "route": "/manager/operational"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "OperationalEventList"
        - "FailedSignInRow"
        - "ForbiddenAttemptRow"
      "notes": "List OperationalEvent rows for failed sign-in clustering and forbidden-listing attempts."
    - "id": "SCR-021"
      "title": "Dispute"
      "route": "/manager/disputes/:id"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "DisputeFreezeBanner"
        - "PartyNotesInOrder"
        - "ManagerRemarkForm"
        - "DisputeOutcomeActions"
      "notes": "Manage a single Dispute: notes in order, dated remark, and outcome."
    - "id": "SCR-022"
      "title": "Items still out"
      "route": "/manager/recovery"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "RecoveryList"
        - "TransferListingAction"
        - "RecordManagerRecoveryAction"
      "notes": "List AgreedBorrows still out after access ended or seven-day unresolved loss."
    - "id": "SCR-023"
      "title": "Building-wide notice"
      "route": "/manager/notice"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "BuildingNoticeForm"
        - "EndNoticeAction"
        - "NoticeNotAnItemHint"
      "notes": "Create or replace the single BuildingNotice at the top of the catalogue."
    - "id": "SCR-024"
      "title": "Committee page"
      "route": "/manager/oversight/print"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "PrintableFiveAnswers"
        - "SaveAsDocumentAction"
        - "UnpublishedNotesOmittedHint"
      "notes": "Overview of the five oversight answers as a printable readable page for a committee meeting."
    - "id": "SCR-025"
      "title": "Change agreed times"
      "route": "/borrows/:id/time-change"
      "states":
        - "loading"
        - "empty"
        - "error"
        - "success"
      "components":
        - "OriginalTimesStandBanner"
        - "TimeChangeProposalForm"
        - "AcceptTimeChangeAction"
        - "CancelHoldAction"
      "notes": "Manage an AgreedBorrow time-change proposal before collect, or a return-by extension after collect."
  "interactions":
    - "id": "INT-001"
      "trigger": "submits the manager-issued phrase or code"
      "response": "starts a session and shows current display name and unit"
      "screen-ref": "SCR-001"
    - "id": "INT-002"
      "trigger": "submits a wrong phrase or code"
      "response": "shows a short non-technical failure and never reveals whether a name exists"
      "screen-ref": "SCR-001"
    - "id": "INT-003"
      "trigger": "an outsider opens the Cupboard"
      "response": "shows the private-register explanation with speak to the manager as the next step"
      "screen-ref": "SCR-002"
    - "id": "INT-004"
      "trigger": "types words, free-today, or a group chip"
      "response": "filters the Listing list in place; zero matches offers clear-search"
      "screen-ref": "SCR-004"
    - "id": "INT-005"
      "trigger": "opens a catalogue row"
      "response": "opens Listing detail with status words, pickup, and request or lender actions"
      "screen-ref": "SCR-005"
    - "id": "INT-006"
      "trigger": "submits List an item after forbidden-goods confirmation"
      "response": "creates a Free Listing or refuses forbidden words and tells the manager"
      "screen-ref": "SCR-006"
    - "id": "INT-007"
      "trigger": "taps pause or withdraw while a request is waiting or a hold is open"
      "response": "blocks the action and names the step in the way"
      "screen-ref": "SCR-008"
    - "id": "INT-008"
      "trigger": "sends a request on a Free Listing"
      "response": "shows WAITING before they leave; or names the rule in the way; or says already asked"
      "screen-ref": "SCR-009"
    - "id": "INT-009"
      "trigger": "accepts with a change to times"
      "response": "starts the hold now at the new times and tells the borrower at once"
      "screen-ref": "SCR-010"
    - "id": "INT-010"
      "trigger": "records collect as already happened after an outage"
      "response": "waits for the other party to confirm within 12 hours"
      "screen-ref": "SCR-012"
    - "id": "INT-011"
      "trigger": "confirms return when the lender has the item"
      "response": "marks the Listing Free immediately"
      "screen-ref": "SCR-012"
    - "id": "INT-012"
      "trigger": "submits a condition note after confirmed return"
      "response": "stores a dated note signed with display name; cannot edit once sent"
      "screen-ref": "SCR-013"
    - "id": "INT-013"
      "trigger": "admits an adult and issues a phrase in person"
      "response": "creates ACTIVE ResidentAccess with no public signup"
      "screen-ref": "SCR-016"
    - "id": "INT-014"
      "trigger": "ends access after extra confirmation"
      "response": "catalogue is gone for that person; outstanding items stay on recovery"
      "screen-ref": "SCR-017"
    - "id": "INT-015"
      "trigger": "prints or saves the five oversight answers"
      "response": "opens a readable page omitting unpublished contact notes"
      "screen-ref": "SCR-024"
    - "id": "INT-016"
      "trigger": "hides or retires an unsafe Listing that has an in-flight ask"
      "response": "cancels the waiting request or open hold and tells both people"
      "screen-ref": "SCR-018"
    - "id": "INT-017"
      "trigger": "proposes a later time change after an agreement exists"
      "response": "tells the other party; original times stand until they accept"
      "screen-ref": "SCR-025"
    - "id": "INT-018"
      "trigger": "borrower cancels a hold after accept-with-change"
      "response": "Listing becomes Free and the lender is told"
      "screen-ref": "SCR-025"
    - "id": "INT-019"
      "trigger": "transfers a Listing to a remaining adult after move-out"
      "response": "new lender owns the Listing; former name stays on past borrows"
      "screen-ref": "SCR-022"
    - "id": "INT-020"
      "trigger": "deputy tries to name a further deputy or remove the manager"
      "response": "refuses in ordinary language"
      "screen-ref": "SCR-017"
"non-functional":
  "performance":
    - "Opening the catalogue and seeing free or busy for about 100 items completes in under 1 second at p95 on ordinary building connectivity. Waiting several seconds for that answer fails the acceptance."
    - "See if free, request, say yes, and confirm handoff must be possible on a phone held in one hand."
    - "While an action is sending, the control is not usable twice. If it did not go through, they are told and try again."
  "accessibility":
    - "WCAG 2.2 AA for core resident flows (catalogue, open item, request, confirm handoff) and for manager and deputy core tasks (admit, hide or retire, dispute remark, five questions, export)."
    - "Keyboard navigation and screen reader completion for those core tasks."
    - "Status as text words, not colour alone. No required sound or flashing. Large, hard-to-confuse touch targets for Accept, Decline, Confirm, and Cancel."
    - "Photographs have text alternatives (item name if blank). English UI copy with weekday plus local civil date and time."
  "security":
    - "Private building register. All catalogue, listing, request, handoff, and manager operations require an admitted-adult session started with the manager-issued private phrase or code. Not public OIDC self-signup."
    - "Failed sign-in never reveals whether a given name exists. No SMS or public recover-access page."
    - "Only admitted people see catalogue, photos, units, and names. Photos and notes are not reachable as a public website."
    - "No date of birth, government id, or payment details. Unpublished contact notes stay with the lender who typed them."
  "scalability":
    - "Supports one building of about 80 homes and about 150 adults with a catalogue on the order of 100 items as one scrollable list, not a paginated 20-item marketplace."
  "observability":
    - "Manager twelve-month activity list records who, when, which item or person, what happened, and why-words for hide, retire, access-end, requests, decisions, handoffs, overdue, and hidden notes."
    - "Operational list (residents never see it) shows time, failed sign-in without revealing whether a guessed name exists, and forbidden-listing attempts with listing name and unit. Burst is visible clustering, not a pager."
    - "In-Cupboard notices are the source of record for borrow events, including overdue and access-ended which cannot be turned off. Committee judges success from the five oversight answers, not an in-product dashboard."
"risks":
  - "id": "RISK-001"
    "description": "Two residents requesting the same free item at once could create two promised borrowers for one physical item."
    "likelihood": "medium"
    "impact": "high"
    "mitigation": "Exactly one WAITING request is recorded. The other person is told the item is already asked for and is not queued (ASSM-001)."
  - "id": "RISK-002"
    "description": "On a shared phone a partner may accept a request as the other person if session identity is unclear or a fast switch hides who is acting."
    "likelihood": "medium"
    "impact": "high"
    "mitigation": "Display name and unit stay visible while signed in. Switch adult only by sign-out then sign-in with that adult's own phrase. Confirm ASSM-002 (Q-001) before build if the committee wants a different session length."
  - "id": "RISK-003"
    "description": "If the first manager seat is empty and no deputy exists, nobody can be admitted."
    "likelihood": "low"
    "impact": "high"
    "mitigation": "First manager and successor are granted out of band at Cupboard setup or by the resident committee. No self-serve become manager in v1 (ASSM-003 / Q-002)."
  - "id": "RISK-004"
    "description": "Forbidden goods could reach the catalogue if detection is invented as a silent honour system or an unspecified detector."
    "likelihood": "medium"
    "impact": "medium"
    "mitigation": "Lender confirms not-forbidden before show. Obvious forbidden words in the name are refused and the manager is told. Caution is lender-marked, not inferred from tools alone (ASSM-004)."
  - "id": "RISK-005"
    "description": "Treating manager hide like lender pause could leave a promised item hanging; silently dropping a hold is also wrong."
    "likelihood": "medium"
    "impact": "medium"
    "mitigation": "Lender pause and withdraw stay blocked while in-flight (DEC-004). Manager hide or retire may cancel the in-flight ask and tell both people (ASSM-020 / Q-003)."
  - "id": "RISK-006"
    "description": "Residents without SMS cannot recover a forgotten phrase except in person, which may delay access."
    "likelihood": "medium"
    "impact": "medium"
    "mitigation": "This is an explicit product choice (DEC-001). Manager reissues a phrase in person. Do not add SMS or a public recover page."
"assumptions":
  - "id": "ASSM-001"
    "description": "Exactly one waiting request is recorded. The other person is told the item is already asked for and is not free; they are not queued. The item never has two waiting requests."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-002"
    "description": "Current display name and unit stay visible while signed in. Stay signed in on this phone until the person signs out or the manager ends access. Switching adult is sign out then sign in as the other person with that adult's own manager-issued phrase or code — no fast switch that could hide who is acting."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-003"
    "description": "The first manager seat is granted when the Cupboard is set up for this building (out of band) and that person receives a manager-issued phrase or code in person. A successor is appointed by the resident committee out of band. v1 has no self-serve 'become manager'. An off-site first manager may have no unit and then cannot list or borrow."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-004"
    "description": "Before a listing is shown, the lender confirms it is not on the forbidden list. Obvious forbidden words in the name are refused with the reason and the manager is told. Lender marks whether the fixed caution applies (not inferred from 'tools' alone). Remaining junk is the manager's to hide or retire."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-005"
    "description": "Unpublished contact notes are visible only to the lender who typed them. Replacement value is visible to the lender, to the manager, and to the two parties if the item is reported gone or in dispute — never as a catalogue price."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-006"
    "description": "Unauthorized manager actions are refused in ordinary language with 'ask the manager' as the next step. An off-site manager who tries to list or request is refused in ordinary language: listing and borrowing are for residents who live here and have a unit; manager work is still available. A late accept/decline is told the request already lapsed. Failed export: told to try again; on-screen lists remain the answers. Mid-flow sign-in loss: the unsent action did not go through; they start it again after signing in."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-007"
    "description": "At most one optional photo of the actual item, common phone picture types, usable on a phone. Upload failure: listing still saves without a photo; person is told the picture did not attach. Photo leaves ordinary catalogue immediately on withdraw/retire; manager may still see it while that listing record is kept, then it goes with the record. Do not specify a vendor or API."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-008"
    "description": "Before return, either party may record a one-line drop-off change the other can see. Return is confirmed only when the lender actually has the item. A wrong-unit drop stays a human conversation; the Cupboard does not mark return from a third unit."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-009"
    "description": "Case-insensitive match on name and description; groups and free-today are filters, not ranks. No featured slots. With on the order of 100 items, show all matches in one scrollable list. Zero matches: nothing matched plus clear-search, no invented substitutes. Not a paginated 20-item list."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-010"
    "description": "One timezone and one currency are configured once for this building at setup. All civil times use that timezone and show weekday. Replacement value is a plain number in that currency, never a checkout price. Not ISO 8601-only display."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-011"
    "description": "Opening the catalogue and seeing free/busy for ~100 items completes in under 1 second at p95 on ordinary building connectivity. Waiting several seconds for that answer fails the AC. Not a 500ms generic SLA."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-012"
    "description": "Only admitted people see catalogue, photos, units, and names. Photos and notes are not reachable as a public website. No extra legal document at every open. Do not invent a crypto stack as a requirement. Not public OIDC/bearer auth."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-013"
    "description": "Manager may unhide a listing that was hidden as duplicate/nonsense. A safety retirement stays retired unless the manager explicitly treats a new listing as the replacement. Ended access is reversed by admitting the person again. Confirmation copy is one plain sentence naming the action."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-014"
    "description": "v1 delivers §14 events as in-Cupboard notices the person sees when they open the Cupboard, plus the single building-wide catalogue banner. Outside-channel opt-in is omitted until the building names the existing lift-outage channel. Non-urgent outside nudges, if later added, are not sent 21:00–08:00 building time; overdue evening notices aimed at 18:00–20:00. Both parties are told when a dispute opens and when the manager decides. Accept-with-change tells the borrower at once. A later proposed time-change after an agreement already exists tells the other party and waits; original times stand until they accept. SMS/email is not a required channel."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-015"
    "description": "Manager types the unit using existing building numbers (no unit-admin screen). Manager may replace or end the single notice. Declined/lapsed/cancelled requests appear on the 12-month manager activity list but do not follow the confirmed-borrow 12+12 summary rule. A dispute decision is a dated remark; the freeze lifts per the chosen outcome; the dispute stays in 12-month activity. Ended access cannot confirm collect/return in the Cupboard; the manager records recovery."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-016"
    "description": "Operational list shows time, failed sign-in without revealing whether a guessed name exists, and forbidden-listing attempts with listing name and unit. Hide/retire/access-end activity names who did it, when, which item or person, and the manager's why-words. 'Burst' is visible clustering on that list, not a pager. Committee judges §3 success from the five oversight answers, not a dashboard. Observability is manager lists, not Datadog."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-017"
    "description": "A printable readable page of those five answers that the manager can print or save as a document from the phone or laptop. Not a spreadsheet, not graphs. Catalogue snapshot is current; borrow records in that document cover three months. Do not invent an export API."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-018"
    "description": "Map §18.3 and §24 to WCAG 2.2 AA for core resident flows. Manager and deputy core tasks (admit, hide/retire, dispute remark, five questions, export) are also completable by keyboard and screen reader. English copy; weekday + local civil date/time."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-019"
    "description": "Time-change before collect, return-by extension after collect, move-out pause/retire/transfer, and manager recovery list are in v1 because they are specified. The twelve-point list is the minimum demonstration, not an exclusion."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-020"
    "description": "Manager hide or retire of a duplicate, nonsense, forbidden, or unsafe listing may cancel a waiting request or an open hold; both people are told. This is manager safety work, not a lender pause."
    "source": "enricher"
    "confidence": "medium"
    "requires-confirmation": true
  - "id": "ASSM-021"
    "description": "Greenfield: no import of lobby-chat history. Existing building processes (fobs, written notices, key deposit) stay outside this product. No existing Cupboard users or records to break."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-022"
    "description": "A subletter is admitted as a resident for their stay and ended when they leave, same as any other adult the manager records against a unit."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-023"
    "description": "While an action is sending, the control is not usable twice. If it did not go through, they are told and try again. Successful request shows waiting before they leave the screen. Empty catalogue stays the invitation, not a spinner-as-error."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-024"
    "description": "Committee observes return-on-agreed-day from manager records; no in-product KPI. Same-day understanding is supported by lobby poster copy already written in §29, not by a training module."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-025"
    "description": "List and detail screens show a skeleton loader matching content structure while loading, distinct from empty and error."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
  - "id": "ASSM-026"
    "description": "Forms validate on blur and re-validate on submit, in ordinary language naming the field and the next step."
    "source": "enricher"
    "confidence": "high"
    "requires-confirmation": false
"open-questions":
  - "id": "Q-001"
    "question": "Confirm session length and shared-phone switch: stay signed in until sign-out or manager ends access, and switch adult only by sign-out then sign-in with that adult's own manager-issued phrase or code (no fast switch)?"
    "raised-by": "enricher"
    "status": "open"
    "answer": ""
  - "id": "Q-002"
    "question": "Confirm first manager seat and successor are granted out of band (Cupboard setup / resident committee), with no self-serve 'become manager' in v1?"
    "raised-by": "enricher"
    "status": "open"
    "answer": ""
  - "id": "Q-003"
    "question": "Confirm that manager hide/retire of a duplicate, nonsense, forbidden, or unsafe listing may cancel a waiting request or open hold and tell both people (unlike lender pause/withdraw, which stays blocked until settled)?"
    "raised-by": "enricher"
    "status": "open"
    "answer": ""
"traceability":
  "source-requirements":
    - "file": "requirements.md"
      "section": "1. Purpose / 2. Problem to solve"
      "maps-to":
        - "US-001"
        - "US-002"
        - "US-003"
        - "AC-001"
    - "file": "requirements.md"
      "section": "4. Out of scope"
      "maps-to":
        - "US-011"
    - "file": "requirements.md"
      "section": "5. People and roles"
      "maps-to":
        - "US-008"
        - "US-009"
        - "US-010"
        - "US-014"
        - "DEC-001"
        - "DEC-002"
    - "file": "requirements.md"
      "section": "Catalogue, listing, request, accept, handoff, overdue, condition notes"
      "maps-to":
        - "US-001"
        - "US-002"
        - "US-003"
        - "US-004"
        - "US-005"
        - "US-006"
        - "US-007"
        - "US-013"
    - "file": "requirements.md"
      "section": "25. v1 done"
      "maps-to":
        - "US-001"
        - "US-002"
        - "US-003"
        - "US-004"
        - "US-005"
        - "US-008"
        - "US-009"
        - "US-011"
    - "file": "qa-log.md"
      "section": "Round 1 Q1–Q4"
      "maps-to":
        - "DEC-001"
        - "DEC-002"
        - "DEC-003"
        - "DEC-004"
        - "US-004"
        - "US-008"
        - "US-010"
        - "AC-007"
        - "AC-015"
  "decisions":
    - "id": "DEC-001"
      "decision": "Manager-issued sign-in. After the manager admits an adult, that adult signs in with a private phrase or code the manager gives them in person. No public signup, no SMS, no self-serve recovery."
      "rationale": "The Cupboard is a private building register. Public OIDC, magic links, or SMS OTP would assume a public recover-access page or that a resident can receive a text message, both of which the requirements forbid. In-person issue after admit keeps joining manager-mediated."
      "alternatives-considered":
        - "Public OIDC or email magic link — rejected because it is public self-signup and recovery."
        - "SMS or WhatsApp OTP — rejected because nothing in the product may assume a resident can receive a text message."
        - "Building Wi-Fi gate with no per-adult phrase — rejected because shared-phone households would not know whose access is in use."
    - "id": "DEC-002"
      "decision": "Residents only may list or borrow. No Staff lender role. An off-site manager does manager work only, and lists or borrows only if they also live here and have a unit."
      "rationale": "Staff who do not live on site have no private lending privilege. Nested resident powers for the manager seat would silently create staff lending the committee forbade. A staff or manager account may still exist; it does not confer lending."
      "alternatives-considered":
        - "Manager may always list and request like a resident even when off-site — rejected because that is non-resident staff lending."
        - "Add a Staff lender role for people who work here but do not live here — rejected; v1 has no Staff lender role."
    - "id": "DEC-003"
      "decision": "When a lender accepts a request but changes the collect window or return-by (still within longest length), the hold starts immediately at those new times. The borrower is told at once and may cancel before collect. No second yes is required to start the hold."
      "rationale": "Disagreement about what was agreed is a product failure. Waiting for a second yes would leave the item neither free nor promised. Binding the counter-change immediately, then letting the borrower cancel, keeps one promised borrower and an honest catalogue word Promised."
      "alternatives-considered":
        - "Require the borrower to accept the changed times before a hold starts — rejected; the item would hang without a promise."
        - "Treat accept-with-change like a later proposed time-change that waits for a yes — rejected for the first answer; later proposed changes after an agreement already exists still wait (see US-013)."
    - "id": "DEC-004"
      "decision": "While a request is waiting or a hold is open, the lender cannot pause or withdraw until they answer, cancel, or the ask or hold lapses. They are told which step is in the way."
      "rationale": "Pause and withdraw remain available when nothing is in-flight. Blocking them during an in-flight ask prevents a second household from being promised an item the lender just paused or withdrew."
      "alternatives-considered":
        - "Allow pause to cancel the waiting ask silently — rejected; the borrower would not know why the item vanished."
        - "Leave the in-flight ask running after withdraw — rejected; the catalogue would promise an item that is no longer listed."
---

# The Building Cupboard

## Problem Context

Residents of this one occupied apartment building already lend drills, folding chairs, cake tins, steamers, and spare air mattresses, but the arrangement is informal and uneven. People ask in the lobby chat, forget who has what, leave items on landings, and stop lending after a bad experience. Useful things sit unused while a neighbor buys the same object for a single afternoon.

Lenders cannot say yes or no without being chased. Borrowers cannot tell pickup hours, whether the set is complete, or which door to knock. After move-out, a former resident may still be treated as responsible for an item that is out. Damaged or incomplete returns become quiet resentment rather than a dated record about the item. The building manager hears disputes only after they have soured the hallway.

Without a private register, the workaround is the same group chat, plus word of mouth. That fails fairness: a handful of households can dominate popular items with no honest status, and outsiders (guests, drivers, search engines) must not browse names, units, photos, or the catalogue. Solving this now is what lets the committee run a neighborly cupboard — visible, time-bounded, and accountable — without turning neighbors into a shop.

---

## Solution Overview

The Building Cupboard is a shared, building-only register of household items residents will lend, plus a way to ask, agree times, pick up, return, and record how the item came back. Physical items stay in homes; the product records agreements and status words (Free, Asked for, Promised, Out, Paused, Overdue, Retired).

A manager admits each adult in person and gives a private phrase or code. That adult signs in on a phone they already use. Residents with a unit list and borrow as themselves. An off-site manager does manager work only. Neighbors browse an honest catalogue, request with a collect window and return-by, and lenders accept as requested, accept with a change (hold starts now), or decline within 24 hours. Collect and return are mutually confirmed. Overdue is visible and blocks new asks without fees. The manager hides or retires unsafe listings, handles disputes, recovers items after move-out, and prints five oversight answers for the committee.

The Cupboard does not take money, run queues, publish a public website, require SMS, or rate people.

---

## User Flows

### Flow 1: Browse and search the catalogue

**Actor**: Resident
**Precondition**: Signed in with a unit; session display name is visible.

**Happy Path**:
1. The resident opens the catalogue.
2. The product shows a skeleton loader, then Listings with status words, collect unit, usual period, and pickup guidance.
3. The resident filters by words, free-today, or an everyday group.
4. Matching items appear in one scrollable list.
5. They open a row and can answer whether it is free, who to collect from, and when it must come back.

**Error Path — nothing matched**:
1. The resident searches for words that match no Listing.
2. The product detects zero matches.
3. The product presents: "Nothing matched. Clear search to see the catalogue again."
4. The user can clear search; the product does not invent substitutes.

### Flow 2: List an item and pause later

**Actor**: Resident (lender)
**Precondition**: Lives here, has a unit, not an off-site manager without a unit.

**Happy Path**:
1. The lender opens create listing and confirms the item is not forbidden.
2. They fill required fields and optionally attach one photo.
3. The Listing is Free in the catalogue.
4. When nothing is in-flight they pause it; status becomes Paused and no new requests arrive.

**Error Path — pause while a request is waiting**:
1. A neighbor has a WAITING request on this Listing.
2. The lender tries to pause or withdraw.
3. The product presents: "You cannot pause or withdraw yet. A request is waiting — answer, cancel, or wait for it to lapse."
4. The user can accept, decline, or wait; pause stays blocked.

### Flow 3: Request a free item

**Actor**: Resident (borrower)
**Precondition**: In good standing, fewer than three active borrows, item is Free and visible.

**Happy Path**:
1. The borrower opens the Listing and chooses request.
2. They enter collect window, return-by within longest length, and reachability during the hold.
3. While sending, the control cannot be used twice.
4. They see the ask as waiting before leaving the screen.
5. The Listing shows Asked for.

**Error Path — already asked**:
1. Another resident's request is recorded first (including a simultaneous submit).
2. The product records exactly one WAITING request.
3. The product presents: "This item is already asked for and is not free."
4. The user is not queued and can browse other Free items.

### Flow 4: Accept with a change (hold starts now)

**Actor**: Resident (lender)
**Precondition**: WAITING request within 24 hours.

**Happy Path**:
1. The lender opens the incoming request and reads the hoped-for times.
2. They accept with a change still within longest length.
3. The hold starts immediately; Listing is Promised; both can read back the new times.
4. The borrower is told at once and may cancel before collect.

**Error Path — answer after lapse**:
1. Twenty-four hours pass with no answer.
2. The request lapses and the Listing is Free.
3. The product presents: "This request already lapsed."
4. The user can wait for a new request; they cannot promise this lapsed ask.

### Flow 5: Mutual collect and return

**Actor**: Resident (party to the borrow)
**Precondition**: AgreedBorrow is HOLD_PROMISED or OUT.

**Happy Path**:
1. Either party records collect (including already happened after an outage).
2. The other confirms within 12 hours; the item is Out.
3. Before return, either may record a one-line drop-off change the other can see.
4. Return is recorded when the lender actually has the item and the other confirms.
5. The Listing is Free immediately.

**Error Path — third-unit drop**:
1. Someone tries to mark return from a unit that does not have the item.
2. The product refuses to mark return from a third unit.
3. The product presents: "Return is confirmed only when the lender actually has the item."
4. The user can record a drop-off note and talk in person; they cannot fake the handoff.

### Flow 6: Condition note after return

**Actor**: Resident (party to a confirmed return)
**Precondition**: Return is confirmed.

**Happy Path**:
1. The person opens the condition-note form.
2. They write a short paragraph about the item, not the person.
3. The note is dated and signed with display name.
4. Future borrowers see it on the Listing.

**Error Path — edit after send**:
1. The author tries to change a sent note.
2. The product refuses silent edits.
3. The product presents: "This note cannot be edited. Ask the manager if it should be hidden."
4. The manager may hide abusive notes or notes that name a child; that hide is recorded.

### Flow 7: Overdue block

**Actor**: Resident (borrower)
**Precondition**: Return-by has passed and the item is not returned.

**Happy Path**:
1. Status words show Overdue on the borrow and Listing.
2. Evening overdue notices appear in-Cupboard and cannot be turned off.
3. New requests are blocked until return or a manager exception.

**Error Path — seven days still gone**:
1. Seven days pass still overdue.
2. The manager is told and the Listing is paused for new requests.
3. The product keeps the item on the recovery list as unresolved if needed.
4. The user can return the item or speak to the manager; there are no fees.

### Flow 8: Admit and sign in

**Actor**: Building manager, then Resident
**Precondition**: Manager seat exists (out of band for the first manager).

**Happy Path**:
1. The manager records display name, unit, and lives-in-that-unit.
2. In person they give a private phrase or code.
3. The adult signs in on a phone they already use.
4. Display name and unit stay visible while signed in.

**Error Path — failed sign-in**:
1. The adult types a wrong phrase.
2. The product does not reveal whether a name exists.
3. The product presents: "Sign-in did not work. Try again or speak to the manager."
4. The user can retry or recover only by a new phrase issued in person — not SMS.

### Flow 9: Outsider gate

**Actor**: Outsider or removed resident
**Precondition**: No active ResidentAccess, or status ENDED.

**Happy Path**:
1. They open the Cupboard.
2. They see only the private-register explanation, or that access has ended.
3. They never see Listings, photos, units, or names.

**Error Path — ended access with items still out**:
1. A former resident tries to confirm a return in the product.
2. In-product confirm is refused.
3. The product presents: "Your access has ended. Arrange outstanding returns with the manager."
4. The manager records recovery on the recovery list.

### Flow 10: Manager hide during an in-flight ask

**Actor**: Building manager (including off-site)
**Precondition**: Duplicate, nonsense, forbidden, or unsafe Listing; a request may be waiting.

**Happy Path**:
1. The manager hides or retires with why-words.
2. If an ask was in-flight, both people are told and the ask does not hang.
3. Ordinary browsing no longer shows the item; history remains for the manager.

**Error Path — resident tries a manager-only action**:
1. A signed-in resident attempts hide, admit, or export.
2. The product refuses.
3. The product presents: "Ask the manager."
4. The user can message the manager; they do not get a blank page.

### Flow 11: Later time change after an agreement

**Actor**: Resident (party to an agreed borrow)
**Precondition**: AgreedBorrow already exists (distinct from the lender's first accept-with-change).

**Happy Path**:
1. Either party proposes new times within longest length.
2. The other is told; original times stand.
3. If the other accepts, both read back the new times.

**Error Path — other party does not accept**:
1. The proposal sits without a yes.
2. Original collect window and return-by remain the agreement.
3. The product presents the original times as still in force.
4. The user can cancel the hold before collect if that is still allowed, or complete the handoff as first agreed.

### Flow 12: Deputy limits

**Actor**: Deputy manager
**Precondition**: Named by the building manager; always a resident.

**Happy Path**:
1. While the manager is away the deputy admits a resident or hides a nonsense listing.
2. Residents continue to browse, request, accept, collect, and return.

**Error Path — deputy tries to name a further deputy**:
1. The deputy opens manage access and tries to name another deputy or remove the manager.
2. The product refuses.
3. The product presents: "Only the building manager can name deputies or remove the manager."
4. The user can continue other manager tasks.

---

## Design Rationale

These four choices were made in clarification round 1 (qa-log.md). Each is recorded as DEC-001 through DEC-004.

### Manager-issued sign-in (DEC-001)

The question was how an already-admitted adult signs in on a phone they already use when there is no public recover-access page and the product must not assume they can receive a text message. Public OIDC, magic links, and SMS OTP were rejected. After admit, the manager gives a private phrase or code in person. Forgotten sign-in is a new phrase issued the same way. Failed sign-in never reveals whether a name exists.

### Residents only may list or borrow (DEC-002)

Staff who do not live here have no lending privilege, yet a manager account is allowed and nested resident powers would let an off-site manager list and request. The decision is residents only: adults who live here and have a unit. There is no Staff lender role. An off-site manager does admit, hide, retire, disputes, notice, oversight, and recovery only, unless they also live here and have a unit — and they always act as themselves.

### Hold starts on accept-with-change (DEC-003)

If the lender accepts but changes the collect window or return-by, waiting for a second yes would leave the item neither free nor promised. The hold starts immediately at the lender's new times (still within longest length). The borrower is told at once and may cancel before collect. A later proposed time-change after an agreement already exists is different: original times stand until the other party accepts.

### Pause blocked while in-flight (DEC-004)

If a lender could pause or withdraw while a request is waiting or a hold is open, a household could still be promised an item that just left the catalogue. Pause and withdraw stay available when nothing is in-flight. While an ask is in-flight they are blocked until the lender answers, cancels, or the ask or hold lapses, and the product names the step in the way. Manager hide or retire of an unsafe listing is a separate safety path (ASSM-020).

---

## Out of Scope

The following are explicitly excluded from this spec. They may be addressed in future specs.
Each item here also appears in `context.non-goals[]`.

- **More than one building**: One occupied building, one Cupboard.
- **Accounts for people who neither live nor work as staff**: Guests and the public stay outsiders.
- **Money**: No payments, deposits, late fees, insurance, buying, selling, or giving away.
- **Forbidden goods as listings**: Food, medicine, alcohol, weapons, and other forbidden items are refused, not listed.
- **Staff delivery**: The manager is never asked to carry items between floors.
- **Skills and sitting matching**: Not a babysitting or pet-sitting marketplace.
- **Public website**: Search engines and passers-by cannot browse the catalogue.
- **Public OIDC, SMS OTP, or self-serve recovery**: Sign-in is manager-issued in person.
- **Queues, featured slots, league tables, graphs, star ratings**: Fairness is the three-borrow cap and honest status words.
- **Automatic legal enforcement**: The Cupboard records what people agreed; it does not prosecute.
- **Lobby-chat import**: Greenfield; existing fob and written-notice processes stay outside.
- **Required SMS or email notices**: In-Cupboard notices are the source of record.

---

## Boundaries

Guardrails for the build phase — a three-tier contract.
Keep each list short and concrete; these are read by downstream build agents.

**Always do**
- Validate inputs at the API boundary in ordinary language; name the field and the next step.
- Keep catalogue, photos, units, and names behind an admitted-adult session.
- Show status as words; keep collect and return as separate controls.
- Record in-Cupboard notices as the source of record for borrow and access events.

**Ask first**
- Changing session length or adding a fast household switch (Q-001).
- How the first manager seat is created in this building (Q-002).
- Whether manager hide during an in-flight ask may cancel the hold (Q-003).
- Naming an outside notification channel or adding a second live building notice.

**Never do**
- Take payment, add a waitlist, add star ratings of people, or publish a public catalogue.
- Assume SMS, invent public OIDC self-signup, or add a public recover-access page.
- Let an off-site manager list or borrow without a unit.
- Mark return from a third unit that does not have the item.
- Commit secrets or skip the session check to make a screen look done.

---

## Assumptions & Open Questions

### Key Assumptions

The following gaps in the stated requirements were filled with standard defaults or inferred from context. Items marked ⚠️ require human confirmation before build.

- ⚠️ **ASSM-002**: Current display name and unit stay visible while signed in. Stay signed in on this phone until the person signs out or the manager ends access. Switching adult is sign out then sign in as the other person with that adult's own manager-issued phrase or code — no fast switch that could hide who is acting. *Confidence: medium.*
- ⚠️ **ASSM-003**: The first manager seat is granted when the Cupboard is set up for this building (out of band) and that person receives a manager-issued phrase or code in person. A successor is appointed by the resident committee out of band. v1 has no self-serve 'become manager'. An off-site first manager may have no unit and then cannot list or borrow. *Confidence: medium.*
- ⚠️ **ASSM-004**: Before a listing is shown, the lender confirms it is not on the forbidden list. Obvious forbidden words in the name are refused with the reason and the manager is told. Lender marks whether the fixed caution applies (not inferred from 'tools' alone). Remaining junk is the manager's to hide or retire. *Confidence: medium.*
- ⚠️ **ASSM-005**: Unpublished contact notes are visible only to the lender who typed them. Replacement value is visible to the lender, to the manager, and to the two parties if the item is reported gone or in dispute — never as a catalogue price. *Confidence: medium.*
- ⚠️ **ASSM-008**: Before return, either party may record a one-line drop-off change the other can see. Return is confirmed only when the lender actually has the item. A wrong-unit drop stays a human conversation; the Cupboard does not mark return from a third unit. *Confidence: medium.*
- ⚠️ **ASSM-010**: One timezone and one currency are configured once for this building at setup. All civil times use that timezone and show weekday. Replacement value is a plain number in that currency, never a checkout price. Not ISO 8601-only display. *Confidence: medium.*
- ⚠️ **ASSM-011**: Opening the catalogue and seeing free/busy for ~100 items completes in under 1 second at p95 on ordinary building connectivity. Waiting several seconds for that answer fails the AC. Not a 500ms generic SLA. *Confidence: medium.*
- ⚠️ **ASSM-013**: Manager may unhide a listing that was hidden as duplicate/nonsense. A safety retirement stays retired unless the manager explicitly treats a new listing as the replacement. Ended access is reversed by admitting the person again. Confirmation copy is one plain sentence naming the action. *Confidence: medium.*
- ⚠️ **ASSM-014**: v1 delivers §14 events as in-Cupboard notices the person sees when they open the Cupboard, plus the single building-wide catalogue banner. Outside-channel opt-in is omitted until the building names the existing lift-outage channel. Non-urgent outside nudges, if later added, are not sent 21:00–08:00 building time; overdue evening notices aimed at 18:00–20:00. Both parties are told when a dispute opens and when the manager decides. Accept-with-change tells the borrower at once. A later proposed time-change after an agreement already exists tells the other party and waits; original times stand until they accept. SMS/email is not a required channel. *Confidence: medium.*
- ⚠️ **ASSM-015**: Manager types the unit using existing building numbers (no unit-admin screen). Manager may replace or end the single notice. Declined/lapsed/cancelled requests appear on the 12-month manager activity list but do not follow the confirmed-borrow 12+12 summary rule. A dispute decision is a dated remark; the freeze lifts per the chosen outcome; the dispute stays in 12-month activity. Ended access cannot confirm collect/return in the Cupboard; the manager records recovery. *Confidence: medium.*
- ⚠️ **ASSM-020**: Manager hide or retire of a duplicate, nonsense, forbidden, or unsafe listing may cancel a waiting request or an open hold; both people are told. This is manager safety work, not a lender pause. *Confidence: medium.*

- ✓ **ASSM-001**: Exactly one waiting request is recorded. The other person is told the item is already asked for and is not free; they are not queued. The item never has two waiting requests.
- ✓ **ASSM-006**: Unauthorized manager actions are refused in ordinary language with 'ask the manager' as the next step. An off-site manager who tries to list or request is refused in ordinary language: listing and borrowing are for residents who live here and have a unit; manager work is still available. A late accept/decline is told the request already lapsed. Failed export: told to try again; on-screen lists remain the answers. Mid-flow sign-in loss: the unsent action did not go through; they start it again after signing in.
- ✓ **ASSM-007**: At most one optional photo of the actual item, common phone picture types, usable on a phone. Upload failure: listing still saves without a photo; person is told the picture did not attach. Photo leaves ordinary catalogue immediately on withdraw/retire; manager may still see it while that listing record is kept, then it goes with the record. Do not specify a vendor or API.
- ✓ **ASSM-009**: Case-insensitive match on name and description; groups and free-today are filters, not ranks. No featured slots. With on the order of 100 items, show all matches in one scrollable list. Zero matches: nothing matched plus clear-search, no invented substitutes. Not a paginated 20-item list.
- ✓ **ASSM-012**: Only admitted people see catalogue, photos, units, and names. Photos and notes are not reachable as a public website. No extra legal document at every open. Do not invent a crypto stack as a requirement. Not public OIDC/bearer auth.
- ✓ **ASSM-016**: Operational list shows time, failed sign-in without revealing whether a guessed name exists, and forbidden-listing attempts with listing name and unit. Hide/retire/access-end activity names who did it, when, which item or person, and the manager's why-words. 'Burst' is visible clustering on that list, not a pager. Committee judges §3 success from the five oversight answers, not a dashboard. Observability is manager lists, not Datadog.
- ✓ **ASSM-017**: A printable readable page of those five answers that the manager can print or save as a document from the phone or laptop. Not a spreadsheet, not graphs. Catalogue snapshot is current; borrow records in that document cover three months. Do not invent an export API.
- ✓ **ASSM-018**: Map §18.3 and §24 to WCAG 2.2 AA for core resident flows. Manager and deputy core tasks (admit, hide/retire, dispute remark, five questions, export) are also completable by keyboard and screen reader. English copy; weekday + local civil date/time.
- ✓ **ASSM-019**: Time-change before collect, return-by extension after collect, move-out pause/retire/transfer, and manager recovery list are in v1 because they are specified. The twelve-point list is the minimum demonstration, not an exclusion.
- ✓ **ASSM-021**: Greenfield: no import of lobby-chat history. Existing building processes (fobs, written notices, key deposit) stay outside this product. No existing Cupboard users or records to break.
- ✓ **ASSM-022**: A subletter is admitted as a resident for their stay and ended when they leave, same as any other adult the manager records against a unit.
- ✓ **ASSM-023**: While an action is sending, the control is not usable twice. If it did not go through, they are told and try again. Successful request shows waiting before they leave the screen. Empty catalogue stays the invitation, not a spinner-as-error.
- ✓ **ASSM-024**: Committee observes return-on-agreed-day from manager records; no in-product KPI. Same-day understanding is supported by lobby poster copy already written in §29, not by a training module.
- ✓ **ASSM-025**: List and detail screens show a skeleton loader matching content structure while loading, distinct from empty and error.
- ✓ **ASSM-026**: Forms validate on blur and re-validate on submit, in ordinary language naming the field and the next step.

### Open Questions

These items remain unresolved and should be answered before or during the build phase:

- **Q-001**: Confirm session length and shared-phone switch: stay signed in until sign-out or manager ends access, and switch adult only by sign-out then sign-in with that adult's own manager-issued phrase or code (no fast switch)?
  - *Raised by*: enricher
  - *Impact if unresolved*: Wrong-person accept on a shared phone, or an unexpected sign-out, would break who-is-acting.
- **Q-002**: Confirm first manager seat and successor are granted out of band (Cupboard setup / resident committee), with no self-serve 'become manager' in v1?
  - *Raised by*: enricher
  - *Impact if unresolved*: Without a first manager nobody can be admitted; an empty seat with no deputy blocks access work.
- **Q-003**: Confirm that manager hide/retire of a duplicate, nonsense, forbidden, or unsafe listing may cancel a waiting request or open hold and tell both people (unlike lender pause/withdraw, which stays blocked until settled)?
  - *Raised by*: enricher
  - *Impact if unresolved*: In-flight asks could hang as promises or be dropped silently if manager hide is treated like lender pause.

---

## Acceptance Criteria Coverage Map

Quick reference: which user stories are covered by which acceptance criteria.

| Story | Criteria | Testable |
|-------|----------|---------|
| US-001 | AC-001, AC-002, AC-003, AC-004 | ✓ |
| US-002 | AC-005, AC-006, AC-007, AC-008, AC-009 | ✓ |
| US-003 | AC-010, AC-011, AC-012, AC-013 | ✓ |
| US-004 | AC-014, AC-015, AC-016, AC-017, AC-018 | ✓ |
| US-005 | AC-019, AC-020, AC-021, AC-022 | ✓ |
| US-006 | AC-023, AC-024 | ✓ |
| US-007 | AC-025, AC-026, AC-027 | ✓ |
| US-008 | AC-028, AC-029, AC-030, AC-031 | ✓ |
| US-009 | AC-032, AC-033, AC-034, AC-035, AC-036 | ✓ |
| US-010 | AC-037, AC-038, AC-039, AC-040 | ✓ |
| US-011 | AC-041, AC-042 | ✓ |
| US-012 | AC-043, AC-044 | ✓ |
| US-013 | AC-045, AC-046 | ✓ |
| US-014 | AC-047, AC-048 | ✓ |

---

## API Endpoints Summary

Private building-register operations. Every call requires an admitted-adult session (the sign-in call itself requires a manager-issued phrase, not public OIDC).

| ID | Method | Path | Auth | Purpose |
|----|--------|------|------|---------|
| API-001 | POST | /v1/sessions | ✓ | Start a session with the manager-issued private phrase or code. Never public OIDC. |
| API-002 | DELETE | /v1/sessions/current | ✓ | End this phone session so another adult can sign in as themselves. |
| API-003 | GET | /v1/session/current | ✓ | Read whose display name and unit is currently in use on this phone. |
| API-004 | GET | /v1/listings | ✓ | Browse and filter this building catalogue (words, group, free-today). One scrollable list, not public. |
| API-005 | GET | /v1/listings/{id} | ✓ | Read one Listing the caller may see, omitting unpublished contact notes for others. |
| API-006 | POST | /v1/listings | ✓ | Create a Listing after required fields and forbidden-goods confirmation. Residents with a unit only. |
| API-007 | PATCH | /v1/listings/{id} | ✓ | Correct a Listing the lender owns when no agreed borrow is in progress. |
| API-008 | POST | /v1/listings/{id}/pause | ✓ | Pause a Listing when nothing is waiting or on hold. |
| API-009 | POST | /v1/listings/{id}/resume | ✓ | Resume a paused Listing. |
| API-010 | DELETE | /v1/listings/{id} | ✓ | Withdraw a Listing after extra confirmation when nothing is on loan and nothing is in-flight. |
| API-011 | GET | /v1/me/listings | ✓ | List Listings this signed-in adult owns as lender. |
| API-012 | POST | /v1/listings/{id}/requests | ✓ | Create a BorrowRequest for a visible Free Listing. |
| API-013 | GET | /v1/requests/{id} | ✓ | Read a BorrowRequest the caller is a party to. |
| API-014 | POST | /v1/requests/{id}/cancel | ✓ | Borrower cancels a waiting ask; the Listing becomes Free. |
| API-015 | POST | /v1/requests/{id}/accept | ✓ | Lender accepts as requested; hold starts; both read back the same times. |
| API-016 | POST | /v1/requests/{id}/accept-with-change | ✓ | Lender accepts with new times within longest length; hold starts now; borrower is told. |
| API-017 | POST | /v1/requests/{id}/decline | ✓ | Lender declines after extra confirmation; optional reason to the borrower. |
| API-018 | GET | /v1/me/borrows | ✓ | List this adult's AgreedBorrows that are promised, out, or overdue. |
| API-019 | GET | /v1/borrows/{id} | ✓ | Read one AgreedBorrow the caller is a party to, including agreed times. |
| API-020 | POST | /v1/borrows/{id}/cancel-hold | ✓ | Either party cancels before collect; the other is told; the Listing becomes Free. |
| API-021 | POST | /v1/borrows/{id}/handoffs | ✓ | Record collect or return. Return only when the lender actually has the item. |
| API-022 | POST | /v1/handoffs/{id}/confirm | ✓ | The other party confirms collect or return within 12 hours. |
| API-023 | POST | /v1/borrows/{id}/condition-notes | ✓ | Leave a dated ConditionNote after confirmed return, signed with display name. |
| API-024 | POST | /v1/condition-notes/{id}/hide | ✓ | Manager or deputy hides an abusive note or a note that names a child; the hide is recorded. |
| API-025 | POST | /v1/borrows/{id}/time-change | ✓ | Propose a later time change after an agreement exists. Original times stand until the other accepts. |
| API-026 | POST | /v1/borrows/{id}/time-change/accept | ✓ | Accept a later proposed time change. Distinct from accept-with-change on a waiting request. |
| API-027 | PATCH | /v1/borrows/{id}/drop-off | ✓ | Record a one-line drop-off change the other party can see. Does not mark return. |
| API-028 | POST | /v1/disputes | ✓ | Open a Dispute; freeze new requests on that Listing only. |
| API-029 | PATCH | /v1/disputes/{id} | ✓ | Manager dated remark and outcome: restore free, keep paused, retire, or clear overdue block. |
| API-030 | GET | /v1/people | ✓ | List ResidentAccess records by unit for manager oversight. |
| API-031 | POST | /v1/people | ✓ | Admit an adult by display name and unit; issue phrase or code in person. No public signup. |
| API-032 | GET | /v1/people/{id} | ✓ | Read one ResidentAccess the manager may manage. |
| API-033 | PATCH | /v1/people/{id} | ✓ | Correct unit or name or remove deputy courtesy (building manager only for deputy changes). |
| API-034 | POST | /v1/people/{id}/end-access | ✓ | End access after extra confirmation; keep outstanding items on the recovery list. |
| API-035 | POST | /v1/people/{id}/reissue-phrase | ✓ | Issue a new private phrase or code in person after forgotten sign-in. Never SMS. |
| API-036 | POST | /v1/listings/{id}/hide | ✓ | Manager hide of duplicate or nonsense. May cancel an in-flight ask or hold and tell both people. |
| API-037 | POST | /v1/listings/{id}/unhide | ✓ | Unhide a Listing that was hidden as duplicate or nonsense. Safety retirement is not reversed this way. |
| API-038 | POST | /v1/listings/{id}/retire | ✓ | Retire unsafe, abandoned, or disputed Listing. If out, stays out until return; no new requests. |
| API-039 | POST | /v1/listings/{id}/transfer | ✓ | Transfer a Listing to a remaining adult in the unit after move-out. |
| API-040 | PUT | /v1/building-notice | ✓ | Replace the single BuildingNotice at the top of the catalogue. |
| API-041 | DELETE | /v1/building-notice | ✓ | End the single BuildingNotice so it disappears from the catalogue. |
| API-042 | GET | /v1/manager/oversight | ✓ | Read the five oversight answers plus overdue and open-dispute lists. |
| API-043 | GET | /v1/manager/oversight/print | ✓ | Readable printable page of the five answers; omit unpublished contact notes. Not a spreadsheet. |
| API-044 | GET | /v1/manager/activity | ✓ | Twelve-month building-wide ManagerActivityEvent list (who, when, what, why). |
| API-045 | GET | /v1/manager/operational | ✓ | Failed sign-in clustering and forbidden-listing attempts. Residents never see this list. |
| API-046 | GET | /v1/manager/recovery | ✓ | AgreedBorrows still out after access ended or seven-day unresolved loss. |
| API-047 | GET | /v1/notices | ✓ | In-Cupboard notices for the signed-in person, including overdue and access-ended which cannot be turned off. |
| API-048 | POST | /v1/listings/{id}/photo | ✓ | Attach at most one optional photo of the actual item. Listing still saves if attach fails. |

---

## Data Model

Quick reference for the build and prototype teams. One row per field; mark the status enum values.

### ResidentAccess

One admitted adult's Cupboard access for this building. Not a household login.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Stable access id. |
| displayName | string | ✓ | Name other residents see (typically first name plus unit), not a legal full name. |
| unitLabel | string |  | Unit number the manager typed. Empty only for an off-site manager who cannot list or borrow. |
| role | AccessRole | ✓ | One of: RESIDENT, DEPUTY_MANAGER, BUILDING_MANAGER. Outsiders have no ResidentAccess row. |
| status | ResidentAccessStatus | ✓ | One of: ACTIVE, ENDED |
| livesInBuilding | boolean | ✓ | True when this adult lives on site. Required to list or borrow. |
| hasUnit | boolean | ✓ | True when unitLabel is present. Off-site manager: false. |
| livesInThatUnit | boolean | ✓ | Manager-recorded fact that this adult lives in that unit. |
| contactNote | string | null |  | Optional reachability note typed by this person. |
| contactNotePublished | boolean | ✓ | Whether other residents see the contact note on listings. |
| signInSecretIssued | boolean | ✓ | True after the manager has given a private phrase or code in person. The secret itself is never shown in the catalogue. |
| sessionDisplayName | string |  | Currently-in-use identity shown while signed in on this phone. |
| sessionUnitLabel | string | null |  | Currently-in-use unit shown while signed in. |
| admittedAt | string | ✓ | Local civil datetime with weekday when admitted. |
| admittedByAccessId | string |  | Manager or deputy who admitted them. Empty for the out-of-band first manager. |
| endedAt | string | null |  | Local civil datetime with weekday when access ended, or null if still active. |
| endedReason | string | null |  | Move-out or committee decision words. |
| createdAt | string | ✓ | Local civil datetime with weekday when this record was created. |
| updatedAt | string | ✓ | Local civil datetime with weekday when this record last changed. |

### Unit

A home number in this one building, typed by the manager using existing building numbers.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Stable unit id for this building. |
| label | string | ✓ | Unit number as the manager already uses it (for example 4B). Typed by the manager; no unit-admin screen. |
| status | UnitStatus | ✓ | One of: IN_USE. Units are not archived in v1; people against the unit are ended instead. |
| buildingName | string | ✓ | This one building. Always the same Cupboard; not a multi-building field for v1. |
| createdAt | string | ✓ | Local civil datetime with weekday when this label was first used on an admit or listing. |
| lastCorrectedAt | string | null |  | When the manager last moved a person onto this unit. |

### Listing

Catalogue record of one household item (or a small set that travels together).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| shortName | string | ✓ | Name a neighbor would recognise. |
| description | string | ✓ | What is included and what is not; what complete means. |
| group | ListingGroup | ✓ | One of: KITCHEN, CLEANING, TOOLS, FURNITURE_AND_HOSTING, CHILDCARE_AND_GUESTS, OUTDOOR, OTHER |
| collectUnitLabel | string | ✓ | Field collectUnitLabel. |
| pickupGuidance | string | ✓ | Field pickupGuidance. |
| usualBorrowLength | BorrowLength | ✓ | One of: SAME_DAY, ONE_NIGHT, THREE_NIGHTS, ONE_WEEK |
| longestBorrowLength | BorrowLength | ✓ | One of: SAME_DAY, ONE_NIGHT, THREE_NIGHTS, ONE_WEEK. Must not be shorter than usual. |
| stillHaveItAndSafe | boolean | ✓ | Field stillHaveItAndSafe. |
| extraRestrictions | string | null |  | Field extraRestrictions. |
| contactNote | string | null |  | Preferred contact; unpublished unless the lender published it. |
| contactNotePublished | boolean | ✓ | Field contactNotePublished. |
| replacementValue | number | null |  | Fairness hint in building currency; never a catalogue price. |
| cautionApplies | boolean | ✓ | Lender-marked power tool, ladder, or heat appliance. |
| status | ListingStatus | ✓ | One of: FREE, ASKED_FOR, PROMISED, OUT, PAUSED, OVERDUE, RETIRED |
| hiddenByManager | boolean | ✓ | Hidden duplicate/nonsense/unsafe; history of past borrows remains. |
| lenderAccessId | string | ✓ | Field lenderAccessId. |
| lenderDisplayName | string | ✓ | Field lenderDisplayName. |
| lenderUnitLabel | string | ✓ | Field lenderUnitLabel. |
| earliestCollectHint | string | null |  | Local civil datetime with weekday if not free now. |
| conditionSummary | string | null |  | Field conditionSummary. |
| photoId | string | null |  | Field photoId. |
| createdAt | string | ✓ | Local civil datetime with weekday when this record was created. |
| updatedAt | string | ✓ | Local civil datetime with weekday when this record last changed. |
| pausedAt | string | null |  | Field pausedAt. |
| withdrawnAt | string | null |  | Field withdrawnAt. |
| retiredAt | string | null |  | Field retiredAt. |
| retiredWhy | string | null |  | Field retiredWhy. |
| hiddenWhy | string | null |  | Field hiddenWhy. |

### Photograph

Optional picture of the actual item, belonging to a listing.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| listingId | string | ✓ | Field listingId. |
| status | PhotographStatus | ✓ | One of: VISIBLE, HIDDEN, LEFT_CATALOGUE |
| altText | string | ✓ | Item name if the lender left it blank. |
| hiddenWhy | string | null |  | Field hiddenWhy. |

### BorrowRequest

A borrower's ask for a specific listing, with hoped-for collect and return moments.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| listingId | string | ✓ | Field listingId. |
| borrowerAccessId | string | ✓ | Field borrowerAccessId. |
| lenderAccessId | string | ✓ | Field lenderAccessId. |
| status | BorrowRequestStatus | ✓ | One of: WAITING, ACCEPTED, ACCEPTED_WITH_CHANGE, DECLINED, LAPSED, CANCELLED |
| collectDay | string | ✓ | Local civil date with weekday. |
| collectStart | string | ✓ | Local civil time. |
| collectEnd | string | ✓ | Local civil time; may be the next calendar day. |
| returnByAt | string | ✓ | Local civil datetime with weekday. |
| purpose | string | null |  | Field purpose. |
| reachabilityDuringHold | string | ✓ | Field reachabilityDuringHold. |
| declineReason | string | null |  | Field declineReason. |
| changedCollectStart | string | null |  | Field changedCollectStart. |
| changedCollectEnd | string | null |  | Field changedCollectEnd. |
| changedReturnByAt | string | null |  | Field changedReturnByAt. |
| createdAt | string | ✓ | Local civil datetime with weekday when this record was created. |
| answerByAt | string | ✓ | CreatedAt plus 24 hours elapsed. |
| answeredAt | string | null |  | Field answeredAt. |
| lapsedAt | string | null |  | Field lapsedAt. |

### AgreedBorrow

A request the lender accepted, with a collect window and return-by both sides can read back.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| listingId | string | ✓ | Field listingId. |
| requestId | string | ✓ | Field requestId. |
| lenderAccessId | string | ✓ | Field lenderAccessId. |
| borrowerAccessId | string | ✓ | Field borrowerAccessId. |
| status | AgreedBorrowStatus | ✓ | One of: HOLD_PROMISED, OUT, OVERDUE, RETURNED, HOLD_LAPSED, CANCELLED, UNRESOLVED |
| agreedCollectStart | string | ✓ | Field agreedCollectStart. |
| agreedCollectEnd | string | ✓ | Field agreedCollectEnd. |
| agreedReturnByAt | string | ✓ | Field agreedReturnByAt. |
| dropOffChangeNote | string | null |  | One-line different drop-off both parties can see. |
| pendingTimeChangeNote | string | null |  | Later proposed change; original times stand until accepted. |
| countsTowardThreeCap | boolean | ✓ | Field countsTowardThreeCap. |
| overdueSince | string | null |  | Field overdueSince. |
| eveningNoticesSent | number | ✓ | Field eveningNoticesSent. |
| createdAt | string | ✓ | Local civil datetime with weekday when this record was created. |
| collectedAt | string | null |  | Field collectedAt. |
| returnedAt | string | null |  | Field returnedAt. |

### Handoff

The recorded real-world moment when the item changes hands: collect or return.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| agreedBorrowId | string | ✓ | Field agreedBorrowId. |
| kind | HandoffKind | ✓ | One of: COLLECT, RETURN |
| status | HandoffStatus | ✓ | One of: WAITING_CONFIRMATION, CONFIRMED, LAPSED_UNCONFIRMED |
| alreadyHappened | boolean | ✓ | True when recorded after an outage as already happened. |
| recordedByAccessId | string | ✓ | Field recordedByAccessId. |
| confirmedByAccessId | string | null |  | Field confirmedByAccessId. |
| recordedAt | string | ✓ | Field recordedAt. |
| confirmByAt | string | ✓ | RecordedAt plus 12 hours. |
| confirmedAt | string | null |  | Field confirmedAt. |

### ConditionNote

Short dated remark about completeness or damage after a confirmed return.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| listingId | string | ✓ | Field listingId. |
| agreedBorrowId | string | ✓ | Field agreedBorrowId. |
| status | ConditionNoteStatus | ✓ | One of: VISIBLE, HIDDEN |
| body | string | ✓ | Describes the item, not the person. No star scores. |
| signedDisplayName | string | ✓ | Field signedDisplayName. |
| authorAccessId | string | ✓ | Field authorAccessId. |
| createdAt | string | ✓ | Local civil datetime with weekday when this record was created. |
| hiddenAt | string | null |  | Field hiddenAt. |
| hiddenWhy | string | null |  | Field hiddenWhy. |
| managerRemark | string | null |  | Field managerRemark. |

### Dispute

Manager-handled freeze on one item when collect, completeness, agreement, or move-out recovery is contested.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| listingId | string | ✓ | Field listingId. |
| agreedBorrowId | string | null |  | Field agreedBorrowId. |
| status | DisputeStatus | ✓ | One of: OPEN, DECIDED |
| reason | DisputeReason | ✓ | One of: COLLECT_CONTESTED, COMPLETENESS_CONTESTED, NEVER_AGREED, MOVE_OUT_RECOVERY |
| outcome | DisputeOutcome | null |  | One of: RESTORE_FREE, KEEP_PAUSED, RETIRE, CLEAR_OVERDUE_BLOCK |
| freezeNewRequests | boolean | ✓ | Field freezeNewRequests. |
| openedByAccessId | string | ✓ | Field openedByAccessId. |
| partyNotesInOrder | string | ✓ | Both people's existing notes in order. |
| managerRemark | string | null |  | Field managerRemark. |
| createdAt | string | ✓ | Local civil datetime with weekday when this record was created. |
| decidedAt | string | null |  | Field decidedAt. |

### BuildingNotice

The single short building-wide notice at the top of the catalogue.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| status | BuildingNoticeStatus | ✓ | One of: ACTIVE, ENDED |
| body | string | ✓ | Field body. |
| startsAt | string | ✓ | Field startsAt. |
| endsAt | string | null |  | Field endsAt. |
| postedByAccessId | string | ✓ | Field postedByAccessId. |

### InCupboardNotice

Source-of-record notice a person sees the next time they open the Cupboard.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| recipientAccessId | string | ✓ | Field recipientAccessId. |
| status | InCupboardNoticeStatus | ✓ | One of: UNREAD, READ |
| event | NoticeEvent | ✓ | One of: REQUEST_RECEIVED, REQUEST_ACCEPTED, REQUEST_ACCEPTED_WITH_CHANGE, REQUEST_DECLINED, REQUEST_LAPSED, HANDOFF_WAITING, HANDOFF_CONFIRMED, HOLD_LAPSED, OVERDUE, MANAGER_STEP_IN, LISTING_HIDDEN_OR_RETIRED, ACCESS_GRANTED, ACCESS_ENDED, DISPUTE_OPENED, DISPUTE_DECIDED, TIME_CHANGE_PROPOSED |
| body | string | ✓ | Field body. |
| listingId | string | null |  | Field listingId. |
| agreedBorrowId | string | null |  | Field agreedBorrowId. |
| cannotTurnOff | boolean | ✓ | True for overdue and access-ended. |
| createdAt | string | ✓ | Local civil datetime with weekday when this record was created. |

### ManagerActivityEvent

Twelve-month building-wide activity the manager reads for oversight — not an external APM product.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| at | string | ✓ | Local civil datetime with weekday. |
| actorAccessId | string | null |  | Field actorAccessId. |
| actorDisplayName | string | ✓ | Field actorDisplayName. |
| action | string | ✓ | What happened in ordinary language. |
| entityName | string | ✓ | Field entityName. |
| entityId | string | ✓ | Field entityId. |
| whyWords | string | null |  | Field whyWords. |
| status | ManagerActivityEventStatus | ✓ | Lifecycle status of this activity row. One of: RECORDED |

### OperationalEvent

Manager-only list when something looks wrong: failed sign-in clustering or forbidden-listing attempts.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| at | string | ✓ | Field at. |
| kind | OperationalEventKind | ✓ | One of: FAILED_SIGN_IN, FORBIDDEN_LISTING_ATTEMPT |
| status | OperationalEventStatus | ✓ | One of: RECORDED |
| listingName | string | null |  | Field listingName. |
| unitLabel | string | null |  | Field unitLabel. |
| doesNotRevealWhetherNameExists | boolean | ✓ | True for failed sign-in rows. |

### OversightSnapshot

Printable readable page of the five oversight answers for a committee meeting.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| generatedAt | string | ✓ | Field generatedAt. |
| accessByUnit | string | ✓ | Who currently has access, by unit. |
| overdueItems | string | ✓ | Overdue items, duration, two parties. |
| openDisputes | string | ✓ | Field openDisputes. |
| unitBorrowHistoryThreeMonths | string | ✓ | Field unitBorrowHistoryThreeMonths. |
| hiddenOrRetiredThisMonth | string | ✓ | Field hiddenOrRetiredThisMonth. |
| omitsUnpublishedContactNotes | boolean | ✓ | Field omitsUnpublishedContactNotes. |
| status | OversightSnapshotStatus | ✓ | Lifecycle status of this printable page. One of: READY |

---

## Screen Inventory

| ID | Title | Route | Page Type | Primary Entity | Key Components | States |
|----|-------|-------|-----------|----------------|----------------|--------|
| SCR-001 | Sign in | /sign-in | form | ResidentAccess | SignInPhraseForm, SignInFailureBanner, SpeakToManagerHint, SessionIdentityPreview | loading, empty, error, success |
| SCR-002 | Private building register | /private-register | detail | Listing | PrivateRegisterExplanation, SpeakToManagerNextStep | loading, empty, error, success |
| SCR-003 | Access ended | /access-ended | detail | ResidentAccess | AccessEndedBanner, ArrangeReturnsWithManagerHint | loading, empty, error, success |
| SCR-004 | Building catalogue | /catalogue | list | Listing | BuildingNoticeBanner, CatalogueSearchField, FreeTodayFilter, GroupFilterChips, CatalogueList, ListingStatusWord, EmptyCatalogueInvitation, ZeroMatchClearSearch, CurrentSessionIdentityBar | loading, empty, error, success |
| SCR-005 | Listing | /listings/:id | detail | Listing | ListingDetailHeader, ListingStatusWord, PickupGuidanceBlock, FixedCautionBanner, ConditionNotesList, ReplacementValueHint, RequestThisItemAction, LenderListingActions, DisputeOpenBanner, HiddenContactNoteOmitted | loading, empty, error, success |
| SCR-006 | List an item | /listings/new | form | Listing | ListingCreateForm, ForbiddenGoodsConfirm, CautionAppliesToggle, OptionalPhotoAttach, ReplacementValueField, PublishContactNoteToggle, ListingValidationSummary | loading, empty, error, success |
| SCR-007 | My listings | /my/listings | list | Listing | MyListingsList, ListingStatusWord, AddListingAction | loading, empty, error, success |
| SCR-008 | Manage listing | /listings/:id/manage | detail | Listing | ListingEditForm, PauseListingAction, ResumeListingAction, WithdrawListingConfirmModal, InFlightBlockBanner, OptionalPhotoAttach | loading, empty, error, success |
| SCR-009 | Request to borrow | /listings/:id/request | form | Listing | BorrowRequestForm, CollectWindowFields, ReturnByField, ReachabilityField, RequestRuleFailureBanner, SendRequestAction | loading, empty, error, success |
| SCR-010 | Incoming request | /requests/:id | detail | BorrowRequest | IncomingRequestReadback, AcceptAsRequestedAction, AcceptWithChangeForm, DeclineRequestConfirmModal, LapseCountdown | loading, empty, error, success |
| SCR-011 | On loan and promised | /my/borrows | list | AgreedBorrow | MyBorrowsList, AgreedTimesReadback, OverdueBanner, OpenHandoffAction, ProposeTimeChangeAction | loading, empty, error, success |
| SCR-012 | Collect or return | /borrows/:id/handoff | detail | AgreedBorrow | AgreedTimesReadback, RecordCollectAction, ConfirmCollectAction, RecordReturnAction, ConfirmReturnAction, AlreadyHappenedToggle, DropOffChangeNoteField, HandoffWaitingBanner, SeparateCollectReturnControls | loading, empty, error, success |
| SCR-013 | Condition note | /borrows/:id/condition-note | form | ConditionNote | ConditionNoteForm, DamagedReturnConfirmModal, SignedDisplayNamePreview | loading, empty, error, success |
| SCR-014 | Your notices | /notices | list | InCupboardNotice | NoticeList, OverdueNoticeCard, AccessEndedNoticeCard, BuildingNoticeBanner | loading, empty, error, success |
| SCR-015 | Who has access | /manager/people | list | ResidentAccess | PeopleByUnitList, AdmitResidentAction, EndAccessAction, CorrectUnitAction | loading, empty, error, success |
| SCR-016 | Admit an adult | /manager/people/new | form | ResidentAccess | AdmitResidentForm, LivesInUnitConfirm, IssueSignInPhrasePanel, OffSiteManagerNoUnitHint | loading, empty, error, success |
| SCR-017 | Manage access | /manager/people/:id | detail | ResidentAccess | AccessDetailHeader, CorrectUnitForm, NameDeputyAction, RemoveDeputyAction, EndAccessConfirmModal, ReissuePhrasePanel | loading, empty, error, success |
| SCR-018 | Manager oversight | /manager/oversight | dashboard | AgreedBorrow | FiveQuestionsSummary, OverdueItemsList, OpenDisputesList, PrintOversightAction | loading, empty, error, success |
| SCR-019 | Twelve-month activity | /manager/activity | list | ManagerActivityEvent | ActivityEventList, ActivityWhoWhenWhatWhy | loading, empty, error, success |
| SCR-020 | Something looks wrong | /manager/operational | list | OperationalEvent | OperationalEventList, FailedSignInRow, ForbiddenAttemptRow | loading, empty, error, success |
| SCR-021 | Dispute | /manager/disputes/:id | detail | Dispute | DisputeFreezeBanner, PartyNotesInOrder, ManagerRemarkForm, DisputeOutcomeActions | loading, empty, error, success |
| SCR-022 | Items still out | /manager/recovery | list | AgreedBorrow | RecoveryList, TransferListingAction, RecordManagerRecoveryAction | loading, empty, error, success |
| SCR-023 | Building-wide notice | /manager/notice | form | BuildingNotice | BuildingNoticeForm, EndNoticeAction, NoticeNotAnItemHint | loading, empty, error, success |
| SCR-024 | Committee page | /manager/oversight/print | dashboard |  | PrintableFiveAnswers, SaveAsDocumentAction, UnpublishedNotesOmittedHint | loading, empty, error, success |
| SCR-025 | Change agreed times | /borrows/:id/time-change | detail | AgreedBorrow | OriginalTimesStandBanner, TimeChangeProposalForm, AcceptTimeChangeAction, CancelHoldAction | loading, empty, error, success |

---

## Visual Reference

> These diagrams derive from the YAML spec above. If a diagram contradicts the spec, the spec takes precedence.

### Actor and permission overview

Roles are `context.target-users`. Each signed-in person has exactly one role at a time (`Resident`, `Deputy manager`, `Building manager`, or `Outsider`). Capabilities below are the `user-stories[].as` / `i-want` pairs. `US-013` and `US-014` are `should`; all other listed stories are `must`.

```mermaid
flowchart TB
  subgraph TargetUsers["target-users"]
    Resident[Resident]
    BuildingManager[Building manager]
    DeputyManager[Deputy manager]
    Outsider[Outsider]
  end
  Resident --> RMust["must US-001 browse catalogue; US-002 list pause resume correct withdraw; US-003 request; US-004 accept decline or accept-with-change; US-005 collect and return; US-006 condition note; US-007 overdue; US-010 sign in"]
  Resident --> RShould["should US-013 propose time change; original times stand until accepted"]
  BuildingManager --> BMMust["must US-008 admit correct unit end access; US-009 hide retire disputes notice oversight including off-site without listing or borrowing; US-012 move-out recovery and transfer listing"]
  DeputyManager --> DMShould["should US-014 same Cupboard work as the manager except remove the manager or name further deputies"]
  Outsider --> OMust["must US-011 private-register explanation or access has ended; never the catalogue"]
```

### User Flows

Must-priority stories `US-001` through `US-012` are not each given a separate flowchart. The two diagrams below cover browse → request → accept and collect → return (`US-001`, `US-003`, `US-004`, `US-005`) from those stories' `acceptance-criteria`.

#### Browse, request, and accept (US-001, US-003, US-004)

```mermaid
flowchart TD
  openCat["Given: signed-in resident with a unit opens the catalogue"]
  loaded{"When: the catalogue finishes loading"}
  openCat --> loaded
  loaded --> rows["Then AC-001: each visible Listing shows Free, Asked for, Promised, Out, Paused, or Overdue plus collect unit, usual period, and pickup guidance"]
  loaded --> emptyCat["Then AC-003: empty-catalogue invitation; not a spinner treated as an error; not told they are next in a queue"]
  rows --> filter["When: types words, free-to-request-today, or an everyday group"]
  filter --> matched["Then AC-002: matching Listings in one scrollable list; no featured slots"]
  filter --> zeroMatch["Then AC-004: nothing matched; offers clear-search; does not invent substitute items"]
  matched --> sendReq["When: send a request with collect window, return-by within longest length, and reachability during the hold"]
  sendReq --> standing{"Given: resident in good standing, fewer than three active borrows, visible Free Listing they do not own?"}
  standing -->|"three active borrows"| threeCap["Then AC-011: refused; three-borrow rule is in the way; return or a manager exception"]
  standing -->|"off-site manager with no unit"| noBorrow["Then AC-013: refused; borrowing is for residents who live here and have a unit"]
  standing -->|"yes"| twoAsks{"When: two residents send a request at the same moment"}
  twoAsks -->|"this submit is the WAITING row"| waiting["Then AC-010: request WAITING; Listing Asked for; borrower sees waiting before leaving the screen"]
  twoAsks -->|"other submit recorded first"| alreadyAsked["Then AC-012: exactly one WAITING request; the other person is told the item is already asked for and is not free; they are not queued"]
  waiting --> lenderWait["Given: lender has a WAITING request still inside 24 hours"]
  lenderWait --> answer{"When: lender answers"}
  answer -->|"accept as requested"| promisedSame["Then AC-014: AgreedBorrow created; Listing Promised; both read back the same collect window and return-by"]
  answer -->|"accept with a change still within longest length"| promisedChange["Then AC-015: hold starts immediately at those new times; Listing Promised; no second yes; borrower told at once"]
  answer -->|"decline after extra confirmation"| declined["Then AC-016: request DECLINED; Listing Free; borrower told"]
  lenderWait --> deadline["When: WAITING for 24 hours with no answer"]
  deadline --> lapsed["Then AC-017: request LAPSES; Listing Free; both people are told"]
  lapsed --> lateAnswer["When: lender tries to accept or decline"]
  lateAnswer --> alreadyLapsed["Then AC-018: told the request already lapsed and the item is not promised"]
```

#### Collect and return (US-005)

```mermaid
flowchart TD
  promised["Given: AgreedBorrow is HOLD_PROMISED and collect has not been confirmed"]
  recordCollect["When: either party records collect, optionally as already happened after an outage"]
  waitingHandoff["Then AC-019: COLLECT Handoff is WAITING_CONFIRMATION; other party has 12 hours to confirm"]
  confirmCollect["When: the other party confirms within 12 hours"]
  outNow["Then AC-020: Handoff CONFIRMED; AgreedBorrow OUT; Listing Out"]
  recordReturn["When: either party records return and the other confirms"]
  hasItem{"Given: lender actually has the item?"}
  freeNow["Then AC-021: Listing Free immediately; collect vs return remain separate controls"]
  thirdUnit["Then AC-022: Cupboard does not mark return; return is confirmed only when the lender actually has the item"]
  promised --> recordCollect --> waitingHandoff --> confirmCollect --> outNow --> recordReturn --> hasItem
  hasItem -->|"AgreedBorrow is OUT and lender has the item"| freeNow
  hasItem -->|"third unit that does not have the item"| thirdUnit
```

### Data Model

Cardinalities follow `entities[].relationships[]`. `Unit` to `ResidentAccess` is drawn as one-to-many because `Unit.relationships` is `one-to-many` and the `ResidentAccess` description states many adults may share a unit.

```mermaid
erDiagram
  ResidentAccess {
    string id PK
    string displayName
    AccessRole role
    ResidentAccessStatus status
    boolean livesInBuilding
    boolean hasUnit
  }
  Unit {
    string id PK
    string label
    UnitStatus status
    string buildingName
  }
  Listing {
    string id PK
    string shortName
    ListingStatus status
    string lenderAccessId FK
    boolean hiddenByManager
  }
  Photograph {
    string id PK
    string listingId FK
    PhotographStatus status
    string altText
  }
  BorrowRequest {
    string id PK
    string listingId FK
    string borrowerAccessId FK
    BorrowRequestStatus status
  }
  AgreedBorrow {
    string id PK
    string listingId FK
    string requestId FK
    AgreedBorrowStatus status
  }
  Handoff {
    string id PK
    string agreedBorrowId FK
    HandoffKind kind
    HandoffStatus status
  }
  ConditionNote {
    string id PK
    string listingId FK
    string agreedBorrowId FK
    ConditionNoteStatus status
  }
  Dispute {
    string id PK
    string listingId FK
    string agreedBorrowId FK
    DisputeStatus status
  }
  BuildingNotice {
    string id PK
    BuildingNoticeStatus status
    string body
  }
  InCupboardNotice {
    string id PK
    string recipientAccessId FK
    InCupboardNoticeStatus status
    NoticeEvent event
  }
  ManagerActivityEvent {
    string id PK
    string actorAccessId FK
    string action
    ManagerActivityEventStatus status
  }
  OperationalEvent {
    string id PK
    OperationalEventKind kind
    OperationalEventStatus status
  }
  OversightSnapshot {
    string id PK
    OversightSnapshotStatus status
    boolean omitsUnpublishedContactNotes
  }
  Unit ||--o{ ResidentAccess : "adults recorded against this unit"
  ResidentAccess ||--o{ Listing : "listings this adult owns as lender"
  Unit ||--o{ Listing : "listings collected from this unit"
  Listing ||--|| Photograph : "at most one optional photo"
  Listing ||--o{ BorrowRequest : "asks for this listing"
  ResidentAccess ||--o{ BorrowRequest : "requests this adult placed as borrower"
  BorrowRequest ||--|| AgreedBorrow : "created on accept or accept-with-change"
  Listing ||--o{ AgreedBorrow : "accepted borrows of this listing"
  ResidentAccess ||--o{ AgreedBorrow : "borrows this adult is a party to"
  AgreedBorrow ||--o{ Handoff : "collect and return handoffs"
  Listing ||--o{ ConditionNote : "visible notes for future borrowers"
  AgreedBorrow ||--o{ ConditionNote : "notes after confirmed return"
  Listing ||--o{ Dispute : "freezes new requests on this listing only"
  AgreedBorrow ||--o{ Dispute : "optional freeze on this item"
  InCupboardNotice ||--|| ResidentAccess : "Recipient"
  InCupboardNotice ||--|| Listing : "optional related listing"
```

### API Sequence — Request and accept-with-change

Mutations `API-012` `POST /v1/listings/{id}/requests` and `API-016` `POST /v1/requests/{id}/accept-with-change`.

```mermaid
sequenceDiagram
  actor Borrower as Resident borrower
  actor Lender as Resident lender
  participant Frontend
  participant API

  Borrower->>Frontend: sends a request on a Free Listing
  Frontend->>API: POST /v1/listings/{id}/requests
  alt success 201 BorrowRequest
    API-->>Frontend: 201 BorrowRequest
    Frontend-->>Borrower: WAITING before leaving the screen
  else already asked 409
    API-->>Frontend: 409 This item is already asked for and is not free.
    Frontend-->>Borrower: already asked for and is not free
  else named rule 422
    API-->>Frontend: 422 A named request rule stands in the way.
    Frontend-->>Borrower: a named request rule stands in the way
  else not resident with unit 403
    API-->>Frontend: 403 Borrowing is for residents who live here and have a unit.
    Frontend-->>Borrower: borrowing is for residents who live here and have a unit
  end

  Lender->>Frontend: accepts with a change to times
  Frontend->>API: POST /v1/requests/{id}/accept-with-change
  alt success 200 AgreedBorrow
    API-->>Frontend: 200 AgreedBorrow
    Frontend-->>Lender: hold starts now at the new times
    Frontend-->>Borrower: borrower is told at once
  else already lapsed 409
    API-->>Frontend: 409 The request already lapsed.
    Frontend-->>Lender: the request already lapsed
  else longest length 422
    API-->>Frontend: 422 Times must stay within longest borrow length.
    Frontend-->>Lender: times must stay within longest borrow length
  end
```

### Screen Navigation

Edges use `ui-surface.interactions[]` triggers (and screen notes that name an opened screen). `INT-001` / `INT-002` stay on `SCR-001`. Catalogue filter `INT-004` stays on `SCR-004`. Sign-in does not name a destination screen in `interactions[]`.

```mermaid
flowchart TB
  subgraph AccessScreens["Access"]
    SCR001["SCR-001 Sign in"]
    SCR002["SCR-002 Private building register"]
    SCR003["SCR-003 Access ended"]
  end
  subgraph ListingScreens["Catalogue and listings"]
    SCR004["SCR-004 Building catalogue"]
    SCR005["SCR-005 Listing"]
    SCR006["SCR-006 List an item"]
    SCR007["SCR-007 My listings"]
    SCR008["SCR-008 Manage listing"]
    SCR014["SCR-014 Your notices"]
  end
  subgraph BorrowScreens["Request accept handoff"]
    SCR009["SCR-009 Request to borrow"]
    SCR010["SCR-010 Incoming request"]
    SCR011["SCR-011 On loan and promised"]
    SCR012["SCR-012 Collect or return"]
    SCR013["SCR-013 Condition note"]
    SCR025["SCR-025 Change agreed times"]
  end
  subgraph ManagerScreens["Manager"]
    SCR015["SCR-015 Who has access"]
    SCR016["SCR-016 Admit an adult"]
    SCR017["SCR-017 Manage access"]
    SCR018["SCR-018 Manager oversight"]
    SCR019["SCR-019 Twelve-month activity"]
    SCR020["SCR-020 Something looks wrong"]
    SCR021["SCR-021 Dispute"]
    SCR022["SCR-022 Items still out"]
    SCR023["SCR-023 Building-wide notice"]
    SCR024["SCR-024 Committee page"]
  end
  SCR001 -->|"INT-001 submits the manager-issued phrase or code"| SCR001
  SCR001 -->|"INT-002 submits a wrong phrase or code"| SCR001
  OutsiderOpen["INT-003 an outsider opens the Cupboard"] -->|"shows the private-register explanation"| SCR002
  SCR004 -->|"INT-004 types words, free-today, or a group chip"| SCR004
  SCR004 -->|"INT-005 opens a catalogue row"| SCR005
  SCR005 -->|"RequestThisItemAction"| SCR009
  SCR005 -->|"LenderListingActions"| SCR008
  SCR007 -->|"AddListingAction"| SCR006
  SCR007 -->|"each row opens manage listing"| SCR008
  SCR006 -->|"INT-006 submits List an item after forbidden-goods confirmation"| SCR006
  SCR008 -->|"INT-007 taps pause or withdraw while a request is waiting or a hold is open"| SCR008
  SCR009 -->|"INT-008 sends a request on a Free Listing"| SCR009
  SCR010 -->|"INT-009 accepts with a change to times"| SCR010
  SCR011 -->|"OpenHandoffAction"| SCR012
  SCR011 -->|"ProposeTimeChangeAction"| SCR025
  SCR012 -->|"INT-010 records collect as already happened after an outage"| SCR012
  SCR012 -->|"INT-011 confirms return when the lender has the item"| SCR012
  SCR013 -->|"INT-012 submits a condition note after confirmed return"| SCR013
  SCR015 -->|"AdmitResidentAction"| SCR016
  SCR016 -->|"INT-013 admits an adult and issues a phrase in person"| SCR016
  SCR015 -->|"EndAccessAction"| SCR017
  SCR017 -->|"INT-014 ends access after extra confirmation"| SCR017
  SCR017 -->|"INT-020 deputy tries to name a further deputy or remove the manager"| SCR017
  SCR018 -->|"INT-016 hides or retires an unsafe Listing that has an in-flight ask"| SCR018
  SCR018 -->|"PrintOversightAction"| SCR024
  SCR024 -->|"INT-015 prints or saves the five oversight answers"| SCR024
  SCR022 -->|"INT-019 transfers a Listing to a remaining adult after move-out"| SCR022
  SCR025 -->|"INT-017 proposes a later time change after an agreement exists"| SCR025
  SCR025 -->|"INT-018 borrower cancels a hold after accept-with-change"| SCR025
```

---


## Schema History

| Version | Date | Change |
|---------|------|--------|
| 1.1 | 2026-09-17 | Initial hybrid spec from enriched requirements, qa-log round 1, and analysis. Status reviewing. |

