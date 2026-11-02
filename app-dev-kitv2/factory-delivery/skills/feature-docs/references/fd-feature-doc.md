# The feature doc — structure, sources, rules

Path: `docs/features/<FEAT-id>-<slug>.md` (the slug is the feature's, from T0 or the feature
folder name). One file per feature; a change request on an existing feature **updates** that
feature's doc (find it by the feature ID it names, or by the ledger's `paths`), it does not add a
second one. gate-docs takes the first `docs/features/*.md` that contains the feature ID, so the ID
must appear in the title line.

## Sections, in this order

```markdown
# <Feature title> (<FEAT-id>)
<Two or three sentences: what the user can now do, who the user is, and why — from the PRD's
problem and goals, or the delta-spec's summary. No pipeline vocabulary.>

## Acceptance criteria
- AC-0001 — <the AC's text, verbatim>
- AC-0002 — …
<every AC of the spec, grouped by REQ when there are more than about eight:>
### REQ-0002 Discount in the total
- AC-0003 — …

## Removed
- REQ-0007 Export to CSV — removed: <the delta-spec's reason>; <what was taken out: screen, route,
  endpoint, setting>
<only for a change request with a non-empty `removed`; omit the section otherwise>

## Unchanged guarantees
- <each delta-spec `unchanged_guarantees` entry, verbatim — what a reader can still rely on>

## Screens and endpoints
| Surface | Where | Notes |
|---|---|---|
| Checkout page | `/checkout` (`src/pages/checkout`) | coupon field for signed-in customers |
| `POST /api/v1/coupons/validate` | api-contract operation `validateCoupon` | 200, 410 `COUPON_EXPIRED`, 422 |

## How to test it
1. <manual steps a developer or product owner can follow, one per main AC, with the exact values:
   "Sign in as a customer, add a 100.00 EUR item, apply B2B10 → -10.00 EUR line">
- Automated: `<acceptance test files>` (named after the ACs), run by `<the stack's test command>`.

## Configuration
<env variables, feature flags, roles or seed data the feature needs — only what the spec, the
contract or the component map names; omit the section when there is none>

## API documentation
<backend features only — see "OpenAPI" below>

## Decisions
- [ADR-001 — The discount is part of the order total](../adr/adr-001-discount-in-total.md)
<every ADR of the feature, linked to its promoted copy; human notes that shaped behaviour:>
- HD-2 — "Hide the coupon field for guest users" → AC-0004
```

## Rules

- **Every AC of the spec**, by ID, with its exact text — the gate fails on any AC ID missing from
  the file. Copy the text; do not paraphrase numbers, quotes or limits.
- **Every removed REQ**, by ID, with what was removed — the gate fails on a removed REQ ID missing.
- Describe only what the spec, the stories, the contract and the component map say. If the review
  or QA records show a known limitation (an open P2/P3 finding, an S3+ defect), add it under a
  `## Known limitations` section with its ID (`RV-4`, `DEF-002`); do not describe untested
  behaviour as working.
- File and route names come from the change set and the component map, never from reading code.
- Write for the next developer and the product owner: what it does, where it lives, how to try it,
  why it is built this way. No pack IDs, stage names, dispatch counts or model names.
- Links are relative (`../adr/…`) so they work in the repository browser.

## Where each fact comes from

| Section | Source (T2) |
|---|---|
| Intro | `01-requirements/prd.md` problem/goals, or `delta-spec.yaml` summary |
| Acceptance criteria, Removed, Unchanged guarantees | the spec (`reqs[].acs`, `removed`, `unchanged_guarantees`) |
| Screens and endpoints | `03-architecture/component-map.md`, `api-contract.yaml`, `02-stories/stories.yaml` `ux.surfaces`, `06-verify/change-set.yaml` file names |
| How to test it | the stories' Gherkin; the acceptance test file names from the change set |
| Decisions | `03-architecture/adr-*.md`, human notes in T1 |
| Known limitations | `06-verify/review.md` (non-blocking findings), `07-qa/defects.yaml` when present |

## OpenAPI

For a feature with an `api-contract.yaml` (backend or agent role):

- The stack generates the OpenAPI document from code (`node-backend-dev-kit:openapi-docs`, which T1
  lists for the tech writer: `buildOpenApiDocument()` in `src/openapi/document.ts`, served at
  `/api-docs` and `/api-docs/openapi.json` when API docs are enabled). There is nothing to
  regenerate by hand; the `openapi` audit at verification already compared it with the contract.
- In the feature doc's `## API documentation`: the operations this feature added, changed or
  removed (method, path, operation id, success and error statuses), and where the rendered docs are
  served.
- If the project also commits an exported copy (for example `docs/openapi.json`, or a script such as
  `openapi:export` in `package.json`), that copy is now stale. You may not write it unless T0 lists
  it: record "OpenAPI export needs regeneration: run `<script>`" in the docs report so it reaches the
  PR's open items.

## README

The README is not a stage output: change it only when T0's write list includes `README.md`. When
it does, keep its existing structure and update only these sections when the feature changes them:
"Features" (one line linking the feature doc), "Configuration" (new env variables or flags),
"API" (new endpoints, or the link to `/api-docs`), "Running" (a new service or command). When T0
does not list it and a section is now wrong, write the suggested change in the docs report.
