#!/usr/bin/env node
// Screens that are new, modified, or show a modified entity — for MODE: append.
// Shares the page-id / page-type / entity / status / api-contract rules with spec-model.mjs
// (lib/spec-model.mjs) so build and append never disagree on a page's id, domain, or type.
//
// Usage: node delta-pages.mjs --spec <spec.md> --page-map <page-map.json> --out <delta-pages.json> [--changes <changes.json>] [--root <dir>]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildModel, entityFor, parseFrontmatter } from './lib/spec-model.mjs'

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
const mapArg = String(flag('page-map') || '')
const outArg = String(flag('out') || '')
if (!specArg || !mapArg || !outArg) {
  console.error('usage: delta-pages.mjs --spec <spec.md> --page-map <page-map.json> --out <delta-pages.json> [--changes <changes.json>]')
  process.exit(2)
}

const specPath = specArg.startsWith('/') ? specArg : join(root, specArg)
const mapPath = mapArg.startsWith('/') ? mapArg : join(root, mapArg)
const outPath = outArg.startsWith('/') ? outArg : join(root, outArg)

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

const mapped = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {}
const changesArg = flag('changes')
const changesPath = changesArg && changesArg !== true
  ? (String(changesArg).startsWith('/') ? String(changesArg) : join(root, String(changesArg)))
  : ''
if (changesPath && !existsSync(changesPath)) {
  console.error(`FATAL: changes file not found: ${changesPath}`)
  process.exit(2)
}
const changes = changesPath ? JSON.parse(readFileSync(changesPath, 'utf8')) : null
const modifiedScreens = new Set(changes?.screens?.modified ?? [])
const modifiedEntities = new Set([...(changes?.entities?.modified ?? []), ...(changes?.entities?.added ?? [])])

const model = buildModel(fm, mapped)
const entities = fm.entities ?? []
const have = new Set(Object.keys(mapped))
const specScreenIds = new Set((fm['ui-surface']?.screens ?? []).filter((s) => s.id).map((s) => s.id))

function rawScreenFor(page) {
  return (fm['ui-surface']?.screens ?? []).find((s) => s.id === page.spec_id)
}

const screens = model.pages.filter((page) => {
  const screen = rawScreenFor(page)
  const entity = entityFor(screen, entities)
  const showsModifiedEntity = Boolean(entity && modifiedEntities.has(entity.name))
    || (screen?.components ?? []).some((component) =>
      [...modifiedEntities].some((name) => String(component).includes(name)),
    )
  return !have.has(page.spec_id) || modifiedScreens.has(page.spec_id) || showsModifiedEntity
})

const assembly_pages = model.pages.map((page) => (
  { id: page.id, title: page.title, domain: page.domain, description: page.description }
))

// Spec ids on disk (page-map) that no longer exist in the spec — the orchestrator/skill decides
// whether to delete those HTML files or keep them (see SKILL.md Step 2).
const removed = Object.entries(mapped)
  .filter(([specId]) => !specScreenIds.has(specId))
  .map(([specId, htmlId]) => ({ spec_id: specId, id: htmlId }))

const entities_changed = [...new Set([...(changes?.entities?.added ?? []), ...(changes?.entities?.modified ?? [])])]

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify({ screens, assembly_pages, entities_changed, removed }, null, 2)}\n`)
console.log(`OK: ${screens.length} screen(s), ${removed.length} removed → ${outArg}`)
