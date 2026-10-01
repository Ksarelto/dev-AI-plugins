---
name: generate-html
description: Transforms a validated spec from .spec/app/current.json into a clickable multi-page HTML prototype at .spec/prototype/{TIMECODE}_{SLUG}/. When a prototype already exists, copies that directory and adds only the new screens so the previous pages stay. A provided theme, brand colours, fonts, style guide, mockup, or layout (in .spec/design/, the spec's context files, or paths named in the request) is binding and reproduced exactly; only when none is provided is the design direction sourced from the ui-ux-pro-max design-intelligence skill (installed on demand). Output is split (one HTML per screen, dedicated css/*.css and js/*.js), fully CDN-free for styling (self-contained shadcn OKLCH tokens + component classes; no Tailwind runtime), verified with a headless-browser render check, and passes a mandatory human review gate before finalizing.
argument-hint: "[spec-slug or spec.md path]"
allowed-tools: [Read, Glob, Grep, Write, Bash, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

# Generate HTML Prototype

**Entry point for**: html-generator-kit pipeline
**Pipeline driver**: `html-orchestrator` agent (see `../../agents/html-orchestrator.md`)
**Spec source**: `.spec/app/current.json` → `spec_path` (a file under `.spec/spec/`)

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
| `scripts/collect-design-inputs.mjs` | this skill (Step 2.6, Bash) | finds provided theme/brand/layout sources → `design-inputs.json` |
| `scripts/spec-model.mjs` | orchestrator (Station 0, Bash) | deterministic SPEC_FILE → `spec-model.json` for a full build; no model call, no truncation |
| `scripts/delta-pages.mjs` | this skill (Step 2, Bash) | same parser, filtered to new/modified screens for `MODE: append`; shares `scripts/lib/spec-model.mjs` with the above |
| `scripts/verify-prototype.mjs` | orchestrator (Station 6.5, Bash) | renders prototype + runs axe + screenshots |
| `scripts/write-kit-result.mjs` | this skill (finalize or abort) | `{spec dir}/html-kit-result.json` path-only envelope for frontend-orchestrator-kit / app-orchestrator-kit |

---

## Prerequisites

- An approved spec must be named by `.spec/app/current.json` (`spec_path`, under `.spec/spec/`). Run `/generate-spec` first if none exists.
- **Optional design reference** — to make the prototype follow an existing theme, drop brand
  guides, `tokens.css`, colour/font notes, or screenshots/mockups into `.spec/design/`, or name
  their paths when invoking. Theme statements in the spec's context files are picked up too.
  Anything found is binding (Step 2.6).
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

Else read `.spec/app/current.json` and use `spec_path` when that file exists. A fresh session
starts here. Do not choose a spec by newest timecode when the pointer exists.

If `current.json` is missing, Glob `.spec/spec/spec-*/spec.md` and then `.spec/app/spec-*/spec.md`:

- Filter by argument slug if provided (substring match against folder name).
- If multiple match or no argument: sort by the timecode segment in the folder name **descending** and take the most recent.
- If nothing found: `"No spec found. Run /generate-spec first."` → STOP (no envelope).

Read the selected `spec.md` **only to extract identity** (do not pass the full file to the orchestrator or back to `orchestrate-frontend` / `orchestrate-app`):
- `metadata.slug` (or derive from folder name: part after `_`)
- `metadata.title` (or fallback: slug with hyphens → spaces)
- `status` from the front matter. If it is not `approved`, STOP: `"Spec is not approved (status: {status}). Finish /generate-spec first."` Write the aborted envelope — `SPEC_FILE` is known.

Keep `SPEC_FILE` as the path. On a full build, `scripts/spec-model.mjs` reads the file itself (a
deterministic parser, not a model call). Append mode uses `scripts/delta-pages.mjs` instead.

On any STOP after `SPEC_FILE` is known (Step 2 decline, Step 2.5 Abort, review Abort, escalation
abort), write `{dirname(SPEC_FILE)}/html-kit-result.json` with `outcome: aborted` before returning
so parent orchestrators do not scrape chat.

### Step 2 — Generate timecode and confirm

```bash
date -u +%Y%m%d-%H%M%S
```

Output directory: `.spec/prototype/{TIMECODE}_{SLUG}/`

Read `prototype_ref` from `.spec/app/current.json` (empty when this is the first prototype).

- Empty `prototype_ref`: `BUILD_MODE=build`. The orchestrator runs design and every screen. Do not run the clone scripts.
- `prototype_ref` set: copy the previous prototype, then add new screens and regenerate changed ones. Run:

```bash
node {KIT_DIR}/skills/generate-html/scripts/clone-prototype.mjs \
  --from "{prototype_ref}" \
  --to ".spec/prototype/{TIMECODE}_{SLUG}"
node {KIT_DIR}/skills/generate-html/scripts/delta-pages.mjs \
  --spec "{SPEC_FILE}" \
  --page-map ".spec/prototype/{TIMECODE}_{SLUG}/page-map.json" \
  --out ".spec/prototype/{TIMECODE}_{SLUG}/delta-pages.json"
```

If `{dirname(SPEC_FILE)}/artifacts/changes.json` exists, add `--changes` with that path.
Set `BUILD_MODE=append` and `DELTA_PAGES` to that `delta-pages.json`.
Screen-generators receive only the delta screens, including `description`, `domain`, `entity`,
`entity_fields`, `entity_statuses`, and `api_contract`. Assembly receives `assembly_pages`
(`{ id, title, domain, description }`), not raw page-map pairs. If `entities_changed` is
non-empty, the orchestrator runs `component-library-author` in update mode before those screens.
`delta-pages.json` also lists `removed[]` (page-map entries whose spec screen no longer exists) —
nothing acts on it yet; it's there for a future cleanup step, not a signal to delete files today.

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

### Step 2.6 — Resolve the provided design reference (binding when present)

A theme, brand, style guide, mockup, or layout the user provided is **mandatory**. The pipeline
only designs its own look when none is found. Discovery is a script, not a judgment call, so it
does not depend on an agent noticing a context file:

1. Collect **explicit** references from this invocation:
   - file or directory paths the user named (brand guide, `tokens.css`, screenshots, a design
     folder), and any `DESIGN_REFS` paths from a calling orchestrator;
   - inline design instructions in the request (hex codes, font names, "use our brand colours",
     "top navigation like our portal") — write them verbatim to `{OUTPUT_DIR}/design-request.md`
     and treat that file as an explicit path;
   - a URL (e.g. Figma) — subagents cannot open it. If this session has a tool that exports it
     (Figma MCP `get_screenshot` / `get_variable_defs`), save the export under
     `{OUTPUT_DIR}/design-request/` and use that path; otherwise say so and ask for an export.
2. Run:

```bash
node {KIT_DIR}/skills/generate-html/scripts/collect-design-inputs.mjs \
  --spec "{SPEC_FILE}" \
  --out "{OUTPUT_DIR}/design-inputs.json" \
  [--extra "{explicit path}" ...]
```

It scans, in priority order: explicit paths → `.spec/design/**` (any file, always binding) → the
spec itself → `.spec/context/*` → `.spec/processed/*/` (spec-dev-kit archives context there after
approval, so a brand note given to `/generate-spec` is still found). Spec/context files count only
when they contain a concrete value (hex / rgb / oklch, CSS variables, `font-family:`) or an explicit
theme/brand/layout statement; images in those folders always count.

3. `BINDING:` output → tell the user in one line which sources will be followed, then continue (no
   question). `NONE:` → continue; the design is auto-picked as before.
4. **Append mode** with `BINDING:` — grep the copied `{OUTPUT_DIR}/design-brief.md` for
   `## Binding reference`. If it is missing, or does not list every source path the script printed,
   AskUserQuestion: "A design reference was provided that the previous prototype doesn't follow.
   Apply it?" — **Apply it (re-runs design and regenerates every page)** → set `BUILD_MODE=build`;
   **Keep the current look** → stay in append mode.

### Step 3 — Drive the orchestrator until review or escalation

Spawn `html-orchestrator`. It **never** asks the user. Loop on packets:

```
MODE:       {BUILD_MODE}     # build | append
SPEC_FILE:  {full path to selected spec.md}
TIMECODE:   {timecode}
SLUG:       {slug}
TITLE:      {title}
OUTPUT_DIR: .spec/prototype/{TIMECODE}_{SLUG}/
DELTA_PAGES: {path or omit on a full build}
KIT_DIR:    {resolved plugin root}
UIUX_DIR:   {resolved path from Step 2.5, or `none`}
DESIGN_INPUTS: {OUTPUT_DIR}/design-inputs.json   # binding: true → provided reference is mandatory

Read {KIT_DIR}/skills/generate-html/references/pipeline-flow.md before any station.
Do NOT call AskUserQuestion. Do NOT write prototype files. Return one packet and STOP.
Do NOT pass SPEC_CONTENT — scripts/spec-model.mjs reads SPEC_FILE.
```

| Packet `type` | This skill |
|---------------|------------|
| `REVIEW_PACKET` | Present `review_packet` verbatim (plus serve + screenshot hints). `AskUserQuestion` — Approve & finalize / Request changes / Abort. |
| `ESCALATION_PACKET` | `AskUserQuestion` with `errors[]` and `options[]`. Apply the user's choice (`resume` with answers, proceed-to-review, or STOP). An `options` list containing `install-browser` is the render-check-skipped case — see Step 4 point 4. |

Do not inline the spec file into the spawn prompt.

### Step 4 — Human review loop (THIS skill owns the gate — max 3 cycles)

1. Present the `REVIEW_PACKET` body verbatim, then add:
   - `Serve: npx serve .spec/prototype/{TIMECODE}_{SLUG}` — open `http://localhost:3000`
   - "Check screenshots in `{OUTPUT_DIR}/_verify/` for a quick look."
   - If the packet is headed `⚠ UNVERIFIED`: say plainly that no browser ever opened these pages —
     render and functionality bugs (unstyled pages, broken modals/forms, dead links) would not have
     been caught.
2. AskUserQuestion — "Review the prototype. How should I proceed?":
   - **Approve & finalize** — proceed to Step 5.
   - **Request changes** — relay free-text description to orchestrator.
   - **Abort** — stop; generated files stay in place. Write `html-kit-result.json` with `outcome: aborted`.
3. On **Request changes** (max 3 cycles):
   ```
   MODE:           revise
   CHANGE_REQUEST: {user's change text}
   PAGES:          {current pages[] list from the last packet}
   TIMECODE / SLUG / TITLE / OUTPUT_DIR / KIT_DIR / UIUX_DIR / SPEC_FILE / DESIGN_INPUTS: (same as build)
   ```
   After 3 change cycles without approval: ask (AskUserQuestion) finalize-as-is or abort.
4. On **ESCALATION_PACKET** with `options` containing `install-browser` (the render-check-skipped
   case — no Playwright/browser binary was available): AskUserQuestion with the packet's `errors[]`
   and these three options:
   - **install-browser** — this skill (never the orchestrator) may run:
     ```bash
     npx --yes playwright install chromium
     ```
     (and `npm i -D playwright-core axe-core` in the consumer repo if the kit's own dependency
     resolution didn't find them — see `references/verification-protocol.md`). Then re-spawn
     `MODE: revise` with `CHANGE_REQUEST: re-run Station 6.5 only` and return to this step.
   - **proceed-unverified** — treat the packet body as a `REVIEW_PACKET` headed `⚠ UNVERIFIED` and
     continue at point 1 above.
   - **abort** — STOP; generated files stay in place.
5. On any other **ESCALATION_PACKET**: ask with the listed options. If the user chooses
   proceed-to-review, treat the packet body as a REVIEW_PACKET and continue this step. If abort: STOP.

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
Design authority: {provided reference + ui-ux-pro-max | provided reference + first-principles | ui-ux-pro-max | first-principles}
Provided reference: {source paths from design-inputs.json | none} · deviations: {none | list}

- `design-brief.md` — the chosen direction and why
- `ux-directives.md` — per-page-type UX rules the screens were built against
- `design-system-ref.md` — token and component/class reference
```

Also write `{OUTPUT_DIR}/page-map.json` mapping each page's `spec_id` (`ui-surface.screens[].id`)
to the HTML page `id`. Skip a page that has no `spec_id` — never use the HTML id as a spec key.
In append mode, start from the copied `page-map.json` and add the new ids. Do not drop old keys.

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
invocation). Then point the shared pointer at this prototype:

```bash
node {KIT_DIR}/skills/generate-html/scripts/record-prototype.mjs \
  --prototype-ref ".spec/prototype/{TIMECODE}_{SLUG}"
```

Then report **paths only**:

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
| "No spec found" | Run `/generate-spec` first. The pointer is `.spec/app/current.json` |
| Pipeline seems stuck | Check for a pending `AskUserQuestion` from **this** skill — answer it |
| Scripts not found | Re-resolve `KIT_DIR` (plugin root, not `.spec/html-generator-kit/` unless that copy exists) |
| Render check SKIPPED | Not silently passed — it's an `ESCALATION_PACKET` (`install-browser` / `proceed-unverified` / `abort`). This skill may run `npx playwright install chromium` if the user picks `install-browser`; the orchestrator must never install anything |
| Design authority first-principles | `UIUX_DIR` is `none` — install ui-ux-pro-max (Step 2.5) and re-run if a sourced look is required |
| Prototype ignored my theme / brand | Check `{OUTPUT_DIR}/design-inputs.json`. `binding: false` means no source was found — put the brand guide, tokens, or screenshots in `.spec/design/` (always picked up) or name the path when invoking. `binding: true` but not followed → see `## Binding reference` → Deviations in `design-brief.md` |
