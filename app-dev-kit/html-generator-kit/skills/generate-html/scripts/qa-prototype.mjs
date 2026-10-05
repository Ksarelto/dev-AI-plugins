#!/usr/bin/env node
// Station 6 static QA (references/qa-checklist.md — every row that is a file or pattern check).
// Usage: node qa-prototype.mjs <OUTPUT_DIR> --pages id1,id2,...
// Writes <OUTPUT_DIR>/_verify/qa.json and prints {passed, critical_issues, warnings}.
// Exit 0 passed, 1 critical issues, 2 usage error.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const out = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--pages') + 1])
const pageIds = String(args[args.indexOf('--pages') + 1] ?? '').split(',').filter(Boolean)
if (!out || !existsSync(out) || args.indexOf('--pages') < 0) {
  console.error('usage: qa-prototype.mjs <OUTPUT_DIR> --pages id1,id2,...')
  process.exit(2)
}

const critical = []
const warnings = []
const read = (rel) => (existsSync(join(out, rel)) ? readFileSync(join(out, rel), 'utf8') : null)

for (const id of pageIds) if (!existsSync(join(out, `pages/${id}.html`))) critical.push(`MISSING PAGE: pages/${id}.html`)
for (const rel of ['index.html', 'js/navigation.js', 'css/tokens.css', 'css/base.css', 'css/components.css']) {
  if (!existsSync(join(out, rel))) critical.push(`MISSING: ${rel}`)
}

const index = read('index.html') ?? ''
const nav = read('js/navigation.js') ?? ''
for (const id of pageIds) {
  if (index && !index.includes(`href="pages/${id}.html"`)) critical.push(`index.html: no link to pages/${id}.html`)
  if (nav && !new RegExp(`id:\\s*['"]${id}['"]`).test(nav)) critical.push(`navigation.js: PAGES missing ${id}`)
}

const tokens = read('css/tokens.css') ?? ''
const base = read('css/base.css') ?? ''
const components = read('css/components.css') ?? ''
for (const [file, css] of [['tokens.css', tokens], ['base.css', base], ['components.css', components]]) {
  if (css.includes('⟨')) critical.push(`${file}: leftover ⟨SLOT⟩ marker — design not fully applied`)
}
if (/font-size:\s*62\.5%/.test(base)) critical.push('base.css: root font-size override (62.5%)')
for (const token of ['--dur-fast', '--dur-base', '--dur-slow', '--lift', '--ease-out']) {
  if (tokens && !tokens.includes(`${token}:`)) critical.push(`tokens.css: missing ${token} — modern layer not applied`)
}
if (components && !components.includes('prefers-reduced-motion')) critical.push('components.css: missing prefers-reduced-motion guard')
if (components && !components.includes(':focus-visible')) critical.push('components.css: missing :focus-visible ring')
const reducedMotion = components.match(/@media \(prefers-reduced-motion[\s\S]*?\n\}/)?.[0] ?? ''
if ((components.replace(reducedMotion, '').match(/!important/g) ?? []).length) warnings.push('components.css: !important outside the reduced-motion guard')

const SIGNATURE = { bento: 'bento', 'surface-glass': 'glass', 'text-gradient': 'gradient', 'card-accent': 'edge-accent', lede: 'editorial', 'tab-row': 'underline-nav' }
const defined = Object.keys(SIGNATURE).filter((cls) => new RegExp(`\\.${cls}\\b`).test(components))
if (defined.length > 3) warnings.push(`components.css: ${defined.length} signature blocks emitted — brief allows max 3`)

const brief = read('design-brief.md') ?? ''
const binding = brief.split(/^## Binding reference/m)[1]?.split(/^## /m)[0]
const ref = read('design-system-ref.md') ?? ''
const pageFiles = existsSync(join(out, 'pages')) ? readdirSync(join(out, 'pages')).filter((f) => f.endsWith('.html')) : []
const pages = pageFiles.map((f) => ({ id: f.replace(/\.html$/, ''), html: readFileSync(join(out, 'pages', f), 'utf8') }))
if (binding) {
  const deviations = binding.match(/Deviations:([^\n]*(?:\n\s+[^\n-][^\n]*)*)/)?.[1] ?? ''
  for (const [, token, value] of binding.matchAll(/`(--[a-z0-9-]+):\s*([^`]+)`/gi)) {
    if (deviations.includes(token)) continue
    const re = new RegExp(`${token}:\\s*${value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;`, 'i')
    if (!re.test(tokens)) critical.push(`tokens.css: provided ${token} ${value.trim()} not applied`)
  }
  const layout = binding.match(/\|\s*Layout\s*\|[^\n]*\b(top-nav|sidebar)\b/i)?.[1]?.toLowerCase()
  for (const p of pages) {
    if (layout === 'top-nav' && !p.html.includes('app-topnav')) critical.push(`${p.id}.html: provided layout top-nav not followed`)
    if (layout === 'sidebar' && !p.html.includes('class="sidebar"')) critical.push(`${p.id}.html: provided layout sidebar not followed`)
  }
  if (!ref.startsWith('# Design System Reference') || !ref.includes('## Provided reference')) critical.push('design-system-ref.md: provided reference block missing — screens never saw it')
  for (const line of deviations.split('\n').map((l) => l.trim()).filter((l) => l && l !== 'none' && l !== '`none`')) warnings.push(`reference deviation: ${line}`)
}

let modernUsed = false
for (const { id, html } of pages) {
  const body = html.split(/<body/i)[1] ?? ''
  if (!/x-show="loading"/.test(html)) critical.push(`${id}.html: missing loading state`)
  if (!/x-show="[^"]*error/.test(html)) critical.push(`${id}.html: missing error state`)
  if (!/items\.length === 0/.test(html)) critical.push(`${id}.html: missing empty state`)
  if (!/class="dev-panel"/.test(html)) critical.push(`${id}.html: missing dev-panel`)
  if (/<style[\s>]/i.test(body)) critical.push(`${id}.html: contains inline <style>`)
  for (const [, attrs, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=/.test(attrs) && content.trim().length > 20) critical.push(`${id}.html: contains inline <script>`)
  }
  if (!/<main\b/.test(html)) critical.push(`${id}.html: missing <main> landmark`)
  if (!/<nav\b/.test(html)) critical.push(`${id}.html: missing <nav> landmark`)
  if (/\$store\.modal\.open/.test(html) && !/data-modal-open/.test(html)) warnings.push(`${id}.html: modal trigger without data-modal-open (untestable)`)
  if (/class="[^"]*\bmodal\b/.test(html) && !/data-modal-close/.test(html)) warnings.push(`${id}.html: modal without data-modal-close (untestable)`)
  if (/<form\b/.test(html) && !(/\brequired\b/.test(html) && /type="submit"/.test(html))) warnings.push(`${id}.html: form without required/submit (validation untestable)`)
  if (/class="[^"]*\btable\b/.test(html) && !/class="[^"]*\bnum\b/.test(html)) warnings.push(`${id}.html: numeric table without .num (columns won't align)`)
  if (/<table\b/.test(html) && !/role="(grid|table)"/.test(html)) warnings.push(`${id}.html: table without role="grid"/"table"`)
  if (/<template[^>]*x-for[\s\S]*?\breveal\b[\s\S]*?<\/template>/.test(html)) warnings.push(`${id}.html: .reveal inside x-for — animation replays on every filter keystroke`)
  for (const [cls, block] of Object.entries(SIGNATURE)) {
    if (new RegExp(`class="[^"]*\\b${cls}\\b`).test(html) && !defined.includes(cls)) warnings.push(`${id}.html: uses .${cls} but the ${block} block was not emitted — renders as nothing`)
  }
  if (/chart\.js|\bd3(\.min)?\.js|apexcharts|echarts/i.test(html)) warnings.push(`${id}.html: references a chart library — kit has none; use .meter/.sparkbars`)
  if (!/<title>/.test(html)) warnings.push(`${id}.html: missing <title> tag`)
  if (!/name="viewport"/.test(html)) warnings.push(`${id}.html: missing <meta name="viewport">`)
  if (/Lorem ipsum|\bTODO\b|PLACEHOLDER/.test(body)) warnings.push(`${id}.html: placeholder text`)
  if (/class="[^"]*\b(num|chip|hover-lift|reveal|bento)\b/.test(html)) modernUsed = true
}
if (pages.length && !modernUsed) warnings.push('pages use no modern-layer classes — prototype may read as a generic template')
if (pages.length && !pages.some((p) => /aria-label/.test(p.html))) warnings.push('no aria-label in any page')

const result = { passed: critical.length === 0, critical_issues: critical, warnings }
mkdirSync(join(out, '_verify'), { recursive: true })
writeFileSync(join(out, '_verify/qa.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result))
process.exit(result.passed ? 0 : 1)
