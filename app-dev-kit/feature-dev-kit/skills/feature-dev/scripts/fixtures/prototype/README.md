# The Building Cupboard — HTML Prototype

Generated: 20260918-063204
Spec: /Users/Artsiom_Murashko/Documents/Own/dev-cusor-plugins/.spec/app/spec-20260917-124658_building-cupboard/spec.md

## Serve

npx serve .spec/prototype/20260918-063204_building-cupboard
Open http://localhost:3000

## Pages (25)

- sign-in: Sign in — Create a signed-in session for ResidentAccess with the manager-issued phrase or code.
- private-register: Private building register — View the private-register explanation for an outsider; never list Listings, photos, units, or names.
- access-ended: Access ended — View the ended-access message for a former ResidentAccess and point outstanding returns to the manager.
- building-catalogue: Building catalogue — Browse and filter all Listings in this building; each row opens listing detail.
- listing-detail: Listing — View a single Listing with status, pickup, caution, and request or lender actions.
- list-an-item: List an item — Create a new Listing with required fields, forbidden-goods confirmation, and optional photo.
- my-listings: My listings — List my own Listings; each row opens manage listing.
- manage-listing: Manage listing — Manage a single Listing the lender owns: pause, resume, correct, or withdraw.
- request-to-borrow: Request to borrow — Create a BorrowRequest for a free Listing with collect window and return-by.
- incoming-request: Incoming request — Manage a waiting BorrowRequest: accept as requested, accept with a change, or decline.
- on-loan-and-promised: On loan and promised — List my AgreedBorrows currently promised, out, or overdue.
- collect-or-return: Collect or return — Manage a single Handoff for an AgreedBorrow: record or confirm collect, or record or confirm return.
- condition-note: Condition note — Create a ConditionNote after confirmed return, signed with display name.
- change-agreed-times: Change agreed times — Manage an AgreedBorrow time-change proposal before collect, or a return-by extension after collect.
- your-notices: Your notices — List InCupboardNotice items the signed-in person must see when they open the Cupboard.
- who-has-access: Who has access — List all ResidentAccess records by unit for manager oversight.
- admit-an-adult: Admit an adult — Register a new ResidentAccess by display name and unit, then issue a phrase or code in person.
- manage-access: Manage access — Manage a single ResidentAccess: correct unit, name or remove deputy, or end access.
- manager-oversight: Manager oversight — Dashboard overview of overdue AgreedBorrows, open Disputes, and the five oversight answers.
- twelve-month-activity: Twelve-month activity — List building-wide ManagerActivityEvent rows for the last twelve months.
- something-looks-wrong: Something looks wrong — List OperationalEvent rows for failed sign-in clustering and forbidden-listing attempts.
- dispute: Dispute — Manage a single Dispute: notes in order, dated remark, and outcome.
- items-still-out: Items still out — List AgreedBorrows still out after access ended or seven-day unresolved loss.
- building-wide-notice: Building-wide notice — Create or replace the single BuildingNotice at the top of the catalogue.
- committee-page: Committee page — Overview of the five oversight answers as a printable readable page for a committee meeting.

## Design System

Direction: consumer-friendly · primary 43 · Calistoga + Inter · sidebar · signature: soft-depth, bento, editorial
Design authority: ui-ux-pro-max

- `design-brief.md` — the chosen direction and why
- `ux-directives.md` — per-page-type UX rules the screens were built against
- `design-system-ref.md` — token and component/class reference
