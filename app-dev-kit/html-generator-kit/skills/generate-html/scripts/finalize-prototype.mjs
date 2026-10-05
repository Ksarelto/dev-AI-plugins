#!/usr/bin/env node
// Station 8 (after approval): write README.md and page-map.json for the prototype.
// page-map.json keeps every key already there (append mode) and adds spec_id → page id.
// Usage: node finalize-prototype.mjs <OUTPUT_DIR> --pages <spec-summary.json | delta-pages.json> --spec <SPEC_FILE> --title <t> --timecode <tc>
// Exit 0 ok, 2 usage error.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const args = process.argv.slice(2)
const opt = (name) => (args.indexOf(`--${name}`) >= 0 ? args[args.indexOf(`--${name}`) + 1] : '')
const optValues = new Set(['pages', 'spec', 'title', 'timecode'].map(opt))
const out = args.find((a) => !a.startsWith('--') && !optValues.has(a))
const pagesPath = opt('pages')
if (!out || !pagesPath || !existsSync(pagesPath)) {
  console.error('usage: finalize-prototype.mjs <OUTPUT_DIR> --pages <json> --spec <SPEC_FILE> --title <t> --timecode <tc>')
  process.exit(2)
}
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback)
const pages = readJson(pagesPath, {}).assembly_pages ?? []

const mapPath = join(out, 'page-map.json')
const pageMap = readJson(mapPath, {})
for (const p of pages) if (p.spec_id) pageMap[p.spec_id] = p.id
writeFileSync(mapPath, `${JSON.stringify(pageMap, null, 2)}\n`)

const brief = existsSync(join(out, 'design-brief.md')) ? readFileSync(join(out, 'design-brief.md'), 'utf8') : ''
const slots = (() => {
  try {
    return JSON.parse(brief.split(/^## Slots\b/m)[1]?.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? '{}')
  } catch {
    return {}
  }
})()
const authority = brief.match(/Design authority:\s*([^\n]+)/)?.[1]?.trim() ?? 'unknown'
const deviations = brief.split(/^## Binding reference/m)[1]?.match(/Deviations:\s*([^\n]+)/)?.[1]?.trim() ?? 'none'
const inputs = readJson(join(out, 'design-inputs.json'), { sources: [] })
const primary = slots.locked_tokens?.['--primary'] ?? (slots.primary ? `oklch(${slots.primary.join(' ')})` : '')
const SIGNATURE_BLOCKS = ['bento', 'glass', 'gradient', 'edge-accent', 'soft-depth', 'editorial', 'underline-nav']
const dir = `.spec/prototype/${basename(out.replace(/\/$/, ''))}`

writeFileSync(join(out, 'README.md'), `${[
  `# ${opt('title')} — HTML Prototype`,
  '',
  `Generated: ${opt('timecode')}`,
  `Spec: ${opt('spec')}`,
  '',
  '## Serve',
  '',
  `npx serve ${dir}`,
  'Open http://localhost:3000',
  '',
  `## Pages (${pages.length})`,
  '',
  ...pages.map((p) => `- ${p.id}: ${p.title}${p.description ? ` — ${p.description}` : ''}`),
  '',
  '## Design System',
  '',
  `Direction: ${slots.archetype ?? ''} · primary ${primary} · ${[slots.font_body, slots.font_display].filter(Boolean).join(' / ')} · ${slots.layout ?? ''} · signature: ${(slots.signature ?? []).filter((b) => SIGNATURE_BLOCKS.includes(b)).join(', ') || 'none'}`,
  `Design authority: ${authority}`,
  `Provided reference: ${inputs.sources?.map((s) => s.path).join(', ') || 'none'} · deviations: ${deviations}`,
  '',
  '- `design-brief.md` — the chosen direction and why',
  '- `ux-directives.md` — per-page-type UX rules the screens were built against',
  '- `design-system-ref.md` — token and component/class reference',
].join('\n')}\n`)
console.log(JSON.stringify({ files: ['README.md', 'page-map.json'], pages: pages.length, page_map_keys: Object.keys(pageMap).length }))
