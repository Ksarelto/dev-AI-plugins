#!/usr/bin/env node
// Fills the CSS design-system templates from a compact design-values.json, instead of having an
// LLM (design-system-author) retype several hundred lines of fixed CSS + a ~290-line signature
// layer into Write every single build. design-system-author still makes every DESIGN DECISION
// (reading the brief, picking concrete OKLCH numbers / fonts / density / signature blocks / motion
// timings) — this script only does the mechanical substitution + validation that used to be a
// hand-run "Verification" checklist at the end of that agent's instructions.
//
// Usage:
//   node build-design-system.mjs --values <design-values.json> --out <OUTPUT_DIR> [--brief <design-brief.md>]
//
// design-values.json shape (see agents/design-system-author.md for the authoring guidance):
//   {
//     "palette": { "neutralHue", "neutralChroma", "primaryL", "primaryC", "primaryH", "accentH" },
//     "radius": "0.625rem",
//     "shadowAlpha": 0.08,
//     "fonts": { "body": "'Inter'", "display": "'Space Grotesk'", "import": "@import url(...);" | "" },
//     "density": { "controlPy", "controlPx", "cellPy", "cellPx", "cardPad", "mainPadY", "mainPadX" },
//     "motion": { "durFast", "durBase", "durSlow", "liftY" },          // all 4 required
//     "signatureBlocks": ["bento", "glass"],                           // 0–3 of the 7 names
//     "lockedTokens": { "--primary": "#0A3D62", ... },                 // optional
//     "layout": "sidebar" | "top-nav",
//     "designDirection": { archetype, mood, paletteNote, typeNote, densityLabel, signatureNote,
//                           motionFeel, composition: [...], voice, emphasize },
//     "providedReference": { layout, nav, header, composition, components }   // optional
//   }
//
// --brief is accepted but not read for substitution (design-values.json already holds every
// decision) — it's only there so a caller can pass it through for provenance/logging if useful.
//
// Hard failures (exit 1): a leftover ⟨...⟩ marker in written CSS; a lockedTokens entry that did not
// get applied; a chosen signature block name that doesn't exist under templates/runtime/css/signature/;
// more than 3 chosen signature blocks; a missing required motion token; a missing design value for
// any slot the templates require.
//
// On success, prints a one-line summary plus the agent-relayable report as JSON on stdout:
//   { status, locked_applied, locked_missing, signature_emitted, signature_skipped, files }

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const RUNTIME_CSS_DIR = join(here, '..', 'templates', 'runtime', 'css')
const SIGNATURE_DIR = join(RUNTIME_CSS_DIR, 'signature')

const SIGNATURE_CLASS_DOCS = {
  bento: '.bento .bento-wide .bento-full .bento-tall',
  glass: '.surface-glass  (chrome only: .topnav / .page-header-sticky — never content cards)',
  gradient: '.text-gradient .surface-mesh  (one per page)',
  'edge-accent': '.card-accent (+ automatic rail on .nav-item-active)',
  'soft-depth': '(no new classes — restyles .card/.modal/.stat-card)',
  editorial: '.lede (+ restyled .page-title)',
  'underline-nav': '.tab-row > .tab / .tab-active',
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return ''
  return next
}

class BuildError extends Error {}

function slotMap(values) {
  const p = values.palette || {}
  const d = values.density || {}
  const m = values.motion || {}
  const f = values.fonts || {}
  return {
    '⟨NEUTRAL_HUE⟩': p.neutralHue,
    '⟨NEUTRAL_CHROMA⟩': p.neutralChroma,
    '⟨PRIMARY_L⟩': p.primaryL,
    '⟨PRIMARY_C⟩': p.primaryC,
    '⟨PRIMARY_H⟩': p.primaryH,
    '⟨ACCENT_H⟩': p.accentH,
    '⟨RADIUS⟩': values.radius,
    '⟨SHADOW_ALPHA⟩': values.shadowAlpha,
    '⟨FONT_BODY⟩': f.body,
    '⟨FONT_DISPLAY⟩': f.display,
    '⟨DENSITY_CONTROL_PY⟩': d.controlPy,
    '⟨DENSITY_CONTROL_PX⟩': d.controlPx,
    '⟨DENSITY_CELL_PY⟩': d.cellPy,
    '⟨DENSITY_CELL_PX⟩': d.cellPx,
    '⟨DENSITY_CARD_PAD⟩': d.cardPad,
    '⟨DENSITY_MAIN_PAD_Y⟩': d.mainPadY,
    '⟨DENSITY_MAIN_PAD_X⟩': d.mainPadX,
    '⟨DUR_FAST⟩': m.durFast,
    '⟨DUR_BASE⟩': m.durBase,
    '⟨DUR_SLOW⟩': m.durSlow,
    '⟨LIFT_Y⟩': m.liftY,
  }
}

const REQUIRED_MOTION = ['durFast', 'durBase', 'durSlow', 'liftY']

function fillSlots(source, map, fileLabel) {
  let out = source
  for (const [slot, value] of Object.entries(map)) {
    if (!out.includes(slot)) continue
    if (value === undefined || value === null || value === '') {
      throw new BuildError(`missing design value for ${slot} (required by ${fileLabel})`)
    }
    out = out.split(slot).join(String(value))
  }
  return out
}

function applyFontImport(baseCss, fontImport) {
  const lines = baseCss.split('\n')
  const idx = lines.findIndex((l) => l.includes('⟨FONT_IMPORT⟩'))
  if (idx === -1) return baseCss
  if (fontImport) {
    lines[idx] = lines[idx].replace('⟨FONT_IMPORT⟩', fontImport)
  } else {
    lines.splice(idx, 1)
  }
  return lines.join('\n')
}

function applyLockedTokens(tokensCss, lockedTokens) {
  if (!lockedTokens || Object.keys(lockedTokens).length === 0) {
    return { css: tokensCss, applied: 0, missing: [] }
  }
  const darkMarker = '\n.dark {'
  const darkIdx = tokensCss.indexOf(darkMarker)
  const rootPart = darkIdx === -1 ? tokensCss : tokensCss.slice(0, darkIdx)
  const restPart = darkIdx === -1 ? '' : tokensCss.slice(darkIdx)

  let applied = 0
  const missing = []
  let newRoot = rootPart
  for (const [name, value] of Object.entries(lockedTokens)) {
    const propName = name.startsWith('--') ? name : `--${name}`
    const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|\\n)(\\s*)${escaped}:\\s*[^;]+;`, 'g')
    let hit = false
    newRoot = newRoot.replace(re, (m, pre, indent) => {
      hit = true
      return `${pre}${indent}${propName}: ${value};`
    })
    if (hit) applied += 1
    else missing.push(propName)
  }
  return { css: newRoot + restPart, applied, missing }
}

function findLeftoverSlots(css) {
  const matches = css.match(/⟨[^⟩]*⟩/g)
  return matches ? [...new Set(matches)] : []
}

export function buildDesignSystem(values, outDir) {
  const errors = []

  // ── validate signature blocks up front ──
  const chosen = Array.isArray(values.signatureBlocks) ? values.signatureBlocks : []
  if (chosen.length > 3) {
    throw new BuildError(`too many signature blocks chosen (${chosen.length}) — max 3: ${chosen.join(', ')}`)
  }
  const availableBlocks = new Set(
    readdirSync(SIGNATURE_DIR).filter((f) => f.endsWith('.css')).map((f) => f.replace(/\.css$/, '')),
  )
  for (const name of chosen) {
    if (!availableBlocks.has(name)) {
      throw new BuildError(`chosen signature block "${name}" does not exist under templates/runtime/css/signature/ (available: ${[...availableBlocks].join(', ')})`)
    }
  }

  // ── validate required motion tokens ──
  const motion = values.motion || {}
  for (const key of REQUIRED_MOTION) {
    if (motion[key] === undefined || motion[key] === null || motion[key] === '') {
      throw new BuildError(`missing required motion token: motion.${key}`)
    }
  }

  const map = slotMap(values)

  // ── tokens.css ──
  let tokensCss = readFileSync(join(RUNTIME_CSS_DIR, 'tokens.css'), 'utf8')
  tokensCss = fillSlots(tokensCss, map, 'tokens.css')
  const lockedResult = applyLockedTokens(tokensCss, values.lockedTokens)
  tokensCss = lockedResult.css
  if (lockedResult.missing.length > 0) {
    throw new BuildError(`lockedTokens entr${lockedResult.missing.length === 1 ? 'y' : 'ies'} not applied (no matching token in tokens.css): ${lockedResult.missing.join(', ')}`)
  }

  // ── base.css ──
  let baseCss = readFileSync(join(RUNTIME_CSS_DIR, 'base.css'), 'utf8')
  baseCss = applyFontImport(baseCss, (values.fonts || {}).import)
  baseCss = fillSlots(baseCss, map, 'base.css')

  // ── components.css (structural — no slots — + modern-always + chosen signature blocks) ──
  let componentsCss = readFileSync(join(RUNTIME_CSS_DIR, 'components.css'), 'utf8')
  componentsCss = fillSlots(componentsCss, map, 'components.css')
  const modernAlways = readFileSync(join(RUNTIME_CSS_DIR, 'modern-always.css'), 'utf8')
  componentsCss = componentsCss.replace(/\n*$/, '\n') + '\n' + modernAlways
  const signatureEmitted = []
  for (const name of chosen) {
    const block = readFileSync(join(SIGNATURE_DIR, `${name}.css`), 'utf8')
    componentsCss = componentsCss.replace(/\n*$/, '\n') + `\n/* ── signature: ${name} ── */\n` + block
    signatureEmitted.push(name)
  }

  // ── leftover-slot check (hard failure) ──
  for (const [label, css] of [['tokens.css', tokensCss], ['base.css', baseCss], ['components.css', componentsCss]]) {
    const leftover = findLeftoverSlots(css)
    if (leftover.length > 0) {
      throw new BuildError(`leftover slot marker(s) in ${label}: ${leftover.join(', ')}`)
    }
  }

  // ── write CSS ──
  const cssDir = join(outDir, 'css')
  mkdirSync(cssDir, { recursive: true })
  writeFileSync(join(cssDir, 'tokens.css'), tokensCss)
  writeFileSync(join(cssDir, 'base.css'), baseCss)
  writeFileSync(join(cssDir, 'components.css'), componentsCss)

  // ── design-system-ref.md ──
  const ref = buildDesignSystemRef(values, signatureEmitted)
  writeFileSync(join(outDir, 'design-system-ref.md'), ref)

  const report = {
    status: 'design-system-contract-ready',
    locked_applied: lockedResult.applied,
    locked_missing: [],
    signature_emitted: signatureEmitted,
    signature_skipped: [],
    files: ['css/tokens.css', 'css/base.css', 'css/components.css', 'design-system-ref.md'],
  }
  return { report, errors }
}

function buildDesignSystemRef(values, signatureEmitted) {
  const dd = values.designDirection || {}
  const pr = values.providedReference
  const layout = values.layout === 'top-nav' ? 'top-nav' : 'sidebar'
  const composition = Array.isArray(dd.composition) ? dd.composition : []

  const providedBlock = pr
    ? `## Provided reference (binding — outranks everything below)
- Layout: ${pr.layout || layout + ' (provided)'}
- Nav: ${pr.nav || '—'}
- Header / brand bar: ${pr.header || '—'}
- Composition: ${pr.composition || '—'}
- Components: ${pr.components || '—'}

`
    : ''

  const signatureLines = signatureEmitted.length
    ? signatureEmitted.map((name) => `- ${name}: ${SIGNATURE_CLASS_DOCS[name] || ''}`).join('\n')
    : '- none selected'

  return `# Design System Reference (CDN-free — no Tailwind, no CDN Alpine)

${providedBlock}## Design direction (from design-brief.md)
- Archetype: ${dd.archetype || '—'} · Mood: ${dd.mood || '—'}
- Palette: ${dd.paletteNote || '—'}
- Type: ${dd.typeNote || '—'}
- Shape/density: radius ${values.radius || '—'} · ${dd.densityLabel || '—'}
- Layout archetype: ${layout}
- Signature layer emitted: ${signatureEmitted.length ? signatureEmitted.join(', ') : 'none'} ${dd.signatureNote ? `— ${dd.signatureNote}` : ''}
- Motion: ${dd.motionFeel || '—'} · fast ${values.motion.durFast} base ${values.motion.durBase} slow ${values.motion.durSlow}
- Composition per page type: ${composition.length ? composition.join(' · ') : '—'}
- Voice: ${dd.voice || '—'} · Emphasize: ${dd.emphasize || '—'}

## CSS load order (page: ../css/… · index.html: css/…)
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/components.css">

## JS load order (every page) — app/data/navigation BEFORE Alpine core
<script src="../js/app.js" defer></script>
<script src="../js/data.js" defer></script>
<script src="../js/navigation.js" defer></script>
<script src="../js/vendor/alpine-focus.min.js" defer></script>
<script src="../js/vendor/alpine.min.js" defer></script>

## Tokens — reference as var(--token), NEVER hsl(var(--token))
--background --foreground --card --card-foreground --popover --overlay
--primary --primary-foreground --primary-hover --accent --accent-foreground
--muted --muted-foreground --secondary --secondary-hover
--success --warning --destructive (+ -foreground, -subtle)
--border --input --ring · --radius(-sm/-lg) · --shadow-sm/-md/-lg · --text-xs…-3xl
--font-sans --font-display · --control-py/px --cell-py/px --card-pad --main-pad-y/x
--dur-fast/-base/-slow --ease-out --ease-spring --lift

## Shell (mandatory structure — matches the brief's layout archetype)
SIDEBAR:
<div class="app"><aside class="sidebar">…</aside><main class="main"><div class="content">…</div></main></div>
TOP-NAV:
<div class="app app-topnav"><header class="topnav">…</header><main class="main"><div class="content">…</div></main></div>
- Sidebar parts: .sidebar-header .sidebar-brand .sidebar-nav (nav lives in .sidebar or .topnav)
- Header: .page-header .page-title .page-subtitle .page-actions .breadcrumb

## Typography (utility classes)
- Page title: class="page-title" · Section: class="text-xl font-semibold"
- Body: default · Caption/muted: class="text-sm text-muted"

## Component classes
- .card .card-header .card-content .card-footer .card-link .card-grid
- .stat-card .stat-value .stat-label
- .badge .badge-default|-primary|-success|-warning|-destructive
- .btn-primary|-secondary|-ghost|-destructive (+ .btn-sm .btn-icon)
- .table .table-header .table-row .table-cell .table-cell-actions
- .form-field .form-label .form-input .form-textarea .form-error .filter-bar
- .empty-state .empty-state-icon .empty-state-title .empty-state-desc
- .skeleton .alert .alert-destructive .alert-success
- .modal-overlay .modal .modal-title .modal-actions
- .dev-panel .dev-panel-label .toast-container

## Modern layer (always available)
- Sticky header: .page-header-sticky (wrap .page-header so it stays put on long pages)
- Filters: .chip-row > .chip / .chip-active  ← prefer over a row of bare selects
- Numbers: .num (tabular figures) · .delta .delta-up|-down|-flat
- Meters/mini-charts: .meter > .meter-fill · .sparkbars > i (inline style="height:N%")
- Identity/keys: .avatar .avatar-group · .kbd · .divider
- Motion: .hover-lift (cards/stat-cards only) · .reveal .reveal-2 .reveal-3 .reveal-4
  (first screenful only, ≤6 per page). Reduced-motion is handled in CSS — never gate it in markup.

## Signature classes (ONLY those from the emitted blocks — see Design direction above)
${signatureLines}

## Utility layer (safe names — NO Tailwind, no slashes/colons)
.flex .flex-col .flex-1 .items-center .items-start .justify-between .justify-end .flex-wrap .grid .hidden .block
.w-full .w-sm .w-75 .w-90 · .gap-1/-2/-3/-4
.mt-1/-2/-4 .mb-1/-2/-3/-4/-6/-8 .ml-2 .mr-1/-2 .mx-auto
.text-xs/-sm/-lg/-xl/-2xl .font-medium .font-semibold .uppercase .tracking-wide .link
.text-muted .text-primary .text-destructive .text-success .bg-card .border .rounded

## Status → badge class mapping
| Status | Class |
|--------|-------|
| NEW, DEFAULT, DRAFT | badge-default |
| ACTIVE, APPROVED, SUCCESS, COMPLETED | badge-success |
| PENDING, IN_PROGRESS, PROCESSING | badge-warning |
| DECLINED, FAILED, REJECTED, DELETED | badge-destructive |

## Navigation active state
navigation.js adds \`nav-item-active\` + \`aria-current="page"\` to the link whose
\`data-nav-id\` matches the current page. Use:
<a href="./{id}.html" class="nav-item" data-nav-id="{id}">ICON Title</a>
`
}

function main() {
  const args = process.argv.slice(2)
  const valuesPath = flag(args, 'values')
  const out = flag(args, 'out')
  if (!valuesPath || !out) {
    console.error('usage: build-design-system.mjs --values <design-values.json> --out <OUTPUT_DIR> [--brief <design-brief.md>]')
    process.exit(2)
  }
  if (!existsSync(valuesPath)) {
    console.error(`FATAL: --values not found: ${valuesPath}`)
    process.exit(2)
  }
  if (!existsSync(out)) {
    console.error(`FATAL: --out not found: ${out}`)
    process.exit(2)
  }

  let values
  try {
    values = JSON.parse(readFileSync(valuesPath, 'utf8'))
  } catch (e) {
    console.error(`FATAL: could not parse --values ${valuesPath}: ${e.message}`)
    process.exit(2)
  }

  try {
    const { report } = buildDesignSystem(values, out)
    console.log(`OK: ${report.files.length} file(s) written, ${report.locked_applied} locked token(s) applied, signature blocks emitted: ${report.signature_emitted.length ? report.signature_emitted.join(', ') : 'none'}`)
    console.log(JSON.stringify(report))
  } catch (e) {
    if (e instanceof BuildError) {
      console.error(`FATAL: ${e.message}`)
      process.exit(1)
    }
    throw e
  }
}

const isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] } catch { return false }
})()
if (isMain) main()
