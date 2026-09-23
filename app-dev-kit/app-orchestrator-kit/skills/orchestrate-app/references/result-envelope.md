# Kit result envelope — `kit-result.json`

**Canonical schema** for the app-dev-kit family. Each kit copies `write-kit-result.mjs`
beside its entry skill. The parent reads **only** this file after a Skill returns.

**Never** paste spec bodies, prototype HTML/CSS/JS, blackboards, review packets, or Q&A
logs into the parent conversation or into the next Skill spawn.

Schema version: `app-dev-kit/kit-result/v1`

---

## Default paths

| Kit | File | When |
|-----|------|------|
| `generate-spec` | `{RUN_DIR}/kit-result.json` | After publish, or abort once `RUN_DIR` exists |
| `generate-html` | `{dirname(SPEC_FILE)}/html-kit-result.json` | Always after a spec was located. On approve, also `{OUTPUT_DIR}/kit-result.json` |
| `feature-dev` | `.spec/features/{slug}.kit-result.json` | After Station 12 approve, or abort once a slug exists. Optional `RESULT_OUT` |
| `backend-dev` | `.spec/backend/{slug}.kit-result.json` | After Station 12 approve, or abort once a slug exists. Optional `RESULT_OUT` |
| `agent-dev` | `.spec/agents/{slug}.kit-result.json` | After Station 12 approve, or abort once a slug exists. Optional `RESULT_OUT` |
| `orchestrate-frontend` | `{dirname(SPEC_PATH)}/frontend-kit-result.json` | After the UI checklist loop (or pause/abort) |
| `orchestrate-app` | `{dirname(SPEC_PATH)}/app-kit-result.json` | After Station 6 (or abort once a work-plan exists) |

If the orchestrator passes `RESULT_OUT`, the callee writes **that path as well** (`--also`).

---

## Shape

```json
{
  "envelope": "app-dev-kit/kit-result/v1",
  "kit": "generate-spec",
  "outcome": "approved",
  "spec_path": ".spec/app/spec-20260920-120000_demo/spec.md",
  "prototype_ref": "",
  "feature_spec": "",
  "backend_spec": "",
  "agent_spec": "",
  "work_plan": "",
  "slug": "demo",
  "branch": "",
  "parent_branch": "",
  "run_dir": ".spec/app/spec-20260920-120000_demo",
  "reason": "",
  "written": "2026-09-20T12:00:00.000Z"
}
```

| Field | Values / meaning |
|-------|------------------|
| `kit` | `generate-spec` \| `generate-html` \| `feature-dev` \| `backend-dev` \| `agent-dev` \| `orchestrate-frontend` \| `orchestrate-app` |
| `outcome` | `approved` (ready for the next station) \| `aborted` (human declined or dropped) \| `error` (structural fail) |
| `spec_path` | App `spec.md`, or the callee blackboard when that is the run artifact |
| `prototype_ref` | Directory `.spec/prototype/{tc}_{slug}/` or `""` |
| `feature_spec` | `.spec/features/{slug}.md` (feature-dev only) |
| `backend_spec` | `.spec/backend/{slug}.md` (backend-dev only) |
| `agent_spec` | `.spec/agents/{slug}.md` (agent-dev only) |
| `work_plan` | `.spec/app/spec-{tc}_{slug}/work-plan.md` (orchestrate-app) |
| `slug` | App slug or increment slug |
| `branch` | `feature/{slug}` / `backend/{slug}` / `agent/{slug}` when created |
| `parent_branch` | Branch the feature was cut from (`feature-dev` only). Empty for other kits |
| `run_dir` | Spec run folder, prototype dir, or increment dir |
| `reason` | Short abort/error note; empty on success |

Empty string means “not applicable”, never `null`. Additive fields may be `""`.

---

## Outcomes → parent status

| Envelope `outcome` | Work-plan / checklist `status` |
|--------------------|--------------------------------|
| `approved` | `done` (record `slug` / `branch`) |
| `aborted` | `pending` |
| `error` | `blocked` + `blocked-reason` |
| missing envelope | leave `in-progress`; resume re-offers it |

---

## Parent rules after a Skill returns

1. `Read` the envelope path above. Do not scrape the callee’s chat transcript for paths.
2. If the file is missing → treat as `error`, `reason: "no kit-result.json"`.
3. Keep in working memory **only** the fields in this file (plus work-plan / checklist ids).
4. Discard callee HITL transcripts from further spawns. The artifacts on disk are the record.
