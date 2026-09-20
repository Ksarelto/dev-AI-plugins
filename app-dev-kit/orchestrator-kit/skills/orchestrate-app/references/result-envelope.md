# Kit result envelope — `kit-result.json`

**Written by**: each delegated kit, via `scripts/write-kit-result.mjs` (copied beside that kit’s
entry skill), **before** the skill returns or STOPs after a run folder exists.
**Read by**: `orchestrate-app` — this is the **only** payload the parent may use from a callee.
**Never** paste spec bodies, prototype HTML/CSS/JS, feature blackboards, review packets, or Q&A
logs into the parent conversation or into the next Skill spawn.

Schema version: `app-dev-kit/kit-result/v1`

---

## Default paths

| Kit | File | When |
|-----|------|------|
| `generate-spec` | `{RUN_DIR}/kit-result.json` | After Station 10 publish, or abort once `RUN_DIR` exists |
| `generate-html` | `{dirname(SPEC_FILE)}/html-kit-result.json` | Always after a spec was located (success **and** abort). On approve, also `{OUTPUT_DIR}/kit-result.json` |
| `feature-dev` | `.spec/features/{slug}.kit-result.json` | After Station 12 approve, or abort once a slug exists. Optional `RESULT_OUT` from the orchestrator is a second copy |

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
  "slug": "demo",
  "branch": "",
  "run_dir": ".spec/app/spec-20260920-120000_demo",
  "reason": "",
  "written": "2026-09-20T12:00:00.000Z"
}
```

| Field | Values / meaning |
|-------|------------------|
| `kit` | `generate-spec` \| `generate-html` \| `feature-dev` |
| `outcome` | `approved` (ready for the next station) \| `aborted` (human declined or dropped) \| `error` (structural fail) |
| `spec_path` | generate-spec / generate-html: app `spec.md`. feature-dev: **feature** blackboard path |
| `prototype_ref` | Directory `.spec/prototype/{tc}_{slug}/` or `""` |
| `feature_spec` | `.spec/features/{slug}.md` (feature-dev only) |
| `slug` | App slug (spec/html) or **feature** slug (feature-dev) |
| `branch` | `feature/{slug}` when feature-dev created/used one |
| `run_dir` | Spec run folder or prototype output dir |
| `reason` | Short abort/error note; empty on success |

Empty string means “not applicable”, never `null`.

---

## Parent rules after a Skill returns

1. `Read` the envelope path above. Do not scrape the callee’s chat transcript for paths.
2. If the file is missing → treat as `error`, `reason: "no kit-result.json"`.
3. Keep in working memory **only** the fields in this file (plus `task-checklist.md` paths/ids).
4. Discard callee HITL transcripts from further spawns. The artifacts on disk are the record.
