#!/usr/bin/env node
// Full-build spec model: every screen, every entity field, no truncation.
// Replaces the spec-interpreter agent for MODE: build.
//
// Usage: node spec-model.mjs --spec <spec.md> --out <spec-model.json> [--page-map <page-map.json>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildModel, parseFrontmatter } from './lib/spec-model.mjs'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}

const root = flag('root') && flag('root') !== true ? String(flag('root')) : process.cwd()
const specArg = String(flag('spec') || '')
const outArg = String(flag('out') || '')
const pageMapArg = flag('page-map')
if (!specArg || !outArg) {
  console.error('usage: spec-model.mjs --spec <spec.md> --out <spec-model.json> [--page-map <page-map.json>]')
  process.exit(2)
}

const abs = (p) => (p.startsWith('/') ? p : join(root, p))
const specPath = abs(specArg)
const outPath = abs(outArg)

let parse
try {
  const mod = await import('yaml')
  parse = mod.parse ?? mod.default?.parse
} catch {
  parse = undefined
}
if (typeof parse !== 'function') {
  console.error('FATAL: the "yaml" package is not installed in this plugin directory. Run npm install from the plugin root.')
  process.exit(2)
}

if (!existsSync(specPath)) {
  console.error(`FATAL: spec not found: ${specPath}`)
  process.exit(2)
}

let fm
try {
  fm = parseFrontmatter(readFileSync(specPath, 'utf8'), parse)
} catch (e) {
  console.error(`FATAL: ${specPath}: ${e.message}`)
  process.exit(2)
}

const pageMapPath = pageMapArg && pageMapArg !== true ? abs(String(pageMapArg)) : ''
const pageMap = pageMapPath && existsSync(pageMapPath) ? JSON.parse(readFileSync(pageMapPath, 'utf8')) : {}

const model = buildModel(fm, pageMap)

if (model.pages.length === 0) {
  console.error('FATAL: no pages extracted. Check ui-surface.screens[] in SPEC_FILE.')
  process.exit(2)
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`)
console.log(`OK: ${model.pages.length} page(s), ${model.entities.length} entit${model.entities.length === 1 ? 'y' : 'ies'} → ${outArg}`)
