#!/usr/bin/env node
// Scoped spec YAML → agent blackboard. One agent-surface row per run.
// Usage: node import-upstream.mjs --spec <spec.md> --out <agent.md> [--slice-ref SL-001] [filters]
//        [--require-scoped] [--changes <changes.json>]
// --slice-ref (spec 2.0) scopes stories/ACs to the slice and adds its agent steps; the agent is
// --agent-ref, else the first AGT id in the slice's agent-refs.

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
const agentRef = flag('agent-ref') === true ? '' : (flag('agent-ref') || '')
const prototypeRef = flag('prototype-ref') === true ? '' : (flag('prototype-ref') || '')
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
  console.error('usage: node import-upstream.mjs --spec <spec.md> --out <agent.md> [--require-scoped]')
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
const agents = list(spec['agent-surface']?.agents)
const tools = list(spec['agent-surface']?.tools)
const kbs = list(spec['agent-surface']?.['knowledge-bases'])
const stories = list(spec['user-stories'])
const acs = list(spec['acceptance-criteria'])
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
const sliceAgent = list(slice?.['agent-refs']).find((ref) => /^AGT-/.test(ref)) ?? ''

if (requireScoped && agents.length > 1 && !agentRef && !taskId && !sliceAgent) {
  console.error('ERROR [REQUIRE_SCOPED] multiple agents imported with no AGENT_REF / TASK_ID / SLICE_REF')
  process.exit(1)
}

const wantAgent = agentRef || sliceAgent
const keptAgent = wantAgent
  ? agents.find((a) => a.id === wantAgent)
  : agents[0]
const keptTools = tools.filter((t) => list(keptAgent?.['tool-refs']).includes(t.id))
const keptKbs = kbs.filter((k) => list(keptAgent?.['knowledge-base-refs']).includes(k.id))
const wantStories = storyRefs.length ? storyRefs : list(slice?.['story-refs'])
const keptStories = wantStories.length
  ? stories.filter((s) => wantStories.includes(s.id))
  : stories
const keptAcs = acRefs.length
  ? acs.filter((a) => acRefs.includes(a.id))
  : acs.filter((a) => keptStories.some((s) => s.id === a['story-ref']))

let protoHint = 'No prototype bound.'
if (prototypeRef && existsSync(join(prototypeRef, 'page-map.json'))) {
  protoHint = `page-map: ${join(prototypeRef, 'page-map.json')} (chat-page hint only; do not inline HTML)`
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
  keptAgent?.id,
  ...(keptAgent?.['tool-refs'] ?? []),
  ...keptTools.map((tool) => tool.id),
  ...keptTools.map((tool) => tool['api-ref']),
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
  branch: fm.branch ?? (slug ? `agent/${slug}` : ''),
  'upstream-spec': specPath,
  'task-id': taskId,
  'slice-ref': sliceRef,
  'agent-ref': keptAgent?.id ?? wantAgent,
  'prototype-ref': prototypeRef,
}
if (reopen) front['prior-branch'] = fm.branch ?? ''
else if (fm['prior-branch']) front['prior-branch'] = fm['prior-branch']
const changeSection = overlap.length > 0 && (reopen || fm['prior-branch'])
  ? `\n## Change request\n\nSpec changed. Edit the existing slice.\n\n${overlap.map((id) => `- ${id}`).join('\n')}\n`
  : ''

const acLines = keptAcs.length
  ? keptAcs.map((a) => `- ${a.id} (${a['story-ref']}): Given ${a.given}; when ${a.when}; then ${a.then}`).join('\n')
  : '- (none imported)'
function toolLine(tool) {
  const endpoint = endpoints.find((item) => item.id === tool['api-ref'])
  const contract = endpoint
    ? ` ${endpoint.method ?? ''} ${endpoint.path ?? ''} request=${JSON.stringify(endpoint.request ?? {})} response=${JSON.stringify(endpoint.response ?? {})}`
    : ''
  return `- ${tool.id} ${tool.name} api-ref=${tool['api-ref'] ?? ''}${contract} — ${tool.description ?? ''}`
}
const toolLines = keptTools.length
  ? keptTools.map(toolLine).join('\n')
  : '- (none)'
const kbLines = keptKbs.length
  ? keptKbs.map((k) => `- ${k.id} ${k.name} retrieval=${k.retrieval ?? ''} source=${k.source ?? ''}`).join('\n')
  : '- (none)'
// Rules and permissions that guard the tools' endpoints — the agent must respect them too.
const toolApis = new Set(keptTools.map((t) => t['api-ref']).filter(Boolean))
const ruleLines = list(spec['business-rules'])
  .filter((b) => list(b['applies-to']).some((r) => toolApis.has(r)) || list(slice?.['rule-refs']).includes(b.id))
  .map((b) => `- ${b.id} ${b.name ?? ''}: ${b.rule}${b['on-violation'] ? ` — on violation: ${b['on-violation']}` : ''}`)
const permissionLines = list(spec.permissions)
  .filter((p) => list(p.refs).some((r) => toolApis.has(r)))
  .map((p) => `- ${p.id} ${p.action}: allow ${list(p.allow).join(', ') || '—'}${Object.entries(p.conditional ?? {}).map(([r, c]) => `; ${r} if ${c}`).join('')}`)
const stepLines = list(slice?.steps).filter((s) => s.track === 'agent')
  .map((s, i) => `${i + 1}. ${s.do}${list(s.refs).length ? ` (${s.refs.join(', ')})` : ''}`)
const guardrails = [...ruleLines, ...permissionLines].join('\n') || '- (none)'

const body = `
# Agent increment — ${keptAgent?.name ?? slug}

## Request

${spec.metadata?.title ?? ''} — ${spec.context?.goal ?? ''}

## Clarifications

## Acceptance Criteria

${acLines}

## Agent Contract

- id: ${keptAgent?.id ?? ''}
- name: ${keptAgent?.name ?? ''}
- kind: ${keptAgent?.kind ?? ''}
- runtime: ${keptAgent?.runtime ?? ''}
- embed: ${keptAgent?.embed ?? 'none'}
- description: ${keptAgent?.description ?? ''}

### Tools

${toolLines}

### Knowledge bases

${kbLines}

### Rules and permissions on tool endpoints

${guardrails}

## Slice Steps

${stepLines.join('\n') || '- (no slice steps — derive the plan from the contract above)'}

## Contract Hints

${protoHint}

## Architecture

## Dependencies

## Build Plan

## Eval Plan

## Gate Log

## Human Review

## Decisions & Open Questions
`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `---\n${stringify(front)}---\n${body}${changeSection}`)
console.log(`OK: wrote ${outPath}`)
process.exit(0)
