#!/usr/bin/env node
// Deterministic capability analysis for app-orchestrator-kit.
// Reads spec.md, writes/re-derives work-plan.md beside it (tracks + B-* / A-* tasks).
// Usage: node analyze-capabilities.mjs <path-to-spec.md> [--prototype-ref <path>]
// Exit 0 = written (at least one needed track). Exit 1 = nothing to build. Exit 2 = usage/parse.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const specPath = args.find((a) => !a.startsWith('--'))
const protoFlagIdx = args.indexOf('--prototype-ref')
const prototypeRef = protoFlagIdx >= 0 ? args[protoFlagIdx + 1] ?? '' : ''

if (!specPath) {
  console.error('usage: node analyze-capabilities.mjs <path-to-spec.md> [--prototype-ref <path>]')
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
  console.error('FATAL: the "yaml" package is not resolvable. Run from the repo root.')
  process.exit(2)
}

function readFrontmatter(path) {
  const raw = readFileSync(path, 'utf8')
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
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
const planPath = join(dirname(specPath), 'work-plan.md')
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
    const text = `${s.as ?? ''} ${s['i-want'] ?? ''} ${s['so-that'] ?? ''}`.toLowerCase()
    return lower.some((n) => text.includes(n))
  }).map((s) => s.id)
  const acIds = acs.filter((a) => storyIds.includes(a['story-ref'])).map((a) => a.id)
  return { storyIds, acIds }
}

function resourceKey(path) {
  const parts = String(path ?? '').split('/').filter((p) => p && !/^v\d+$/i.test(p) && !p.startsWith('{'))
  return parts[0] || ''
}

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
  const coveredEndpointIds = new Set()
  for (const entity of entities) {
    const name = entity.name
    const related = endpoints.filter((e) => {
      const blob = `${e.path ?? ''} ${e.description ?? ''} ${JSON.stringify(e.request ?? {})}`.toLowerCase()
      return blob.includes(String(name).toLowerCase())
    })
    related.forEach((e) => coveredEndpointIds.add(e.id))
    const { storyIds, acIds } = matchingStories([name])
    const key = `B:${name}`
    const prior = existingByKey.get(key)
    const priority = maxPriority(storyIds)
    if (priority === 'wont') continue
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
      status: prior?.status ?? 'pending',
      slug: prior?.slug ?? '',
      branch: prior?.branch ?? '',
      'blocked-reason': prior?.['blocked-reason'] ?? '',
    })
  }

  const leftovers = endpoints.filter((e) => !coveredEndpointIds.has(e.id))
  const byResource = new Map()
  for (const e of leftovers) {
    const key = resourceKey(e.path) || e.id
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
      status: prior?.status ?? 'pending',
      slug: prior?.slug ?? '',
      branch: prior?.branch ?? '',
      'blocked-reason': prior?.['blocked-reason'] ?? '',
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
    tasks.push({
      id: alloc('A', nextA, prior?.id),
      track: 'agent',
      title: agent.name || agent.id,
      'entity-refs': [],
      'api-refs': (agent['tool-refs'] ?? []),
      'agent-ref': agent.id,
      'story-refs': storyIds,
      'ac-refs': acIds,
      priority,
      'slug-hint': kebab(agent.name) || kebab(agent.id),
      status: prior?.status ?? 'pending',
      slug: prior?.slug ?? '',
      branch: prior?.branch ?? '',
      'blocked-reason': prior?.['blocked-reason'] ?? '',
    })
  }
}

const currentKeys = new Set(tasks.map((t) => (
  t.track === 'agent' ? `A:${t['agent-ref']}` : `B:${(t['entity-refs'] ?? [])[0] || t['slug-hint']}`
)))
for (const [key, prior] of existingByKey) {
  if (currentKeys.has(key) || prior.status === 'done' || prior.status === 'skipped') continue
  if (tasks.some((t) => t.id === prior.id)) continue
  tasks.push({
    ...prior,
    status: 'blocked',
    'blocked-reason': 'source entity or agent removed from spec',
  })
}

tasks.sort((a, b) => {
  if (a.track !== b.track) return a.track.localeCompare(b.track)
  return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
})

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
  ? readFileSync(planPath, 'utf8').split(/^---\n[\s\S]*?\n---\n/)[1] ?? ''
  : `\n# Work Plan — ${spec.metadata?.title ?? spec.metadata?.slug ?? ''}\n\n## Log\n`

const body = existing ? `${priorBody.trimEnd()}\n${logLine}\n` : `${priorBody}${logLine}\n`

writeFileSync(planPath, `---\n${stringify(front)}---\n${body}`, 'utf8')
console.log(`OK: wrote ${planPath} (tracks needed: ${tracks.filter((t) => t.needed).map((t) => t.id).join(', ') || 'none'}; ${tasks.length} tasks)`)
process.exit(0)
