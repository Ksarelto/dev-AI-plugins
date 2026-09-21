---
name: generate-html
description: Transforms a validated spec from .spec/app/spec-*/spec.md into a clickable multi-page HTML prototype at .spec/prototype/{TIMECODE}_{SLUG}/. Design direction is sourced from the ui-ux-pro-max design-intelligence skill (installed on demand) so each prototype gets a current, product-appropriate look rather than a generic template. Output is split (one HTML per screen, dedicated css/*.css and js/*.js), fully CDN-free for styling (self-contained shadcn OKLCH tokens + component classes; no Tailwind runtime), verified with a headless-browser render check, and passes a mandatory human review gate before finalizing.
argument-hint: "[spec-slug or spec.md path]"
allowed-tools: [Read, Glob, Grep, Write, Bash, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

# Generate HTML Prototype

**Entry point for**: html-generator-kit pipeline
**Pipeline driver**: `html-orchestrator` agent (see `../../agents/html-orchestrator.md`)
**Spec source**: `.spec/app/spec-{YYYYMMDD-HHmmss}_{slug}/spec.md`

This skill runs in the **main conversation**. It owns every `AskUserQuestion` call. The
orchestrator is a subagent and must never ask the user — it returns a packet and stops.

---

## Resolve KIT_DIR (do this first)

`KIT_DIR` is the **plugin root** (the directory that contains `agents/` and `skills/`). Resolve in
this order; use the first that exists:

1. Parent of this skill folder — `{this SKILL.md directory}/../..` (Claude: if
   `${CLAUDE_SKILL_DIR}` is set, `KIT_DIR` is `${CLAUDE_SKILL_DIR}/../..`).
2. `app-dev-kit/html-generator-kit` relative to the workspace root (this marketplace repo).
3. `.spec/html-generator-kit` (legacy consumer copy).

All script and reference paths are `{KIT_DIR}/skills/generate-html/…`. Never hardcode
`.spec/html-generator-kit/skills/…` or `.spec/html-generator-kit/scripts/…`.

---

## Companion files (loaded on demand — not loaded unless a step references them)

| Path | Loaded by | When |
|------|-----------|------|
| `references/pipeline-flow.md` | this skill, orchestrator | before starting — single source of truth for station sequence, gates, and invariants |
| `references/context-budget.md` | orchestrator | payload contracts — paths and slices, not the full spec on the hub |
| `references/artifact-structure.md` | orchestrator, all agents | file ownership and output directory layout |
| `references/design-system-conventions.md` | `design-system-author` (Station 2) | OKLCH token system, CSS conventions |
| `references/alpine-interaction-patterns.md` | `screen-generator` (Station 4) | Alpine.js x- directives, store calls |
| `references/interaction-conventions.md` | `screen-generator` (Station 4) | data hook naming for QA + verification |
| `references/accessibility.md` | `screen-generator` (Station 4), `qa-validator` (Station 6) | a11y requirements and landmark structure |
| `references/qa-checklist.md` | `qa-validator` (Station 6) | structured pass/fail scoring |
| `references/verification-protocol.md` | orchestrator (Station 6.5) | headless-browser verification via `scripts/verify-prototype.mjs` |
| `references/ui-ux-pro-max.md` | this skill (Step 2.5), `design-strategist`, `design-system-author`, `qa-validator` | install/resolve the design-intelligence dependency, query recipes, token mapping, degradation |
| `templates/design-brief.md` | `design-strategist` (Station 1.5) | output format for design-brief.md |
| `templates/modern-signature-css.md` | `design-system-author` (Station 2) | contemporary CSS layer (motion, focus, bento/glass/gradient signatures) |
| `templates/tokens-css.md` | `design-system-author` (Station 2) | OKLCH tokens starter |
| `templates/base-css.md` | `design-system-author` (Station 2) | reset + typography foundation |
| `templates/components-css.md` | `design-system-author` (Station 2) | component class patterns |
| `templates/app-js.md` | `component-library-author` (Station 3) | Alpine stores: notification, modal, theme |
| `templates/mock-data-js.md` | `component-library-author` (Station 3) | entity mock-data pool pattern |
| `templates/navigation-js.md` | `assembly-wiring` (Station 5) | active-page highlight + breadcrumb helpers |
| `templates/page-shell.md` | `screen-generator` (Station 4) | standalone page HTML structure |
| `templates/index-shell.md` | `assembly-wiring` (Station 5) | landing app-map structure |
| `scripts/verify-prototype.mjs` | orchestrator (Station 6.5, Bash) | renders prototype + runs axe + screenshots |
| `scripts/write-kit-result.mjs` | this skill (finalize or abort) | `{spec dir}/html-kit-result.json` path-only envelope for frontend-orchestrator-kit / app-orchestrator-kit |

---

## Prerequisites

- A validated spec must exist in `.spec/app/`. Run `/generate-spec` first if none exists.
- **`ui-ux-pro-max`** — the third-party design-intelligence skill this kit uses as its design
  authority. Strongly recommended; Step 2.5 detects it and offers to install it. Without it the
  pipeline still runs, but the design is invented from model priors rather than sourced from a rule
  database, and prototypes drift back toward generic. See `references/ui-ux-pro-max.md`.

---

## Steps

Read `{KIT_DIR}/skills/generate-html/references/pipeline-flow.md` before Step 1.

### Step 1 — Locate spec

If a structured field `SPEC_PATH` is set and that file exists, use it as `SPEC_FILE`. Do **not**
re-glob “most recent”.

Else if the argument is a path that exists and ends with `spec.md`, use it as `SPEC_FILE`.

Else Glob `.spec/app/spec-*/spec.md` (spec lives **one level inside** the timecoded folder):

- Filter by argument slug if provided (substring match against folder name).
- If multiple match or no argument: sort by the timecode segment in the folder name **descending** and take the most recent.
- If nothing found: `"No spec found in .spec/app/. Run /generate-spec first."` → STOP (no envelope).

Read the selected `spec.md` **only to extract identity** (do not pass the full file to the orchestrator or back to `orchestrate-frontend` / `orchestrate-app`):
- `metadata.slug` (or derive from folder name: part after `_`)
- `metadata.title` (or fallback: slug with hyphens → spaces)

Keep `SPEC_FILE` as the path. The `spec-interpreter` agent reads the file itself.

On any STOP after `SPEC_FILE` is known (Step 2 decline, Step 2.5 Abort, review Abort, escalation
abort), write `{dirname(SPEC_FILE)}/html-kit-result.json` with `outcome: aborted` before returning
so parent orchestrators do not scrape chat.

### Step 2 — Generate timecode and confirm

```bash
date -u +%Y%m%d-%H%M%S
```

Output directory: `.spec/prototype/{TIMECODE}_{SLUG}/`

Ask user (single AskUserQuestion):
> "Generating HTML prototype from `{spec-filename}`. Output → `.spec/prototype/{TIMECODE}_{SLUG}/`. Proceed?"

If user declines: write an aborted envelope and STOP:

```bash
node {KIT_DIR}/skills/generate-html/scripts/write-kit-result.mjs \
  --out {dirname(SPEC_FILE)}/html-kit-result.json \
  --kit generate-html \
  --outcome aborted \
  --spec-path {SPEC_FILE} \
  --slug {SLUG} \
  --reason "user declined proceed"
```


### Step 2.5 — Resolve the ui-ux-pro-max dependency

Read `{KIT_DIR}/skills/generate-html/references/ui-ux-pro-max.md` (§ Path resolution) and run its resolution loop:

```bash
python3 --version 2>/dev/null || echo "NO_PYTHON"
for d in "$CLAUDE_PLUGIN_ROOT/.claude/skills/ui-ux-pro-max" ".claude/skills/ui-ux-pro-max" \
         "$HOME/.claude/skills/ui-ux-pro-max" ".cursor/skills/ui-ux-pro-max" \
         "$HOME/.cursor/skills/ui-ux-pro-max" ".agents/skills/ui-ux-pro-max" \
         "$HOME/.agents/skills/ui-ux-pro-max" ".windsurf/skills/ui-ux-pro-max" \
         ".factory/skills/ui-ux-pro-max"; do
  [ -f "$d/scripts/search.py" ] && echo "UIUX_DIR=$d" && break
done
```

**If a `UIUX_DIR=` line was printed and Python 3 is present** → set `UIUX_DIR` to that path and go to
Step 3. Do not ask the user anything.

**Otherwise** → AskUserQuestion:

> "This kit designs from `ui-ux-pro-max`, an open-source design-intelligence skill (84 styles, 192
> palettes, 74 font pairings, 98 UX guidelines). It isn't installed. Without it I design from model
> priors, which produces noticeably more generic prototypes. Install it?"

Detect the host AI for the installer:

```bash
if [ -d .cursor ] || [ -n "${CURSOR_PROJECT_DIR:-}" ]; then echo HOST_AI=cursor; else echo HOST_AI=claude; fi
```

- **Install it (recommended)** — run, then re-run the resolution loop above:
  ```bash
  npm install -g ui-ux-pro-max-cli && uipro init --ai {HOST_AI} --global
  ```
  If the global npm install is not permitted, fall back to
  `npx -y -p ui-ux-pro-max-cli uipro init --ai {HOST_AI}`.
  If it still does not resolve, report the failure and continue with `UIUX_DIR: none`.
- **Continue without it** — set `UIUX_DIR: none`.
- **Abort** — stop.

If `python3` is missing, say so explicitly: the skill's search engine needs Python 3.x, so installing
the npm package alone will not help — continue with `UIUX_DIR: none` or abort.

Never fabricate a `UIUX_DIR`, and never claim the design was rule-sourced when it was not.

### Step 3 — Drive the orchestrator until review or escalation

Spawn `html-orchestrator`. It **never** asks the user. Loop on packets:

```
MODE:       build
SPEC_FILE:  {full path to selected spec.md}
TIMECODE:   {timecode}
SLUG:       {slug}
TITLE:      {title}
OUTPUT_DIR: .spec/prototype/{TIMECODE}_{SLUG}/
KIT_DIR:    {resolved plugin root}
UIUX_DIR:   {resolved path from Step 2.5, or `none`}

Read {KIT_DIR}/skills/generate-html/references/pipeline-flow.md before any station.
Do NOT call AskUserQuestion. Do NOT write prototype files. Return one packet and STOP.
Do NOT pass SPEC_CONTENT — spec-interpreter reads SPEC_FILE.
```

| Packet `type` | This skill |
|---------------|------------|
| `REVIEW_PACKET` | Present `review_packet` verbatim (plus serve + screenshot hints). `AskUserQuestion` — Approve & finalize / Request changes / Abort. |
| `ESCALATION_PACKET` | `AskUserQuestion` with `errors[]` and `options[]`. Apply the user's choice (`resume` with answers, proceed-to-review, or STOP). |

Do not inline the spec file into the spawn prompt.

### Step 4 — Human review loop (THIS skill owns the gate — max 3 cycles)

1. Present the `REVIEW_PACKET` body verbatim, then add:
   - `Serve: npx serve .spec/prototype/{TIMECODE}_{SLUG}` — open `http://localhost:3000`
   - "Check screenshots in `{OUTPUT_DIR}/_verify/` for a quick look."
   - If render check is `SKIPPED`: say so. Do **not** install Playwright from a subagent; if the
     user asks for a browser check, this skill may install Playwright/axe in the consumer repo,
     then re-spawn `MODE: revise` with `CHANGE_REQUEST: re-run Station 6.5 only`.
2. AskUserQuestion — "Review the prototype. How should I proceed?":
   - **Approve & finalize** — proceed to Step 5.
   - **Request changes** — relay free-text description to orchestrator.
   - **Abort** — stop; generated files stay in place. Write `html-kit-result.json` with `outcome: aborted`.
3. On **Request changes** (max 3 cycles):
   ```
   MODE:           revise
   CHANGE_REQUEST: {user's change text}
   PAGES:          {current pages[] list from the last packet}
   TIMECODE / SLUG / TITLE / OUTPUT_DIR / KIT_DIR / UIUX_DIR / SPEC_FILE: (same as build)
   ```
   After 3 change cycles without approval: ask (AskUserQuestion) finalize-as-is or abort.
4. On **ESCALATION_PACKET**: ask with the listed options. If the user chooses proceed-to-review,
   treat the packet body as a REVIEW_PACKET and continue this step. If abort: STOP.

### Step 5 — Finalize (this skill writes README — Station 8)

Do **not** re-spawn the orchestrator to write README. Write `{OUTPUT_DIR}/README.md`:

```markdown
# {TITLE} — HTML Prototype

Generated: {TIMECODE}
Spec: {SPEC_FILE}

## Serve

npx serve .spec/prototype/{TIMECODE}_{SLUG}
Open http://localhost:3000

## Pages ({count})

{for each page: - {id}: {title} — {description}}

## Design System

Direction: {archetype} · primary {hue} · {fonts} · {layout} · signature: {emitted blocks}
Design authority: {ui-ux-pro-max | first-principles}

- `design-brief.md` — the chosen direction and why
- `ux-directives.md` — per-page-type UX rules the screens were built against
- `design-system-ref.md` — token and component/class reference
```

Also write `{OUTPUT_DIR}/page-map.json` mapping each page's `spec_id` (`ui-surface.screens[].id`)
to the HTML page `id`. Skip a page that has no `spec_id` — never use the HTML id as a spec key.

```json
{
  "SCR-001": "sign-in",
  "SCR-004": "building-catalogue"
}
```

Fill identity fields from the last `REVIEW_PACKET` (and `pages[]` on that packet). Then write the
path-only envelope (parent orchestrators read this, not the HTML):

```bash
node {KIT_DIR}/skills/generate-html/scripts/write-kit-result.mjs \
  --out {dirname(SPEC_FILE)}/html-kit-result.json \
  --also {OUTPUT_DIR}/kit-result.json \
  --kit generate-html \
  --outcome approved \
  --spec-path {SPEC_FILE} \
  --prototype-ref {OUTPUT_DIR} \
  --slug {SLUG} \
  --run-dir {OUTPUT_DIR}
```

If the caller passed `RESULT_OUT`, add another `--also {RESULT_OUT}` (or write it in a second
invocation). Then report **paths only**:

```
Prototype generated
Output:  .spec/prototype/{TIMECODE}_{SLUG}/
Result:  {dirname(SPEC_FILE)}/html-kit-result.json
Serve:   npx serve .spec/prototype/{TIMECODE}_{SLUG}
```

---

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| "No spec found in .spec/app/" | Run `/generate-spec` first |
| Pipeline seems stuck | Check for a pending `AskUserQuestion` from **this** skill — answer it |
| Scripts not found | Re-resolve `KIT_DIR` (plugin root, not `.spec/html-generator-kit/` unless that copy exists) |
| Render check SKIPPED | Playwright is optional. This skill may install it if the user asks; the orchestrator must not `npm i` |
| Design authority first-principles | `UIUX_DIR` is `none` — install ui-ux-pro-max (Step 2.5) and re-run if a sourced look is required |
