# HTML Generator Kit

**Entry point**: `/generate-html [spec-slug]` → `skills/generate-html/SKILL.md`

Transforms a validated YAML spec from `.spec/app/` into a **clickable multi-page HTML prototype**
in `.spec/prototype/{TIMECODE}_{SLUG}/`. Fully CDN-free, Alpine.js-interactive, headless-browser verified.

Design direction comes from **[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)**,
an open-source design-intelligence skill, so each prototype gets a product-appropriate, current look
instead of the same indigo/sidebar template.

Human gates (`AskUserQuestion`) are owned by the **skill**. The orchestrator is a subagent and
returns packets (`REVIEW_PACKET`, `ESCALATION_PACKET`). It never writes prototype files.

---

## Install

Upstream: **spec-dev-kit** (`/generate-spec`). Design dependency: **ui-ux-pro-max** (see below).

### Claude Code

```text
/plugin install spec-dev-kit@dev-cursor-plugins
/plugin install html-generator-kit@dev-cursor-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./app-dev-kit/spec-dev-kit
claude --plugin-dir ./app-dev-kit/html-generator-kit
```

### Cursor

From this marketplace repo:

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable the kits under **Customize → Plugins**.

Or add the marketplace in Agent chat:

```text
/add-plugin https://github.com/Ksarelto/dev-cursor-plugins
```

---

## Quick start

1. Install the design dependency (once per machine):
   ```bash
   npm install -g ui-ux-pro-max-cli
   uipro init --ai cursor --global      # or --ai claude
   ```
   `/generate-html` also detects it and offers to install it at Step 2.5 (using `--ai cursor` when
   `.cursor/` is present, otherwise `--ai claude`), so you can skip this.
2. Run `/generate-spec` to produce a spec in `.spec/app/`.
3. Run `/generate-html` (or `/generate-html my-feature-slug`).
4. Approve at the review gate (skill-owned).
5. `npx serve .spec/prototype/{TIMECODE}_{SLUG}` → open `http://localhost:3000`.

---

## Dependency: ui-ux-pro-max

| | |
|---|---|
| What | Open-source design-intelligence skill: 84 styles, 192 palettes, 74 font pairings, 192 product-type rule sets, 98 UX guidelines, 16 motion presets |
| Required? | **Optional but strongly recommended.** Without it the pipeline designs from model priors and prototypes drift back toward generic |
| Needs | Node (for the installer) + **Python 3.x** (the search engine; stdlib only, no network calls) |
| Where it lands | `.claude/skills/ui-ux-pro-max/` · `~/.claude/skills/…` · `.cursor/skills/…` — the kit resolves all of these |
| Used by | `design-strategist` (palette/type/style/UX/motion queries), `design-system-author` (stack notes), `qa-validator` (pro-rules checklist) |
| Contract | [`skills/generate-html/references/ui-ux-pro-max.md`](skills/generate-html/references/ui-ux-pro-max.md) — queries, hex→OKLCH mapping, conflict priority, degradation |

When it is unavailable, the pipeline still completes and the review packet says
`Design authority: first-principles` — it never claims a design was rule-sourced when it wasn't.

---

## What it produces

```
.spec/prototype/{TIMECODE}_{SLUG}/
├── index.html                  # Landing page / app map
├── pages/{screen-id}.html      # One standalone HTML per screen
├── css/
│   ├── tokens.css              # shadcn OKLCH tokens (light + dark)
│   ├── base.css                # Reset + typography
│   └── components.css          # Component classes (no Tailwind runtime)
├── js/
│   ├── app.js                  # Alpine stores: notification, modal, theme
│   ├── data.js                 # Entity mock-data pools
│   └── navigation.js           # Active-page + breadcrumb helpers
├── design-brief.md             # Chosen direction: archetype, palette, fonts, signature layer, motion
├── ux-directives.md            # Per-page-type UX rules the screens were built against
├── design-system-ref.md        # Compact token + class reference
├── component-manifest.md       # Alpine data API reference
├── page-map.json               # spec screen id → HTML page id (feature-dev bind)
├── _verify/report.json + screenshots
└── README.md                   # Serve instructions + page index (written by the skill on approve)
```

---

## Directory layout

```
html-generator-kit/                          ← plugin root (KIT_DIR)
  README.md                                  ← you are here
  agents/
    html-orchestrator.md                     ← opus | returns packets; no AskUserQuestion; no Write
    spec-interpreter.md                      ← haiku | Reads SPEC_FILE; compact summary
    design-strategist.md                     ← sonnet | queries ui-ux-pro-max → design-brief.md + ux-directives.md
    design-system-author.md                  ← sonnet | fills brief into css/ + design-system-ref
    component-library-author.md              ← sonnet | Alpine stores, mock data, component-manifest
    screen-generator.md                      ← sonnet | one page HTML (N parallel instances)
    assembly-wiring.md                       ← sonnet | index.html + navigation.js
    qa-validator.md                          ← haiku | spec coverage + HTML quality + a11y
    modification-router.md                   ← sonnet | decomposes change requests
  skills/
    generate-html/
      SKILL.md                               ← entry point: locate spec, HITL, Station 8 README
      references/
        pipeline-flow.md                     ← station sequence, gates, parallelism
        context-budget.md                    ← paths and slices, not full spec on the hub
        artifact-structure.md                ← output directory layout + file ownership
        design-system-conventions.md         ← OKLCH tokens + component CSS conventions
        alpine-interaction-patterns.md       ← Alpine.js directives + store API
        interaction-conventions.md           ← data hook naming (QA + verification)
        accessibility.md                     ← a11y landmarks + WCAG requirements
        qa-checklist.md                      ← structured pass/fail scoring
        verification-protocol.md             ← headless render check + screenshot protocol
        ui-ux-pro-max.md                     ← design dependency: install, resolve, query, degrade
      templates/
        design-brief.md  modern-signature-css.md
        tokens-css.md  base-css.md  components-css.md
        app-js.md  mock-data-js.md  navigation-js.md
        page-shell.md  index-shell.md
      scripts/
        verify-prototype.mjs                 ← headless-browser render + axe + screenshot
```

`KIT_DIR` is the plugin root (this directory when installed). Scripts are
`{KIT_DIR}/skills/generate-html/scripts/…`. A consumer copy at `.spec/html-generator-kit/` is a
fallback, not the only path.

---

## Pipeline

```
.spec/app/spec-*/spec.md
      │
generate-html skill: resolve KIT_DIR, Step 2.5 ui-ux-pro-max → UIUX_DIR
      │
generate-html skill → spawn html-orchestrator (MODE: build, SPEC_FILE path only)
  Station 0: setup — spec-interpreter (bg, Reads SPEC_FILE) + read pipeline-flow.md
  Station 1: receive spec-interpreter compact summary
  Station 1.5: design-strategist → design-brief.md + ux-directives.md   ↓ GATE: design-brief
  Station 2: design-system-author → css/ (+ signature layer) + design-system-ref
  Station 3: component-library-author → app.js + data.js + manifest
  Station 4: screen-generator × N (PARALLEL) → pages/{id}.html
  Station 5: assembly-wiring → index.html + navigation.js
  Station 6: qa-validator → pass/fail                   ↓ GATE: qa-pass
  Station 6.5: verify-prototype.mjs (render + axe)      ↓ GATE: render-pass
  → RETURN REVIEW_PACKET or ESCALATION_PACKET
      │
generate-html skill: human review gate (max 3 cycles)
  Approve → skill writes README.md + page-map.json (Station 8)
  Changes → orchestrator MODE: revise → modification-router
  Abort   → stop
```
