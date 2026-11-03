#!/usr/bin/env node
// Flag a changed function body that already exists in shared/ or in another slice,
// and a feature file that draws a raw input, button, or table.
//
// Usage: node scan-duplicates.mjs [--root <dir>] [--base <ref>] [--all] [--files a,b]
//        node scan-duplicates.mjs --self-check
// Exit: 0 clean · 1 findings · 2 usage.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const MIN_LINES = 6
const RAW = /<(input|button|table)(\s|>|\/)/

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:\\])\/\/.*$/gm, '$1')

const matchBrace = (text, open) => {
  let depth = 0
  let quote = ''
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') { i += 1; continue }
      if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

const SIG = /\b(?:async\s+)?function\s*[A-Za-z0-9_]*\s*\([^)]*\)\s*(?::[^{]+)?\{|\b(?:const|let)\s+[A-Za-z0-9_]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?::[^=]+)?=>\s*\{/g

export const bodiesOf = (src) => {
  const text = stripComments(src)
  const found = []
  for (const match of text.matchAll(SIG)) {
    const open = match.index + match[0].length - 1
    const close = matchBrace(text, open)
    if (close < 0) continue
    const body = text.slice(open + 1, close)
    const lines = body.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length < MIN_LINES) continue
    found.push({
      norm: body.replace(/\s+/g, ''),
      line: text.slice(0, open).split('\n').length,
    })
  }
  return found
}

export const sliceOf = (rel) => {
  if (rel.startsWith('src/shared/') || rel === 'src/shared') return 'shared'
  const match = rel.match(/^src\/(features|entities|widgets|pages)\/([^/]+)/)
  return match ? `${match[1]}/${match[2]}` : 'other'
}

const isCode = (rel) => /\.(ts|tsx)$/.test(rel) && !rel.endsWith('.d.ts')
const isTest = (rel) => /\.(test|spec)\.(ts|tsx)$/.test(rel) || rel.includes('/tests/')

export const scanSources = (files) => {
  const corpus = []
  for (const file of files) {
    if (!isCode(file.rel) || isTest(file.rel)) continue
    for (const body of bodiesOf(file.text)) {
      corpus.push({ rel: file.rel, slice: sliceOf(file.rel), changed: Boolean(file.changed), ...body })
    }
  }
  const findings = []
  const seen = new Set()
  for (const left of corpus) {
    if (!left.changed) continue
    for (const right of corpus) {
      if (left.rel === right.rel && left.line === right.line) continue
      if (left.norm !== right.norm) continue
      if (left.slice === right.slice) continue
      const key = [left.rel, left.line, right.rel, right.line].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      const shared = left.slice === 'shared' || right.slice === 'shared'
      const where = left.slice === 'shared' ? right : left
      const other = where === left ? right : left
      findings.push({
        file: where.rel,
        line: where.line,
        rule: 'duplicate-body',
        message: shared
          ? `same body as ${other.rel}:${other.line} — import it`
          : `same body as ${other.rel}:${other.line} — move it to shared and import it`,
      })
    }
  }
  for (const file of files) {
    if (!file.changed || !file.rel.startsWith('src/features/') || isTest(file.rel) || !file.rel.endsWith('.tsx')) continue
    const match = file.text.match(RAW)
    if (!match) continue
    const line = file.text.slice(0, match.index).split('\n').length
    findings.push({
      file: file.rel,
      line,
      rule: 'raw-primitive',
      message: `raw <${match[1]}> — use the shared/ui primitive`,
    })
  }
  return findings
}

const selfCheck = () => {
  const body = `export function formatSize(bytes) {
  const kb = 1024
  const mb = kb * 1024
  const gb = mb * 1024
  if (bytes > gb) return 'gb'
  if (bytes > mb) return 'mb'
  return 'kb'
}
`
  const short = `export const add = (a, b) => {
  const sum = a + b
  return sum
}
`
  const files = [
    { rel: 'src/shared/lib/format.ts', text: body, changed: false },
    { rel: 'src/features/files/lib/format.ts', text: body, changed: true },
    { rel: 'src/features/other/lib/add.ts', text: short, changed: true },
    { rel: 'src/entities/file/lib/add.ts', text: short, changed: false },
    { rel: 'src/features/files/ui/row.tsx', text: 'export const Row = () => <input />\n', changed: true },
  ]
  const hits = scanSources(files)
  const dup = hits.find((hit) => hit.rule === 'duplicate-body' && hit.message.includes('import it'))
  const raw = hits.find((hit) => hit.rule === 'raw-primitive')
  const shortHit = hits.find((hit) => hit.file.includes('add.ts'))
  if (!dup) {
    console.error('self-check: missed the shared duplicate')
    process.exit(1)
  }
  if (!raw) {
    console.error('self-check: missed the raw input')
    process.exit(1)
  }
  if (shortHit) {
    console.error('self-check: flagged a body shorter than 6 lines')
    process.exit(1)
  }
  console.log('OK: self-check')
}

const args = process.argv.slice(2)
if (args.includes('--self-check')) selfCheck()

if (args.includes('--self-check') && args.length === 1) process.exit(0)

const opt = { root: process.cwd(), base: '', all: false, files: null }
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--self-check') continue
  if (arg === '--root') opt.root = path.resolve(args[++i] ?? '')
  else if (arg === '--base') opt.base = args[++i] ?? ''
  else if (arg === '--all') opt.all = true
  else if (arg === '--files') opt.files = (args[++i] ?? '').split(',').filter(Boolean)
  else {
    console.error(`unknown argument: ${arg}`)
    process.exit(2)
  }
}

const git = (gitArgs) => {
  try {
    return execFileSync('git', gitArgs, { cwd: opt.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').map((line) => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const abs = path.join(dir, name)
    if (statSync(abs).isDirectory()) walk(abs, out)
    else out.push(abs)
  }
  return out
}

const relOf = (abs) => path.relative(opt.root, abs).split(path.sep).join('/')
const src = path.join(opt.root, 'src')
const changed = new Set(
  opt.files ?? (opt.all
    ? walk(src).map(relOf)
    : [
      ...git(['diff', '--relative', '--name-only', '--diff-filter=ACMR', 'HEAD']),
      ...git(['ls-files', '--others', '--exclude-standard']),
      ...(opt.base ? git(['diff', '--relative', '--name-only', '--diff-filter=ACMR', `${opt.base}...HEAD`]) : []),
    ]),
)

const files = walk(src).map((abs) => {
  const rel = relOf(abs)
  return { rel, text: readFileSync(abs, 'utf8'), changed: changed.has(rel) }
})
const findings = scanSources(files)
for (const hit of findings) console.error(`${hit.file}:${hit.line} ${hit.rule}: ${hit.message}`)
if (findings.length) process.exit(1)
console.log('OK: no duplicated bodies')
