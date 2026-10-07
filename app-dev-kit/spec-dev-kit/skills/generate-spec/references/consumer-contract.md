# Consumer Contract — how build kits use a spec

**Audience**: html-generator-kit, frontend-orchestrator-kit, feature-dev-kit, app-orchestrator-kit,
backend-dev-kit, agent-dev-kit — and anyone writing a new consumer.
**Schema**: `spec-schema.md` (2.0). Every consumer also reads 1.x specs (§ Legacy specs).

A published spec is a **step-by-step build guide**: `delivery-plan.slices` says *what to build in
which order*, each slice's `steps` say *how*, and `done-when` says *when it is finished*. Everything
a step needs is addressable by id.

---

## 1. Find the spec

1. Read `.spec/app/current.json` → `spec_path`. Never glob for the newest spec.
2. Check `status: approved` (feature-dev's importer refuses anything else; others must too).
3. Check `spec-version`: `2.0` → this contract; `1.x` → § Legacy specs.

Files next to `spec_path`:

| File | Use |
|------|-----|
| `spec.md` | the contract (YAML front matter). Parse YAML; never feed the body to a model as data |
| `slices/SL-NNN.yaml` | **build brief** per slice (`brief: app-dev-kit/slice-brief/v1`) — the slice plus every item it references |
| `spec.views.md` | generated human tables; never parse it |
| `artifacts/changes.json` | ids added / modified / removed by the last increment, per section (incl. `slices`) |
| `kit-result.json` | spec-dev-kit's path-only envelope |

---

## 2. Plan from the delivery plan (orchestrators)

```
for slice in delivery-plan.slices (in order):        # depends-on only points backwards
  for track in slice.tracks:                          # backend | frontend | agent
    one unit of work: { slice-ref: slice.id, refs from the slice }
```

| Orchestrator | Unit of work |
|--------------|--------------|
| app-orchestrator-kit `analyze-capabilities.mjs` | one `B-*` per slice with `backend`; one `A-*` per `AGT-*` in a slice with `agent`; frontend → orchestrate-frontend |
| frontend-orchestrator-kit `build-checklist.mjs` | one feature per slice with `frontend`; one task per slice screen |

Rules:
- **Keep slice order.** Never re-sort by priority — the order is the dependency order the human
  approved at spec review.
- **Pass `SLICE_REF`** to every build kit together with the explicit refs.
- **Reopen** a `done` unit when its slice id is in `changes.slices.modified` (or any of its refs
  changed).

---

## 3. Build one slice (build kits)

Read `{dirname(spec_path)}/slices/{SLICE_REF}.yaml`. If it is missing (a spec published before
briefs existed), filter the spec by the slice's refs — same result.

**Build what `slice.*-refs` lists; everything else in the brief is context.** (A brief includes,
for example, an endpoint of another slice because a screen in this slice calls it.)

`owners` maps each context rule and permission (one pulled in through a shared entity or
endpoint, not listed in this slice's `rule-refs` / `permission-refs`) to the slice that lists it,
or `""` when no slice does. Show those as "owned by {slice} — do not build"; build an unowned one.
`requirement-ids` lists the requirement ids this slice covers — ids only; look a text up with
`lookup-spec.mjs --ids`.

html-generator-kit does not read a slice brief. It builds one page for every `ui-surface.screens[]`
row on the approved spec. The html-generator column is what those pages show, not a per-slice read.

| Brief section | backend-dev | feature-dev | agent-dev | html-generator |
|---------------|-------------|-------------|-----------|----------------|
| `slice.steps` (own `track`) | build order | build order | build order | — |
| `slice.done-when` | tests that must pass | tests that must pass | evals that must pass | — |
| `user-stories`, `acceptance-criteria` (`kind`) | tests per AC; unhappy kinds are not optional | tests per AC | eval cases | — |
| `entities` (`values`, `derived`, `relationships.via`, `retention`) | tables, enums, FKs, retention jobs; never store `derived` | types; `derived` is read-only | tool I/O types | columns / fields / badges |
| `state-machines` | guarded transitions; `actor: system` + `after` = scheduled job | status words, allowed actions per state | — | status badges |
| `business-rules` (`params`, `on-violation`) | service checks; error `code` from the endpoint | show the violation copy | respect in tools | — |
| `permissions` | `requireRole` / `requirePermission`; `denied-behavior` | hide or disable controls | refuse tool calls | — |
| `endpoints` (`roles`, `errors[].code/message`) | routes + error envelope | API client + error copy | tool contracts | — |
| `screens` (`page-type`, `primary-entity`, `roles`, `states`, `components`) | — | pages, all four states | — | one page each |
| `notifications` (`copy`, `mandatory`, `timing`) | emit on transitions | render in-app copy | — | sample copy |
| `glossary`, `boundaries`, `non-functional` | naming, guardrails, NFR tests | copy words, a11y | — | copy words |
| `open-questions` (`blocking`) | a blocking question stops the slice — ask the human | same | same | — |

---

## 4. Legacy specs (1.x)

No `delivery-plan`, no briefs, no explicit refs. Consumers keep their previous heuristics:

- endpoints = `api-surface.endpoints` + `api-surface.mutations`, **de-duplicated by `id`** (1.x
  writers listed the same object in both);
- frontend features grouped by owning story; backend tasks per entity;
- ACs ↔ screens and entities ↔ endpoints matched by keywords;
- enum values parsed from `"One of: …"` in the field description.

When a 1.x app is continued, spec-dev-kit keeps `spec-version` 1.x unless the continue run
upgrades it explicitly (adds `roles`, `requirements`, and a `delivery-plan` covering every `must`
story). After an upgrade, orchestrators re-plan by slice; shipped work is matched by screen
(frontend) or kept as `done` history (backend), never queued for removal.
