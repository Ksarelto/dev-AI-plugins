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
Station 0    Setup
  PARALLEL: run scripts/spec-model.mjs (SPEC_FILE path → spec-model.json) + read this file
      ↓
Station 1    Receive spec-model.json
      ↓
Station 1.5  Design Direction (design-strategist, reads design-inputs.json; ui-ux-pro-max only for open slots or when nothing is binding)
             → design-brief.md + ux-directives.md   ← GATE: design-brief
      ↓
Station 2    Design System  ← GATE: design-system-contract
      ↓
Station 3    Component Library  ← GATE: component-ready
      ↓
Station 4    Screen Generation  ← PARALLEL (all screens at once)
      ↓
Station 4.5  Incremental per-page verify-and-fix  ← PARALLEL (all pages just generated, at once)
             scripts/verify-prototype.mjs --page {id} (static+render gate only, no --model/--brief)
             cap 2 cycles + no-progress early stop (see Loop Guards) — NOT an escalation gate; a
             page still critical after 2 cycles proceeds to Station 5 as-is and is caught again,
             with the usual escalation path, at Station 6.5
      ↓
Station 5    Assembly & Wiring
      ↓
Station 6    QA Validation (scripts/qa-static.mjs — deterministic, no model call)  ← GATE: qa-pass
      ↓
Station 6.5  Render & Functionality Verification  ← GATE: render-pass
      ↓
Station 6.6  Visual Review (visual-reviewer, reads the Station 6.5 screenshots)  ← GATE: visual-review
      ↓
  ⇢ RETURN REVIEW_PACKET or ESCALATION_PACKET to the generate-html skill, then STOP
──────────────────────────────────────────────────────────────────

── generate-html skill (main loop — owns the human gate) ──────────
Station 7    Human Review Loop (max 3 cycles)
  • Approve        → skill writes README + page-map.json (Station 8)
  • Request change → re-spawn orchestrator MODE: revise → new packet → repeat
  • Abort          → stop
      ↓
Station 8    Finalize (skill) — write {OUTPUT_DIR}/README.md and page-map.json
──────────────────────────────────────────────────────────────────
```

**Why the gate is skill-owned:** the orchestrator is a subagent; a subagent's `AskUserQuestion`
never reaches the real user, so an in-agent gate would silently self-approve. The skill runs in the
main conversation loop, so only it can truly pause for human approval.

**Packets:** the orchestrator never asks. It returns `REVIEW_PACKET` or `ESCALATION_PACKET`. Hard
gate failures and QA/render failures after their 2-cycle, no-progress-early-stop cap are
`ESCALATION_PACKET`, not an in-agent
question.

---

## Gates

| Gate | Station | Condition | On failure |
|------|---------|-----------|-----------|
| `design-brief` | 1.5→2 | `design-brief.md` **and** `ux-directives.md` exist and non-empty; brief names 1–3 valid signature blocks (`none` allowed only with a binding reference); `binding: true` → brief has `## Binding reference` | re-run strategist once, then `ESCALATION_PACKET` |
| `design-system-contract` | 2→3 | `build-design-system.mjs` exited 0 (Phase 4: the file-existence + non-empty + motion-token + locked-token + signature-block checks are now the script's own hard-failure checks, not a self-report the orchestrator re-verifies) | `ESCALATION_PACKET` |
| `component-ready` | 3→4 | `js/app.js`, `js/data.js`, `js/store.js`, `component-manifest.md` all exist and non-empty | `ESCALATION_PACKET` |
| `qa-pass` | 6→6.5 | `scripts/qa-static.mjs` exits 0 (`critical` list empty) | Auto-fix (max 2 cycles, no-progress early stop — see Loop Guards § No-progress rule), then `ESCALATION_PACKET` |
| `render-pass` | 6.5→6.6 | `verify-prototype.mjs` exits 0 with `report.browser: true` (critical[] now also includes mobile-overflow, locked-token mismatches with `--brief`, and spec-conformance failures with `--model`, in addition to render/a11y/nav/modal/form) | Route each critical to owning agent, re-run station, re-verify (max 2 cycles, no-progress early stop), then `ESCALATION_PACKET`. No browser available (`report.browser: false`) → `ESCALATION_PACKET` with `options: ["install-browser", "proceed-unverified", "abort"]` — never folded into a plain `REVIEW_PACKET` |
| `visual-review` | 6.6→7 | `visual-reviewer` reports `passed: true` (no `critical` finding in its `VISUAL_REVIEW:` block) — **not** a HARD gate like `design-brief`/`component-ready`: a critical here still gets the same max-2-cycles + no-progress-early-stop treatment as `qa-pass`/`render-pass`, not an unlimited retry. Skipped entirely when Station 6.5 itself was SKIPPED (no screenshots to review) | Route each critical to owning agent (page-specific → `screen-generator`; brief-wide → `design-system-author`), re-run the station, re-run Station 6.5 then 6.6 (max 2 cycles, no-progress early stop), then `ESCALATION_PACKET` |

## Append mode

When `current.json` has a `prototype_ref`, the skill copies that directory and sets `MODE: append`.
Stations 1.5–3 are not re-run. The copied design files must still exist (the same gates, checked
on disk). Station 4 runs only for screens listed in `delta-pages.json`. Station 5 receives the
existing page-map entries plus those delta screens and rebuilds the nav. The 15-screen interpreter cap does not apply.

**Gate bypass is never allowed** for the first four gates on a full build. The render gate is where the
"looks broken / tiny / unstyled" class of bug is caught — never skip the **script** when the
file exists; skip only the browser half when Playwright is unavailable (see verification-protocol).

---

## Loop Guards

| Loop | Location | Max cycles | Exit condition | On exceed |
|------|----------|-----------|----------------|-----------|
| Incremental per-page verify-and-fix | Station 4.5 | 2 cycles, no-progress early stop | `verify-prototype.mjs --page {id}` exits 0 for that page | Proceed to Station 5 as-is — **not** an escalation (see § No-progress rule and Station 4.5 in the sequence above); the same issue, if still present, is caught by Station 6.5's own gate and escalation path |
| QA auto-fix | Station 6 | 2 cycles, no-progress early stop | No critical issues | `ESCALATION_PACKET` |
| Render auto-fix | Station 6.5 | 2 cycles, no-progress early stop | verify-prototype.mjs exits 0 | `ESCALATION_PACKET` with report.json + screenshots |
| Visual review auto-fix | Station 6.6 | 2 cycles, no-progress early stop | `visual-reviewer` reports `passed: true` | `ESCALATION_PACKET` with `CRITICAL_ISSUES` |
| Human review | Station 7 (skill) | 3 cycles | User approves | AskUserQuestion with unresolved items; then finalize as-is or abort per user choice |

Station 7's loop is owned by the `generate-html` skill, not the orchestrator. Each "Request change"
cycle re-spawns the orchestrator in `MODE: revise`; approval is Station 8 in the skill (no
`MODE: finalize`).

### No-progress rule (one rule, applied at Stations 4.5, 6, 6.5, and 6.6)

Before each retry/re-run cycle in any of the four loops above, record the current `critical[]` set
(the exact strings the gate reported — `qa-static.mjs`'s `report.json.critical`,
`verify-prototype.mjs`'s `report.json.critical`, or `visual-reviewer`'s `CRITICAL_ISSUES`). No
normalization beyond that: compare the exact strings, since every one of these scripts already
produces a stable, deterministic message for the same underlying problem (e.g. the exact file path +
rule id), so an identical string really does mean an identical issue.

After the retry's re-run, capture the new `critical[]` set and compare it to the recorded one:

- **Progress was made** (the new set is a strict subset — at least one previously-critical string is
  gone, even if new ones appeared) → continue to the next cycle, up to the 2-cycle cap.
- **No progress** (the new set is identical to, or a superset of — nothing from the old list was
  fixed — the previous set) → **stop retrying immediately and escalate**, even if only 1 of the 2
  cycles has been used. Burning a second identical cycle wastes a retry and produces a worse
  `ESCALATION_PACKET` (same information either way, one less chance spent reporting it).

This is one mechanism, not two: "cap 2 cycles" and "stop early on no progress" are read together —
the cap is the ceiling, the no-progress check is what usually stops a loop sooner than the ceiling.

---

## Parallelism Rules

### Station 0 (always parallel)

The orchestrator MUST perform both of these in the same message:
1. Read `pipeline-flow.md` (this file)
2. Bash: run `scripts/spec-model.mjs --spec {SPEC_FILE} --out {OUTPUT_DIR}/spec-model.json`

### Station 4 (always parallel)

ALL screen-generator agents MUST be spawned in a single message.
Never spawn screen generators sequentially — it defeats the purpose of parallelism.

The number of parallel agents equals the number of pages in `pages[]`.
Each agent receives only its own page's slice — not all pages' data.

### Station 4.5 (always parallel)

`verify-prototype.mjs --dir {OUTPUT_DIR} --page {id}` MUST be run for every page generated this run
in a single message (one Bash call per page, all in that one message — same convention as Station
4's single-message spawn, applied here via Bash instead of Agent). Any page-specific fix-and-reverify
cycle that follows (max 2, no-progress early stop) is scoped to just that page and does not block
the other pages' own cycles.

### All other stations (strictly sequential)

Stations 1, 2, 3, 5, 6, 7, 8 are strictly sequential.
Do NOT attempt to overlap:
- Station 3 before Station 2 completes (depends on design-system-ref.md)
- Station 4 before Station 3 completes (depends on component-manifest.md)
- Station 4.5 before Station 4 completes (needs the page file to exist to verify it)
- Station 5 before Station 4.5 completes (Station 4.5 is a cheap early catch before assembly spends
  work on top of a broken page — but Station 4.5 never blocks Station 5 past its 2-cycle cap)

---

## Context Passing Rules

See also `references/context-budget.md`.

**Each agent receives ONLY the context slice it needs.** Never pass the full spec content to the
orchestrator or to downstream agents. `scripts/spec-model.mjs` **Reads** `SPEC_FILE` directly — no
model call, no truncation (it replaced the old `spec-interpreter` agent).

| Agent | Receives |
|-------|----------|
| `html-orchestrator` | `SPEC_FILE` path, identity fields, `KIT_DIR`, `OUTPUT_DIR`, `UIUX_DIR` — **not** spec body |
| `design-strategist` | TITLE + domain(s) + entity names + distinct page types + 1–3 sentence purpose/audience + KIT_DIR + OUTPUT_DIR + UIUX_DIR + DESIGN_INPUTS path (it reads the sources itself) |
| `design-system-author` | design-brief.md content + entity names (strings) + KIT_DIR + OUTPUT_DIR + UIUX_DIR |
| `component-library-author` | design-system-ref.md content + entity definitions + KIT_DIR + OUTPUT_DIR |
| `screen-generator` | The FULL per-page object from spec-model.json as-is — `{ id, spec_id, title, description, type, domain, entity, route, roles, components, states, entity_fields, entity_statuses, api_contract, transitions, acceptance_criteria, interactions }` — plus design_ref + ux_directives (all-pages + this type only) + component_manifest + `rules_dir`=`{KIT_DIR}/skills/generate-html/references/` + output_path (+ `MODE`/`CHANGE_REQUEST` on a single-page revise — see Modification Re-entry Points) |
| `assembly-wiring` | pages[] IDs/titles/domains (no entity details) + nav_structure + design_ref + KIT_DIR + OUTPUT_DIR |
| `visual-reviewer` | `screenshots_dir` (Station 6.5's `_verify/screenshots/`) + `design_brief` content + `mockup_paths` (design-inputs.json `sources[]` where `kind: image`) + pages[] IDs/titles + OUTPUT_DIR |
| `modification-router` | User change text + pages[] IDs/titles/domains only |

Station 6 (QA) is `scripts/qa-static.mjs`, run via Bash with `--dir`/`--model`/`--uiux-dir` — not an
agent, so it has no row in this table (it replaced the old `qa-validator` agent; see Phase 7).

Violating these rules causes context overflow on large specs (the #1 bottleneck).

---

## Modification Re-entry Points

When `modification-router` returns tasks, the orchestrator re-enters the pipeline at the correct station:

| Task type | Re-entry | Cascade effect |
|-----------|----------|---------------|
| Look-and-feel change ("more modern", "feels dated", new palette/fonts) | Station 1.5 | Re-reads design-inputs.json; ui-ux-pro-max only for open slots or when nothing is binding; must re-run stations 2 + 3 + 4 (all pages) |
| Design system change | Station 2 | Must re-run stations 3 + 4 (all pages) |
| Component/data change | Station 3 | May require station 4 re-run |
| Single page change | Station 4 (target page only, `MODE: edit`) | No cascade — the existing file is edited in place (targeted diff), not regenerated from scratch; see `agents/screen-generator.md` § Edit mode |
| Multiple pages | Station 4 (affected pages, parallel) | No cascade |
| Assembly/nav change | Station 5 | No cascade |
| Re-run verify only | Station 6.5 | After the skill installed Playwright |

After any re-run (except verify-only), always re-run QA (Station 6), Render Verification
(Station 6.5), then Visual Review (Station 6.6) before returning to human review (Station 7).
Verify-only re-entries (Station 6.5) still re-run Station 6.6 afterward — the screenshots changed.

Station 4.5 (the incremental per-page verify-and-fix in the table above) applies only to a full
build/append pass's own Station 4 → Station 5 transition — not to these revise-flow re-entries. A
revise-flow single-page edit already goes through the full Station 6 → 6.5 → 6.6 gate chain
regardless of which station it re-entered at, so there is no separate early-catch step to add here.

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
| Giving Station 4.5 its own `ESCALATION_PACKET` branch | Duplicates Station 6.5's existing escalation path; a page still critical after Station 4.5's 2 cycles proceeds to Station 5 as-is and is caught there instead |
| Burning a full retry cycle (Station 4.5/6/6.5/6.6) when the critical set didn't change | Wastes a cycle and produces a worse escalation packet — see § No-progress rule; stop and escalate immediately instead |
