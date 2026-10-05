#!/usr/bin/env node
// Station 2: fill the CSS templates from the ```json slots block in design-brief.md.
// Writes css/tokens.css, css/base.css, css/components.css, design-system-ref.md.
// Usage: node apply-design-brief.mjs <OUTPUT_DIR> [--kit <KIT_DIR>]
// Prints a JSON report. Exit 0 ok, 1 brief slots invalid or a slot left unfilled, 2 usage error.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const out = args.find((a) => !a.startsWith('--'))
const kitIdx = args.indexOf('--kit')
const kit = kitIdx >= 0 ? args[kitIdx + 1] : join(dirname(fileURLToPath(import.meta.url)), '../../..')
if (!out || !existsSync(join(out, 'design-brief.md'))) {
  console.error('usage: apply-design-brief.mjs <OUTPUT_DIR> [--kit <KIT_DIR>] — OUTPUT_DIR must contain design-brief.md')
  process.exit(2)
}
const tpl = (name) => readFileSync(join(kit, 'skills/generate-html/templates', name), 'utf8')
const fences = (md, lang) => [...md.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)\\n```', 'g'))].map((m) => m[1])
const fail = (errors) => {
  console.log(JSON.stringify({ status: 'failed', errors }))
  process.exit(1)
}

const brief = readFileSync(join(out, 'design-brief.md'), 'utf8')
const slotsBlock = brief.split(/^## Slots\b/m)[1]
const raw = slotsBlock && fences(slotsBlock, 'json')[0]
if (!raw) fail(['design-brief.md has no "## Slots" section with a ```json block'])
let s
try {
  s = JSON.parse(raw)
} catch (e) {
  fail([`design-brief.md slots JSON: ${e.message}`])
}

const DENSITY = {
  compact: ['0.4rem', '0.7rem', '0.55rem', '0.9rem', '1rem', '1.5rem', '2rem'],
  comfortable: ['0.6rem', '1rem', '0.9rem', '1.15rem', '1.35rem', '2.5rem', '3rem'],
}
const SIGNATURE_CLASSES = {
  bento: '- bento: .bento .bento-wide .bento-full .bento-tall',
  glass: '- glass: .surface-glass  (chrome only: .topnav / .page-header-sticky — never content cards)',
  gradient: '- gradient: .text-gradient .surface-mesh  (one per page)',
  'edge-accent': '- edge-accent: .card-accent (+ automatic rail on .nav-item-active)',
  'soft-depth': '- soft-depth: (no new classes — restyles .card/.modal/.stat-card)',
  editorial: '- editorial: .lede (+ restyled .page-title)',
  'underline-nav': '- underline-nav: .tab-row > .tab / .tab-active',
}
const errors = []
const [pl, pc, ph] = s.primary ?? []
for (const [k, v] of Object.entries({ neutral_hue: s.neutral_hue, neutral_chroma: s.neutral_chroma, 'primary[0..2]': ph, accent_h: s.accent_h, font_body: s.font_body, radius: s.radius, shadow_alpha: s.shadow_alpha })) {
  if (v === undefined || v === '') errors.push(`slots.${k} is required`)
}
const density = DENSITY[s.density]
if (!density) errors.push('slots.density must be compact or comfortable')
if (!['sidebar', 'top-nav'].includes(s.layout)) errors.push('slots.layout must be sidebar or top-nav')
const signature = s.signature ?? []
if (signature.length > 3) errors.push(`slots.signature names ${signature.length} blocks — max 3`)
const m = s.motion ?? {}
if (!m.fast || !m.base || !m.slow || !m.lift) errors.push('slots.motion needs fast, base, slow, lift')
if (errors.length) fail(errors)

const sig = tpl('modern-signature-css.md')
const sections = sig.split(/^## /m)
const motionBlock = fences(sections.find((x) => x.startsWith('ALWAYS — motion tokens')), 'css')[0]
const alwaysBlocks = sections.filter((x) => x.startsWith('ALWAYS —') && !x.startsWith('ALWAYS — motion tokens')).flatMap((x) => fences(x, 'css'))
const switched = Object.fromEntries(sections.find((x) => x.startsWith('SWITCHED')).split(/^### /m).slice(1).map((x) => [x.match(/^`([^`]+)`/)?.[1], fences(x, 'css')[0]]))
const emitted = signature.filter((name) => switched[name])
const skipped = signature.filter((name) => !switched[name])

const fill = (css, map) => css.replace(/⟨([A-Z_]+)⟩/g, (all, key) => (map[key] === undefined ? all : String(map[key])))
const slotMap = {
  NEUTRAL_HUE: s.neutral_hue, NEUTRAL_CHROMA: s.neutral_chroma,
  PRIMARY_L: pl, PRIMARY_C: pc, PRIMARY_H: ph, ACCENT_H: s.accent_h,
  FONT_BODY: s.font_body, FONT_DISPLAY: s.font_display || s.font_body,
  RADIUS: s.radius, SHADOW_ALPHA: s.shadow_alpha,
  DENSITY_CONTROL_PY: density[0], DENSITY_CONTROL_PX: density[1], DENSITY_CELL_PY: density[2], DENSITY_CELL_PX: density[3],
  DENSITY_CARD_PAD: density[4], DENSITY_MAIN_PAD_Y: density[5], DENSITY_MAIN_PAD_X: density[6],
  DUR_FAST: m.fast, DUR_BASE: m.base, DUR_SLOW: m.slow, LIFT_Y: m.lift,
}

let tokens = fill(fences(tpl('tokens-css.md'), 'css')[0], slotMap)
tokens = tokens.replace(/^(:root \{[\s\S]*?)\n\}/m, (all, body) => `${body}\n\n${fill(motionBlock, slotMap)}\n}`)
if (s.primary_foreground === 'dark') tokens = tokens.replace(/(:root \{[\s\S]*?--primary-foreground: )[^;]+/, `$1oklch(0.18 0.02 ${ph})`)

const locked = s.locked_tokens ?? {}
const lockedMissing = []
const setToken = (css, scope, name, value) => {
  const re = new RegExp(`(${scope.replace('.', '\\.')} \\{[\\s\\S]*?\\n\\s*${name}: )[^;]+`)
  return re.test(css) ? css.replace(re, `$1${value}`) : null
}
for (const [name, value] of Object.entries(locked)) {
  const next = setToken(tokens, ':root', name, value)
  if (next === null) lockedMissing.push(name)
  else tokens = next
}
if (locked['--primary']) {
  const p = locked['--primary']
  const derived = [
    [':root', '--primary-hover', `oklch(from ${p} calc(l - 0.06) c h)`],
    [':root', '--ring', p],
    ['.dark', '--primary', `oklch(from ${p} calc(l + 0.13) c h)`],
    ['.dark', '--primary-hover', `oklch(from ${p} calc(l + 0.19) c h)`],
    ['.dark', '--ring', `oklch(from ${p} calc(l + 0.13) c h)`],
  ]
  for (const [scope, name, value] of derived) if (!locked[name] || scope === '.dark') tokens = setToken(tokens, scope, name, value) ?? tokens
}

const fontImport = s.font_import ? `@import url('${s.font_import}');` : ''
const base = fences(tpl('base-css.md'), 'css')[0].replace(/^⟨FONT_IMPORT⟩\n?/m, fontImport ? `${fontImport}\n` : '')
const components = [fences(tpl('components-css.md'), 'css')[0], ...alwaysBlocks, ...emitted.map((name) => `/* signature: ${name} */\n${switched[name]}`)].join('\n\n')

const leftovers = [['tokens.css', tokens], ['base.css', base], ['components.css', components]]
  .flatMap(([file, css]) => [...new Set(css.match(/⟨[A-Z_]+⟩/g) ?? [])].map((slot) => `${file}: ${slot} not filled`))
if (leftovers.length) fail(leftovers)

const provided = s.provided_structure ?? []
const comp = Object.entries(s.composition ?? {}).map(([type, text]) => `  - ${type}: ${text}`)
const header = [
  '# Design System Reference (CDN-free — no Tailwind)',
  '',
  ...(provided.length ? ['## Provided reference (binding — outranks everything below)', ...provided.map((line) => `- ${line}`), ''] : []),
  '## Design direction (from design-brief.md)',
  `- Archetype: ${s.archetype ?? ''} · Mood: ${s.intent ?? ''}`,
  `- Palette: primary ${locked['--primary'] ?? `oklch(${pl} ${pc} ${ph})`} · accent hue ${s.accent_h} · neutral hue ${s.neutral_hue}`,
  `- Type: body ${s.font_body} · display ${s.font_display || s.font_body}`,
  `- Shape/density: radius ${s.radius} · ${s.density}`,
  `- Layout archetype: ${s.layout}`,
  `- Signature layer emitted: ${emitted.join(', ') || 'none'}`,
  `- Motion: ${m.feel ?? ''} · fast ${m.fast} base ${m.base} slow ${m.slow} · applies to: ${m.places ?? ''}`,
  ...(comp.length ? ['- Composition per page type:', ...comp] : []),
  `- Voice: ${s.voice ?? ''} · Emphasize: ${s.emphasis ?? ''}`,
  '',
].join('\n')
const refBody = fences(tpl('design-system-ref.md'), 'markdown')[0]
  .replace('⟨SIGNATURE_CLASSES⟩', emitted.map((name) => SIGNATURE_CLASSES[name]).join('\n') || '- none')

mkdirSync(join(out, 'css'), { recursive: true })
mkdirSync(join(out, 'js'), { recursive: true })
mkdirSync(join(out, 'pages'), { recursive: true })
writeFileSync(join(out, 'css/tokens.css'), `${tokens}\n`)
writeFileSync(join(out, 'css/base.css'), `${base}\n`)
writeFileSync(join(out, 'css/components.css'), `${components}\n`)
writeFileSync(join(out, 'design-system-ref.md'), `${header}\n${refBody}\n`)
console.log(JSON.stringify({
  status: lockedMissing.length ? 'locked-missing' : 'design-system-contract-ready',
  locked_applied: Object.keys(locked).length - lockedMissing.length,
  locked_missing: lockedMissing,
  signature_emitted: emitted,
  signature_skipped: skipped,
  files: ['css/tokens.css', 'css/base.css', 'css/components.css', 'design-system-ref.md'],
}))
process.exit(lockedMissing.length ? 1 : 0)
