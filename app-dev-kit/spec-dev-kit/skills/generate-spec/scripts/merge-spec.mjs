#!/usr/bin/env node
// Upsert artifacts/delta.yaml onto base.spec.md and write spec.md plus artifacts/changes.json.
// No base → delta.yaml must be a full spec front matter object; write spec.md from it.
// No delta and spec.md already present → leave it (first-run synthesizer wrote spec.md).
//
// Every id-keyed list is upserted: an existing id in the delta replaces that item; a new id is
// appended; ids under `removed:` are dropped. Entities merge field-by-field. Legacy
// api-surface.mutations (1.x) are folded into api-surface.endpoints.
// spec-version stays the base's unless the delta sets it (a 1.x → 2.0 upgrade is explicit).
//
// Usage: node merge-spec.mjs --run <run-dir> [--root <dir>]

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { endpointsOf, flag, loadYaml, readSpec, writeSpec } from './lib-spec.mjs'

const args = process.argv.slice(2)
const runArg = String(flag(args, 'run') || '')
const root = flag(args, 'root') && flag(args, 'root') !== true ? String(flag(args, 'root')) : process.cwd()
if (!runArg) {
  console.error('usage: merge-spec.mjs --run <run-dir> [--root <dir>]')
  process.exit(2)
}

const runDir = runArg.startsWith('/') ? runArg : join(root, runArg)
const basePath = join(runDir, 'base.spec.md')
const deltaPath = join(runDir, 'artifacts/delta.yaml')
const deltaMdPath = join(runDir, 'artifacts/delta.md')
const specPath = join(runDir, 'spec.md')
const { parse, stringify } = await loadYaml()

if (!existsSync(deltaPath)) {
  if (existsSync(specPath)) {
    console.log(`OK: no delta; left ${specPath}`)
    process.exit(0)
  }
  console.error(`FATAL: missing ${deltaPath} and ${specPath}`)
  process.exit(1)
}

const delta = parse(readFileSync(deltaPath, 'utf8')) ?? {}
const idOf = (item) => item?.id ?? item?.name ?? item?.term ?? ''
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

function upsert(baseList, addList, removedIds, bucket) {
  const out = Array.isArray(baseList) ? [...baseList] : []
  const removed = new Set(removedIds ?? [])
  const removedApplied = []
  for (let i = out.length - 1; i >= 0; i--) {
    const key = idOf(out[i])
    if (key && removed.has(key)) {
      out.splice(i, 1)
      removedApplied.push(key)
    }
  }
  const index = new Map()
  out.forEach((item, i) => {
    const key = idOf(item)
    if (key) index.set(key, i)
  })
  const added = []
  const modified = []
  for (const item of addList ?? []) {
    const key = idOf(item)
    if (!key) {
      out.push(item)
      continue
    }
    if (index.has(key)) {
      const at = index.get(key)
      if (JSON.stringify(out[at]) !== JSON.stringify(item)) modified.push(key)
      out[at] = item
    } else {
      index.set(key, out.length)
      out.push(item)
      added.push(key)
    }
  }
  if (bucket) {
    bucket.added = added
    bucket.modified = modified
    bucket.removed = removedApplied.reverse()
  }
  return out
}

function mergeObj(base, add) {
  if (!isObj(add)) return base
  return { ...(isObj(base) ? base : {}), ...add }
}

function overlayByKey(baseList, addList, keyOf) {
  if (!Array.isArray(addList)) return Array.isArray(baseList) ? baseList : []
  const out = (Array.isArray(baseList) ? baseList : []).map((item) => (isObj(item) ? { ...item } : item))
  const index = new Map()
  out.forEach((item, i) => {
    const key = keyOf(item)
    if (key) index.set(key, i)
  })
  for (const item of addList) {
    const key = keyOf(item)
    if (!key) {
      out.push(item)
      continue
    }
    if (index.has(key)) out[index.get(key)] = { ...(isObj(out[index.get(key)]) ? out[index.get(key)] : {}), ...item }
    else {
      index.set(key, out.length)
      out.push(item)
    }
  }
  return out
}

function mergeFields(baseList, addList, dropNames) {
  const drop = new Set(dropNames ?? [])
  const kept = (Array.isArray(baseList) ? baseList : []).filter((field) => !drop.has(field?.name))
  return overlayByKey(kept, addList, (field) => field?.name ?? '')
}

function relKey(rel) {
  return rel?.entity ? `${rel.entity}|${rel.type ?? ''}` : ''
}

function mergeEntities(baseList, addList, removedIds, removedFields, bucket) {
  const out = Array.isArray(baseList) ? baseList.map((entity) => ({ ...entity })) : []
  const removed = new Set(removedIds ?? [])
  const removedApplied = []
  for (let i = out.length - 1; i >= 0; i--) {
    const key = idOf(out[i])
    if (key && removed.has(key)) {
      out.splice(i, 1)
      removedApplied.push(key)
    }
  }
  const index = new Map()
  out.forEach((entity, i) => {
    const key = idOf(entity)
    if (key) index.set(key, i)
  })
  const added = []
  const modified = []
  const fieldDrops = isObj(removedFields) ? removedFields : {}
  for (const item of addList ?? []) {
    const key = idOf(item)
    if (!key) {
      out.push(item)
      continue
    }
    if (!index.has(key)) {
      index.set(key, out.length)
      out.push(item)
      added.push(key)
      continue
    }
    const at = index.get(key)
    const prev = out[at]
    const fields = mergeFields(prev.fields, item.fields, fieldDrops[key])
    const relationships = overlayByKey(prev.relationships, item.relationships, relKey)
    const next = { ...prev, ...item, fields, relationships }
    if (JSON.stringify(prev) !== JSON.stringify(next)) modified.push(key)
    out[at] = next
  }
  for (const [name, drops] of Object.entries(fieldDrops)) {
    if (!Array.isArray(drops) || drops.length === 0 || !index.has(name)) continue
    if (modified.includes(name) || added.includes(name)) continue
    const at = index.get(name)
    const prev = out[at]
    const fields = mergeFields(prev.fields, undefined, drops)
    if (JSON.stringify(prev.fields ?? []) !== JSON.stringify(fields)) {
      out[at] = { ...prev, fields }
      modified.push(name)
    }
  }
  bucket.added = added
  bucket.modified = modified
  bucket.removed = removedApplied.reverse()
  return out
}

const changes = {}
function section(name) {
  const bucket = { added: [], modified: [], removed: [] }
  changes[name] = bucket
  return bucket
}

function foldMutations(fm) {
  const api = isObj(fm['api-surface']) ? fm['api-surface'] : null
  if (!api || !Array.isArray(api.mutations)) return
  api.endpoints = endpointsOf(fm)
  delete api.mutations
}

const folder = basename(runDir)
const stamp = folder.match(/^spec-(\d{8}-\d{6})_/)?.[1] ?? ''

if (!existsSync(basePath)) {
  if (!delta['spec-version']) {
    console.error('FATAL: first-run delta.yaml must include spec-version (full front matter)')
    process.exit(1)
  }
  delta.status = 'reviewing'
  if (stamp) delta.timecode = stamp
  if (String(delta['spec-version']).startsWith('2')) foldMutations(delta)
  writeFileSync(specPath, writeSpec(specPath, delta, '\n', stringify))
  console.log(`OK: wrote ${specPath} from delta`)
  process.exit(0)
}

const { fm, body } = readSpec(basePath, parse)
fm.status = 'reviewing'
if (stamp) fm.timecode = stamp
if (delta['spec-version']) fm['spec-version'] = String(delta['spec-version'])
const removed = isObj(delta.removed) ? delta.removed : {}

fm.metadata = mergeObj(fm.metadata, delta.metadata)
if (!isObj(fm.metadata)) fm.metadata = {}
fm.metadata.updated = new Date().toISOString()
fm.metadata['source-files'] = [...new Set([
  ...(fm.metadata['source-files'] ?? []),
  ...(delta.metadata?.['source-files'] ?? []),
  ...(delta['source-files'] ?? []),
])]

// context: scalar fields overlay; success-metrics upsert by id.
if (delta.context !== undefined) {
  const { 'success-metrics': kpis, ...rest } = isObj(delta.context) ? delta.context : {}
  const baseKpis = fm.context?.['success-metrics']
  fm.context = mergeObj(fm.context, rest)
  if (kpis !== undefined || baseKpis !== undefined) {
    fm.context['success-metrics'] = upsert(baseKpis, kpis, removed['success-metrics'], section('success-metrics'))
  }
}
for (const key of ['non-functional', 'boundaries']) {
  if (delta[key] !== undefined) fm[key] = mergeObj(fm[key], delta[key])
}
if (delta.traceability !== undefined) {
  const { decisions, ...rest } = isObj(delta.traceability) ? delta.traceability : {}
  const baseDecisions = fm.traceability?.decisions
  fm.traceability = mergeObj(fm.traceability, rest)
  fm.traceability.decisions = upsert(baseDecisions, decisions, removed.decisions, section('decisions'))
}

// Top-level id- or name-keyed lists. Each gets a changes.json bucket.
const LISTS = [
  'requirements', 'roles', 'glossary', 'permissions', 'business-rules', 'state-machines',
  'notifications', 'user-stories', 'acceptance-criteria', 'risks', 'assumptions', 'open-questions',
]
for (const key of LISTS) {
  if (delta[key] === undefined && fm[key] === undefined && removed[key] === undefined) continue
  fm[key] = upsert(fm[key], delta[key], removed[key], section(key))
}
fm.entities = mergeEntities(fm.entities, delta.entities, removed.entities, removed.fields, section('entities'))

const uiBase = isObj(fm['ui-surface']) ? fm['ui-surface'] : {}
const uiAdd = isObj(delta['ui-surface']) ? delta['ui-surface'] : {}
fm['ui-surface'] = {
  ...mergeObj(uiBase, uiAdd),
  screens: upsert(uiBase.screens, uiAdd.screens, removed.screens, section('screens')),
  interactions: upsert(uiBase.interactions, uiAdd.interactions, removed.interactions, section('interactions')),
}

// One endpoint list. Delta mutations (legacy writers) count as endpoints.
const apiBase = isObj(fm['api-surface']) ? fm['api-surface'] : {}
const apiAdd = isObj(delta['api-surface']) ? delta['api-surface'] : {}
const { mutations: _baseMut, endpoints: _baseEp, ...apiBaseRest } = apiBase
const { mutations: _addMut, endpoints: _addEp, ...apiAddRest } = apiAdd
fm['api-surface'] = {
  ...apiBaseRest,
  ...apiAddRest,
  endpoints: upsert(
    endpointsOf({ 'api-surface': apiBase }),
    endpointsOf({ 'api-surface': apiAdd }),
    [...(removed.endpoints ?? []), ...(removed.mutations ?? [])],
    section('endpoints'),
  ),
}
section('mutations') // kept empty so 1.x readers of changes.mutations still find the key

if (delta['agent-surface'] || fm['agent-surface']) {
  const agentBase = isObj(fm['agent-surface']) ? fm['agent-surface'] : {}
  const agentAdd = isObj(delta['agent-surface']) ? delta['agent-surface'] : {}
  fm['agent-surface'] = {
    ...mergeObj(agentBase, agentAdd),
    agents: upsert(agentBase.agents, agentAdd.agents, removed.agents, section('agents')),
    tools: upsert(agentBase.tools, agentAdd.tools, removed.tools, section('tools')),
    'knowledge-bases': upsert(agentBase['knowledge-bases'], agentAdd['knowledge-bases'], removed['knowledge-bases'], section('knowledge-bases')),
  }
} else {
  section('agents')
  section('tools')
}

if (delta['delivery-plan'] || fm['delivery-plan']) {
  const planBase = isObj(fm['delivery-plan']) ? fm['delivery-plan'] : {}
  const planAdd = isObj(delta['delivery-plan']) ? delta['delivery-plan'] : {}
  fm['delivery-plan'] = {
    ...mergeObj(planBase, planAdd),
    slices: upsert(planBase.slices, planAdd.slices, removed.slices, section('slices')),
  }
}

const nextBody = existsSync(deltaMdPath) ? readFileSync(deltaMdPath, 'utf8') : body
writeFileSync(specPath, writeSpec(specPath, fm, nextBody, stringify))
writeFileSync(join(runDir, 'artifacts/changes.json'), `${JSON.stringify(changes, null, 2)}\n`)
console.log(`OK: merged delta into ${specPath}`)
