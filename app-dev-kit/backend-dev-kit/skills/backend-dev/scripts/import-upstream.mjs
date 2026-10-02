#!/usr/bin/env node
// Scoped spec YAML → backend blackboard. One resource (1.x) or one delivery slice (2.0) per run.
// Usage: node import-upstream.mjs --spec <spec.md> --out <backend.md> [--slice-ref SL-001] [filters]
//        [--require-scoped] [--changes <changes.json>]
// --slice-ref reads {spec dir}/slices/{SL}.yaml (written by spec-dev-kit at publish); without the
// brief it filters the spec by the slice's refs. Explicit --*-refs still narrow the slice.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
const taskId = flag('task-id') === true ? '' : (flag('task-id') || '')
const prototypeRef = flag('prototype-ref') === true ? '' : (flag('prototype-ref') || '')
const entityRefs = listFlag('entity-refs')
const apiRefs = listFlag('api-refs')
const storyRefs = listFlag('story-refs')
const acRefs = listFlag('ac-refs')
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

if (!specPath || !outPath) {
  console.error('usage: node import-upstream.mjs --spec <spec.md> --out <backend.md> [--require-scoped]')
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

const raw = readFileSync(specPath, 'utf8')
const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
if (!match) {
  console.error('FATAL: no YAML front matter')
  process.exit(2)
}
const spec = parse(match[1])
const list = (v) => (Array.isArray(v) ? v : [])
const entities = list(spec.entities)
// One endpoint list; 1.x specs may split reads/writes into endpoints + mutations (dedupe by id).
const endpoints = [...new Map([
  ...list(spec['api-surface']?.endpoints),
  ...list(spec['api-surface']?.mutations),
].map((e) => [e?.id ?? `${e?.method} ${e?.path}`, e])).values()]
const stories = list(spec['user-stories'])
const acs = list(spec['acceptance-criteria'])

// 2.0 slice scope: the brief file when spec-dev-kit wrote one, else the slice's refs in the spec.
function loadSlice(ref) {
  if (!ref) return null
  const briefPath = join(dirname(specPath), 'slices', `${ref}.yaml`)
  if (existsSync(briefPath)) return parse(readFileSync(briefPath, 'utf8'))
  const slice = list(spec['delivery-plan']?.slices).find((s) => s?.id === ref)
  if (!slice) {
    console.error(`ERROR [SLICE_NOT_FOUND] ${ref} is not in delivery-plan.slices of ${specPath}`)
    process.exit(1)
  }
  const ids = new Set([...list(slice['entity-refs']), ...list(slice['api-refs'])])
  const touches = (refs) => list(refs).some((r) => ids.has(r))
  return {
    slice,
    'business-rules': list(spec['business-rules']).filter((b) => list(slice['rule-refs']).includes(b.id) || touches(b['applies-to'])),
    'state-machines': list(spec['state-machines']).filter((m) => list(slice['state-machine-refs']).includes(m.id) || ids.has(m.entity)),
    permissions: list(spec.permissions).filter((p) => list(slice['permission-refs']).includes(p.id) || touches(p.refs)),
    notifications: list(spec.notifications).filter((n) => list(slice['notification-refs']).includes(n.id)),
    'open-questions': list(spec['open-questions']).filter((q) => q.status !== 'resolved' && (list(q.affects).includes(ref) || touches(q.affects))),
  }
}
const brief = loadSlice(sliceRef)
const slice = brief?.slice ?? null

const isApp = spec.type === 'app' || entities.length > 1 || endpoints.length > 3
if (requireScoped && isApp && !taskId && !slice && entityRefs.length === 0 && apiRefs.length === 0) {
  console.error('ERROR [REQUIRE_SCOPED] type:app imported with no SLICE_REF / TASK_ID / ENTITY_REFS / API_REFS')
  process.exit(1)
}

const wantEntities = entityRefs.length ? entityRefs : list(slice?.['entity-refs'])
const wantApis = apiRefs.length ? apiRefs : list(slice?.['api-refs'])
const wantStories = storyRefs.length ? storyRefs : list(slice?.['story-refs'])
const keptApis = wantApis.length
  ? endpoints.filter((e) => wantApis.includes(e.id))
  : endpoints.filter((e) => entities.filter((ent) => !wantEntities.length || wantEntities.includes(ent.name)).some((ent) =>
    `${e.path ?? ''} ${e.description ?? ''}`.toLowerCase().includes(String(ent.name).toLowerCase())))
const keptEntities = wantEntities.length
  ? entities.filter((e) => wantEntities.includes(e.name))
  : apiRefs.length
    ? entities.filter((ent) => keptApis.some((e) => JSON.stringify(e).toLowerCase().includes(String(ent.name).toLowerCase())))
    : entities
// A scoped app run narrows stories instead of importing all of them: the endpoints' own
// story-refs (2.0), else stories that name a kept entity (1.x), else — last resort — every story.
function scopedStories() {
  const viaApi = stories.filter((s) => keptApis.some((e) => list(e['story-refs']).includes(s.id)))
  if (viaApi.length) return viaApi
  const names = keptEntities.map((e) => String(e.name).toLowerCase())
  const viaText = stories.filter((s) => names.some((n) => `${s['i-want'] ?? ''} ${s['so-that'] ?? ''}`.toLowerCase().includes(n)))
  if (viaText.length) return viaText
  console.error('WARN [STORIES_UNSCOPED] no story matched the scoped entities/endpoints — importing all stories')
  return stories
}
const keptStories = wantStories.length
  ? stories.filter((s) => wantStories.includes(s.id))
  : isApp && (taskId || entityRefs.length || apiRefs.length)
    ? scopedStories()
    : stories
const keptAcs = acRefs.length
  ? acs.filter((a) => acRefs.includes(a.id))
  : acs.filter((a) => keptStories.some((s) => s.id === a['story-ref']))
// Same ownership filter whatever the source (brief or spec): the backend builds what its slice
// lists; brief items that are only context (e.g. a rule of a screen's other endpoint) are dropped.
const keptNames = new Set(keptEntities.map((e) => e.name))
const keptApiIds = new Set(keptApis.map((e) => e.id))
const owns = (refs) => list(refs).some((r) => keptNames.has(r) || keptApiIds.has(r))
const source = (key) => list(brief?.[key] ?? spec[key])
const rules = source('business-rules').filter((b) => list(slice?.['rule-refs']).includes(b.id) || owns(b['applies-to']))
const machines = source('state-machines').filter((m) => keptNames.has(m.entity))
const permissions = source('permissions').filter((p) => list(slice?.['permission-refs']).includes(p.id) || owns(p.refs))
const notifications = slice ? source('notifications').filter((n) => list(slice['notification-refs']).includes(n.id)) : []
const openQuestions = brief ? list(brief['open-questions']) : []
const steps = list(slice?.steps).filter((s) => s.track === 'backend')

let protoHint = 'No prototype bound.'
if (prototypeRef && existsSync(join(prototypeRef, 'page-map.json'))) {
  protoHint = `page-map: ${join(prototypeRef, 'page-map.json')} (read by implementer; do not inline HTML)`
}

let fm = {}
if (existsSync(outPath)) {
  const existing = readFileSync(outPath, 'utf8')
  const fmMatch = existing.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) fm = parse(fmMatch[1]) ?? {}
}

const slug = fm.slug || ''
const priorStatus = fm.status ?? 'draft'
const localIds = [
  ...keptEntities.map((entity) => entity.name),
  ...keptApis.map((endpoint) => endpoint.id),
  ...keptStories.map((story) => story.id),
  ...keptAcs.map((ac) => ac.id),
]
const changed = changedIdSet(loadChanges(changesArg))
const overlap = [...new Set(localIds.filter(Boolean).map(String))].filter((id) => changed.has(id))
const reopen = priorStatus === 'done' && overlap.length > 0
const front = {
  slug,
  status: reopen ? 'approved' : priorStatus,
  created: fm.created ?? new Date().toISOString().slice(0, 10),
  branch: fm.branch ?? (slug ? `backend/${slug}` : ''),
  'upstream-spec': specPath,
  'task-id': taskId,
  'slice-ref': sliceRef,
  'entity-refs': keptEntities.map((e) => e.name),
  'api-refs': keptApis.map((e) => e.id),
  'prototype-ref': prototypeRef,
}
if (reopen) front['prior-branch'] = fm.branch ?? ''
else if (fm['prior-branch']) front['prior-branch'] = fm['prior-branch']
const changeSection = overlap.length > 0 && (reopen || fm['prior-branch'])
  ? `\n## Change request\n\nSpec changed. Edit the existing slice.\n\n${overlap.map((id) => `- ${id}`).join('\n')}\n`
  : ''

const acLines = keptAcs.length
  ? keptAcs.map((a) => `- ${a.id} (${a['story-ref']}${a.kind ? `, ${a.kind}` : ''}): Given ${a.given}; when ${a.when}; then ${a.then}`).join('\n')
  : '- (none imported)'
const model = keptEntities.length
  ? keptEntities.map((e) => {
    const fields = list(e.fields).map((f) => {
      const flags = [f.required ? 'required' : '', f.derived ? 'derived — computed, not stored' : '', f.unique ? 'unique' : ''].filter(Boolean)
      const values = list(f.values).length ? ` ∈ {${f.values.join(', ')}}` : ''
      return `  - ${f.name}: ${f.type}${values}${flags.length ? ` (${flags.join(', ')})` : ''}${f.description ? ` — ${f.description}` : ''}`
    }).join('\n')
    const rels = list(e.relationships).map((r) => `  - → ${r.entity} ${r.type}${r.via ? ` via ${r.via}` : ''}${r.description ? ` — ${r.description}` : ''}`).join('\n')
    return [`### ${e.name}`, e.description ?? '', e.retention ? `Retention: ${e.retention}` : '', fields, rels ? `Relationships:\n${rels}` : '']
      .filter(Boolean).join('\n')
  }).join('\n\n')
  : '- (none)'
const apiLines = keptApis.length
  ? keptApis.map((e) => {
    const head = `- ${e.id} ${e.method} ${e.path} auth=${e['auth-required'] ?? ''}${list(e.roles).length ? ` roles=${e.roles.join('|')}` : ''} — ${e.description ?? ''}`
    const req = e.request && Object.values(e.request).some((v) => v && Object.keys(v).length) ? `  - request: ${JSON.stringify(e.request)}` : ''
    const ok = e.response?.success ? `  - success: ${JSON.stringify(e.response.success)}` : ''
    const errs = list(e.response?.errors).map((x) => `  - error ${x.status}${x.code ? ` ${x.code}` : ''}: ${x.message ?? ''}${x.when ? ` (when ${x.when})` : ''}`)
    return [head, req, ok, ...errs].filter(Boolean).join('\n')
  }).join('\n')
  : '- (none)'
const ruleLines = rules.length
  ? rules.map((b) => `- ${b.id} ${b.name ?? ''}: ${b.rule}${b.params && Object.keys(b.params).length ? ` params=${JSON.stringify(b.params)}` : ''}${b['on-violation'] ? ` — on violation: ${b['on-violation']}` : ''}${list(b['ac-refs']).length ? ` [${b['ac-refs'].join(', ')}]` : ''}`).join('\n')
  : '- (none)'
const machineLines = machines.length
  ? machines.map((m) => [`### ${m.id} ${m.entity}.${m.field ?? 'status'} (initial ${m.initial})`,
    ...list(m.transitions).map((t) => `- ${t.from} → ${t.to}: ${t.trigger} [${t.actor ?? ''}${t.after ? `, after ${t.after}` : ''}]${list(t.guard).length ? ` guard ${t.guard.join(', ')}` : ''}${list(t.effects).length ? ` effects ${t.effects.join(', ')}` : ''}`)].join('\n')).join('\n\n')
  : '- (none)'
const permissionLines = permissions.length
  ? permissions.map((p) => `- ${p.id} ${p.action}: allow ${list(p.allow).join(', ') || '—'}${Object.entries(p.conditional ?? {}).map(([r, c]) => `; ${r} if ${c}`).join('')}${p['denied-behavior'] ? ` — denied: ${p['denied-behavior']}` : ''}`).join('\n')
  : '- (none)'
const notificationLines = notifications.length
  ? notifications.map((n) => `- ${n.id} ${n.event} → ${list(n.recipients).join(', ')} via ${list(n.channels).join(', ')}${n.mandatory ? ' (mandatory)' : ''}; ${n.timing ?? ''}${n.copy ? ` — "${n.copy}"` : ''}`).join('\n')
  : '- (none)'
const stepLines = steps.length
  ? steps.map((s, i) => `${i + 1}. ${s.do}${list(s.refs).length ? ` (${s.refs.join(', ')})` : ''}`).join('\n')
  : '- (no slice steps — derive the plan from the contract above)'
const nfr = spec['non-functional'] ?? {}
const nfrLines = ['security', 'performance', 'observability', 'scalability']
  .flatMap((k) => list(nfr[k]).map((v) => `- ${k}: ${v}`)).join('\n') || '- (none)'
const questionLines = openQuestions.map((q) => `- ${q.id}${q.blocking ? ' (BLOCKING)' : ''}: ${q.question}`).join('\n')

const body = `
# Backend increment — ${slice?.title || keptEntities.map((e) => e.name).join(', ') || slug}

## Request

${spec.metadata?.title ?? ''} — ${slice?.goal || spec.context?.goal || ''}

## Clarifications

## Acceptance Criteria

${acLines}

## Data Model

${model}

## API Contract

${apiLines}

## Business Rules

${ruleLines}

## State Machines

${machineLines}

## Permissions

${permissionLines}

## Notifications

${notificationLines}

## Non-functional

${nfrLines}

## Slice Steps

${stepLines}

## Contract Hints

${protoHint}

## Reuse Map

## Dependencies

## Build Plan

## Gate Log

## Human Review

## Decisions & Open Questions
${questionLines ? `\n${questionLines}\n` : ''}`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `---\n${stringify(front)}---\n${body}${changeSection}`)
console.log(`OK: wrote ${outPath}`)
process.exit(0)
