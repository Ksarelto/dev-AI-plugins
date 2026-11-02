# Analysis steps (S1 requirements)

Used by `prd-authoring` and `delta-spec`. Adapted from the v1 spec analyst. Do this analysis in your
head or in scratch notes; only the spec, `completeness.yaml` and the envelope are outputs.

A gap surfaced is cheap; a gap silently filled becomes a defect in the build. But a stated rule is
not a gap: before you open one, search the sources for the answer.

## 1. Classify every source paragraph

T2 lists the normalised sources. Every `[SRC-nnn]` paragraph of this feature (its `feature` in
`context/index.yaml`, not `superseded`) gets exactly one class. Nothing is left unclassified — the spec
gate fails on a paragraph that is neither cited nor set aside (`source-dropped`).

| Class | Signal | Goes to |
|---|---|---|
| functional | a capability, an action, a "can", "must", "should" | a requirement (`sources`) with ACs |
| rule / constraint | a limit, a timer, an eligibility rule, "never", "at most" | an AC on the requirement it constrains, numbers verbatim |
| non-functional | speed, availability, accessibility, security, privacy | `non_functional` (`NFR-n`, its category) |
| decision | "we decided", a "Decisions" list, minutes | the requirement it decides, cited; never asked again |
| glossary | a definition, a "Terms" table | the words your requirements use; `sources_not_used` with reason "glossary: …" when it states no behaviour |
| context | history, pain points, "today the app does X" | `sources_not_used`, reason "context: …" (it may still shape the PRD body) |
| out of scope | "not now", "later", an "Out of scope" heading | PRD `out_of_scope`; `sources_not_used`, reason "out of scope" |
| open question | "TBD", "?", "unclear" | an `OQ-n` with a severity and default |
| preference | taste without a rule ("I like cards") | `sources_not_used`, reason "preference, no requirement" — or an OQ when it matters |

The heading a paragraph sits under is a strong hint: text under "Glossary", "Decisions",
"Out of scope", "Success measures", "Open questions" or "Background" is classified by that heading
unless the text itself states behaviour.

A paragraph that another feature's spec already cites does not need a second citation (after a
backlog split the sibling owns it).

## 2. Reframe vague statements

For each statement that cannot be measured, write the measurable version and treat it as a
propose + confirm candidate:

| Source says | Reframed |
|---|---|
| "make it fast" | "the order list renders 50 rows in under 1 s at the 95th percentile" |
| "improve the workflow" | "a customer reorders a past order in at most 2 clicks" |
| "better error messages" | "a declined card shows \"Your card was declined\" and keeps the cart" |

When the source gave no number at all, the number is yours: a `major` open question with that
number as its default, unless a common pattern settles it.

## 3. Story parts per requirement

Every requirement candidate needs an **actor** (as a …), a **capability** (I want …), a **benefit**
(so that …) and a **priority signal** (must / should / could). A missing part is a gap. When the same
part is missing everywhere (no priorities at all), open one gap for the pattern, not one per
requirement. Priority of a stated requirement is `must` unless the source marks it optional or later.

## 4. CRUD trace per entity

List the business objects the sources name. For each primary entity walk the lifecycle:

| Stage | Present when the sources say | Missing on a primary entity → |
|---|---|---|
| Create | create, add, new, register, upload | gap (data_lifecycle) |
| Read | list, view, show, detail, search | gap |
| Update | edit, change, rename, reassign | gap unless it is clearly read-only |
| Delete / archive | delete, remove, archive, retire, expire | gap — and an undo_rollback question when it is destructive |

Status words ("pending", "approved", "expired") mean a lifecycle: name every transition, who
triggers it and what the user sees. Each transition worth testing becomes an AC.

## 5. Implied dependencies

| Signal in the sources | Implied dependency | If the sources are silent |
|---|---|---|
| roles, permissions, "only admins", "my orders" | authentication and authorisation | gap — never assume a provider or a role model |
| notify, email, toast, "let them know" | a notification channel | gap: channel, recipients, wording |
| upload, attach, file, photo | file storage | gap: size and type limits, retention |
| search, filter, sort | a query or index layer | gap: which fields, how results are ordered |
| export, report, download | an export format | gap: format, scope, size limit |
| audit, history, "who changed what" | an audit trail | gap: which events and fields |

## 6. Consistency across requirements

Two requirements touching the same entity or role must treat it the same way ("admin can delete"
versus "any user can delete" is a conflict). Watch for terminology drift: "move" and "reschedule",
"status: active" and "status: enabled". Pick one word and use it everywhere.

## 7. Conflicts

For every pair of statements that seem to disagree, decide the type:

| Type | Meaning | You do |
|---|---|---|
| `contradiction` | both cannot be true | ask (conflict-resolution question, priority 1) |
| `complementary` | not a conflict once read together | merge them into one requirement citing both |
| `scope difference` | both true in different contexts | write both, each with its context in the text |
| `terminology drift` | same concept, different words | pick the canonical word; cite both sources |

Only contradictions are asked. When you must lean while waiting, prefer the newer source (its `date`
in `context/index.yaml`), the more specific one, and an authoritative document over discussion notes.
Record the lean as the question's default.

## 8. Walk the feature as every user

Before writing ACs, walk each requirement step by step as each role, including one who is not
allowed. Ask "what goes wrong here?": invalid input, empty data, permission denied, network
failure, two users at once, session expiry, limits reached, a dependency that is down. Each answer
the sources give is an AC (`error`, `edge` or `permission`); each they do not give is a gap.

## 9. Domain-aware defaults

Apply a default only when the sources are silent **and** it fits the domain. A default becomes an AC or
an NFR you write; one that could be wrong becomes an open question.

| Missing | Default | Never apply when |
|---|---|---|
| loading state | a skeleton matching the content | — |
| empty list | an explanation plus the next action | — |
| an action fails on the network | "did not go through — try again" with a retry, input kept | another system owns the call (next row) |
| another system rejects the request | show that system's message, keep the user's input, change nothing locally | the sources state their own handling |
| destructive action | a one-sentence confirmation naming the action | the sources list confirmations already |
| form validation | on blur, again on submit | — |
| accessibility | WCAG 2.2 AA; status never shown by colour alone | the sources set their own bar |
| **authentication** | none — derive it from the sources or ask | always |
| **performance target** | none — derive it from the source's words or ask | always |
| page size, sort, date format | derive from the stated scale and locale | the sources state them |

Behaviour owned by another system (an existing backend's validation, retries, retention) is not a gap
of this spec. Write only how this app reacts to that system's answer.

## 10. Self-check before writing completeness.yaml

- Every SRC paragraph of the feature: cited by a requirement or listed in `sources_not_used`.
- Every `must` requirement: at least one `happy` AC and one `error`, `edge` or `permission` AC, or
  a reason the story writer can give as `no_unhappy_path` (a pure calculation, a read-only view).
- Every primary entity traced through create / read / update / delete-or-archive.
- Every dependency row checked.
- Every contradiction asked or defaulted; no conflict resolved silently.
- Every number with a unit in a cited source appears in a requirement, AC or NFR (the gate warns
  `number-dropped` otherwise).
