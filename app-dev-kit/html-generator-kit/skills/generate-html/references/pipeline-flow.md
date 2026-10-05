# Pipeline Flow — html-generator-kit

Station sequence, gates, loop guards, and parallelism rules for `html-orchestrator`.

If another file disagrees, **this file wins**.

`KIT_DIR` is the plugin root (directory that contains `agents/` and `skills/`). The `generate-html`
skill resolves it. Scripts and references are `{KIT_DIR}/skills/generate-html/…`. Never hardcode
`.spec/html-generator-kit/`.

---

## Station Sequence

```
── generate-html skill (main loop) ────────────────────────────────
Resolve KIT_DIR
Step 2.5     Resolve ui-ux-pro-max → UIUX_DIR (offer install if missing)
Step 2.6     collect-design-inputs.mjs → design-inputs.json (binding: true = provided reference is mandatory)
──────────────────────────────────────────────────────────────────

── orchestrator subagent (MODE: build) ──────────────────────────
Station 0    Setup — delta-pages.mjs --spec → spec-summary.json (script)
      ↓
Station 1    Read spec-summary.json (screens, entities, nav_structure, assembly_pages)
      ↓
Station 1.5  Design Direction (design-strategist, reads design-inputs.json; ui-ux-pro-max only for open slots or when nothing is binding)
             → design-brief.md (+ ## Slots JSON) + ux-directives.md   ← GATE: design-brief
      ↓
Station 2    Design System — apply-design-brief.mjs (script)  ← GATE: design-system-contract
      ↓
Station 3    Component Library  ← GATE: component-ready
      ↓
Station 4    Screen Generation  ← PARALLEL (all screens at once)
      ↓
Station 5    Assembly & Wiring — assemble-prototype.mjs (script)
      ↓
Station 6    QA Validation — qa-prototype.mjs (script)  ← GATE: qa-pass
      ↓
Station 6.5  Render & Functionality Verification  ← GATE: render-pass
      ↓
  ⇢ RETURN REVIEW_PACKET or ESCALATION_PACKET to the generate-html skill, then STOP
──────────────────────────────────────────────────────────────────

── generate-html skill (main loop — owns the human gate) ──────────
Station 7    Human Review Loop (max 3 cycles)
  • Approve        → Station 8
  • Request change → re-spawn orchestrator MODE: revise → new packet → repeat
  • Abort          → stop
      ↓
Station 8    Finalize (skill) — finalize-prototype.mjs → README.md + page-map.json
──────────────────────────────────────────────────────────────────
```

**Why the gate is skill-owned:** the orchestrator is a subagent; a subagent's `AskUserQuestion`
never reaches the real user, so an in-agent gate would silently self-approve. The skill runs in the
main conversation loop, so only it can truly pause for human approval.

**Packets:** the orchestrator never asks. It returns `REVIEW_PACKET` or `ESCALATION_PACKET`. Hard
gate failures and QA/render failures after one retry are `ESCALATION_PACKET`, not an in-agent
question.

---

## Gates

| Gate | Station | Condition | On failure |
|------|---------|-----------|-----------|
| `design-brief` | 1.5→2 | `design-brief.md` **and** `ux-directives.md` exist and non-empty; brief has a `## Slots` block; `binding: true` → brief has `## Binding reference` | re-run strategist once, then `ESCALATION_PACKET` |
| `design-system-contract` | 2→3 | `apply-design-brief.mjs` exits 0 (slots valid, no leftover `⟨⟩`, no `locked_missing`) | strategist `FIX:` once + re-run script, then `ESCALATION_PACKET` |
| `component-ready` | 3→4 | `js/app.js`, `js/data.js`, `component-manifest.md` all exist and non-empty | `ESCALATION_PACKET` |
| `qa-pass` | 6→6.5 | `qa-prototype.mjs` exits 0 (`critical_issues` empty) | Auto-fix attempt (max 1 retry), then `ESCALATION_PACKET` |
| `render-pass` | 6.5→7 | `verify-prototype.mjs` exits 0 (`passed: true`) | Route each critical to owning agent, re-run station, re-verify (max 1 cycle), then `ESCALATION_PACKET`. Playwright missing → `SKIPPED` warning on `REVIEW_PACKET`, not a hard fail |

## Append mode

When `current.json` has a `prototype_ref`, the skill copies that directory and sets `MODE: append`.
Stations 1.5–3 are not re-run. The copied design files must still exist (the same gates, checked
on disk). Station 4 runs only for screens listed in `delta-pages.json`. `spec-summary.json` is
refreshed from the spec, and Stations 5–6 run on all its `assembly_pages`.

**Gate bypass is never allowed** for the first four gates on a full build. The render gate is where the
"looks broken / tiny / unstyled" class of bug is caught — never skip the **script** when the
file exists; skip only the browser half when Playwright is unavailable (see verification-protocol).

---

## Loop Guards

| Loop | Location | Max cycles | Exit condition | On exceed |
|------|----------|-----------|----------------|-----------|
| QA auto-fix | Station 6 | 1 retry | No critical issues | `ESCALATION_PACKET` |
| Render auto-fix | Station 6.5 | 1 cycle | verify-prototype.mjs exits 0 | `ESCALATION_PACKET` with report.json + screenshots |
| Human review | Station 7 (skill) | 3 cycles | User approves | AskUserQuestion with unresolved items; then finalize as-is or abort per user choice |

Station 7's loop is owned by the `generate-html` skill, not the orchestrator. Each "Request change"
cycle re-spawns the orchestrator in `MODE: revise`; approval is Station 8 in the skill (no
`MODE: finalize`).

---

## Parallelism Rules

### Station 4 (always parallel)

ALL screen-generator agents MUST be spawned in a single message.
Never spawn screen generators sequentially — it defeats the purpose of parallelism.

The number of parallel agents equals the number of entries in `screens[]`.
Each agent receives only its own page's slice — not all pages' data.

### All other stations (strictly sequential)

Stations 1, 2, 3, 5, 6, 7, 8 are strictly sequential.
Do NOT attempt to overlap:
- Station 3 before Station 2 completes (depends on design-system-ref.md)
- Station 4 before Station 3 completes (depends on component-manifest.md)
- Station 5 before Station 4 completes (needs all pages to exist for index.html)

---

## Context Passing Rules

See also `references/context-budget.md`.

**Each agent receives ONLY the context slice it needs.** Never pass the full spec content to the
orchestrator or to downstream agents. `delta-pages.mjs` reads `SPEC_FILE` → `spec-summary.json`.

| Agent | Receives |
|-------|----------|
| `html-orchestrator` | `SPEC_FILE` path, identity fields, `KIT_DIR`, `OUTPUT_DIR`, `UIUX_DIR` — **not** spec body |
| `design-strategist` | TITLE + domain(s) + entity names + distinct page types + 1–3 sentence purpose/audience + KIT_DIR + OUTPUT_DIR + UIUX_DIR + DESIGN_INPUTS path (it reads the sources itself) |
| `component-library-author` | design-system-ref.md content + entity definitions + KIT_DIR + OUTPUT_DIR |
| `screen-generator` | One page object + one entity definition + design_ref + ux_directives (all-pages + this type only) + component_manifest + `rules_dir`=`{KIT_DIR}/skills/generate-html/references/` + output_path |
| `modification-router` | User change text + `assembly_pages` IDs/titles/domains only |

Violating these rules causes context overflow on large specs (the #1 bottleneck).

---

## Modification Re-entry Points

When `modification-router` returns tasks, the orchestrator re-enters the pipeline at the correct station:

| Task type | Re-entry | Cascade effect |
|-----------|----------|---------------|
| Look-and-feel change ("more modern", "feels dated", new palette/fonts) | Station 1.5 | Re-reads design-inputs.json; ui-ux-pro-max only for open slots or when nothing is binding; must re-run stations 2 + 3 + 4 (all pages) |
| Token/font/radius/density change | strategist `FIX:` on `## Slots` → Station 2 script | No page re-run (pages reference tokens); layout switch → Station 4 all pages |
| Component/data change | Station 3 | May require station 4 re-run |
| Single page change | Station 4 (target page only) | No cascade |
| Multiple pages | Station 4 (affected pages, parallel) | No cascade |
| Nav order/labels | Station 4 (all pages) → Station 5 script | index copies the page shell |
| Re-run verify only | Station 6.5 | After the skill installed Playwright |

After any re-run (except verify-only), always re-run QA (Station 6) then Render Verification
(Station 6.5) before returning to human review (Station 7).

---

## Anti-Patterns (never do these)

| Anti-pattern | Why |
|-----------------|-----|
| Passing full spec content to the orchestrator or screen-generator | Context overflow on large specs |
| Running screen generators sequentially | Defeats parallelism, 10x slower |
| Skipping the design-system gate | Style drift across pages |
| Auto-approving human review | Kit non-negotiable: human must approve |
| `AskUserQuestion` inside html-orchestrator | Subagent questions never reach the user |
| Orchestrator `Write` (HTML/CSS/JS/README) | Authority leak; workers and the skill own files |
| Re-running the full pipeline for a single-page change | Wasteful; route to single agent only |
| Reading all CSS files in screen-generator | design-system-ref.md is the compact contract |
| Installing ui-ux-pro-max or Playwright from inside a subagent | Needs user consent; the skill owns install |
| Claiming a design was rule-sourced when `UIUX_DIR == none` | Dishonest; the packet must say `first-principles` |
| Emitting every signature block "to be safe" | Restraint is the design; max 3, only what the brief named |
| Using a signature class in a page whose block wasn't emitted | Renders as nothing — silent visual breakage |
| Hardcoding `.spec/html-generator-kit/` | Plugin root is `KIT_DIR`; `.spec/` is artifacts |
| Overriding a provided colour/font/layout with a database pick or "differentiation" | A provided reference is mandatory; the kit designs only what it leaves open |
| Changing a locked colour to fix contrast | Fix the pairing or disclose an `a11y-risk` deviation; the human decides |
| Running `verify-prototype.mjs` after each page or station | Opens a browser per change. The render check runs once at Station 6.5, after assembly and QA |
