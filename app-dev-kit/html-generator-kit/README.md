# HTML Generator Kit

**Entry point**: `/generate-html [spec-slug]` → `skills/generate-html/SKILL.md`

Transforms a validated YAML spec from `.spec/app/` into a **clickable multi-page HTML prototype**
in `.spec/prototype/{TIMECODE}_{SLUG}/`. Styling and Alpine.js are both CDN-free (no Tailwind runtime; Alpine.js + its focus plugin are vendored under `js/vendor/`) — only Google Fonts loads from a CDN. Headless-browser verified.

If you provide a theme — brand colours, fonts, a style guide, `tokens.css`, screenshots/mockups, or
a layout — the prototype **must** follow it: every stated value is locked verbatim and QA fails the
build if one is missing. Only what the reference leaves open (or everything, when there is no
reference) comes from **[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)**,
an open-source design-intelligence skill, so each prototype gets a product-appropriate, current look
instead of the same indigo/sidebar template.

Where a design reference is picked up (`scripts/collect-design-inputs.mjs`, highest priority first):

1. Paths or inline instructions given when invoking `/generate-html`
2. `.spec/design/**` — any file (markdown, CSS, JSON tokens, images); always binding
3. The spec itself, `.spec/context/*`, and `.spec/processed/*/` (where spec-dev-kit archives
   context) — only files with concrete values (hex/rgb/oklch, CSS variables, `font-family:`) or an
   explicit theme/brand/layout statement; images always count

What was followed, and any deviation (e.g. a font not on Google Fonts), is listed in
`design-brief.md` → `## Binding reference` and in the review packet.

Human gates (`AskUserQuestion`) are owned by the **skill**. The orchestrator is a subagent and
returns packets (`REVIEW_PACKET`, `ESCALATION_PACKET`). It never writes prototype files.

---

## Install

Upstream: **spec-dev-kit** (`/generate-spec`). Design dependency: **ui-ux-pro-max** (see below).

### Claude Code

```text
/plugin install spec-dev-kit@dev-AI-plugins
/plugin install html-generator-kit@dev-AI-plugins
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
/add-plugin https://github.com/Ksarelto/dev-AI-plugins
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
3. Optional: put your theme / brand / mockups in `.spec/design/`.
4. Run `/generate-html` (or `/generate-html my-feature-slug`).
5. Approve at the review gate (skill-owned).
6. `npx serve .spec/prototype/{TIMECODE}_{SLUG}` → open `http://localhost:3000`.

---

## Dependency: ui-ux-pro-max

| | |
|---|---|
| What | Open-source design-intelligence skill: 84 styles, 192 palettes, 74 font pairings, 192 product-type rule sets, 98 UX guidelines, 16 motion presets |
| Required? | **Optional but strongly recommended.** Without it the pipeline designs from model priors and prototypes drift back toward generic |
| Needs | Node (for the installer) + **Python 3.x** (the search engine; stdlib only, no network calls) |
| Where it lands | `.claude/skills/ui-ux-pro-max/` · `~/.claude/skills/…` · `.cursor/skills/…` — the kit resolves all of these |
| Used by | `design-strategist` (palette/type/style/UX/motion queries), `design-system-author` (stack notes), `scripts/qa-static.mjs` (pro-rules checklist) |
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
│   ├── store.js                # Shared entity store + entityList/entityDetail/entityForm factories
│   ├── data.js                 # Entity mock-data pools
│   ├── navigation.js           # Active-page + breadcrumb helpers
│   └── vendor/                 # Vendored Alpine.js + focus plugin (pinned version, no CDN)
├── design-inputs.json          # Provided design sources found (binding: true|false)
├── design-values.json          # Concrete design decisions (palette/fonts/density/motion/signature)
├── design-brief.md             # Binding reference (if any) + chosen direction for open slots
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
    design-strategist.md                     ← sonnet | binding design-inputs.json, else ui-ux-pro-max → design-brief.md + ux-directives.md
    design-system-author.md                  ← sonnet | fills brief into css/ + design-system-ref
    component-library-author.md              ← sonnet | Alpine stores, mock data, component-manifest
    screen-generator.md                      ← sonnet | one page HTML (N parallel instances)
    assembly-wiring.md                       ← sonnet | index.html + navigation.js
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
        spec-model.mjs                        ← deterministic spec → model parser (Station 0, full build)
        delta-pages.mjs                        ← append-mode delta, shares lib/spec-model.mjs with the above
        qa-static.mjs                          ← deterministic QA gate (Station 6) — replaced qa-validator
        collect-design-inputs.mjs (Step 2.6) and the rest
```

`KIT_DIR` is the plugin root (this directory when installed). Scripts are
`{KIT_DIR}/skills/generate-html/scripts/…`. A consumer copy at `.spec/html-generator-kit/` is a
fallback, not the only path.

---

## Pipeline

Current specs live under `.spec/spec/`. Runs that still keep `spec.md` under `.spec/app/spec-{tc}_{slug}/` remain valid.

```
.spec/spec/spec-*/spec.md
      │
generate-html skill: resolve KIT_DIR, Step 2.5 ui-ux-pro-max → UIUX_DIR,
                     Step 2.6 collect-design-inputs.mjs → design-inputs.json
      │
generate-html skill → spawn html-orchestrator (MODE: build, SPEC_FILE path only)
  Station 0: setup — scripts/spec-model.mjs (Reads SPEC_FILE → spec-model.json) + read pipeline-flow.md
  Station 1: receive spec-model.json
  Station 1.5: design-strategist → design-brief.md + ux-directives.md   ↓ GATE: design-brief
  Station 2: design-system-author → css/ (+ signature layer) + design-system-ref
  Station 3: component-library-author → app.js + data.js + manifest
  Station 4: screen-generator × N (PARALLEL) → pages/{id}.html
  Station 5: assembly-wiring → index.html + navigation.js
  Station 6: scripts/qa-static.mjs (deterministic) → pass/fail  ↓ GATE: qa-pass
  Station 6.5: verify-prototype.mjs (render + axe)      ↓ GATE: render-pass
  → RETURN REVIEW_PACKET or ESCALATION_PACKET
      │
generate-html skill: human review gate (max 3 cycles)
  Approve → skill writes README.md + page-map.json (Station 8)
  Changes → orchestrator MODE: revise → modification-router
  Abort   → stop
```
