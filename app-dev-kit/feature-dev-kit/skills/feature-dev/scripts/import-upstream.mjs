#!/usr/bin/env node
// Deterministic mapper: spec-dev-kit YAML (+ optional html prototype) → feature blackboard.
// One feature per run (one screen, or several screens nested under that feature).
// Usage:
//   node import-upstream.mjs --spec <spec.md> --out <feature.md> [--slice-ref SL-001] [filters] [--require-scoped] [--changes <changes.json>]
// Spec 2.0: screens carry story-refs / api-refs / primary-entity. --slice-ref adds the slice goal,
// frontend steps, rules, notifications, done-when ACs, and the slice's api-refs.
// Spec 1.x: ACs and entities are matched to screens by keywords and component names.
// Exit 0 = wrote (or printed). Exit 1 = scoped-import failure. Exit 2 = usage/parse failure.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return undefined
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}
function listFlag(name) {
  const v = flag(name)
  if (!v || v === true) return []
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

const specPath = flag('spec')
const outPath = flag('out')
const requireScoped = Boolean(flag('require-scoped'))
const stdoutOnly = Boolean(flag('stdout-only'))
const featureId = flag('feature-id') === true ? '' : (flag('feature-id') || '')
const taskId = flag('task-id') === true ? '' : (flag('task-id') || '')
const taskIds = listFlag('task-ids')
const screenRef = flag('screen-ref') === true ? '' : (flag('screen-ref') || '')
const screenRefsArg = listFlag('screen-refs')
const slugArg = flag('slug') === true ? '' : (flag('slug') || '')
const prototypeRef = flag('prototype-ref') === true ? '' : (flag('prototype-ref') || '')
const storyRefsArg = listFlag('story-refs')
const acRefsArg = listFlag('ac-refs')
const entityRefsArg = listFlag('entity-refs')
const sliceRef = flag('slice-ref') === true ? '' : (flag('slice-ref') || '')
const changesArg = flag('changes')

function loadChanges(changesFlag) {
  if (!changesFlag || changesFlag === true) return null
  const changesPath = String(changesFlag).startsWith('/') ? String(changesFlag) : join(process.cwd(), String(changesFlag))
  if (!existsSync(changesPath)) {
    console.error(`FATAL: changes file not found: ${changesPath}`)
    process.exit(2)
  }
  return JSON.parse(readFileSync(changesPath, 'utf8'))
}

function changedIdSet(changes) {
  const ids = new Set()
  if (!changes || typeof changes !== 'object') return ids
  for (const bucket of Object.values(changes)) {
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) continue
    for (const list of [bucket.modified, bucket.removed]) {
      for (const id of list ?? []) if (id) ids.add(String(id))
    }
  }
  return ids
}

if (!specPath) {
  console.error('usage: node import-upstream.mjs --spec <spec.md> [--out <feature.md>] [--feature-id F-001] [--screen-refs SCR-001,SCR-002] [--task-ids T-001,T-002] [--require-scoped]')
  process.exit(2)
}

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

function readFrontmatter(path) {
  const raw = readFileSync(path, 'utf8')
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    console.error(`FATAL: no YAML front matter found in ${path}`)
    process.exit(2)
  }
  return { raw, fm: parse(match[1]), body: raw.slice(match[0].length) }
}

const { fm: spec } = readFrontmatter(specPath)
if (spec.status !== 'approved') {
  console.error(`ERROR [SPEC_NOT_APPROVED] ${specPath} status is "${spec.status ?? ''}" — publish the spec (status: approved) before /feature-dev`)
  process.exit(1)
}
const screens = spec['ui-surface']?.screens ?? []
const interactions = spec['ui-surface']?.interactions ?? []
const stories = spec['user-stories'] ?? []
const acs = spec['acceptance-criteria'] ?? []
const entities = spec.entities ?? []
const list = (v) => (Array.isArray(v) ? v : [])
// One endpoint list; 1.x specs may split reads/writes into endpoints + mutations (dedupe by id).
const endpoints = [...new Map([
  ...list(spec['api-surface']?.endpoints),
  ...list(spec['api-surface']?.mutations),
].map((e) => [e?.id ?? `${e?.method} ${e?.path}`, e])).values()]

// 2.0 slice: {spec dir}/slices/{SL}.yaml when spec-dev-kit wrote it, else the slice in the spec.
let slice = null
if (sliceRef) {
  const briefPath = join(dirname(specPath), 'slices', `${sliceRef}.yaml`)
  slice = existsSync(briefPath)
    ? parse(readFileSync(briefPath, 'utf8'))?.slice
    : list(spec['delivery-plan']?.slices).find((s) => s?.id === sliceRef)
  if (!slice) {
    console.error(`ERROR [SLICE_NOT_FOUND] ${sliceRef} is not in delivery-plan.slices of ${specPath}`)
    process.exit(1)
  }
}

const screenRefs = [...new Set([...screenRefsArg, ...(screenRef ? [screenRef] : [])])]
if (screenRefs.length === 0 && slice) screenRefs.push(...list(slice['screen-refs']))
const allTaskIds = [...new Set([...taskIds, ...(taskId ? [taskId] : [])])]

const selectedScreens = []
for (const ref of screenRefs) {
  const found = screens.find((s) => s.id === ref)
  if (!found) {
    console.error(`ERROR [SCREEN_MISSING] screen-ref "${ref}" not in ui-surface.screens[]`)
    process.exit(1)
  }
  selectedScreens.push(found)
}
if (selectedScreens.length === 0 && screens.length === 1) selectedScreens.push(screens[0])
const screen = selectedScreens[0] ?? null

const isApp = spec.type === 'app' || screens.length > 1
if (requireScoped && isApp && selectedScreens.length === 0) {
  console.error('ERROR [REQUIRE_SCOPED] type:app (or multiple screens) imported with no resolved screens — one /feature-dev run is one feature, not the whole app')
  process.exit(1)
}

function titleKeywords(s) {
  return (s.title ?? '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
}

function acsForScreen(s) {
  const keywords = titleKeywords(s)
  return acs.filter((ac) => {
    const viaInteraction = interactions.some(
      (i) => i['screen-ref'] === s.id
        && (ac.when?.includes(i.trigger) || ac.then?.includes(i.response)),
    )
    const text = `${ac.given ?? ''} ${ac.when ?? ''} ${ac.then ?? ''}`.toLowerCase()
    return viaInteraction || text.includes(String(s.id).toLowerCase()) || keywords.some((k) => text.includes(k))
  })
}

function derivedAcs() {
  const merged = []
  const seen = new Set()
  for (const s of selectedScreens) {
    for (const ac of acsForScreen(s)) {
      if (seen.has(ac.id)) continue
      seen.add(ac.id)
      merged.push(ac)
    }
  }
  return merged
}

// 2.0 screens name their stories; keep the slice's share of them when a slice is given.
const sliceStories = new Set(list(slice?.['story-refs']))
const screenStoryIds = [...new Set(selectedScreens.flatMap((s) => list(s['story-refs'])))]
  .filter((id) => !sliceStories.size || sliceStories.has(id))
const explicitScreenRefs = selectedScreens.some((s) => Array.isArray(s['story-refs']))

const filteredAcs = acRefsArg.length
  ? acs.filter((a) => acRefsArg.includes(a.id))
  : storyRefsArg.length
    ? acs.filter((a) => storyRefsArg.includes(a['story-ref']))
    : explicitScreenRefs
      ? acs.filter((a) => screenStoryIds.includes(a['story-ref']))
      : derivedAcs()
// done-when ACs are tests that must pass even when --ac-refs names a narrower set.
if (slice) {
  const have = new Set(filteredAcs.map((a) => a.id))
  for (const id of list(slice['done-when'])) {
    if (have.has(id)) continue
    const ac = acs.find((a) => a.id === id)
    if (!ac) continue
    filteredAcs.push(ac)
    have.add(id)
  }
}
const storyIds = storyRefsArg.length
  ? storyRefsArg
  : [...new Set(filteredAcs.map((a) => a['story-ref']).filter(Boolean))]
const filteredStories = stories.filter((s) => storyIds.includes(s.id))

function derivedEntities() {
  if (entityRefsArg.length) return entityRefsArg
  const primary = selectedScreens.map((s) => s['primary-entity']).filter(Boolean)
  if (primary.length) return [...new Set(primary)]
  const names = entities.map((e) => e.name)
  return names.filter((name) =>
    selectedScreens.some((s) => s.components?.some((c) => String(c).includes(name))),
  )
}
const entityNames = derivedEntities()
const filteredEntities = entities.filter((e) => entityNames.includes(e.name))

function mentionsEntity(blob, name) {
  return JSON.stringify(blob).includes(name)
}
const screenApiIds = new Set(selectedScreens.flatMap((s) => list(s['api-refs'])))
const sliceApiIds = new Set(list(slice?.['api-refs']))
const filteredEndpoints = selectedScreens.some((s) => Array.isArray(s['api-refs'])) || sliceApiIds.size
  ? endpoints.filter((ep) => screenApiIds.has(ep.id) || sliceApiIds.has(ep.id))
  : endpoints.filter((ep) =>
    entityNames.length === 0 ? false : entityNames.some((n) => mentionsEntity(ep, n)),
  )

// What the UI must surface: rule violation copy, status words, who sees which control, notices.
const keptIds = new Set([...entityNames, ...filteredEndpoints.map((e) => e.id), ...selectedScreens.map((s) => s.id)])
const touches = (refs) => list(refs).some((r) => keptIds.has(r))
const uiRules = list(spec['business-rules']).filter((b) => touches(b['applies-to']) || list(slice?.['rule-refs']).includes(b.id))
const uiMachines = list(spec['state-machines']).filter((m) => entityNames.includes(m.entity))
const uiPermissions = list(spec.permissions).filter((p) => touches(p.refs))
const effectIds = new Set(uiMachines.flatMap((m) => list(m.transitions).flatMap((t) => list(t.effects))))
const uiNotifications = list(spec.notifications).filter((n) => effectIds.has(n.id) || list(slice?.['notification-refs']).includes(n.id))
const glossary = list(spec.glossary)
const frontendSteps = list(slice?.steps).filter((s) => s.track === 'frontend')

function kebab(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ifPageExists(protoDir, id) {
  if (!protoDir || !id) return ''
  const rel = `pages/${id}.html`
  return existsSync(join(protoDir, rel)) ? rel : ''
}

function resolvePrototypePage(protoDir, s, ref) {
  if (!protoDir || !s) return ''

  const mapPath = join(protoDir, 'page-map.json')
  if (existsSync(mapPath) && ref) {
    try {
      const map = JSON.parse(readFileSync(mapPath, 'utf8'))
      const hit = ifPageExists(protoDir, map[ref])
      if (hit) return hit
    } catch {
      // fall through
    }
  }

  const readmePath = join(protoDir, 'README.md')
  if (existsSync(readmePath) && s.title) {
    const readme = readFileSync(readmePath, 'utf8')
    const re = new RegExp(`^[-*]\\s+([a-z0-9-]+):\\s+${escapeRe(String(s.title).trim())}\\s+[—-]`, 'mi')
    const m = readme.match(re)
    if (m) {
      const hit = ifPageExists(protoDir, m[1])
      if (hit) return hit
    }
  }

  const route = String(s.route ?? '').replace(/^\//, '')
  const parts = route.split('/').filter((p) => p && !p.startsWith(':'))
  const last = parts.at(-1) ?? ''
  const first = parts[0] ?? ''
  for (const id of [kebab(s.title), last, first]) {
    const hit = ifPageExists(protoDir, id)
    if (hit) return hit
  }
  return ''
}

const protoDir = prototypeRef || ''
const slug = slugArg || kebab(screen?.title) || spec.metadata?.slug || 'feature'
const title = selectedScreens.length > 1
  ? selectedScreens.map((s) => s.title).join(', ')
  : (screen?.title ?? spec.metadata?.title ?? slug)
const today = new Date().toISOString().slice(0, 10)

function acLine(ac) {
  return `Given ${ac.given}, when ${ac.when}, then ${ac.then}.`
}

const requestLines = [
  slice ? `Slice ${slice.id} — ${slice.title}: ${slice.goal ?? ''}` : '',
  selectedScreens.length
    ? selectedScreens.map((s) => `${s.title} (${s.route}).`).join('\n')
    : (spec.metadata?.title ?? ''),
  !slice && spec.context?.goal ? `Goal: ${spec.context.goal}` : '',
  filteredStories.length
    ? 'User stories:\n' + filteredStories.map((s) => `- As a ${s.as}, I want ${s['i-want']}, so that ${s['so-that']}.`).join('\n')
    : '',
  frontendSteps.length
    ? 'Slice steps (frontend, from the spec delivery plan):\n' + frontendSteps.map((s, i) => `${i + 1}. ${s.do}${list(s.refs).length ? ` (${s.refs.join(', ')})` : ''}`).join('\n')
    : '',
  list(slice?.['done-when']).length ? `Done when: ${slice['done-when'].join(', ')} pass.` : '',
].filter(Boolean).join('\n\n')

const acMarkdown = filteredAcs.length
  ? filteredAcs.map((ac, i) => `${i + 1}. [${ac.id}] ${acLine(ac)}`).join('\n')
  : '1. TBD: no acceptance criteria mapped to this screen-task'

function screenBlock(s) {
  const page = resolvePrototypePage(protoDir, s, s.id)
  const screenInteractions = interactions.filter((i) => i['screen-ref'] === s.id)
  return [
    `- screen-ref: ${s.id}`,
    `- title: ${s.title}`,
    `- route: ${s.route}`,
    s['page-type'] ? `- page-type: ${s['page-type']}` : '',
    s['primary-entity'] ? `- primary-entity: ${s['primary-entity']}` : '',
    list(s.roles).length ? `- roles: ${s.roles.join(', ')}` : '',
    `- states: ${(s.states ?? []).join(', ')}`,
    `- components: ${(s.components ?? []).join(', ')}`,
    s.notes ? `- notes: ${s.notes}` : '',
    page ? `- prototype-page: ${page}` : '',
    screenInteractions.length
      ? '- interactions:\n' + screenInteractions.map((i) => `  - ${i.trigger} → ${i.response}`).join('\n')
      : '',
  ].filter(Boolean).join('\n')
}

const uiMarkdown = selectedScreens.length
  ? selectedScreens.map(screenBlock).join('\n\n')
  : '<standalone feature — no ui-surface.screens[] row imported>'

function entityBlock(e) {
  const fields = (e.fields ?? []).slice(0, 12).map((f) => {
    const values = list(f.values).length ? ` /* ${f.values.join(' | ')} */` : ''
    return `${f.name}${f.required ? '' : '?'}: ${f.type}${values}${f.derived ? ' /* derived, read-only */' : ''}`
  }).join(', ')
  return `### ${e.name}\n${e.description ?? ''}\n\n\`${e.name}: { ${fields} }\``
}

function endpointLine(ep) {
  const errors = list(ep.response?.errors).map((x) => `${x.status}${x.code ? ` ${x.code}` : ''}: "${x.message ?? ''}"`)
  return `- ${ep.method} ${ep.path} (${ep.id})${list(ep.roles).length ? ` [${ep.roles.join(', ')}]` : ''} — ${ep.description ?? ''}`
    + (errors.length ? `\n  - errors: ${errors.join('; ')}` : '')
}

const apiMarkdown = [
  filteredEntities.map(entityBlock).join('\n\n'),
  filteredEndpoints.length
    ? '### Endpoints\n' + filteredEndpoints.map(endpointLine).join('\n')
    : '',
  uiMachines.length
    ? '### Status lifecycle\n' + uiMachines.map((m) => `- ${m.entity}.${m.field ?? 'status'} (${m.id}): ${list(m.transitions).map((t) => `${t.from}→${t.to} on "${t.trigger}"`).join('; ')}`).join('\n')
    : '',
  uiRules.length
    ? '### Rules the UI must surface\n' + uiRules.map((b) => `- ${b.id}: ${b.rule}${b['on-violation'] ? ` — show: ${b['on-violation']}` : ''}`).join('\n')
    : '',
  uiPermissions.length
    ? '### Permissions (hide or disable controls for other roles)\n' + uiPermissions.map((p) => `- ${p.id} ${p.action}: ${list(p.allow).join(', ') || '—'}${Object.entries(p.conditional ?? {}).map(([r, c]) => `; ${r} if ${c}`).join('')}`).join('\n')
    : '',
  uiNotifications.length
    ? '### Notifications (copy)\n' + uiNotifications.map((n) => `- ${n.id} ${n.event} → ${list(n.recipients).join(', ')}: "${n.copy ?? ''}"`).join('\n')
    : '',
  glossary.length
    ? '### Glossary (use these words in copy)\n' + glossary.map((g) => `- ${g.term}: ${g.meaning}`).join('\n')
    : '',
].filter(Boolean).join('\n\n') || '<no entities mapped to this screen-task>'

const compact = [
  `SLUG: ${slug}`,
  `TITLE: ${title}`,
  `FEATURE_ID: ${featureId || '(none)'}`,
  `TASK_ID: ${allTaskIds.join(', ') || '(none)'}`,
  `SLICE_REF: ${sliceRef || '(none)'}`,
  `SCREEN_REF: ${selectedScreens.map((s) => s.id).join(', ') || '(none)'}`,
  `PROTOTYPE_PAGE: ${selectedScreens.map((s) => resolvePrototypePage(protoDir, s, s.id)).filter(Boolean).join(', ') || '(none)'}`,
  `STORIES: ${filteredStories.map((s) => s.id).join(', ') || '(none)'}`,
  `ACS: ${filteredAcs.map((a) => a.id).join(', ') || '(none)'}`,
  `ENTITIES: ${filteredEntities.map((e) => e.name).join(', ') || '(none)'}`,
  `SCREENS_IMPORTED: ${selectedScreens.length}`,
].join('\n')

if (stdoutOnly && !outPath) {
  console.log(compact)
  process.exit(0)
}

if (!outPath) {
  console.error('FATAL: --out <feature.md> is required unless --stdout-only')
  process.exit(2)
}

const kitDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = join(kitDir, 'templates', 'feature-spec.md')
const hadBoard = existsSync(outPath)
let board = hadBoard
  ? readFileSync(outPath, 'utf8')
  : existsSync(templatePath)
    ? readFileSync(templatePath, 'utf8')
    : ''

if (!board) {
  console.error('FATAL: no --out file and no templates/feature-spec.md')
  process.exit(2)
}

function replaceFm(key, value) {
  const re = new RegExp(`^${key}:\\s*.*$`, 'm')
  const line = `${key}: ${value}`
  if (re.test(board)) board = board.replace(re, line)
  else board = board.replace(/^---\r?\n/, `---\n${line}\n`)
}

function replaceSection(heading, content) {
  const re = new RegExp(`(## ${heading}\\n)([\\s\\S]*?)(?=\\n## |$)`)
  if (!re.test(board)) {
    board = board.trimEnd() + `\n\n## ${heading}\n\n${content}\n`
    return
  }
  board = board.replace(re, `$1\n${content}\n`)
}

replaceFm('slug', slug)
replaceFm('created', today)
replaceFm('upstream-spec', specPath)
replaceFm('feature-id', featureId || 'none')
replaceFm('task-id', allTaskIds.join(',') || 'none')
replaceFm('screen-ref', selectedScreens.map((s) => s.id).join(',') || 'none')
replaceFm('slice-ref', sliceRef || 'none')
replaceFm('prototype-ref', protoDir || 'none')
board = board.replace(/# Feature: <name>/, `# Feature: ${title}`)
board = board.replace(/<feature-slug>/g, slug)

replaceSection('Request', requestLines || slug)
replaceSection('Acceptance Criteria', acMarkdown)
replaceSection('UI Surface', uiMarkdown)
replaceSection('API Contract / Data Model', apiMarkdown)

function fmValue(key) {
  const match = board.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : ''
}

const priorStatus = hadBoard ? fmValue('status') : ''
const localIds = [
  ...selectedScreens.map((screen) => screen.id),
  ...filteredEntities.map((entity) => entity.name),
  ...filteredStories.map((story) => story.id),
  ...filteredAcs.map((ac) => ac.id),
  ...filteredEndpoints.map((endpoint) => endpoint.id),
]
const changed = changedIdSet(loadChanges(changesArg))
const overlap = [...new Set(localIds.filter(Boolean).map(String))].filter((id) => changed.has(id))
const reopen = priorStatus === 'done' && overlap.length > 0
if (reopen || (hadBoard && fmValue('prior-branch') && overlap.length > 0)) {
  if (reopen) {
    replaceFm('status', 'approved')
    replaceFm('prior-branch', fmValue('branch') || 'none')
  }
  replaceSection('Change request', `Spec changed. Edit the existing slice.\n\n${overlap.map((id) => `- ${id}`).join('\n')}`)
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, board, 'utf8')
console.log(`OK: wrote ${outPath}`)
console.log(compact)
process.exit(0)
