// Shared helpers for continue / merge / archive / revert / validate / views. Not a CLI.

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

// Every id prefix the spec uses. nextIds() reports the next free number for each.
export const ID_KINDS = [
  'US', 'AC', 'SCR', 'INT', 'API', 'AGT', 'TOOL', 'KB',
  'REQ', 'KPI', 'PERM', 'BR', 'SM', 'NTF', 'SL',
  'RISK', 'ASSM', 'Q', 'DEC',
]
const ID_RE = new RegExp(`^(${ID_KINDS.join('|')})-(\\d+)$`)

export async function loadYaml() {
  const mod = await import('yaml')
  const parse = mod.parse ?? mod.default?.parse
  const stringify = mod.stringify ?? mod.default?.stringify
  if (typeof parse !== 'function' || typeof stringify !== 'function') {
    console.error('FATAL: the "yaml" package is not installed in this plugin directory. Run npm install from the plugin root.')
    process.exit(2)
  }
  return { parse, stringify }
}

export function flag(args, name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}

export function rel(root, abs) {
  return relative(root, abs).split('\\').join('/')
}

export function splitFront(raw, parse) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return null
  return { fm: parse(match[1]), body: raw.slice(match[0].length) }
}

export function readSpec(path, parse) {
  const split = splitFront(readFileSync(path, 'utf8'), parse)
  if (!split) {
    console.error(`FATAL: no YAML front matter in ${path}`)
    process.exit(2)
  }
  return split
}

// aliasDuplicateObjects: false — never emit &anchors / *aliases when one object appears twice.
export function writeSpec(path, fm, body, stringify) {
  const yamlText = stringify(fm, { lineWidth: 0, aliasDuplicateObjects: false })
  const markdown = body.startsWith('\n') || body === '' ? body : `\n${body}`
  return `---\n${yamlText}---\n${markdown.endsWith('\n') ? markdown : `${markdown}\n`}`
}

export function isV2(fm) {
  return /^2\./.test(String(fm?.['spec-version'] ?? ''))
}

// One endpoint list. 1.x specs may still carry api-surface.mutations; fold them in, first id wins.
export function endpointsOf(fm) {
  const api = fm?.['api-surface'] ?? {}
  const seen = new Set()
  const out = []
  for (const item of [...(api.endpoints ?? []), ...(api.mutations ?? [])]) {
    const key = item?.id ?? `${item?.method} ${item?.path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function bump(maxes, id) {
  const match = String(id ?? '').match(ID_RE)
  if (!match) return
  maxes[match[1]] = Math.max(maxes[match[1]] ?? 0, Number(match[2]))
}

function walk(node, maxes) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, maxes)
    return
  }
  if (!node || typeof node !== 'object') return
  if (typeof node.id === 'string') bump(maxes, node.id)
  for (const value of Object.values(node)) walk(value, maxes)
}

export function nextIds(fm) {
  const maxes = {}
  walk(fm, maxes)
  const next = {}
  for (const kind of ID_KINDS) next[kind] = (maxes[kind] ?? 0) + 1
  return next
}

export function screenIndex(fm) {
  const names = (fm.entities ?? []).map((entity) => entity.name).filter(Boolean)
  return (fm['ui-surface']?.screens ?? []).map((screen) => {
    const text = `${screen.title ?? ''} ${screen.notes ?? ''}`
    return {
      id: screen.id,
      title: screen.title ?? '',
      route: screen.route ?? '',
      entity: screen['primary-entity'] || names.find((name) => text.includes(name)) || '',
    }
  })
}

export function idsOf(fm, key) {
  const list = key === 'screens'
    ? (fm['ui-surface']?.screens ?? [])
    : (fm['user-stories'] ?? [])
  return list.map((item) => item.id).filter(Boolean)
}

// Every addressable item: [kind-label, list]. Used by validate, lookup, and views.
export function sectionsOf(fm) {
  const ui = fm['ui-surface'] ?? {}
  const agent = fm['agent-surface'] ?? {}
  return [
    ['requirement', fm.requirements],
    ['success-metric', fm.context?.['success-metrics']],
    ['permission', fm.permissions],
    ['business-rule', fm['business-rules']],
    ['state-machine', fm['state-machines']],
    ['user-story', fm['user-stories']],
    ['acceptance-criterion', fm['acceptance-criteria']],
    ['endpoint', endpointsOf(fm)],
    ['agent', agent.agents],
    ['tool', agent.tools],
    ['knowledge-base', agent['knowledge-bases']],
    ['screen', ui.screens],
    ['interaction', ui.interactions],
    ['notification', fm.notifications],
    ['slice', fm['delivery-plan']?.slices],
    ['risk', fm.risks],
    ['assumption', fm.assumptions],
    ['open-question', fm['open-questions']],
    ['decision', fm.traceability?.decisions],
  ].map(([kind, list]) => [kind, Array.isArray(list) ? list : []])
}

// id → { kind, item }, plus entity and role name maps.
export function indexSpec(fm) {
  const ids = new Map()
  const duplicates = []
  for (const [kind, list] of sectionsOf(fm)) {
    for (const item of list) {
      const id = item?.id
      if (typeof id !== 'string' || !id) continue
      if (ids.has(id)) duplicates.push(id)
      else ids.set(id, { kind, item })
    }
  }
  const entities = new Map((fm.entities ?? []).filter((e) => e?.name).map((e) => [e.name, e]))
  const roles = new Map((fm.roles ?? []).filter((r) => r?.name).map((r) => [r.name, r]))
  return { ids, entities, roles, duplicates }
}

// Strip "(lender)"-style qualifiers so "Resident (lender)" resolves to role "Resident".
export function roleName(text) {
  return String(text ?? '').replace(/\s*\(.*\)\s*$/, '').trim()
}

export const BRIEF_ENVELOPE = 'app-dev-kit/slice-brief/v1'

// Everything one delivery slice needs, expanded from its refs. Written to slices/SL-NNN.yaml at
// publish so build kits read one file instead of re-deriving scope from the whole spec.
export function sliceBrief(fm, slice, specPath = '') {
  const list = (v) => (Array.isArray(v) ? v : [])
  const has = (set, values) => list(values).some((v) => set.has(v))
  const ui = fm['ui-surface'] ?? {}
  const agent = fm['agent-surface'] ?? {}
  const endpoints = endpointsOf(fm)
  const slices = list(fm['delivery-plan']?.slices)

  const storyIds = new Set(list(slice['story-refs']))
  const doneWhen = new Set(list(slice['done-when']))
  const acs = list(fm['acceptance-criteria']).filter((ac) => storyIds.has(ac?.['story-ref']) || doneWhen.has(ac?.id))

  const screenIds = new Set(list(slice['screen-refs']))
  const screens = list(ui.screens).filter((s) => screenIds.has(s?.id))
  const interactions = list(ui.interactions).filter((i) => screenIds.has(i?.['screen-ref']))

  const agentRefs = new Set(list(slice['agent-refs']))
  const agents = list(agent.agents).filter((a) => agentRefs.has(a?.id))
  const toolIds = new Set([...agentRefs, ...agents.flatMap((a) => list(a?.['tool-refs']))])
  const kbIds = new Set([...agentRefs, ...agents.flatMap((a) => list(a?.['knowledge-base-refs']))])
  const tools = list(agent.tools).filter((t) => toolIds.has(t?.id))
  const kbs = list(agent['knowledge-bases']).filter((k) => kbIds.has(k?.id))

  const apiIds = new Set([
    ...list(slice['api-refs']),
    ...screens.flatMap((s) => list(s?.['api-refs'])),
    ...tools.map((t) => t?.['api-ref']).filter(Boolean),
  ])
  const apis = endpoints.filter((e) => apiIds.has(e?.id))

  const entityNames = new Set([
    ...list(slice['entity-refs']),
    ...screens.map((s) => s?.['primary-entity']).filter(Boolean),
  ])
  const entities = list(fm.entities).filter((e) => entityNames.has(e?.name))

  const smIds = new Set(list(slice['state-machine-refs']))
  const machines = list(fm['state-machines']).filter((m) => smIds.has(m?.id) || entityNames.has(m?.entity))
  const guardIds = new Set(machines.flatMap((m) => list(m?.transitions).flatMap((t) => [...list(t?.guard), ...list(t?.effects)])))

  const ruleIds = new Set(list(slice['rule-refs']))
  const rules = list(fm['business-rules']).filter((b) => ruleIds.has(b?.id) || guardIds.has(b?.id)
    || has(entityNames, b?.['applies-to']) || has(apiIds, b?.['applies-to']))

  const ntfIds = new Set([...list(slice['notification-refs']), ...guardIds])
  const notifications = list(fm.notifications).filter((n) => ntfIds.has(n?.id))

  const permIds = new Set(list(slice['permission-refs']))
  const permissions = list(fm.permissions).filter((p) => permIds.has(p?.id) || has(apiIds, p?.refs) || has(screenIds, p?.refs))

  const kept = new Set([
    slice.id, ...storyIds, ...acs.map((a) => a.id), ...screenIds, ...interactions.map((i) => i.id),
    ...apiIds, ...entityNames, ...machines.map((m) => m.id), ...rules.map((r) => r.id),
    ...notifications.map((n) => n.id), ...permissions.map((p) => p.id),
    ...agents.map((a) => a.id), ...tools.map((t) => t.id), ...kbs.map((k) => k.id),
  ])
  const touching = (items) => list(items).filter((x) => has(kept, x?.affects))

  return {
    brief: BRIEF_ENVELOPE,
    spec: specPath,
    'spec-version': String(fm['spec-version'] ?? ''),
    slice,
    'depends-on': slices
      .filter((s) => list(slice['depends-on']).includes(s?.id))
      .map((s) => ({ id: s.id, title: s.title, goal: s.goal })),
    context: {
      title: fm.metadata?.title ?? '',
      goal: fm.context?.goal ?? '',
      constraints: list(fm.context?.constraints),
      'non-goals': list(fm.context?.['non-goals']),
    },
    roles: list(fm.roles),
    glossary: list(fm.glossary),
    'user-stories': list(fm['user-stories']).filter((s) => storyIds.has(s?.id)),
    'acceptance-criteria': acs,
    requirements: list(fm.requirements).filter((r) => has(kept, r?.['covered-by'])),
    entities,
    'state-machines': machines,
    'business-rules': rules,
    permissions,
    endpoints: apis,
    screens,
    interactions,
    notifications,
    agents,
    tools,
    'knowledge-bases': kbs,
    'non-functional': fm['non-functional'] ?? {},
    boundaries: fm.boundaries ?? {},
    'open-questions': touching(fm['open-questions']).filter((q) => q?.status !== 'resolved'),
    assumptions: touching(fm.assumptions),
    decisions: touching(fm.traceability?.decisions),
  }
}
