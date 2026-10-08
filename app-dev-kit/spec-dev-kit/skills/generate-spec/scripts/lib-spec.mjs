// Shared helpers for continue / archive / revert / validate / views. Not a CLI.

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'

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

export function maxNextIds(...nexts) {
  const out = {}
  for (const kind of ID_KINDS) {
    out[kind] = Math.max(1, ...nexts.map((n) => Number(n?.[kind] ?? 1)))
  }
  return out
}

export function specIdOf(specPath) {
  return basename(dirname(specPath))
}

export function normalizeRequirement(r) {
  if (!r || typeof r !== 'object') return r
  return {
    ...r,
    kind: r.kind || 'behavior',
    source: r.source || 'stated',
    'source-ref': r['source-ref'] || r.ref || '',
    priority: r.priority || 'must',
    scope: r.scope || 'in',
    'covered-by': Array.isArray(r['covered-by']) ? r['covered-by'] : [],
  }
}

export function loadRequirements(specPath, fm, parse) {
  const list = (v) => (Array.isArray(v) ? v : [])
  const file = fm?.metadata?.['requirements-file']
  if (file && parse) {
    const abs = isAbsolute(file) ? file : join(dirname(specPath), file)
    if (existsSync(abs)) {
      const parsed = parse(readFileSync(abs, 'utf8'))
      return list(parsed?.requirements ?? parsed).map(normalizeRequirement)
    }
  }
  return list(fm?.requirements).map(normalizeRequirement)
}

// Arrays of objects are one JSON line each. Callers omit default fields before writing.
export function stringifyCompact(value) {
  const write = (node, indent) => {
    const pad = ' '.repeat(indent)
    const inner = ' '.repeat(indent + 2)
    if (Array.isArray(node)) {
      if (!node.length) return '[]'
      const objects = node.every((item) => item && typeof item === 'object' && !Array.isArray(item))
      const body = node.map((item) => `${inner}${objects ? JSON.stringify(item) : write(item, indent + 2)}`).join(',\n')
      return `[\n${body}\n${pad}]`
    }
    if (node && typeof node === 'object') {
      const keys = Object.keys(node)
      if (!keys.length) return '{}'
      return `{\n${keys.map((key) => `${inner}${JSON.stringify(key)}: ${write(node[key], indent + 2)}`).join(',\n')}\n${pad}}`
    }
    return JSON.stringify(node)
  }
  return `${write(value, 0)}\n`
}

export function attachRequirements(specPath, fm, parse) {
  fm.requirements = loadRequirements(specPath, fm, parse)
  return fm
}

export function loadSpecChain(specPath, parse, root = process.cwd()) {
  const specs = []
  const seen = new Set()
  let path = specPath
  while (path && !seen.has(path)) {
    seen.add(path)
    const abs = isAbsolute(path) ? path : join(root, path)
    if (!existsSync(abs)) break
    const { fm, body } = readSpec(abs, parse)
    attachRequirements(abs, fm, parse)
    specs.push({ path: abs, specId: specIdOf(abs), fm, body })
    const parent = fm.metadata?.['parent-spec']
    if (!parent) break
    path = parent
  }
  return specs
}

export function indexSpecChain(specs) {
  const ids = new Map()
  const entities = new Map()
  const roles = new Map()
  const duplicates = []
  for (const { fm } of [...specs].reverse()) {
    const idx = indexSpec(fm)
    for (const [id, value] of idx.ids) ids.set(id, value)
    for (const [name, entity] of idx.entities) entities.set(name, entity)
    for (const [name, role] of idx.roles) roles.set(name, role)
    duplicates.push(...idx.duplicates)
  }
  return { ids, entities, roles, duplicates }
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
export function sliceBrief(fm, slice, specPath = '', opts = {}) {
  const list = (v) => (Array.isArray(v) ? v : [])
  const has = (set, values) => list(values).some((v) => set.has(v))
  const parents = list(opts.parents)
  const tag = (item, specId) => (item && specId ? { ...item, 'from-spec': specId } : item)
  const pull = (have, ids, pick) => {
    const out = [...have]
    const seen = new Set(out.map((item) => item?.id ?? item?.name).filter(Boolean))
    for (const id of ids) {
      if (seen.has(id)) continue
      for (const parent of parents) {
        const item = pick(parent.fm, id)
        if (item) {
          out.push(tag(item, parent.specId))
          seen.add(id)
          break
        }
      }
    }
    return out
  }
  const ui = fm['ui-surface'] ?? {}
  const agent = fm['agent-surface'] ?? {}
  const endpoints = endpointsOf(fm)
  const slices = list(fm['delivery-plan']?.slices)
  const reqs = list(opts.requirements ?? fm.requirements)

  const storyIds = new Set(list(slice['story-refs']))
  const doneWhen = new Set(list(slice['done-when']))
  let acs = list(fm['acceptance-criteria']).filter((ac) => storyIds.has(ac?.['story-ref']) || doneWhen.has(ac?.id))
  acs = pull(acs, [...storyIds, ...doneWhen], (pfm, id) => list(pfm['acceptance-criteria']).find((ac) => ac?.id === id || ac?.['story-ref'] === id))

  const screenIds = new Set(list(slice['screen-refs']))
  let screens = list(ui.screens).filter((s) => screenIds.has(s?.id))
  screens = pull(screens, screenIds, (pfm, id) => list(pfm['ui-surface']?.screens).find((s) => s?.id === id))
  let interactions = list(ui.interactions).filter((i) => screenIds.has(i?.['screen-ref']))
  interactions = pull(interactions, screenIds, (pfm, id) => list(pfm['ui-surface']?.interactions).find((i) => i?.['screen-ref'] === id))

  const agentRefs = new Set(list(slice['agent-refs']))
  let agents = list(agent.agents).filter((a) => agentRefs.has(a?.id))
  agents = pull(agents, agentRefs, (pfm, id) => list(pfm['agent-surface']?.agents).find((a) => a?.id === id))
  const toolIds = new Set([...agentRefs, ...agents.flatMap((a) => list(a?.['tool-refs']))])
  const kbIds = new Set([...agentRefs, ...agents.flatMap((a) => list(a?.['knowledge-base-refs']))])
  let tools = list(agent.tools).filter((t) => toolIds.has(t?.id))
  tools = pull(tools, toolIds, (pfm, id) => list(pfm['agent-surface']?.tools).find((t) => t?.id === id))
  let kbs = list(agent['knowledge-bases']).filter((k) => kbIds.has(k?.id))
  kbs = pull(kbs, kbIds, (pfm, id) => list(pfm['agent-surface']?.['knowledge-bases']).find((k) => k?.id === id))

  const apiIds = new Set([
    ...list(slice['api-refs']),
    ...screens.flatMap((s) => list(s?.['api-refs'])),
    ...tools.map((t) => t?.['api-ref']).filter(Boolean),
  ])
  let apis = endpoints.filter((e) => apiIds.has(e?.id))
  apis = pull(apis, apiIds, (pfm, id) => endpointsOf(pfm).find((e) => e?.id === id))

  const entityNames = new Set([
    ...list(slice['entity-refs']),
    ...screens.map((s) => s?.['primary-entity']).filter(Boolean),
  ])
  let entities = list(fm.entities).filter((e) => entityNames.has(e?.name))
  entities = pull(entities, entityNames, (pfm, id) => list(pfm.entities).find((e) => e?.name === id))

  const smIds = new Set(list(slice['state-machine-refs']))
  let machines = list(fm['state-machines']).filter((m) => smIds.has(m?.id) || entityNames.has(m?.entity))
  machines = pull(machines, smIds, (pfm, id) => list(pfm['state-machines']).find((m) => m?.id === id))
  const guardIds = new Set(machines.flatMap((m) => list(m?.transitions).flatMap((t) => [...list(t?.guard), ...list(t?.effects)])))

  const sentence = (t) => {
    const text = String(t ?? '').trim()
    const cut = text.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? text
    return cut.length > 140 ? `${cut.slice(0, 137)}…` : cut
  }
  const ruleIds = new Set(list(slice['rule-refs']))
  let rules = list(fm['business-rules']).filter((b) => ruleIds.has(b?.id) || guardIds.has(b?.id))
  rules = pull(rules, ruleIds, (pfm, id) => list(pfm['business-rules']).find((b) => b?.id === id))

  const ntfIds = new Set([...list(slice['notification-refs']), ...guardIds])
  let notifications = list(fm.notifications).filter((n) => ntfIds.has(n?.id))
  notifications = pull(notifications, ntfIds, (pfm, id) => list(pfm.notifications).find((n) => n?.id === id))

  const permIds = new Set(list(slice['permission-refs']))
  let permissions = list(fm.permissions).filter((p) => permIds.has(p?.id))
  permissions = pull(permissions, permIds, (pfm, id) => list(pfm.permissions).find((p) => p?.id === id))

  const catalogs = [{ fm, specId: '' }, ...parents]
  const seenExtra = new Set([...rules.map((b) => b?.id), ...permissions.map((p) => p?.id)])
  const ownedElsewhere = []
  for (const doc of catalogs) {
    for (const b of list(doc.fm['business-rules'])) {
      if (!b?.id || seenExtra.has(b.id) || ruleIds.has(b.id)) continue
      if (!(has(entityNames, b?.['applies-to']) || has(apiIds, b?.['applies-to']))) continue
      seenExtra.add(b.id)
      ownedElsewhere.push({ id: b.id, kind: 'rule', text: sentence(b.rule), 'from-spec': doc.specId })
    }
    for (const p of list(doc.fm.permissions)) {
      if (!p?.id || seenExtra.has(p.id) || permIds.has(p.id)) continue
      if (!(has(apiIds, p?.refs) || has(screenIds, p?.refs))) continue
      seenExtra.add(p.id)
      ownedElsewhere.push({ id: p.id, kind: 'permission', text: sentence(p.action), 'from-spec': doc.specId })
    }
  }

  const kept = new Set([
    slice.id, ...storyIds, ...acs.map((a) => a.id), ...screenIds, ...interactions.map((i) => i.id),
    ...apiIds, ...entityNames, ...machines.map((m) => m.id), ...rules.map((r) => r.id),
    ...notifications.map((n) => n.id), ...permissions.map((p) => p.id),
    ...agents.map((a) => a.id), ...tools.map((t) => t.id), ...kbs.map((k) => k.id),
  ])
  const touching = (items) => list(items).filter((x) => has(kept, x?.affects))

  // Context rules / permissions (pulled in through a shared entity or endpoint) → the slice that
  // lists them. Consumers build only their own refs and show these as "owned by another slice".
  const ownerOf = (key, id) => {
    const local = slices.find((s) => list(s?.[key]).includes(id))?.id
    if (local) return local
    for (const parent of parents) {
      const found = list(parent.fm['delivery-plan']?.slices).find((s) => list(s?.[key]).includes(id))?.id
      if (found) return found
    }
    return ''
  }
  const owners = {}
  for (const item of ownedElsewhere) {
    item.owner = ownerOf(item.kind === 'rule' ? 'rule-refs' : 'permission-refs', item.id)
    if (item.owner) owners[item.id] = item.owner
    delete item['from-spec']
  }

  return {
    brief: BRIEF_ENVELOPE,
    spec: specPath,
    'spec-version': String(fm['spec-version'] ?? ''),
    slice,
    'depends-on': list(slice['depends-on']).map((id) => {
      const local = slices.find((s) => s?.id === id)
      if (local) return { id: local.id, title: local.title, goal: local.goal }
      for (const parent of parents) {
        const found = list(parent.fm['delivery-plan']?.slices).find((s) => s?.id === id)
        if (found) return { id: found.id, title: found.title, goal: found.goal, 'from-spec': parent.specId }
      }
      return { id }
    }),
    context: {
      title: fm.metadata?.title ?? '',
      goal: fm.context?.goal ?? '',
      constraints: list(fm.context?.constraints),
      'non-goals': list(fm.context?.['non-goals']),
    },
    roles: list(fm.roles).map((r) => r?.name).filter(Boolean),
    glossary: list(fm.glossary).map((g) => g?.term).filter(Boolean),
    'user-stories': pull(
      list(fm['user-stories']).filter((s) => storyIds.has(s?.id)),
      storyIds,
      (pfm, id) => list(pfm['user-stories']).find((s) => s?.id === id),
    ),
    'acceptance-criteria': acs,
    // Ids only: no build kit reads requirement text.
    'requirement-ids': reqs.filter((r) => has(kept, r?.['covered-by'])).map((r) => r.id),
    entities,
    'state-machines': machines,
    'business-rules': rules,
    permissions,
    owners,
    'owned-elsewhere': ownedElsewhere,
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
