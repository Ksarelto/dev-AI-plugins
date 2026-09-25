#!/usr/bin/env node
// Deterministic capability analysis for app-orchestrator-kit.
// Reads spec.md, writes/re-derives work-plan.md beside it (tracks + B-* / A-* tasks).
// Usage: node analyze-capabilities.mjs <path-to-spec.md> [--prototype-ref <path>] [--changes <changes.json>]
// Exit 0 = written (at least one needed track). Exit 1 = nothing to build. Exit 2 = usage/parse.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const args = process.argv.slice(2)
function flagValue(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return ''
  return next
}
const prototypeRef = flagValue('prototype-ref')
const changesPath = flagValue('changes')
const consumed = new Set([prototypeRef, changesPath].filter(Boolean))
const specPath = args.find((a) => !a.startsWith('--') && !consumed.has(a))

if (!specPath) {
  console.error('usage: node analyze-capabilities.mjs <path-to-spec.md> [--prototype-ref <path>] [--changes <changes.json>]')
  process.exit(2)
}

let parse, stringify
try {
  const mod = await import('yaml')
  parse = mod.parse ?? mod.default?.parse
  stringify = mod.stringify ?? mod.default?.stringify
} catch {
  // fall through
}
if (typeof parse !== 'function' || typeof stringify !== 'function') {
  console.error('FATAL: the "yaml" package is not installed in this plugin directory. Run npm install from the plugin root.')
  process.exit(2)
}

function readFrontmatter(path) {
  const raw = readFileSync(path, 'utf8')
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    console.error(`FATAL: no YAML front matter found in ${path}`)
    process.exit(2)
  }
  return parse(match[1])
}

function kebab(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

const AGENT_RE = /\b(agent|assistant|rag|chatbot|llm|openrouter|retrieval|tool[- ]call)\b/i
const PRIORITY_RANK = { must: 0, should: 1, could: 2, wont: 3 }

const spec = readFrontmatter(specPath)
const changes = changesPath && existsSync(changesPath)
  ? JSON.parse(readFileSync(changesPath, 'utf8'))
  : null
if (changesPath && !changes) {
  console.error(`FATAL: changes file not found: ${changesPath}`)
  process.exit(2)
}

function modifiedIds(section) {
  return new Set(changes?.[section]?.modified ?? [])
}
const changedEntities = modifiedIds('entities')
const changedEndpoints = new Set([...modifiedIds('endpoints'), ...modifiedIds('mutations')])
const changedAgents = modifiedIds('agents')
const changedStories = modifiedIds('user-stories')
const changedAcs = modifiedIds('acceptance-criteria')

function taskState(prior, hit) {
  if (hit && prior?.status === 'done') {
    return { status: 'pending', reason: 'spec changed' }
  }
  return { status: prior?.status ?? 'pending', reason: prior?.['blocked-reason'] ?? '' }
}
function planPathFor(specFile) {
  const runDir = dirname(specFile)
  const parent = dirname(runDir)
  if (basename(parent) === 'spec') return join(dirname(parent), 'app', 'work-plan.md')
  return join(runDir, 'work-plan.md')
}
const planPath = planPathFor(specPath)
const existing = existsSync(planPath) ? readFrontmatter(planPath) : null

const screens = spec['ui-surface']?.screens ?? []
const entities = spec.entities ?? []
const stories = spec['user-stories'] ?? []
const acs = spec['acceptance-criteria'] ?? []
const endpoints = [
  ...(spec['api-surface']?.endpoints ?? []),
  ...(spec['api-surface']?.mutations ?? []),
]
const agentSurface = spec['agent-surface'] ?? {}
const namedAgents = agentSurface.agents ?? []

function storyText() {
  return [
    spec.context?.problem ?? '',
    spec.context?.goal ?? '',
    ...stories.map((s) => `${s.as ?? ''} ${s['i-want'] ?? ''} ${s['so-that'] ?? ''}`),
    ...acs.map((a) => `${a.given ?? ''} ${a.when ?? ''} ${a.then ?? ''}`),
  ].join(' ')
}

const frontendNeeded = screens.length > 0
const backendNeeded = endpoints.length > 0 || entities.length > 0
const agentNamed = namedAgents.length > 0
const agentHeuristic = !agentNamed && AGENT_RE.test(storyText())
const agentNeeded = agentNamed || agentHeuristic

const TRACK_META = {
  backend: { entry: 'backend-dev-kit:backend-dev' },
  agent: { entry: 'agent-dev-kit:agent-dev' },
  frontend: { entry: 'frontend-orchestrator-kit:orchestrate-frontend' },
}

function priorTrack(id) {
  return (existing?.tracks ?? []).find((t) => t.id === id)
}

const tracks = ['backend', 'agent', 'frontend'].map((id) => {
  const needed = id === 'backend' ? backendNeeded : id === 'agent' ? agentNeeded : frontendNeeded
  const confidence = id === 'agent' && agentHeuristic ? 'low' : 'high'
  const prior = priorTrack(id)
  return {
    id,
    needed,
    confidence,
    status: prior?.status ?? (needed ? 'pending' : 'skipped'),
    entry: TRACK_META[id].entry,
    result: prior?.result ?? '',
    'blocked-reason': prior?.['blocked-reason'] ?? '',
  }
})

function maxPriority(storyIds) {
  const priorities = storyIds
    .map((id) => stories.find((s) => s.id === id)?.priority)
    .filter(Boolean)
  if (priorities.length === 0) return 'should'
  return priorities.reduce((best, p) => (PRIORITY_RANK[p] < PRIORITY_RANK[best] ? p : best))
}

function matchingStories(needles) {
  const lower = needles.map((n) => String(n).toLowerCase()).filter((n) => n.length > 2)
  const storyIds = stories.filter((s) => {
    const text = `${s['i-want'] ?? ''} ${s['so-that'] ?? ''}`.toLowerCase()
    return lower.some((n) => text.includes(n))
  }).map((s) => s.id)
  const acIds = acs.filter((a) => storyIds.includes(a['story-ref'])).map((a) => a.id)
  return { storyIds, acIds }
}

function refsHit(storyIds, acIds, prior) {
  const storySet = new Set([...(storyIds ?? []), ...(prior?.['story-refs'] ?? [])])
  const acSet = new Set([...(acIds ?? []), ...(prior?.['ac-refs'] ?? [])])
  for (const id of storySet) if (changedStories.has(id)) return true
  for (const id of acSet) if (changedAcs.has(id)) return true
  return false
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

function endpointOwner(endpoint) {
  let best = null
  let bestLen = -1
  for (const entity of entities) {
    for (const segment of pathSegments(endpoint.path)) {
      if (!segmentMatches(entity.name, segment)) continue
      if (segment.length > bestLen) {
        best = entity.name
        bestLen = segment.length
      }
    }
  }
  return best
}

const endpointOwnerById = new Map(endpoints.map((endpoint) => [endpoint.id, endpointOwner(endpoint)]))

const existingByKey = new Map((existing?.tasks ?? []).map((t) => {
  const key = t.track === 'agent' ? `A:${t['agent-ref'] || t.id}` : `B:${(t['entity-refs'] ?? [])[0] || t['slug-hint'] || t.id}`
  return [key, t]
}))

let nextB = 1
let nextA = 1
const usedIds = new Set((existing?.tasks ?? []).map((t) => t.id))
function alloc(prefix, nextRef, preserved) {
  if (preserved) {
    usedIds.add(preserved)
    return preserved
  }
  let id
  do {
    const n = prefix === 'B' ? nextB++ : nextA++
    id = `${prefix}-${String(n).padStart(3, '0')}`
  } while (usedIds.has(id))
  usedIds.add(id)
  return id
}

const tasks = []

if (backendNeeded) {
  for (const entity of entities) {
    const name = entity.name
    const related = endpoints.filter((e) => endpointOwnerById.get(e.id) === name)
    const { storyIds, acIds } = matchingStories([name])
    const key = `B:${name}`
    const prior = existingByKey.get(key)
    const priority = maxPriority(storyIds)
    if (priority === 'wont') continue
    const state = taskState(prior, changedEntities.has(name) || related.some((e) => changedEndpoints.has(e.id)) || refsHit(storyIds, acIds, prior))
    tasks.push({
      id: alloc('B', nextB, prior?.id),
      track: 'backend',
      title: name,
      'entity-refs': [name],
      'api-refs': related.map((e) => e.id),
      'agent-ref': '',
      'story-refs': storyIds,
      'ac-refs': acIds,
      priority,
      'slug-hint': kebab(name),
      status: state.status,
      slug: prior?.slug ?? '',
      branch: prior?.branch ?? '',
      'blocked-reason': state.reason,
    })
  }

  const leftovers = endpoints.filter((e) => !endpointOwnerById.get(e.id))
  const byResource = new Map()
  for (const e of leftovers) {
    const key = pathSegments(e.path)[0] || e.id
    if (!byResource.has(key)) byResource.set(key, [])
    byResource.get(key).push(e)
  }
  for (const [res, group] of byResource) {
    const title = res
    const mapKey = `B:${title}`
    if (tasks.some((t) => t['slug-hint'] === kebab(title) || t.title === title)) continue
    const prior = existingByKey.get(mapKey)
    const { storyIds, acIds } = matchingStories([title])
    const priority = maxPriority(storyIds)
    if (priority === 'wont') continue
    const state = taskState(prior, group.some((e) => changedEndpoints.has(e.id)) || refsHit(storyIds, acIds, prior))
    tasks.push({
      id: alloc('B', nextB, prior?.id),
      track: 'backend',
      title,
      'entity-refs': [],
      'api-refs': group.map((e) => e.id),
      'agent-ref': '',
      'story-refs': storyIds,
      'ac-refs': acIds,
      priority,
      'slug-hint': kebab(title) || kebab(group[0].id),
      status: state.status,
      slug: prior?.slug ?? '',
      branch: prior?.branch ?? '',
      'blocked-reason': state.reason,
    })
  }
}

if (agentNeeded) {
  const sourceAgents = namedAgents.length
    ? namedAgents
    : [{ id: 'AGT-heuristic', name: 'heuristic-agent', description: 'Heuristic agent track from story keywords' }]
  for (const agent of sourceAgents) {
    const key = `A:${agent.id}`
    const prior = existingByKey.get(key)
    const { storyIds, acIds } = matchingStories([agent.name, agent.description])
    const priority = maxPriority(storyIds)
    if (priority === 'wont') continue
    const state = taskState(prior, changedAgents.has(agent.id) || refsHit(storyIds, acIds, prior))
    tasks.push({
      id: alloc('A', nextA, prior?.id),
      track: 'agent',
      title: agent.name || agent.id,
      'entity-refs': [],
      'api-refs': [],
      'tool-refs': agent['tool-refs'] ?? [],
      'agent-ref': agent.id,
      'story-refs': storyIds,
      'ac-refs': acIds,
      priority,
      'slug-hint': kebab(agent.name) || kebab(agent.id),
      status: state.status,
      slug: prior?.slug ?? '',
      branch: prior?.branch ?? '',
      'blocked-reason': state.reason,
    })
  }
}

const currentKeys = new Set(tasks.map((t) => (
  t.track === 'agent' ? `A:${t['agent-ref']}` : `B:${(t['entity-refs'] ?? [])[0] || t['slug-hint']}`
)))
for (const [key, prior] of existingByKey) {
  if (currentKeys.has(key) || prior.status === 'skipped') continue
  if (tasks.some((t) => t.id === prior.id)) continue
  if (prior.status === 'done') {
    tasks.push({
      ...prior,
      status: 'pending',
      change: 'remove',
      'blocked-reason': '',
    })
    continue
  }
  tasks.push({
    ...prior,
    status: 'blocked',
    'blocked-reason': 'source entity or agent removed from spec',
  })
}

function byPriority(a, b) {
  return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
}

function topoBackend(backendTasks) {
  const byName = new Map()
  const nameless = []
  for (const task of backendTasks) {
    const name = task['entity-refs']?.[0]
    if (name) byName.set(name, task)
    else nameless.push(task)
  }
  const deps = new Map()
  for (const name of byName.keys()) {
    const entity = entities.find((item) => item.name === name)
    deps.set(name, (entity?.relationships ?? [])
      .map((rel) => rel.entity)
      .filter((parent) => parent && parent !== name && byName.has(parent)))
  }
  const indeg = new Map([...byName.keys()].map((name) => [name, deps.get(name).length]))
  const pending = [...byName.keys()]
  const ordered = []
  while (pending.length) {
    const ready = pending.filter((name) => indeg.get(name) === 0)
    if (!ready.length) {
      pending.sort((a, b) => byPriority(byName.get(a), byName.get(b)))
      for (const name of pending) ordered.push(byName.get(name))
      break
    }
    ready.sort((a, b) => byPriority(byName.get(a), byName.get(b)))
    const next = ready[0]
    pending.splice(pending.indexOf(next), 1)
    ordered.push(byName.get(next))
    for (const [name, parents] of deps) {
      if (parents.includes(next)) indeg.set(name, indeg.get(name) - 1)
    }
  }
  nameless.sort(byPriority)
  return [...ordered, ...nameless]
}

tasks.sort((a, b) => {
  if (a.track !== b.track) return a.track.localeCompare(b.track)
  return byPriority(a, b)
})
const backendOrdered = topoBackend(tasks.filter((task) => task.track === 'backend'))
let backendAt = 0
for (let i = 0; i < tasks.length; i++) {
  if (tasks[i].track === 'backend') tasks[i] = backendOrdered[backendAt++]
}

if (!tracks.some((t) => t.needed)) {
  console.error(`No needed tracks derived from ${specPath} (no screens, entities, API, or agents).`)
  process.exit(1)
}

const now = new Date().toISOString()
const front = {
  'work-plan-version': '1.0',
  'spec-ref': specPath,
  'prototype-ref': prototypeRef || existing?.['prototype-ref'] || '',
  generated: existing?.generated ?? now,
  updated: now,
  tracks,
  tasks,
}

const logLine = existing
  ? `- ${now} — work-plan re-derived from ${specPath} (${tracks.filter((t) => t.needed).length} tracks, ${tasks.length} tasks)`
  : `- ${now} — work-plan generated from ${specPath} (${tracks.filter((t) => t.needed).length} tracks, ${tasks.length} tasks)`

const priorBody = existing
  ? readFileSync(planPath, 'utf8').split(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)[1] ?? ''
  : `\n# Work Plan — ${spec.metadata?.title ?? spec.metadata?.slug ?? ''}\n\n## Log\n`

const body = existing ? `${priorBody.trimEnd()}\n${logLine}\n` : `${priorBody}${logLine}\n`

mkdirSync(dirname(planPath), { recursive: true })
writeFileSync(planPath, `---\n${stringify(front)}---\n${body}`, 'utf8')
console.log(`OK: wrote ${planPath} (tracks needed: ${tracks.filter((t) => t.needed).map((t) => t.id).join(', ') || 'none'}; ${tasks.length} tasks)`)
process.exit(0)
