#!/usr/bin/env node
// Mechanical, deterministic QA gate for a generated HTML prototype — replaces the qa-validator
// Haiku agent (Phase 7). Every row qa-checklist.md attributed to "qa-validator" is a grep/file-
// existence check, not a judgment call — an LLM doing that mechanically was (1) inconsistent run to
// run, (2) satisfied some of its own documented checks with regexes that don't prove what they
// claim (e.g. the old `x-show=".*error"` check matches almost any attribute containing "error"),
// and (3) never actually implemented two of its own CRITICAL rows (index.html links every page;
// navigation.js's page list is complete) despite qa-checklist.md listing them under its name.
//
// Usage:
//   node qa-static.mjs --dir <OUTPUT_DIR> --model <spec-model.json> [--uiux-dir <UIUX_DIR>]
//
// --model is REQUIRED (unlike verify-prototype.mjs's optional --model): it is the only source of
// the expected page list now — there is no separate page_ids[] input.
// --uiux-dir is optional; a literal path or absent/"none". When present and
// {UIUX_DIR}/references/pro-rules.md exists, its statically-checkable misses are reported as
// warnings prefixed "pro-rules:" (same treatment qa-validator.md documented). Missing file → skip
// silently.
//
// Read-only — no file modifications to the prototype. Writes its OWN report to
// {OUTPUT_DIR}/_qa/report.json (same family as verify-prototype.mjs's {OUTPUT_DIR}/_verify/report.json).
//
// Exit code: 0 = no critical issues, 1 = critical issues present, 2 = usage/setup error.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

function flag(args, name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return ''
  return next
}

const args = process.argv.slice(2)
const dir = flag(args, 'dir')
const modelPath = flag(args, 'model')
const uiuxDir = flag(args, 'uiux-dir')

if (!dir || !modelPath) {
  console.error('usage: qa-static.mjs --dir <OUTPUT_DIR> --model <spec-model.json> [--uiux-dir <UIUX_DIR>]')
  process.exit(2)
}
if (!existsSync(dir)) {
  console.error(`FATAL: --dir not found: ${dir}`)
  process.exit(2)
}
if (!existsSync(modelPath)) {
  console.error(`FATAL: --model not found: ${modelPath}`)
  process.exit(2)
}

let model
try {
  model = JSON.parse(readFileSync(modelPath, 'utf8'))
} catch (e) {
  console.error(`FATAL: could not parse --model ${modelPath}: ${e.message}`)
  process.exit(2)
}
if (!Array.isArray(model.pages)) {
  console.error(`FATAL: --model ${modelPath} has no pages[] array`)
  process.exit(2)
}

const critical = []
const warnings = []
const pushC = (row, msg) => critical.push(`${row}: ${msg}`)
const pushW = (row, msg) => warnings.push(`${row}: ${msg}`)

function read(p) {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

// ── C1-C4: coverage ──────────────────────────────────────────────────────────────────────────
const pages = model.pages
const pageHtml = {} // id -> raw html (only for pages that exist)

for (const page of pages) {
  const p = join(dir, 'pages', `${page.id}.html`)
  if (!existsSync(p)) {
    pushC('C1', `MISSING PAGE: pages/${page.id}.html`)
    continue
  }
  pageHtml[page.id] = read(p)
}

const indexPath = join(dir, 'index.html')
const indexHtml = read(indexPath)
if (indexHtml === null) {
  pushC('C1', 'MISSING: index.html')
} else {
  for (const page of pages) {
    const re = new RegExp(`href=["']pages/${page.id}\\.html["']`)
    if (!re.test(indexHtml)) pushC('C2', `index.html does not link to pages/${page.id}.html`)
  }
}

const navPath = join(dir, 'js', 'navigation.js')
const navJs = read(navPath)
if (navJs === null) {
  pushC('C1', 'MISSING: js/navigation.js')
} else {
  for (const page of pages) {
    // wire-nav.mjs bakes PAGES as a JSON-ish literal array of { id, title, domain } objects —
    // check for the literal id string value, not a placeholder/substring match.
    const re = new RegExp(`"id"\\s*:\\s*"${page.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
    if (!re.test(navJs)) pushC('C3', `navigation.js does not list page id "${page.id}"`)
  }
}

for (const rel of ['css/tokens.css', 'css/base.css', 'css/components.css']) {
  if (!existsSync(join(dir, rel))) pushC('C4', `MISSING: ${rel}`)
}
// Component-ready gate's own files — double-checked cheaply here too (not re-validated in depth).
for (const rel of ['js/store.js', 'component-manifest.md']) {
  if (!existsSync(join(dir, rel))) pushC('C4', `MISSING: ${rel}`)
}

// ── Per-page HTML structure (S1-S7) + file separation (F1/F2) ──────────────────────────────────
// The old qa-validator checks here were trivially satisfiable (e.g. `x-show=".*error"` matches any
// attribute value containing the substring "error", including an unrelated class name). Anchor to
// the actual x-show condition shape screen-generator.md documents for each state.
const STATE_PATTERNS = {
  loading: /x-show\s*=\s*"loading"/,
  error: /x-show\s*=\s*"!loading\s*&&\s*error"/,
  empty: /x-show\s*=\s*"!loading\s*&&\s*!error\s*&&\s*items\.length\s*===\s*0"/,
  success: /x-show\s*=\s*"!loading\s*&&\s*!error\s*&&\s*items\.length\s*>\s*0"/,
}

for (const page of pages) {
  const html = pageHtml[page.id]
  if (html === undefined) continue
  const rel = `pages/${page.id}.html`

  if (!STATE_PATTERNS.loading.test(html)) pushC('S1', `${rel}: missing loading state (x-show="loading")`)
  if (!STATE_PATTERNS.error.test(html)) pushC('S2', `${rel}: missing error state (x-show="!loading && error")`)
  if (!STATE_PATTERNS.empty.test(html)) pushC('S3', `${rel}: missing empty state (x-show="!loading && !error && items.length === 0")`)
  if (!/class="dev-panel"/.test(html)) pushC('S5', `${rel}: missing dev-panel`)

  // S6 / F1: no inline <style> in body.
  if (/<style[\s>]/i.test(html)) pushC('S6', `${rel}: contains inline <style>`)

  // S7 / F2: no inline <script> without src= whose content is non-trivial (>20 chars), matching
  // qa-validator.md's documented threshold.
  const scriptBlocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  for (const [, attrs, body] of scriptBlocks) {
    if (/\bsrc=/.test(attrs)) continue
    if (body.trim().length > 20) { pushC('S7', `${rel}: contains inline <script>`); break }
  }

  if (!/<title>/i.test(html)) pushW('S10', `${rel}: missing <title> tag`)
  if (!/name="viewport"/.test(html)) pushW('S11', `${rel}: missing <meta name="viewport">`)
}

// F1/F2 also sweep css/*.css and js/*.js for leftover ⟨SLOT⟩ markers (same sweep qa-validator.md's
// "No leftover CSS slots" interaction-convention check did).
const cssDir = join(dir, 'css')
if (existsSync(cssDir)) {
  for (const f of readdirSync(cssDir)) {
    if (!f.endsWith('.css')) continue
    const css = read(join(cssDir, f)) || ''
    if (/⟨/.test(css)) pushW('I-slot', `css/${f}: leftover ⟨SLOT⟩ marker — design not fully applied`)
  }
}

// ── Interaction convention checks (WARNING — Station 6.5 is the real test) ─────────────────────
for (const page of pages) {
  const html = pageHtml[page.id]
  if (html === undefined) continue
  const rel = `pages/${page.id}.html`

  if (/\$store\.modal\.open/.test(html) && !/data-modal-open/.test(html)) {
    pushW('I1', `${rel}: modal trigger without data-modal-open (untestable)`)
  }
  if (/class="modal\b/.test(html) && !/data-modal-close/.test(html)) {
    pushW('I2', `${rel}: modal without data-modal-close (untestable)`)
  }
  const forms = [...html.matchAll(/<form\b[^>]*>/gi)]
  if (forms.length && !(/\brequired\b/.test(html) && /type="submit"/.test(html))) {
    pushW('I3', `${rel}: form without required/submit (validation untestable)`)
  }
}

// ── Accessibility structural checks (A1/A2/A4/A5) ───────────────────────────────────────────────
for (const page of pages) {
  const html = pageHtml[page.id]
  if (html === undefined) continue
  const rel = `pages/${page.id}.html`
  if (!/<main[\s>]/i.test(html)) pushC('A1', `${rel}: missing <main> landmark`)
  if (!/<nav[\s>]/i.test(html)) pushC('A2', `${rel}: missing <nav> landmark`)

  // A4: data tables have role="grid" or role="table" (warning).
  const hasTable = /class="table\b/.test(html)
  if (hasTable && !/role="(grid|table)"/.test(html)) pushW('A4', `${rel}: table without role="grid"/"table"`)

  // A5 (current wording, post-Phase 5): column headers use role="columnheader", never scope="col"
  // on a non-<th> element — this kit's table is a div-based grid by design.
  if (hasTable) {
    if (/role="columnheader"[^>]*scope="col"|scope="col"[^>]*role="columnheader"/.test(html)) {
      pushW('A5', `${rel}: table header cell carries both role="columnheader" and scope="col" (scope invalid on non-<th>)`)
    } else if (/<div\b[^>]*scope="col"/.test(html)) {
      pushW('A5', `${rel}: div-based table header cell uses invalid scope="col" (use role="columnheader")`)
    } else if (!/role="columnheader"/.test(html)) {
      pushW('A5', `${rel}: table present but no header cell carries role="columnheader"`)
    }
  }
}

if (indexHtml !== null) {
  if (!/<main[\s>]/i.test(indexHtml)) pushC('A1', 'index.html: missing <main> landmark')
  if (!/<nav[\s>]/i.test(indexHtml)) pushC('A2', 'index.html: missing <nav> landmark')
}

// ── Design-currency / modern-layer checks (M2-M11) ──────────────────────────────────────────────
const tokensCss = read(join(dir, 'css', 'tokens.css')) || ''
const componentsCss = read(join(dir, 'css', 'components.css')) || ''

if (!/--dur-base/.test(tokensCss)) pushC('M2', 'tokens.css: missing motion tokens (--dur-base) — modern layer not applied')
if (!/prefers-reduced-motion/.test(componentsCss)) pushC('M3', 'components.css: missing prefers-reduced-motion guard')
if (!/:focus-visible/.test(componentsCss)) pushC('M4', 'components.css: missing :focus-visible ring')

const SIGNATURE_CLASSES = ['bento', 'surface-glass', 'text-gradient', 'card-accent', 'lede', 'tab-row']
const signatureDefCount = SIGNATURE_CLASSES.reduce((n, cls) => {
  const re = new RegExp(`\\.${cls}\\b`, 'g')
  return n + ((componentsCss.match(re) || []).length > 0 ? 1 : 0)
}, 0)
if (signatureDefCount > 3) pushW('M5', `components.css: ${signatureDefCount} signature blocks emitted — brief allows max 3`)

// M6: stray !important outside the reduced-motion guard. Strip the @media (prefers-reduced-motion:
// reduce) { ... } block(s) first, then look for any remaining !important.
function stripReducedMotionBlock(css) {
  const marker = '@media (prefers-reduced-motion: reduce)'
  let out = ''
  let i = 0
  while (true) {
    const idx = css.indexOf(marker, i)
    if (idx === -1) { out += css.slice(i); break }
    out += css.slice(i, idx)
    // find matching closing brace for this block (balance braces starting after the first `{`)
    const braceStart = css.indexOf('{', idx)
    if (braceStart === -1) { out += css.slice(idx); break }
    let depth = 1
    let j = braceStart + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    i = j
  }
  return out
}
const outsideGuard = stripReducedMotionBlock(componentsCss)
if (/!important/.test(outsideGuard)) pushW('M6', 'components.css: !important outside the reduced-motion guard')

const allPagesHtml = Object.values(pageHtml).join('\n')
if (!/\.num\b|\.chip\b|\.hover-lift\b|\.reveal\b|\.bento\b/.test(allPagesHtml)) {
  pushW('M7', 'pages use no modern-layer classes — prototype may read as a generic template')
}

for (const page of pages) {
  const html = pageHtml[page.id]
  if (html === undefined) continue
  const rel = `pages/${page.id}.html`
  if (/class="table\b/.test(html) && /badge|stat-value|table-cell/.test(html)) {
    const hasNumericContext = /\$[\d,.]|\b\d{2,}\b/.test(html)
    if (hasNumericContext && !/\bnum\b/.test(html)) {
      pushW('M8', `${rel}: numeric table without .num (columns won't align)`)
    }
  }
  const forEachMatches = [...html.matchAll(/<template\s+x-for[^>]*>([\s\S]*?)<\/template>/gi)]
  for (const [, body] of forEachMatches) {
    if (/\breveal\b/.test(body)) { pushW('M10', `${rel}: .reveal inside x-for — animation replays on every filter keystroke`); break }
  }
  for (const cls of SIGNATURE_CLASSES) {
    const usedRe = new RegExp(`class="[^"]*\\b${cls}\\b`)
    if (usedRe.test(html)) {
      const definedRe = new RegExp(`\\.${cls}\\b`)
      if (!definedRe.test(componentsCss)) {
        pushW('M9', `${rel}: uses .${cls} but its signature block was not emitted — renders as nothing`)
      }
    }
  }
  if (/chart\.js|\bd3\b|apexcharts|echarts/i.test(html)) {
    pushW('M11', `${rel}: references a chart library — kit has none; use .meter/.sparkbars`)
  }
}

// ── Provided-reference adherence (CRITICAL — skip when the brief has no Binding reference) ──────
const briefPath = join(dir, 'design-brief.md')
const briefMd = read(briefPath)
if (briefMd && /##\s*Binding reference\b/.test(briefMd)) {
  const section = briefMd.match(/##\s*Binding reference\b([\s\S]*?)(?:\n##\s|$)/)
  const rows = section ? (section[1].match(/^\|.*\|\s*$/gm) || []) : []
  const deviationsSection = briefMd.match(/##\s*Deviations\b([\s\S]*?)(?:\n##\s|$)/)
  if (deviationsSection) {
    for (const line of deviationsSection[1].split('\n')) {
      const t = line.trim()
      if (t.startsWith('-') || t.startsWith('*')) warnings.push(`reference deviation: ${t.replace(/^[-*]\s*/, '')}`)
    }
  }
  const deviatedText = deviationsSection ? deviationsSection[1] : ''

  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 4) continue
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue
    if (/^attribute$/i.test(cells[0])) continue
    const attribute = cells[0]
    const applied = cells[3].replace(/`/g, '')
    if (deviatedText.includes(attribute)) continue // disclosed deviation — exempt

    const tokenMatch = applied.match(/--([a-zA-Z0-9-]+)\s*:\s*(.+)/)
    if (tokenMatch) {
      const token = `--${tokenMatch[1]}`
      const value = tokenMatch[2].trim().replace(/;$/, '')
      const re = new RegExp(`${token}\\s*:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
      if (!re.test(tokensCss)) pushC('R-locked-token', `tokens.css: provided ${token} ${value} not applied (source ${cells[2]})`)
      continue
    }
    if (/^font/i.test(attribute)) {
      const fontName = applied.replace(/['"]/g, '').trim()
      if (fontName && !new RegExp(fontName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(tokensCss)) {
        pushC('R-locked-font', `tokens.css: provided font ${fontName} not applied`)
      }
      continue
    }
    if (/^layout/i.test(attribute)) {
      const layout = applied.toLowerCase()
      if (/top-nav/.test(layout)) {
        for (const page of pages) {
          const html = pageHtml[page.id]
          if (html !== undefined && !/app-topnav/.test(html)) pushC('R-locked-layout', `pages/${page.id}.html: provided layout top-nav not followed`)
        }
      } else if (/sidebar/.test(layout)) {
        for (const page of pages) {
          const html = pageHtml[page.id]
          if (html !== undefined && !/class="sidebar"/.test(html)) pushC('R-locked-layout', `pages/${page.id}.html: provided layout sidebar not followed`)
        }
      }
    }
  }
}

// ── Content-quality warnings (Q1/Q2) ─────────────────────────────────────────────────────────────
for (const page of pages) {
  const html = pageHtml[page.id]
  if (html === undefined) continue
  const rel = `pages/${page.id}.html`
  if (/Lorem ipsum/i.test(html)) pushW('Q1', `${rel}: leftover "Lorem ipsum" placeholder text`)
  if (/\bTODO\b|\bPLACEHOLDER\b/.test(html)) pushW('Q2', `${rel}: leftover "TODO"/"PLACEHOLDER" text`)
}

// ── pro-rules pass (WARNING only — skip entirely when UIUX_DIR is absent/none) ───────────────────
if (uiuxDir && uiuxDir !== 'none') {
  const proRulesPath = join(uiuxDir, 'references', 'pro-rules.md')
  if (existsSync(proRulesPath)) {
    const proRules = read(proRulesPath) || ''
    // Only statically-checkable rows: a bullet/row naming a concrete, greppable requirement this
    // kit already has a token/class for. Anything else is advisory prose — skip it rather than
    // inventing a checklist item (same restraint ui-ux-pro-max.md documents).
    const checks = [
      { needle: /aria-label/i, name: 'icon buttons need aria-label', pattern: /aria-label=/ },
      { needle: /focus.?visible|focus\s+ring/i, name: 'visible focus ring', pattern: /:focus-visible/ },
      { needle: /reduced.?motion/i, name: 'reduced-motion support', pattern: /prefers-reduced-motion/ },
    ]
    for (const check of checks) {
      if (check.needle.test(proRules)) {
        const target = componentsCss + allPagesHtml
        if (!check.pattern.test(target)) pushW('pro-rules', `pro-rules: ${check.name} — not found in generated output`)
      }
    }
  }
  // Missing file → skip silently (documented behavior).
}

// ── Output ────────────────────────────────────────────────────────────────────────────────────
const qaDir = join(dir, '_qa')
mkdirSync(qaDir, { recursive: true })
const passed = critical.length === 0
const report = {
  dir,
  pages_checked: pages.length,
  critical,
  warnings,
  passed,
}
writeFileSync(join(qaDir, 'report.json'), JSON.stringify(report, null, 2))

console.log(`\n── QA static check (qa-static.mjs) ──`)
console.log(`dir:     ${dir}`)
console.log(`pages:   ${pages.length} checked against ${relative(process.cwd(), modelPath)}`)
if (warnings.length) {
  console.log(`\nWARNINGS (${warnings.length}):`)
  warnings.forEach((w) => console.log(`  • ${w}`))
}
if (critical.length) {
  console.log(`\nCRITICAL (${critical.length}):`)
  critical.forEach((c) => console.log(`  ✗ ${c}`))
}
console.log(`\nRESULT: ${passed ? 'PASS ✅' : 'FAIL ❌'}   (report: ${relative(process.cwd(), join(qaDir, 'report.json'))})`)
process.exit(passed ? 0 : 1)
