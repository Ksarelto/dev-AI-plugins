#!/usr/bin/env node
// Find user-provided theme / brand / layout references for a prototype run.
// Any source found makes the design reference BINDING for design-strategist.
// Usage: node collect-design-inputs.mjs --spec <spec.md> --out <design-inputs.json> [--extra <path>]... [--root <dir>]

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}
function flags(name) {
  const out = []
  args.forEach((arg, i) => {
    if (arg === `--${name}` && args[i + 1] && !args[i + 1].startsWith('--')) out.push(args[i + 1])
  })
  return out
}

const root = flag('root') && flag('root') !== true ? String(flag('root')) : process.cwd()
const specArg = String(flag('spec') || '')
const outArg = String(flag('out') || '')
if (!specArg || !outArg) {
  console.error('usage: collect-design-inputs.mjs --spec <spec.md> --out <design-inputs.json> [--extra <path>]...')
  process.exit(2)
}
const abs = (p) => (p.startsWith('/') ? p : join(root, p))
const rel = (p) => relative(root, p) || p

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])
const TEXT = new Set(['.md', '.markdown', '.txt', '.css', '.scss', '.less', '.json', '.yaml', '.yml', '.html', '.htm'])
const MAX_TEXT_BYTES = 512 * 1024
const MAX_SIGNALS = 25

const words = (list) => new RegExp(list.map((word) => `\\b${word}\\b`).join('|'), 'i')
const VALUE = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(|--[a-z][\w-]*\s*:|font-family\s*:/i
// A design statement on its own. "colour" / "layout" alone are not: specs use them in a11y rules
// ("status as words, not colour alone") and entity names ("Brand").
const STRONG = words([
  'palette', 'colou?r (?:scheme|palette|theme)', '(?:primary|secondary|accent|brand) colou?rs?',
  '(?:dark|light|colou?r|custom|corporate|company|brand) theme', 'theme colou?rs?', 'theming',
  'brand (?:guide(?:lines)?|book|identity|palette|fonts?)', 'branding', 'style ?guide',
  'design (?:system|tokens?|language|reference)', 'look and feel', 'typeface', 'typography',
  'font (?:family|pairing|stack)', 'sidebar', 'side ?nav', 'top ?nav(?:igation)?', 'navbar',
  'nav(?:igation)? bar', 'tab bar', 'bottom nav(?:igation)?', 'figma', 'mockups?', 'wireframes?',
])
const WEAK = words([
  'theme', 'colou?rs?', 'fonts?', 'layout', 'header', 'footer', 'rounded', 'border-radius',
  'radius', 'shadows?', 'spacing', 'density', 'dark mode', 'light mode', 'logo',
])

function kindOf(path) {
  const ext = extname(path).toLowerCase()
  if (IMAGE.has(ext)) return 'image'
  if (['.css', '.scss', '.less'].includes(ext)) return 'css'
  if (['.json', '.yaml', '.yml'].includes(ext)) return 'tokens'
  if (['.html', '.htm'].includes(ext)) return 'html'
  if (TEXT.has(ext)) return 'text'
  return ''
}

function signalsOf(path) {
  if (statSync(path).size > MAX_TEXT_BYTES) return []
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const hits = []
  for (let i = 0; i < lines.length && hits.length < MAX_SIGNALS; i += 1) {
    const text = lines[i].trim()
    if (!text) continue
    const strong = VALUE.test(text) || STRONG.test(text)
    if (strong || WEAK.test(text)) hits.push({ line: i + 1, strong, text: text.slice(0, 200) })
  }
  return hits
}

function walk(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

const sources = []
const seen = new Set()
// `always`: every readable file in this origin is a design source, signals or not.
function add(path, origin, always) {
  if (seen.has(path) || !existsSync(path) || statSync(path).isDirectory()) return
  const kind = kindOf(path)
  if (!kind) return
  seen.add(path)
  if (kind === 'image') {
    sources.push({ path: rel(path), origin, kind, signals: [] })
    return
  }
  const signals = signalsOf(path)
  const counts = always || signals.some((hit) => hit.strong)
  if (counts) sources.push({ path: rel(path), origin, kind, signals })
}

for (const extra of flags('extra')) {
  const path = abs(extra)
  if (!existsSync(path)) console.error(`WARN: explicit design reference not found: ${extra}`)
  else if (statSync(path).isDirectory()) walk(path).forEach((file) => add(file, 'explicit', true))
  else add(path, 'explicit', true)
}

walk(join(root, '.spec/design')).forEach((file) => add(file, 'design-dir', true))

const specPath = abs(specArg)
add(specPath, 'spec', false)

walk(join(root, '.spec/context')).forEach((file) => {
  add(file, 'context', IMAGE.has(extname(file).toLowerCase()))
})

const processedRoot = join(root, '.spec/processed')
const currentId = basename(dirname(specPath))
const processedDirs = existsSync(processedRoot)
  ? readdirSync(processedRoot).filter((name) => statSync(join(processedRoot, name)).isDirectory())
  : []
const ordered = [
  ...processedDirs.filter((name) => name === currentId),
  ...processedDirs.filter((name) => name !== currentId).sort().reverse(),
]
for (const name of ordered) {
  walk(join(processedRoot, name)).forEach((file) => {
    add(file, 'processed', IMAGE.has(extname(file).toLowerCase()))
  })
}

const result = { binding: sources.length > 0, sources }
const outPath = abs(outArg)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)
if (result.binding) {
  console.log(`BINDING: ${sources.length} design source(s) → ${outArg}`)
  for (const source of sources) console.log(`  - ${source.path} (${source.origin}, ${source.kind})`)
} else {
  console.log(`NONE: no design reference found → ${outArg}`)
}
