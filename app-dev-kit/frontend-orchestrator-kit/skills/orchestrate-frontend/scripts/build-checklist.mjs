#!/usr/bin/env node
// Deterministic UI checklist builder for frontend-orchestrator-kit.
// Reads a spec-dev-kit spec.md and writes task-checklist.md. One feature = one later /feature-dev call.
// Spec 2.0 (delivery-plan.slices present): one feature per slice with a frontend track, in slice
//   order, one task per slice screen; refs come from the slice and screen, never guessed.
// Spec 1.x: one task per screen, grouped under the highest-priority user story that owns them
//   (AC ↔ screen matched by keywords). Screen-less API/agent stories are omitted.
// Usage: node build-checklist.mjs <path-to-spec.md> [--prototype-ref <path>] [--changes <changes.json>] [--dry-run]
// Exit 0 = written (features.length > 0). Exit 1 = zero buildable tasks. Exit 2 = usage/parse failure.
// Algorithm of record: ../references/task-decomposition.md
// File shape of record: ../references/checklist-format.md

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, readdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

function writeAtomic(path, contents) {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, contents)
  renameSync(tmp, path)
}

const args = process.argv.slice(2)
function flagValue(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return ''
  return next
}
const dryRun = args.includes('--dry-run')
const prototypeRef = flagValue('prototype-ref')
const changesPath = flagValue('changes')
const consumed = new Set([prototypeRef, changesPath].filter(Boolean))
const specPath = args.find((a) => !a.startsWith('--') && !consumed.has(a))

if (!specPath) {
  console.error('usage: node build-checklist.mjs <path-to-spec.md> [--prototype-ref <path>] [--changes <changes.json>] [--dry-run]')
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

const spec = readFrontmatter(specPath)
if (changesPath && !existsSync(changesPath)) {
  console.error(`FATAL: changes file not found: ${changesPath}`)
  process.exit(2)
}
const changes = changesPath ? JSON.parse(readFileSync(changesPath, 'utf8')) : null
const modifiedScreens = new Set(changes?.screens?.modified ?? [])
const modifiedEntities = new Set(changes?.entities?.modified ?? [])
const modifiedStories = new Set(changes?.['user-stories']?.modified ?? [])
const modifiedAcs = new Set(changes?.['acceptance-criteria']?.modified ?? [])
const modifiedSlices = new Set(changes?.slices?.modified ?? [])
function checklistPathFor(specFile) {
  const runDir = dirname(specFile)
  const parent = dirname(runDir)
  if (basename(parent) === 'spec') return join(dirname(parent), 'app', 'task-checklist.md')
  return join(runDir, 'task-checklist.md')
}
const checklistPath = checklistPathFor(specPath)

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
const taskKey = (t) => (t['slice-ref'] ? `${t['slice-ref']}|${t['screen-ref']}` : (t['screen-ref'] || t.id))
const existingByScreen = new Map(priorTaskRows.map((t) => [taskKey(t), t]))
const existingFeatures = existing?.features ?? []

const PRIORITY_RANK = { must: 0, should: 1, could: 2, wont: 3 }

let stories = spec['user-stories'] ?? []
let acs = spec['acceptance-criteria'] ?? []
let screens = spec['ui-surface']?.screens ?? []
const interactions = spec['ui-surface']?.interactions ?? []
let entities = spec.entities ?? []

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

const usedTaskIds = new Set(priorTaskRows.map((t) => t.id).filter(Boolean))
const usedFeatureIds = new Set((existing?.features ?? []).map((f) => f.id).filter(Boolean))

const tasks = []
const features = []
let slices = (spec['delivery-plan']?.slices ?? []).filter((s) => s?.id)

// A continue spec lists only its own slices. With no checklist yet, derive ancestor slices first
// so shipped work keeps its place and depends-on can resolve.
function absorbAncestors() {
  if (existing) return
  const older = [...parentSpecPaths(specPath)].reverse()
  if (!older.length) return
  const sliceMap = new Map()
  const screenMap = new Map()
  const storyMap = new Map()
  const acMap = new Map()
  const entityMap = new Map()
  const take = (doc, sid) => {
    for (const screen of doc['ui-surface']?.screens ?? []) if (screen?.id) screenMap.set(screen.id, screen)
    for (const story of doc['user-stories'] ?? []) if (story?.id) storyMap.set(story.id, story)
    for (const ac of doc['acceptance-criteria'] ?? []) if (ac?.id) acMap.set(ac.id, ac)
    for (const entity of doc.entities ?? []) if (entity?.name) entityMap.set(entity.name, entity)
    for (const slice of doc['delivery-plan']?.slices ?? []) {
      if (!slice?.id || !(slice.tracks ?? []).includes('frontend')) continue
      sliceMap.set(slice.id, { ...slice, _sourceSpec: sid })
    }
  }
  for (const file of older) take(readFrontmatter(file), specIdOf(file))
  take(spec, specIdOf(specPath))
  slices = [...sliceMap.values()]
  screens = [...screenMap.values()]
  stories = [...storyMap.values()]
  acs = [...acMap.values()]
  entities = [...entityMap.values()]
}
absorbAncestors()
const sliceMode = slices.length > 0
const claimedPrior = new Set()

function reopenedTask(prior, screenId, entityRefs, storyIds, acIds, sliceId) {
  const priorStoryHit = (prior?.['story-refs'] ?? []).some((id) => modifiedStories.has(id))
    || (prior?.['ac-refs'] ?? []).some((id) => modifiedAcs.has(id))
  return prior?.status === 'done' && (
    modifiedScreens.has(screenId)
    || entityRefs.some((name) => modifiedEntities.has(name))
    || storyIds.some((id) => modifiedStories.has(id))
    || acIds.some((id) => modifiedAcs.has(id))
    || (sliceId && modifiedSlices.has(sliceId))
    || priorStoryHit
  )
}

function buildFromStories() {
  for (const screen of screens) {
    const { storyIds, acIds } = storyRefsForScreen(screen)
    const priority = maxPriority(storyIds)
    if (priority === 'wont') continue

    const prior = existingByScreen.get(screen.id)
    const entityRefs = entityRefsForScreen(screen)
    const reopened = reopenedTask(prior, screen.id, entityRefs, storyIds, acIds, '')
    tasks.push({
      id: allocateId('T', usedTaskIds, prior?.id),
      title: screen.title,
      'screen-ref': screen.id,
      'story-refs': storyIds,
      'ac-refs': acIds,
      'entity-refs': entityRefs,
      status: reopened ? 'pending' : (prior?.status ?? 'pending'),
      'blocked-reason': reopened ? 'spec changed' : (prior?.['blocked-reason'] ?? ''),
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
    const priorScreens = new Set((priorFeature?.tasks ?? []).map((task) => task['screen-ref']))
    const gainedScreen = priorScreens.size > 0 && nested.some((task) => !priorScreens.has(task['screen-ref']))
    const reopenFeature = priorFeature?.status === 'done' && (
      nested.some((task) => task.status === 'pending' && task['blocked-reason'] === 'spec changed')
      || (story && modifiedStories.has(story.id))
      || gainedScreen
    )
    const id = allocateId('F', usedFeatureIds, priorFeature?.id)
    if (reopenFeature) markReopened(id)
    features.push({
      id,
      title,
      'slug-hint': kebab(title) || kebab(story?.id) || kebab(groupTasks[0]['screen-ref']),
      'story-refs': story ? [story.id] : [],
      priority,
      status: reopenFeature ? 'pending' : (priorFeature?.status ?? 'pending'),
      slug: priorFeature?.slug ?? '',
      branch: priorFeature?.branch ?? '',
      'parent-branch': priorFeature?.['parent-branch'] ?? '',
      'blocked-reason': reopenFeature ? 'spec changed' : (priorFeature?.['blocked-reason'] ?? ''),
      tasks: nested,
    })
  }
}

// 2.0: the delivery plan decides grouping and order. Prior rows are matched by slice + screen,
// then (for a 1.x → 2.0 upgrade) by screen alone, so shipped screens keep their done state.
function buildFromSlices() {
  const priorFor = (sliceId, screenId) => {
    const exact = existingByScreen.get(`${sliceId}|${screenId}`)
    if (exact && !claimedPrior.has(exact)) return exact
    const loose = priorTaskRows.find((t) => !t['slice-ref'] && t['screen-ref'] === screenId && !claimedPrior.has(t))
    return loose ?? null
  }
  const featureIdBySlice = new Map()
  for (const slice of slices) {
    if (!(slice.tracks ?? []).includes('frontend')) continue
    const sliceStories = new Set(slice['story-refs'] ?? [])
    const nested = []
    for (const screenId of slice['screen-refs'] ?? []) {
      const screen = screens.find((s) => s.id === screenId)
      if (!screen) continue
      const own = (screen['story-refs'] ?? []).filter((id) => sliceStories.has(id))
      const storyIds = own.length ? own : [...sliceStories]
      const knownEntities = new Set(entities.map((e) => e.name))
      const acIds = [...new Set([
        ...acs.filter((ac) => storyIds.includes(ac['story-ref'])).map((ac) => ac.id),
        ...(slice['done-when'] ?? []),
      ])]
      const entityRefs = [...new Set([
        ...(screen['primary-entity'] ? [screen['primary-entity']] : []),
        ...(slice['entity-refs'] ?? []),
      ])].filter((name) => knownEntities.has(name))
      const prior = priorFor(slice.id, screenId)
      if (prior) claimedPrior.add(prior)
      const reopened = reopenedTask(prior, screenId, entityRefs, storyIds, acIds, slice.id)
      const task = {
        id: allocateId('T', usedTaskIds, prior?.id),
        title: screen.title,
        'slice-ref': slice.id,
        'screen-ref': screenId,
        'story-refs': storyIds,
        'ac-refs': acIds,
        'entity-refs': entityRefs,
        'api-refs': screen['api-refs'] ?? [],
        status: reopened ? 'pending' : (prior?.status ?? 'pending'),
        'blocked-reason': reopened ? 'spec changed' : (prior?.['blocked-reason'] ?? ''),
      }
      tasks.push(task)
      nested.push(task)
    }
    if (!nested.length) continue
    const priorFeature = existingFeatures.find((f) => f['slice-ref'] === slice.id)
      ?? existingFeatures.find((f) => !f['slice-ref'] && (f.tasks ?? []).some((t) => nested.some((n) => n.id === t.id)))
    const priorScreens = new Set((priorFeature?.tasks ?? []).map((task) => task['screen-ref']))
    const gainedScreen = priorScreens.size > 0 && nested.some((task) => !priorScreens.has(task['screen-ref']))
    const reopenFeature = priorFeature?.status === 'done' && (
      nested.some((task) => task.status === 'pending' && task['blocked-reason'] === 'spec changed')
      || modifiedSlices.has(slice.id)
      || gainedScreen
    )
    const id = allocateId('F', usedFeatureIds, priorFeature?.id)
    if (reopenFeature) markReopened(id)
    featureIdBySlice.set(slice.id, id)
    features.push({
      id,
      title: slice.title,
      'slug-hint': kebab(slice.title) || kebab(slice.id),
      'slice-ref': slice.id,
      ...(slice._sourceSpec ? { 'source-spec': slice._sourceSpec } : {}),
      'depends-on': (slice['depends-on'] ?? []).map((dep) => featureIdBySlice.get(dep)).filter(Boolean),
      'story-refs': [...sliceStories],
      priority: maxPriority([...sliceStories]),
      status: reopenFeature ? 'pending' : (priorFeature?.status ?? 'pending'),
      slug: priorFeature?.slug ?? '',
      branch: priorFeature?.branch ?? '',
      'parent-branch': priorFeature?.['parent-branch'] ?? '',
      'blocked-reason': reopenFeature ? 'spec changed' : (priorFeature?.['blocked-reason'] ?? ''),
      tasks: nested,
    })
  }
}

function absPath(p) {
  return resolve(isAbsolute(p) ? p : join(process.cwd(), p))
}

function specIdOf(specFile) {
  return basename(dirname(absPath(specFile)))
}

function parentSpecPaths(specFile) {
  const out = []
  const seen = new Set()
  let current = specFile
  while (current && !seen.has(absPath(current))) {
    seen.add(absPath(current))
    let doc
    try { doc = readFrontmatter(current) } catch { break }
    const parent = doc.metadata?.['parent-spec']
    if (!parent) break
    current = isAbsolute(parent) ? parent : join(process.cwd(), parent)
    if (!existsSync(current)) break
    out.push(current)
  }
  return out
}

const priorSpec = existing?.['spec-ref'] || ''
const appendMode = Boolean(
  existing && priorSpec && absPath(priorSpec) !== absPath(specPath)
  && [absPath(specPath), ...parentSpecPaths(specPath).map(absPath)].includes(absPath(priorSpec)),
)

let keptCount = 0
let appendedCount = 0
let reopenedCount = 0
let adoptedCount = 0
const archives = []
const reopenedIds = new Set()

function markReopened(featureId) {
  if (!reopenedIds.has(featureId)) {
    reopenedIds.add(featureId)
    reopenedCount++
  }
  const file = join(dirname(checklistPath), 'results', `${featureId}.json`)
  if (existsSync(file) && !archives.includes(file)) archives.push(file)
}

function adoptApprovedBoards() {
  if (existing) return
  const dir = join(dirname(checklistPath), '..', 'features')
  if (!existsSync(dir)) return
  const boards = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    let fm
    try { fm = readFrontmatter(join(dir, name)) } catch { continue }
    if (fm.status !== 'done' || !fm['slice-ref']) continue
    const slug = fm.slug || name.replace(/\.md$/, '')
    const kitPath = join(dir, `${slug}.kit-result.json`)
    if (!existsSync(kitPath)) continue
    let kit
    try { kit = JSON.parse(readFileSync(kitPath, 'utf8')) } catch { continue }
    if (kit.outcome !== 'approved') continue
    const featureId = fm['feature-id'] && fm['feature-id'] !== 'none' ? fm['feature-id'] : ''
    boards.push({
      slice: fm['slice-ref'],
      featureId,
      slug: kit.slug || slug,
      branch: kit.branch || fm.branch || '',
      parent: kit.parent_branch || fm['parent-branch'] || '',
    })
  }
  const used = new Set(features.map((feature) => feature.id))
  for (const feature of features) {
    if (feature.status !== 'pending' || feature.slug) continue
    const board = boards.find((item) => item.slice === feature['slice-ref'])
    if (!board) continue
    const previous = feature.id
    if (board.featureId && board.featureId !== feature.id && !used.has(board.featureId)) {
      used.delete(feature.id)
      feature.id = board.featureId
      used.add(board.featureId)
      for (const other of features) {
        if (!other['depends-on']) continue
        other['depends-on'] = other['depends-on'].map((id) => (id === previous ? feature.id : id))
      }
    }
    feature.status = 'done'
    feature.slug = board.slug
    feature.branch = board.branch
    feature['parent-branch'] = board.parent
    feature['blocked-reason'] = ''
    for (const task of feature.tasks ?? []) if (task.status !== 'skipped') task.status = 'done'
    adoptedCount++
  }
}

function copyFeature(feature, sourceSpec) {
  return {
    ...feature,
    'source-spec': feature['source-spec'] || sourceSpec,
    tasks: (feature.tasks ?? []).map((task) => ({ ...task })),
  }
}

function reopenFeature(feature) {
  if (feature.status !== 'done' && feature.status !== 'skipped') return false
  feature.status = 'pending'
  feature['blocked-reason'] = 'spec changed'
  return true
}

function buildAppend() {
  const priorSpecId = specIdOf(priorSpec)
  const specId = specIdOf(specPath)
  const kept = (existing?.features ?? []).map((feature) => copyFeature(feature, priorSpecId))
  keptCount = kept.length
  for (const feature of kept) {
    const sliceHit = feature['slice-ref'] && modifiedSlices.has(feature['slice-ref'])
    const screenHit = (feature.tasks ?? []).some((task) => modifiedScreens.has(task['screen-ref']))
    if ((sliceHit || screenHit) && reopenFeature(feature)) markReopened(feature.id)
  }
  const knownScreens = new Set(kept.flatMap((feature) => (feature.tasks ?? []).map((task) => task['screen-ref'])))
  const featureIdBySlice = new Map(kept.filter((feature) => feature['slice-ref']).map((feature) => [feature['slice-ref'], feature.id]))
  const usedFeatureIdsAppend = new Set(kept.map((feature) => feature.id))
  const usedTaskIdsAppend = new Set(kept.flatMap((feature) => (feature.tasks ?? []).map((task) => task.id)))
  const added = []

  function taskFor(slice, screenId, sliceStories) {
    const screen = screens.find((item) => item.id === screenId)
    if (!screen) return null
    const own = (screen['story-refs'] ?? []).filter((id) => sliceStories.has(id))
    const storyIds = own.length ? own : [...sliceStories]
    const knownEntities = new Set(entities.map((entity) => entity.name))
    const acIds = [...new Set([
      ...acs.filter((ac) => storyIds.includes(ac['story-ref'])).map((ac) => ac.id),
      ...(slice['done-when'] ?? []),
    ])]
    const entityRefs = [...new Set([
      ...(screen['primary-entity'] ? [screen['primary-entity']] : []),
      ...(slice['entity-refs'] ?? []),
    ])].filter((name) => knownEntities.has(name))
    return {
      id: allocateId('T', usedTaskIdsAppend),
      title: screen.title,
      'slice-ref': slice.id,
      'screen-ref': screenId,
      'story-refs': storyIds,
      'ac-refs': acIds,
      'entity-refs': entityRefs,
      'api-refs': screen['api-refs'] ?? [],
      status: 'pending',
      'blocked-reason': '',
    }
  }

  if (sliceMode) {
    for (const slice of slices) {
      if (!(slice.tracks ?? []).includes('frontend')) continue
      const prior = kept.find((feature) => feature['slice-ref'] === slice.id && feature['source-spec'] !== specId)
      const sliceStories = new Set(slice['story-refs'] ?? [])
      if (prior) {
        if (!modifiedSlices.has(slice.id)) {
          console.error(`ID_COLLISION: ${slice.id} is already ${prior.id} from ${prior['source-spec']}`)
          process.exit(2)
        }
        const have = new Set((prior.tasks ?? []).map((task) => task['screen-ref']))
        let gained = false
        for (const screenId of slice['screen-refs'] ?? []) {
          if (have.has(screenId)) continue
          const task = taskFor(slice, screenId, sliceStories)
          if (!task) continue
          prior.tasks.push(task)
          have.add(screenId)
          gained = true
        }
        if (gained && reopenFeature(prior)) markReopened(prior.id)
        prior['story-refs'] = [...new Set([...(prior['story-refs'] ?? []), ...sliceStories])]
        continue
      }
      const nested = []
      for (const screenId of slice['screen-refs'] ?? []) {
        const task = taskFor(slice, screenId, sliceStories)
        if (task) nested.push(task)
      }
      if (!nested.length) continue
      const id = allocateId('F', usedFeatureIdsAppend)
      featureIdBySlice.set(slice.id, id)
      added.push({
        id,
        title: slice.title,
        'slug-hint': kebab(slice.title) || kebab(slice.id),
        'slice-ref': slice.id,
        'source-spec': specId,
        'depends-on': (slice['depends-on'] ?? []).map((dep) => featureIdBySlice.get(dep)).filter(Boolean),
        'story-refs': [...sliceStories],
        priority: maxPriority([...sliceStories]),
        status: 'pending',
        slug: '',
        branch: '',
        'parent-branch': '',
        'blocked-reason': '',
        tasks: nested,
      })
    }
  } else {
    const collisions = screens.filter((screen) => knownScreens.has(screen.id) && !modifiedScreens.has(screen.id))
    if (collisions.length) {
      console.error(`ID_COLLISION: ${collisions.map((screen) => screen.id).join(', ')} already on the checklist from ${priorSpecId}`)
      process.exit(2)
    }
    const fresh = screens.filter((screen) => !knownScreens.has(screen.id))
    const groups = new Map()
    for (const screen of fresh) {
      const { storyIds, acIds } = storyRefsForScreen(screen)
      const priority = maxPriority(storyIds)
      if (priority === 'wont') continue
      const task = {
        id: allocateId('T', usedTaskIdsAppend),
        title: screen.title,
        'screen-ref': screen.id,
        'story-refs': storyIds,
        'ac-refs': acIds,
        'entity-refs': entityRefsForScreen(screen),
        status: 'pending',
        'blocked-reason': '',
        _priority: priority,
      }
      const story = storyIds
        .map((id) => stories.find((item) => item.id === id))
        .filter((item) => item && item.priority !== 'wont')
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])[0]
      const key = story ? `story:${story.id}` : `screen:${screen.id}`
      if (!groups.has(key)) groups.set(key, { story, tasks: [] })
      groups.get(key).tasks.push(task)
    }
    for (const { story, tasks: groupTasks } of groups.values()) {
      const priority = story?.priority ?? groupTasks[0]?._priority ?? 'should'
      const title = groupTasks.length === 1 ? groupTasks[0].title : (story?.['i-want'] || groupTasks[0].title)
      added.push({
        id: allocateId('F', usedFeatureIdsAppend),
        title,
        'slug-hint': kebab(title) || kebab(story?.id) || kebab(groupTasks[0]['screen-ref']),
        'source-spec': specId,
        'story-refs': story ? [story.id] : [],
        priority,
        status: 'pending',
        slug: '',
        branch: '',
        'parent-branch': '',
        'blocked-reason': '',
        tasks: groupTasks.map(({ _priority, ...task }) => task),
      })
    }
  }

  appendedCount = added.length
  features.push(...kept, ...added)
}

if (appendMode) buildAppend()
else if (sliceMode) buildFromSlices()
else buildFromStories()

const currentKeys = new Set(tasks.map(taskKey))
if (!appendMode) for (const prior of priorTaskRows) {
  if (!prior['screen-ref']) continue
  if (claimedPrior.has(prior)) continue
  if (currentKeys.has(taskKey(prior)) || prior.status === 'skipped') continue
  if (features.some((f) => f.tasks.some((t) => t.id === prior.id))) continue
  const listedRemoved = (changes?.screens?.removed ?? []).includes(prior['screen-ref'])
    || (prior['slice-ref'] && (changes?.slices?.removed ?? []).includes(prior['slice-ref']))
  const host = features.find((f) => f.id === prior._feature?.id)
    ?? features.find((f) => (f['story-refs'] ?? []).some((id) => (prior['story-refs'] ?? []).includes(id)))
    ?? features.find((f) => f['slice-ref'] && f['slice-ref'] === prior['slice-ref'])
  const keepPrior = !listedRemoved
  const removing = listedRemoved && prior.status === 'done'
  const blockedTask = {
    id: prior.id,
    title: prior.title,
    ...(prior['slice-ref'] ? { 'slice-ref': prior['slice-ref'] } : {}),
    'screen-ref': prior['screen-ref'],
    'story-refs': prior['story-refs'] ?? [],
    'ac-refs': prior['ac-refs'] ?? [],
    'entity-refs': prior['entity-refs'] ?? [],
    status: keepPrior ? (prior.status ?? 'pending') : (removing ? 'pending' : 'blocked'),
    ...(keepPrior ? {} : { change: removing ? 'remove' : '' }),
    'blocked-reason': keepPrior
      ? (prior['blocked-reason'] ?? '')
      : (removing ? '' : 'source screen removed from spec'),
  }
  if (host) {
    host.tasks.push(blockedTask)
    if (removing && (host.status === 'done' || host.status === 'skipped')) {
      host.status = 'pending'
      host['blocked-reason'] = 'spec changed'
      markReopened(host.id)
    }
  } else {
    features.push({
      id: allocateId('F', usedFeatureIds, prior._feature?.id),
      title: prior._feature?.title || prior.title || prior['screen-ref'],
      'slug-hint': kebab(prior._feature?.title || prior.title) || kebab(prior['screen-ref']),
      ...(prior._feature?.['slice-ref'] ? { 'slice-ref': prior._feature['slice-ref'] } : {}),
      'story-refs': prior['story-refs'] ?? [],
      priority: prior._feature?.priority ?? 'should',
      status: keepPrior ? (prior._feature?.status ?? prior.status ?? 'pending') : (removing ? 'pending' : 'blocked'),
      slug: prior._feature?.slug ?? '',
      branch: prior._feature?.branch ?? '',
      'parent-branch': prior._feature?.['parent-branch'] ?? '',
      'blocked-reason': keepPrior
        ? (prior._feature?.['blocked-reason'] ?? '')
        : (removing ? 'spec changed' : 'source screen removed from spec'),
      tasks: [blockedTask],
    })
  }
}

// 1.x: priority order. 2.0: the delivery plan's order is the build order — never re-sort it.
if (!sliceMode && !appendMode) features.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
const thisSpecId = specIdOf(specPath)
for (const feature of features) if (!feature['source-spec']) feature['source-spec'] = thisSpecId
adoptApprovedBoards()
if (!appendMode) appendedCount = features.length

const taskCount = features.reduce((n, f) => n + f.tasks.length, 0)
if (taskCount === 0) {
  console.error(`No buildable UI tasks derived from ${specPath} (no non-"wont" screens).`)
  process.exit(1)
}

const now = new Date().toISOString()
const rowSig = (list) => (list ?? []).map((feature) => `${feature.id}:${(feature.tasks ?? []).map((task) => `${task.id}@${task['screen-ref']}`).join(',')}`).join('|')
const rowsChanged = Boolean(existing && rowSig(existing.features) !== rowSig(features))
const front = {
  'checklist-version': sliceMode ? '1.2' : '1.1',
  'spec-ref': specPath,
  'prototype-ref': prototypeRef || existing?.['prototype-ref'] || '',
  generated: existing?.generated ?? now,
  updated: now,
  derived: now,
  features,
}
if (existing?.preflight) front.preflight = existing.preflight
if (existing?.approved && !rowsChanged) {
  front.approved = existing.approved
  if (existing['approved-spec-ref']) front['approved-spec-ref'] = existing['approved-spec-ref']
}

const counts = `kept ${keptCount}, appended ${appendedCount}, reopened ${reopenedCount}, adopted ${adoptedCount}`
const logLine = appendMode
  ? `- ${now} — checklist appended from ${specPath} (${counts})`
  : existing
    ? `- ${now} — checklist re-derived from ${specPath} (${features.length} features, ${taskCount} tasks, ${counts})`
    : `- ${now} — checklist generated from ${specPath} (${features.length} features, ${taskCount} tasks, ${counts})`

const priorBody = existing
  ? readFileSync(checklistPath, 'utf8').split(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)[1] ?? ''
  : `\n# Task Checklist — ${spec.metadata?.title ?? spec.metadata?.slug ?? ''}\n\n## Log\n`

const body = existing ? `${priorBody.trimEnd()}\n${logLine}\n` : `${priorBody}${logLine}\n`

const stamp = now.replace(/[:.]/g, '-')
if (!dryRun) {
  for (const file of archives) renameSync(file, file.replace(/\.json$/, `.${stamp}.stale.json`))
  mkdirSync(dirname(checklistPath), { recursive: true })
  writeAtomic(checklistPath, `---\n${stringify(front)}---\n${body}`)
  console.log(`OK: wrote ${checklistPath} (${features.length} features, ${taskCount} tasks)`)
} else {
  console.log(`DRY-RUN: would write ${checklistPath} (${features.length} features, ${taskCount} tasks)`)
  for (const file of archives) console.log(`would-archive: ${file}`)
}
console.log(`kept: ${keptCount} appended: ${appendedCount} reopened: ${reopenedCount} adopted: ${adoptedCount}`)
for (const feature of features) {
  const deps = (feature['depends-on'] ?? []).join(',')
  console.log(`- ${feature.id} [${feature.status}] ${feature['slice-ref'] ?? ''} ${feature.title}${deps ? ` depends-on ${deps}` : ''}`)
}
process.exit(0)
