#!/usr/bin/env node
// Screens that are new, modified, or show a modified entity.
// Usage: node delta-pages.mjs --spec <spec.md> --page-map <page-map.json> --out <delta-pages.json> [--changes <changes.json>] [--root <dir>]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

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

const raw = readFileSync(specPath, 'utf8')
const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
if (!match) {
  console.error(`FATAL: no YAML front matter in ${specPath}`)
  process.exit(2)
}
const fm = parse(match[1])
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
const have = new Set(Object.keys(mapped))
const entities = fm.entities ?? []
const endpoints = [
  ...(fm['api-surface']?.endpoints ?? []),
  ...(fm['api-surface']?.mutations ?? []),
]

function kebab(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

function pageId(screen) {
  const route = String(screen.route ?? '')
  const fromRoute = route === '/' ? '' : kebab(route.replace(/^\//, ''))
  return fromRoute || kebab(screen.title) || kebab(screen.id)
}

function htmlId(screen) {
  const mappedId = mapped[screen.id]
  return typeof mappedId === 'string' && mappedId ? mappedId : pageId(screen)
}

function pathSegments(path) {
  return String(path ?? '').split('/').filter((part) => part && !part.startsWith('{') && !/^v\d+$/i.test(part))
}

function segmentMatches(name, segment) {
  const key = kebab(name)
  if (!key || !segment) return false
  if (segment === key || segment === `${key}s`) return true
  return key.endsWith('y') && segment === `${key.slice(0, -1)}ies`
}

function entityFor(screen) {
  const text = `${screen.title ?? ''} ${screen.notes ?? ''} ${(screen.components ?? []).join(' ')}`
  return entities.find((entity) => entity.name && text.includes(entity.name)) ?? null
}

function statusesOf(entity) {
  const field = (entity?.fields ?? []).find((item) => /status/i.test(`${item?.name ?? ''} ${item?.type ?? ''}`))
  if (!field) return []
  if (Array.isArray(field.enum)) return field.enum.map(String)
  return [...new Set(`${field.description ?? ''}`.match(/[A-Z][A-Z0-9_]{1,}/g) ?? [])]
}

function apiContract(entity) {
  const contract = {}
  if (!entity) return contract
  const owned = endpoints.length === 0 || endpoints.some((endpoint) => (
    pathSegments(endpoint.path).some((segment) => segmentMatches(entity.name, segment))
  ))
  if (!owned) return contract
  for (const field of (entity.fields ?? []).slice(0, 12)) {
    if (field?.name) contract[field.name] = field.type ?? 'string'
  }
  return contract
}

function pageFields(screen) {
  const entity = entityFor(screen)
  return {
    id: htmlId(screen),
    spec_id: screen.id,
    title: screen.title ?? '',
    description: screen.notes ?? '',
    domain: kebab(entity?.name || screen.title || screen.id),
    entity: entity?.name ?? '',
    route: screen.route ?? '',
    notes: screen.notes ?? '',
    components: screen.components ?? [],
    entity_fields: (entity?.fields ?? []).slice(0, 12).map((field) => ({ name: field.name, type: field.type ?? 'string' })),
    entity_statuses: statusesOf(entity),
    api_contract: apiContract(entity),
  }
}

const allScreens = (fm['ui-surface']?.screens ?? []).filter((screen) => screen.id)
const screens = allScreens
  .filter((screen) => {
    const entity = entityFor(screen)
    const showsModifiedEntity = Boolean(entity && modifiedEntities.has(entity.name))
      || (screen.components ?? []).some((component) =>
        [...modifiedEntities].some((name) => String(component).includes(name)),
      )
    return !have.has(screen.id) || modifiedScreens.has(screen.id) || showsModifiedEntity
  })
  .map(pageFields)

const assembly_pages = allScreens.map((screen) => {
  const page = pageFields(screen)
  return { id: page.id, title: page.title, domain: page.domain, description: page.description }
})
const entities_changed = [...new Set([...(changes?.entities?.added ?? []), ...(changes?.entities?.modified ?? [])])]

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify({ screens, assembly_pages, entities_changed }, null, 2)}\n`)
console.log(`OK: ${screens.length} screen(s) → ${outArg}`)
