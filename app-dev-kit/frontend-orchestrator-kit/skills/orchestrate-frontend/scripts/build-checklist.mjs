#!/usr/bin/env node
// Deterministic UI checklist builder for frontend-orchestrator-kit.
// Reads a spec-dev-kit spec.md, builds one task per screen, groups those tasks under
// the highest-priority user story that owns them, and writes task-checklist.md.
// One feature = one later /feature-dev call. Screen-less API/agent stories are omitted.
// Usage: node build-checklist.mjs <path-to-spec.md> [--prototype-ref <path>]
// Exit 0 = written (features.length > 0). Exit 1 = zero buildable tasks. Exit 2 = usage/parse failure.
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

function priorTasks(doc) {
  if (!doc) return []
  if (Array.isArray(doc.features) && doc.features.length) {
    return doc.features.flatMap((feature) =>
      (feature.tasks ?? []).map((task) => ({ ...task, _feature: feature })),
    )
  }
  return doc.tasks ?? []
}

const priorTaskRows = priorTasks(existing)
const existingByScreen = new Map(priorTaskRows.map((t) => [t['screen-ref'] || t.id, t]))
const existingFeatures = existing?.features ?? []

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

function allocateId(prefix, used, preserved) {
  if (preserved) {
    used.add(preserved)
    return preserved
  }
  let n = 1
  let id
  do {
    id = `${prefix}-${String(n++).padStart(3, '0')}`
  } while (used.has(id))
  used.add(id)
  return id
}

const usedTaskIds = new Set()
const usedFeatureIds = new Set()

const tasks = []

for (const screen of screens) {
  const { storyIds, acIds } = storyRefsForScreen(screen)
  const priority = maxPriority(storyIds)
  if (priority === 'wont') continue

  const prior = existingByScreen.get(screen.id)
  tasks.push({
    id: allocateId('T', usedTaskIds, prior?.id),
    title: screen.title,
    'screen-ref': screen.id,
    'story-refs': storyIds,
    'ac-refs': acIds,
    'entity-refs': entityRefsForScreen(screen),
    status: prior?.status ?? 'pending',
    'blocked-reason': prior?.['blocked-reason'] ?? '',
    _priority: priority,
  })
}

function owningStory(task) {
  const ranked = (task['story-refs'] ?? [])
    .map((id) => stories.find((s) => s.id === id))
    .filter((s) => s && s.priority !== 'wont')
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  return ranked[0] ?? null
}

const groups = new Map()
for (const task of tasks) {
  const story = owningStory(task)
  const key = story ? `story:${story.id}` : `screen:${task['screen-ref']}`
  if (!groups.has(key)) groups.set(key, { story, tasks: [] })
  groups.get(key).tasks.push(task)
}

function findExistingFeature(story, groupTasks) {
  if (story) {
    const hit = existingFeatures.find((f) => (f['story-refs'] ?? []).includes(story.id))
    if (hit) return hit
  }
  const screensInGroup = new Set(groupTasks.map((t) => t['screen-ref']))
  return existingFeatures.find((f) =>
    (f.tasks ?? []).some((t) => screensInGroup.has(t['screen-ref'])),
  ) ?? null
}

const features = []
for (const { story, tasks: groupTasks } of groups.values()) {
  const priorFeature = findExistingFeature(story, groupTasks)
  const priority = story?.priority ?? groupTasks[0]?._priority ?? 'should'
  const title = groupTasks.length === 1
    ? groupTasks[0].title
    : (story?.['i-want'] || groupTasks[0].title)
  const nested = groupTasks.map((task) => {
    const { _priority, ...rest } = task
    return rest
  })
  features.push({
    id: allocateId('F', usedFeatureIds, priorFeature?.id),
    title,
    'slug-hint': kebab(title) || kebab(story?.id) || kebab(groupTasks[0]['screen-ref']),
    'story-refs': story ? [story.id] : [],
    priority,
    status: priorFeature?.status ?? 'pending',
    slug: priorFeature?.slug ?? '',
    branch: priorFeature?.branch ?? '',
    'parent-branch': priorFeature?.['parent-branch'] ?? '',
    'blocked-reason': priorFeature?.['blocked-reason'] ?? '',
    tasks: nested,
  })
}

const currentRefs = new Set(tasks.map((t) => t['screen-ref']).filter(Boolean))
for (const prior of priorTaskRows) {
  if (!prior['screen-ref']) continue
  if (currentRefs.has(prior['screen-ref']) || prior.status === 'done' || prior.status === 'skipped') continue
  if (features.some((f) => f.tasks.some((t) => t.id === prior.id))) continue
  const host = features.find((f) => f.id === prior._feature?.id)
    ?? features.find((f) => (f['story-refs'] ?? []).some((id) => (prior['story-refs'] ?? []).includes(id)))
  const blockedTask = {
    id: prior.id,
    title: prior.title,
    'screen-ref': prior['screen-ref'],
    'story-refs': prior['story-refs'] ?? [],
    'ac-refs': prior['ac-refs'] ?? [],
    'entity-refs': prior['entity-refs'] ?? [],
    status: 'blocked',
    'blocked-reason': 'source screen removed from spec',
  }
  if (host) host.tasks.push(blockedTask)
  else {
    features.push({
      id: allocateId('F', usedFeatureIds, prior._feature?.id),
      title: prior.title || prior['screen-ref'],
      'slug-hint': kebab(prior.title) || kebab(prior['screen-ref']),
      'story-refs': prior['story-refs'] ?? [],
      priority: 'should',
      status: 'blocked',
      slug: prior._feature?.slug ?? '',
      branch: prior._feature?.branch ?? '',
      'parent-branch': prior._feature?.['parent-branch'] ?? '',
      'blocked-reason': 'source screen removed from spec',
      tasks: [blockedTask],
    })
  }
}

features.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))

const taskCount = features.reduce((n, f) => n + f.tasks.length, 0)
if (taskCount === 0) {
  console.error(`No buildable UI tasks derived from ${specPath} (no non-"wont" screens).`)
  process.exit(1)
}

const now = new Date().toISOString()
const front = {
  'checklist-version': '1.1',
  'spec-ref': specPath,
  'prototype-ref': prototypeRef || existing?.['prototype-ref'] || '',
  generated: existing?.generated ?? now,
  updated: now,
  features,
}

const logLine = existing
  ? `- ${now} — checklist re-derived from ${specPath} (${features.length} features, ${taskCount} tasks)`
  : `- ${now} — checklist generated from ${specPath} (${features.length} features, ${taskCount} tasks)`

const priorBody = existing
  ? readFileSync(checklistPath, 'utf8').split(/^---\n[\s\S]*?\n---\n/)[1] ?? ''
  : `\n# Task Checklist — ${spec.metadata?.title ?? spec.metadata?.slug ?? ''}\n\n## Log\n`

const body = existing ? `${priorBody.trimEnd()}\n${logLine}\n` : `${priorBody}${logLine}\n`

writeFileSync(checklistPath, `---\n${stringify(front)}---\n${body}`, 'utf8')

console.log(`OK: wrote ${checklistPath} (${features.length} features, ${taskCount} tasks)`)
process.exit(0)
