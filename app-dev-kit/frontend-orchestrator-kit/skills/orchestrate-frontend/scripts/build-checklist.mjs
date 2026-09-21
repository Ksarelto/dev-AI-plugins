#!/usr/bin/env node
// Deterministic UI task-checklist builder for frontend-orchestrator-kit.
// Reads a spec-dev-kit spec.md, groups user-stories/acceptance-criteria by screen, and writes
// (or re-derives, preserving existing task status) task-checklist.md next to it.
// Screen-less API/agent stories are omitted — they belong on /backend-dev or /agent-dev.
// Usage: node build-checklist.mjs <path-to-spec.md> [--prototype-ref <path>]
// Exit 0 = written (tasks.length > 0). Exit 1 = zero buildable tasks. Exit 2 = usage/parse failure.
// Algorithm of record: ../references/task-decomposition.md
// File shape of record: ../references/checklist-format.md

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const specPath = args.find((a) => !a.startsWith('--'))
const protoFlagIdx = args.indexOf('--prototype-ref')
const prototypeRef = protoFlagIdx >= 0 ? args[protoFlagIdx + 1] ?? '' : ''

if (!specPath) {
  console.error('usage: node build-checklist.mjs <path-to-spec.md> [--prototype-ref <path>]')
  process.exit(2)
}

let parse, stringify
try {
  const mod = await import('yaml')
  parse = mod.parse ?? mod.default?.parse
  stringify = mod.stringify ?? mod.default?.stringify
} catch {
  // fall through to the check below
}
if (typeof parse !== 'function' || typeof stringify !== 'function') {
  console.error(
    'FATAL: the "yaml" package is not resolvable. Run this script from the repo root '
      + '(where node_modules/yaml exists), or `yarn add -D yaml`.',
  )
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

const spec = readFrontmatter(specPath)
const checklistPath = join(dirname(specPath), 'task-checklist.md')

const existing = existsSync(checklistPath) ? readFrontmatter(checklistPath) : null
const existingByScreen = new Map((existing?.tasks ?? []).map((t) => [t['screen-ref'] || t.id, t]))

const PRIORITY_RANK = { must: 0, should: 1, could: 2, wont: 3 }

const stories = spec['user-stories'] ?? []
const acs = spec['acceptance-criteria'] ?? []
const screens = spec['ui-surface']?.screens ?? []
const interactions = spec['ui-surface']?.interactions ?? []
const entities = spec.entities ?? []

function kebab(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

function titleKeywords(screen) {
  return screen.title
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
}

function storyRefsForScreen(screen) {
  const keywords = titleKeywords(screen)
  const acRefs = acs.filter((ac) => {
    const story = stories.find((s) => s.id === ac['story-ref'])
    if (!story) return false
    const viaInteraction = interactions.some(
      (i) => i['screen-ref'] === screen.id
        && (ac.when?.includes(i.trigger) || ac.then?.includes(i.response)),
    )
    const text = `${ac.given ?? ''} ${ac.when ?? ''} ${ac.then ?? ''}`.toLowerCase()
    const viaKeyword = keywords.some((k) => text.includes(k))
    return viaInteraction || text.includes(screen.id.toLowerCase()) || viaKeyword
  })
  const storyIds = [...new Set(acRefs.map((ac) => ac['story-ref']))]
  return { storyIds, acIds: acRefs.map((ac) => ac.id) }
}

function entityRefsForScreen(screen) {
  const names = entities.map((e) => e.name)
  return names.filter((name) => screen.components?.some((c) => c.includes(name)))
}

function maxPriority(storyIds) {
  const priorities = storyIds
    .map((id) => stories.find((s) => s.id === id)?.priority)
    .filter(Boolean)
  if (priorities.length === 0) return 'should'
  return priorities.reduce((best, p) => (PRIORITY_RANK[p] < PRIORITY_RANK[best] ? p : best))
}

let nextId = 1
const usedIds = new Set()
function allocateId(preserved) {
  if (preserved) {
    usedIds.add(preserved)
    return preserved
  }
  let id
  do {
    id = `T-${String(nextId++).padStart(3, '0')}`
  } while (usedIds.has(id))
  usedIds.add(id)
  return id
}

const tasks = []

for (const screen of screens) {
  const { storyIds, acIds } = storyRefsForScreen(screen)
  const priority = maxPriority(storyIds)
  if (priority === 'wont') continue

  const prior = existingByScreen.get(screen.id)
  tasks.push({
    id: allocateId(prior?.id),
    title: screen.title,
    'screen-ref': screen.id,
    'story-refs': storyIds,
    'ac-refs': acIds,
    'entity-refs': entityRefsForScreen(screen),
    priority,
    'slug-hint': kebab(screen.title) || kebab(screen.id),
    status: prior?.status ?? 'pending',
    slug: prior?.slug ?? '',
    branch: prior?.branch ?? '',
    'blocked-reason': prior?.['blocked-reason'] ?? '',
  })
}

// Prior UI tasks whose source screen no longer exists in the spec → blocked, never dropped.
// Screen-less (API/agent) stories are not frontend tasks.
const currentRefs = new Set(tasks.map((t) => t['screen-ref']).filter(Boolean))
for (const [ref, prior] of existingByScreen) {
  if (!prior['screen-ref']) continue
  if (currentRefs.has(ref) || prior.status === 'done' || prior.status === 'skipped') continue
  if (tasks.some((t) => t.id === prior.id)) continue
  tasks.push({
    ...prior,
    status: 'blocked',
    'blocked-reason': 'source screen removed from spec',
  })
}

tasks.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])

if (tasks.length === 0) {
  console.error(`No buildable UI tasks derived from ${specPath} (no non-"wont" screens).`)
  process.exit(1)
}

const now = new Date().toISOString()
const front = {
  'checklist-version': '1.0',
  'spec-ref': specPath,
  'prototype-ref': prototypeRef || existing?.['prototype-ref'] || '',
  generated: existing?.generated ?? now,
  updated: now,
  tasks,
}

const logLine = existing
  ? `- ${now} — checklist re-derived from ${specPath} (${tasks.length} tasks)`
  : `- ${now} — checklist generated from ${specPath} (${tasks.length} tasks)`

const priorBody = existing
  ? readFileSync(checklistPath, 'utf8').split(/^---\n[\s\S]*?\n---\n/)[1] ?? ''
  : `\n# Task Checklist — ${spec.metadata?.title ?? spec.metadata?.slug ?? ''}\n\n## Log\n`

const body = existing ? `${priorBody.trimEnd()}\n${logLine}\n` : `${priorBody}${logLine}\n`

writeFileSync(checklistPath, `---\n${stringify(front)}---\n${body}`, 'utf8')

console.log(`OK: wrote ${checklistPath} (${tasks.length} tasks)`)
process.exit(0)
