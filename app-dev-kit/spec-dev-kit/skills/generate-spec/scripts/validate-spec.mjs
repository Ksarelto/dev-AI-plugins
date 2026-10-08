#!/usr/bin/env node
// Deterministic validator for hybrid YAML+Markdown specs. Hard gate for Station 7 and publish.
// Usage: node validate-spec.mjs <path-to-spec.md> [--require-approved] [--json]
// Exit 0 = valid (errors: 0). Exit 1 = invalid. Exit 2 = usage/parse failure.
// Schema of record: ../references/spec-schema.md (rule codes match its tables).
// 2.0 specs get every rule. 1.x specs get the structure rules; most 2.0 rules become warnings.

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { attachRequirements, endpointsOf, indexSpec, indexSpecChain, isV2, loadSpecChain, loadYaml, roleName } from './lib-spec.mjs'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const TYPES = ['feature', 'app', 'domain', 'integration']
const STATUSES = [
  'draft', 'awaiting-clarification', 'analyzing', 'enriching',
  'reviewing', 'approved', 'building', 'changes-requested', 'done',
]
const SUPPORTED_SCHEMA_VERSIONS = ['1.0', '1.1', '1.2', '2.0']
const REL_TYPES = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many']
const REQ_KINDS = ['behavior', 'rule', 'constraint', 'nfr', 'data', 'copy', 'metric']
// Inferences live only in assumptions[] — a requirement is stated in the source or answered by the user.
const REQ_SOURCES = ['stated', 'answered']
const PRIORITIES = ['must', 'should', 'could', 'wont']
const SCOPES = ['in', 'non-goal', 'deferred']
const AC_KINDS = ['happy', 'error', 'edge', 'permission', 'nfr']
const PAGE_TYPES = ['list', 'detail', 'form', 'dashboard', 'settings', 'other']
const TRACKS = ['backend', 'frontend', 'agent']
const NFR_CATEGORIES = ['performance', 'accessibility', 'security', 'scalability', 'observability']
const BODY_VIEW_HEADINGS = [
  'Data Model', 'API Endpoints Summary', 'Screen Inventory',
  'Acceptance Criteria Coverage Map', 'Key Assumptions',
]
const ID_PREFIX = {
  requirement: 'REQ', 'success-metric': 'KPI', permission: 'PERM', 'business-rule': 'BR',
  'state-machine': 'SM', 'user-story': 'US', 'acceptance-criterion': 'AC', endpoint: 'API',
  agent: 'AGT', tool: 'TOOL', 'knowledge-base': 'KB', screen: 'SCR', interaction: 'INT',
  notification: 'NTF', slice: 'SL', risk: 'RISK', assumption: 'ASSM', 'open-question': 'Q',
  decision: 'DEC',
}
const ID_TOKEN = /\b(?:REQ|KPI|PERM|BR|SM|US|AC|API|AGT|TOOL|KB|SCR|INT|NTF|SL|RISK|ASSM|Q|DEC)-\d+\b/g

const args = process.argv.slice(2)
const requireApproved = args.includes('--require-approved')
const asJson = args.includes('--json')
const specPath = args.find((a) => !a.startsWith('--'))
if (!specPath) {
  console.error('usage: node validate-spec.mjs <path-to-spec.md> [--require-approved] [--json]')
  process.exit(2)
}

const { parse } = await loadYaml()
let raw
try {
  raw = readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`FATAL: cannot read ${specPath}: ${e.message}`)
  process.exit(2)
}
const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
if (!fmMatch) {
  console.error('FATAL: no YAML front matter found (expected a leading --- ... --- block).')
  process.exit(2)
}
let fm
try {
  fm = parse(fmMatch[1])
} catch (e) {
  console.error(`FATAL: front matter is not valid YAML: ${e.message}`)
  process.exit(2)
}
const body = raw.slice(fmMatch[0].length)
const v2 = isV2(fm)
attachRequirements(specPath, fm, parse)
const chain = loadSpecChain(specPath, parse, process.cwd())
const chainIndex = indexSpecChain(chain)

function appRootOf(specFile) {
  let dir = dirname(resolve(specFile))
  for (let i = 0; i < 8; i++) {
    if (basename(dir) === '.spec') return dirname(dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

function sameFile(a, b, root) {
  const abs = (p) => resolve(isAbsolute(p) ? p : join(root, p))
  return abs(a) === abs(b)
}

function restatedIds(runDir) {
  const ids = new Set()
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (!node || typeof node !== 'object') return
    if (typeof node.id === 'string') ids.add(node.id)
    for (const value of Object.values(node)) walk(value)
  }
  const priorItems = join(runDir, 'artifacts/prior-items.yaml')
  if (existsSync(priorItems)) {
    try { walk(parse(readFileSync(priorItems, 'utf8'))) } catch { /* listed ids stay empty */ }
  }
  const changesFile = join(runDir, 'artifacts/changes.json')
  if (existsSync(changesFile)) {
    try {
      const changes = JSON.parse(readFileSync(changesFile, 'utf8'))
      for (const section of Object.values(changes)) {
        for (const id of section?.modified ?? []) if (id) ids.add(String(id))
      }
    } catch { /* ignore */ }
  }
  return ids
}

const errors = []
const warnings = []
const err = (code, msg) => errors.push(`[${code}] ${msg}`)
const warn = (code, msg) => warnings.push(`[${code}] ${msg}`)
// 2.0 rule: error on 2.0, warning on 1.x.
const rule = (code, msg) => (v2 ? err(code, msg) : warn(code, msg))
const arr = (v) => (Array.isArray(v) ? v : [])
const nonEmpty = (v) => Array.isArray(v) && v.length > 0
const str = (v) => typeof v === 'string' && v.trim().length > 0

const index = indexSpec(fm)
const { ids: localIds, entities: localEntities } = index
const ids = chainIndex.ids
const entities = chainIndex.entities
const roles = chainIndex.roles
const roleNames = new Set(roles.keys())
const fmLines = fmMatch[1].split(/\r?\n/).length
if (fmLines > 2500) warn('SPEC_TOO_LARGE', `front matter is ${fmLines} lines (limit 2500) — keep the register in requirements.yaml`)
const stories = arr(fm['user-stories'])
const acs = arr(fm['acceptance-criteria'])
const endpoints = endpointsOf(fm)
const ui = fm['ui-surface'] ?? {}
const screens = arr(ui.screens)
const slices = arr(fm['delivery-plan']?.slices)
const nfr = fm['non-functional'] ?? {}

const appRoot = appRootOf(specPath)
const currentPath = join(appRoot, '.spec/app/current.json')
if (existsSync(currentPath)) {
  let current = null
  try { current = JSON.parse(readFileSync(currentPath, 'utf8')) } catch { current = null }
  const pointed = current?.spec_path
  if (pointed && !sameFile(pointed, specPath, appRoot) && !fm.metadata?.['parent-spec']) {
    err('PARENT_SPEC_MISSING', `current.json points at ${pointed} but this spec has no metadata.parent-spec — a later increment is feature-only, not a new first spec`)
  }
}
if (chain.length > 1) {
  const parentIds = new Set()
  for (const { fm: parentFm } of chain.slice(1)) {
    for (const id of indexSpec(parentFm).ids.keys()) parentIds.add(id)
  }
  const allowed = restatedIds(dirname(resolve(specPath)))
  for (const id of localIds.keys()) {
    if (parentIds.has(id) && !allowed.has(id)) {
      err('ID_REUSED', `${id} already exists in the parent spec — new items take the next free id; a modified item must be listed in artifacts/prior-items.yaml or changes.json`)
    }
  }
}

// A ref is a known id, an entity name, or (for covered-by) "non-functional.<category>".
function resolves(ref, { allowNfr = false } = {}) {
  const r = String(ref ?? '').trim()
  if (ids.has(r) || entities.has(r) || localIds.has(r) || localEntities.has(r)) return true
  if (allowNfr && /^non-functional\./.test(r)) return nonEmpty(nfr[r.slice('non-functional.'.length)])
  return false
}
function checkRefs(owner, field, list, opts) {
  for (const ref of arr(list)) {
    if (!resolves(ref, opts)) rule('BROKEN_REF', `${owner} ${field} → ${JSON.stringify(ref)} does not resolve`)
  }
}
// Free-text lists (guard, effects): only id-shaped tokens must resolve.
function checkTokens(owner, field, list) {
  for (const text of arr(list)) {
    for (const token of String(text).match(ID_TOKEN) ?? []) {
      if (!ids.has(token)) rule('BROKEN_REF', `${owner} ${field} mentions ${token}, which does not exist`)
    }
  }
}
function checkRole(owner, field, name, { allowSystem = false } = {}) {
  if (!v2 && roleNames.size === 0) return
  const n = roleName(name)
  if (allowSystem && n === 'system') return
  if (!roleNames.has(n)) rule('UNKNOWN_ROLE', `${owner} ${field} ${JSON.stringify(name)} is not in roles[]`)
}
const tokens = (text) => new Set(String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
function similar(a, b) {
  const x = tokens(a)
  const y = tokens(b)
  if (x.size < 4 || y.size < 4) return false
  let shared = 0
  for (const t of x) if (y.has(t)) shared++
  return shared / Math.min(x.size, y.size) >= 0.8
}

// --- Structure (all versions) ---
if (!SUPPORTED_SCHEMA_VERSIONS.includes(String(fm['spec-version']))) {
  err('SCHEMA_VERSION_INVALID', `spec-version must be one of ${SUPPORTED_SCHEMA_VERSIONS.join(', ')} (got ${JSON.stringify(fm['spec-version'])})`)
}
if (!/^\d{8}-\d{6}$/.test(String(fm.timecode ?? ''))) err('TIMECODE_FORMAT_INVALID', `timecode must match \\d{8}-\\d{6} (got ${JSON.stringify(fm.timecode)})`)
if (!TYPES.includes(fm.type)) err('TYPE_INVALID', `type must be one of ${TYPES.join(', ')} (got ${JSON.stringify(fm.type)})`)
if (!STATUSES.includes(fm.status)) err('STATUS_INVALID', `status must be a valid lifecycle value (got ${JSON.stringify(fm.status)})`)
const meta = fm.metadata ?? {}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(meta.slug ?? ''))) err('SLUG_FORMAT_INVALID', `metadata.slug must be kebab-case (got ${JSON.stringify(meta.slug)})`)
if (/\{\{[^}]*\}\}/.test(fmMatch[1])) err('PLACEHOLDER_LEFT', 'front matter still contains {{template}} placeholders')

for (const id of index.duplicates) err('DUPLICATE_ID', `${id} is used by more than one item`)
for (const [id, { kind }] of ids) {
  const prefix = ID_PREFIX[kind]
  if (prefix && !new RegExp(`^${prefix}-\\d+$`).test(id)) {
    err(kind === 'user-story' ? 'STORY_ID_FORMAT_INVALID' : 'ID_FORMAT_INVALID', `${kind} id ${JSON.stringify(id)} must match ${prefix}-NNN`)
  }
}

const storyIds = new Set(stories.map((s) => s?.id).filter(Boolean))
for (const ac of acs) {
  if (!storyIds.has(ac?.['story-ref'])) err('BROKEN_STORY_REF', `acceptance-criteria ${ac?.id ?? '(no id)'} story-ref ${JSON.stringify(ac?.['story-ref'])} does not match any user story id`)
  if (typeof ac?.testable !== 'boolean') err('TESTABLE_FLAG_MISSING', `acceptance-criteria ${ac?.id ?? '(no id)'} testable must be true|false`)
}
for (const e of endpoints) {
  if (!HTTP_METHODS.includes(e?.method)) err('HTTP_METHOD_INVALID', `api-surface.endpoints ${e?.id ?? '(no id)'} method ${JSON.stringify(e?.method)} is not an HTTP verb`)
}

const agentSurface = fm['agent-surface']
if (agentSurface && typeof agentSurface === 'object') {
  const kinds = ['conversational', 'rag', 'tool-using', 'graph']
  const runtimes = ['openai-agents', 'langgraph']
  const embeds = ['none', 'backend-route', 'frontend-widget']
  for (const a of arr(agentSurface.agents)) {
    if (a?.kind && !kinds.includes(a.kind)) err('AGENT_KIND_INVALID', `agent ${a?.id} kind ${JSON.stringify(a.kind)} is invalid`)
    if (a?.runtime && !runtimes.includes(a.runtime)) err('AGENT_RUNTIME_INVALID', `agent ${a?.id} runtime ${JSON.stringify(a.runtime)} is invalid`)
    if (a?.embed && !embeds.includes(a.embed)) err('AGENT_EMBED_INVALID', `agent ${a?.id} embed ${JSON.stringify(a.embed)} is invalid`)
    for (const ref of arr(a?.['tool-refs'])) if (ids.get(ref)?.kind !== 'tool') err('BROKEN_TOOL_REF', `agent ${a?.id} tool-ref ${JSON.stringify(ref)} does not match any TOOL id`)
    for (const ref of arr(a?.['knowledge-base-refs'])) if (ids.get(ref)?.kind !== 'knowledge-base') err('BROKEN_KB_REF', `agent ${a?.id} knowledge-base-ref ${JSON.stringify(ref)} does not match any KB id`)
  }
  for (const t of arr(agentSurface.tools)) {
    if (t?.['api-ref'] && ids.get(t['api-ref'])?.kind !== 'endpoint') err('BROKEN_API_REF', `tool ${t?.id} api-ref ${JSON.stringify(t['api-ref'])} does not match any API id`)
  }
  for (const k of arr(agentSurface['knowledge-bases'])) {
    if (k?.retrieval && !['hybrid', 'dense', 'keyword'].includes(k.retrieval)) err('KB_RETRIEVAL_INVALID', `knowledge-base ${k?.id} retrieval ${JSON.stringify(k.retrieval)} is invalid`)
  }
}
if (!nonEmpty(nfr.performance) || !nonEmpty(nfr.accessibility)) err('NFR_INCOMPLETE', 'non-functional.performance and non-functional.accessibility must both be non-empty')

// --- Contract quality (2.0 = error, 1.x = warning) ---
if (v2 && nonEmpty(fm['api-surface']?.mutations)) err('MUTATIONS_DEPRECATED', 'api-surface.mutations is removed in 2.0 — put every operation in api-surface.endpoints')

const normPath = (p) => String(p ?? '').toLowerCase().replace(/\{[^}]+\}|:[a-z0-9_]+/g, ':p').split('/').map((s) => s.replace(/s$/, '')).join('/')
const seenExact = new Map()
const seenNorm = new Map()
const spelling = new Map()
for (const e of endpoints) {
  const exact = `${e?.method} ${e?.path}`
  const norm = `${e?.method} ${normPath(e?.path)}`
  if (seenExact.has(exact)) rule('DUPLICATE_ENDPOINT', `${e?.id} repeats ${exact} (${seenExact.get(exact)})`)
  else if (seenNorm.has(norm)) rule('DUPLICATE_ENDPOINT', `${e?.id} ${exact} is a second spelling of ${seenNorm.get(norm)}`)
  seenExact.set(exact, e?.id)
  if (!seenNorm.has(norm)) seenNorm.set(norm, `${e?.id} ${exact}`)
  const pathKey = normPath(e?.path)
  if (spelling.has(pathKey) && spelling.get(pathKey).path !== e?.path) {
    warn('PATH_SPELLING_INCONSISTENT', `${e?.id} ${e?.path} and ${spelling.get(pathKey).id} ${spelling.get(pathKey).path} spell one resource two ways`)
  } else if (!spelling.has(pathKey)) spelling.set(pathKey, { id: e?.id, path: e?.path })
  for (const r of arr(e?.roles)) checkRole(e?.id, 'roles', r)
  checkRefs(e?.id, 'story-refs', e?.['story-refs'])
}

for (const [name, entity] of localEntities) {
  if (!str(entity.description) || entity.description.trim() === name) rule('PLACEHOLDER_DESCRIPTION', `entity ${name} description is empty or just its name`)
  for (const f of arr(entity.fields)) {
    const d = String(f?.description ?? '').trim()
    if (!d || /^field\s+\S+\.?$/i.test(d) || d.toLowerCase() === String(f?.name ?? '').toLowerCase()) {
      rule('PLACEHOLDER_DESCRIPTION', `${name}.${f?.name} description ${JSON.stringify(d)} says nothing about the field`)
    }
    const enumLike = /(Status|State)$/.test(String(f?.type ?? '')) || f?.values !== undefined
    if (enumLike && v2 && !nonEmpty(f?.values)) err('ENUM_VALUES_MISSING', `${name}.${f?.name} (${f?.type}) must list values[]`)
  }
  for (const r of arr(entity.relationships)) {
    if (!REL_TYPES.includes(r?.type)) rule('RELATIONSHIP_INVALID', `${name} → ${r?.entity} type ${JSON.stringify(r?.type)} must be one of ${REL_TYPES.join(', ')}`)
    if (!entities.has(r?.entity)) rule('RELATIONSHIP_INVALID', `${name} relationship targets unknown entity ${JSON.stringify(r?.entity)}`)
  }
}

if (v2) {
  // Roles and permissions
  if (!nonEmpty(fm.roles) && roles.size === 0) err('MVS_INCOMPLETE', 'roles[] must list at least one role')
  for (const u of arr(fm.context?.['target-users'])) checkRole('context', 'target-users', u)
  for (const s of stories) checkRole(s?.id, 'as', s?.as)
  for (const p of arr(fm.permissions)) {
    for (const r of arr(p?.allow)) checkRole(p?.id, 'allow', r)
    for (const r of Object.keys(p?.conditional ?? {})) checkRole(p?.id, 'conditional', r)
    checkRefs(p?.id, 'refs', p?.refs)
  }

  // Requirements register + coverage
  if (!nonEmpty(fm.requirements)) err('MVS_INCOMPLETE', 'requirements[] must list the atomic requirements')
  for (const r of arr(fm.requirements)) {
    if (!str(r?.text)) err('REQUIREMENT_INVALID', `${r?.id} has no text`)
    if (!REQ_KINDS.includes(r?.kind)) err('REQUIREMENT_INVALID', `${r?.id} kind ${JSON.stringify(r?.kind)} must be one of ${REQ_KINDS.join(', ')}`)
    if (!REQ_SOURCES.includes(r?.source)) err('REQUIREMENT_INVALID', `${r?.id} source ${JSON.stringify(r?.source)} must be one of ${REQ_SOURCES.join(', ')}`)
    if (!PRIORITIES.includes(r?.priority)) err('REQUIREMENT_INVALID', `${r?.id} priority ${JSON.stringify(r?.priority)} is invalid`)
    if (!SCOPES.includes(r?.scope ?? 'in')) err('REQUIREMENT_INVALID', `${r?.id} scope ${JSON.stringify(r?.scope)} is invalid`)
    if (r?.source === 'stated' && !str(r?.['source-ref'])) err('REQUIREMENT_INVALID', `${r?.id} is stated but has no source-ref (file#Lline)`)
    checkRefs(r?.id, 'covered-by', r?.['covered-by'], { allowNfr: true })
    const inScope = (r?.scope ?? 'in') === 'in'
    if (inScope && r?.priority === 'must' && !nonEmpty(r?.['covered-by'])) {
      err('REQUIREMENT_UNCOVERED', `${r?.id} (must, ${r?.source}) has nothing in covered-by: ${String(r?.text).slice(0, 90)}`)
    }
    if (/^this (file|document|brief|section)\b/i.test(String(r?.text ?? '').trim())) {
      err('META_REQUIREMENT', `${r?.id} is about the source file, not the product: ${String(r.text).slice(0, 90)}`)
    }
  }
  const coveredCount = new Map()
  for (const r of arr(fm.requirements)) {
    for (const id of arr(r?.['covered-by'])) coveredCount.set(id, (coveredCount.get(id) ?? 0) + 1)
  }
  for (const [id, n] of coveredCount) {
    if (n > 25) warn('CATCH_ALL_COVERAGE', `${id} covers ${n} requirements — map each requirement to the AC that tests it`)
  }

  // Acceptance criteria kinds + unhappy paths
  for (const ac of acs) {
    if (!AC_KINDS.includes(ac?.kind)) err('AC_KIND_INVALID', `${ac?.id} kind ${JSON.stringify(ac?.kind)} must be one of ${AC_KINDS.join(', ')}`)
  }
  for (const s of stories) {
    const own = acs.filter((a) => a?.['story-ref'] === s?.id)
    if (s?.priority === 'must') {
      if (!own.some((a) => a?.kind === 'happy') || !own.some((a) => a?.kind && a.kind !== 'happy')) {
        err('STORY_UNHAPPY_PATH_MISSING', `${s?.id} needs ≥1 happy and ≥1 error/edge/permission AC`)
      }
    }
    const parts = String(s?.['i-want'] ?? '').split(/,|\band\b|;/).map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 3) warn('STORY_TOO_BIG', `${s?.id} i-want bundles ${parts.length} capabilities — split it`)
  }

  // Business rules
  for (const b of arr(fm['business-rules'])) {
    if (!str(b?.rule)) err('RULE_INVALID', `${b?.id} has no rule text`)
    if (!nonEmpty(b?.['ac-refs'])) err('RULE_UNTESTED', `${b?.id} (${b?.name ?? ''}) has no ac-refs`)
    checkRefs(b?.id, 'ac-refs', b?.['ac-refs'])
    checkRefs(b?.id, 'applies-to', b?.['applies-to'])
  }

  // State machines
  const machines = arr(fm['state-machines'])
  for (const [name, entity] of localEntities) {
    for (const f of arr(entity.fields)) {
      const lifecycle = f?.name === 'status' || /(Status|State)$/.test(String(f?.type ?? ''))
      if (!lifecycle || f?.derived || arr(f?.values).length < 2) continue
      if (!machines.some((m) => m?.entity === name && (m?.field ?? 'status') === f.name)) {
        err('STATE_MACHINE_MISSING', `${name}.${f.name} has ${f.values.length} values but no state-machines[] entry`)
      }
    }
  }
  const isoDuration = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/
  for (const m of machines) {
    const entity = entities.get(m?.entity)
    if (!entity) {
      err('STATE_MACHINE_INVALID', `${m?.id} entity ${JSON.stringify(m?.entity)} does not exist`)
      continue
    }
    const field = arr(entity.fields).find((f) => f?.name === (m?.field ?? 'status'))
    const states = new Set(arr(m?.states))
    if (!field) err('STATE_MACHINE_INVALID', `${m?.id} field ${JSON.stringify(m?.field)} is not on ${m.entity}`)
    else if (nonEmpty(field.values) && (field.values.length !== states.size || field.values.some((v) => !states.has(v)))) {
      err('STATE_MACHINE_INVALID', `${m?.id} states [${[...states]}] differ from ${m.entity}.${field.name} values [${field.values}]`)
    }
    if (!states.has(m?.initial)) err('STATE_MACHINE_INVALID', `${m?.id} initial ${JSON.stringify(m?.initial)} is not a state`)
    const reached = new Set([m?.initial])
    for (const t of arr(m?.transitions)) {
      const label = `${m?.id} ${t?.from}→${t?.to}`
      if (t?.from !== '*' && !states.has(t?.from)) err('STATE_MACHINE_INVALID', `${label} from is not a state`)
      if (!states.has(t?.to)) err('STATE_MACHINE_INVALID', `${label} to is not a state`)
      if (!str(t?.trigger)) err('STATE_MACHINE_INVALID', `${label} has no trigger`)
      const actors = Array.isArray(t?.actor) ? t.actor : [t?.actor ?? '']
      for (const a of actors) checkRole(label, 'actor', a, { allowSystem: true })
      if (!actors.includes('system')) {
        if (!t?.['api-ref']) warn('TRANSITION_NO_ENDPOINT', `${label} is triggered by ${actors.join('/')} but names no api-ref — how does the UI cause it?`)
        else checkRefs(label, 'api-ref', [t['api-ref']])
      }
      if (t?.after && !isoDuration.test(String(t.after))) warn('STATE_MACHINE_INVALID', `${label} after ${JSON.stringify(t.after)} is not an ISO-8601 duration`)
      checkTokens(label, 'guard', t?.guard)
      checkTokens(label, 'effects', t?.effects)
      checkRefs(label, 'ac-refs', t?.['ac-refs'])
      reached.add(t?.to)
    }
    for (const s of states) if (!reached.has(s)) warn('STATE_UNREACHABLE', `${m?.id} state ${s} is never entered`)
  }

  // Screens + interactions
  for (const s of screens) {
    if (!s?.['page-type'] || !('primary-entity' in (s ?? {}))) warn('SCREEN_UNTYPED', `${s?.id} needs page-type and primary-entity`)
    if (s?.['page-type'] && !PAGE_TYPES.includes(s['page-type'])) err('SCREEN_INVALID', `${s?.id} page-type ${JSON.stringify(s['page-type'])} must be one of ${PAGE_TYPES.join(', ')}`)
    if (str(s?.['primary-entity']) && !entities.has(s['primary-entity'])) err('BROKEN_REF', `${s?.id} primary-entity ${JSON.stringify(s['primary-entity'])} is not an entity`)
    for (const r of arr(s?.roles)) checkRole(s?.id, 'roles', r)
    checkRefs(s?.id, 'story-refs', s?.['story-refs'])
    checkRefs(s?.id, 'api-refs', s?.['api-refs'])
  }
  for (const i of arr(ui.interactions)) {
    checkRefs(i?.id, 'screen-ref', [i?.['screen-ref']])
    if (i?.['target-screen']) checkRefs(i?.id, 'target-screen', [i['target-screen']])
  }

  // Notifications, assumptions, questions, decisions, risks
  for (const n of arr(fm.notifications)) {
    if (!str(n?.event) || !nonEmpty(n?.recipients)) err('NOTIFICATION_INVALID', `${n?.id} needs event and recipients`)
    checkRefs(n?.id, 'ac-refs', n?.['ac-refs'])
  }
  for (const p of arr(fm.permissions)) {
    if (!nonEmpty(p?.['ac-refs'])) warn('PERMISSION_UNTESTED', `${p?.id} (${p?.action}) has no ac-refs`)
    checkRefs(p?.id, 'ac-refs', p?.['ac-refs'])
  }
  for (const a of arr(fm.assumptions)) {
    checkRefs(a?.id, 'affects', a?.affects)
    if (!nonEmpty(a?.affects)) warn('ASSUMPTION_UNLINKED', `${a?.id} affects nothing — link the rule / AC it shapes, or drop it`)
  }
  const rulesList = arr(fm['business-rules'])
  for (let i = 0; i < rulesList.length; i++) {
    for (let j = i + 1; j < rulesList.length; j++) {
      if (similar(rulesList[i]?.rule, rulesList[j]?.rule)) warn('DUPLICATE_STATEMENT', `${rulesList[j]?.id} restates ${rulesList[i]?.id} — merge them`)
    }
  }
  for (const q of arr(fm['open-questions'])) checkRefs(q?.id, 'affects', q?.affects)
  const reqTexts = new Set(arr(fm.requirements).map((r) => String(r?.text ?? '').trim().toLowerCase()).filter(Boolean))
  for (const d of arr(fm.traceability?.decisions)) {
    checkRefs(d?.id, 'affects', d?.affects)
    if (reqTexts.has(String(d?.decision ?? '').trim().toLowerCase())) {
      err('DEC_RESTATES_REQ', `${d?.id} repeats a requirement — reference it from affects, do not copy the text`)
    }
  }
  for (const r of arr(fm.risks)) checkTokens(r?.id, 'mitigation', [r?.mitigation])

  // One home per fact
  for (const a of arr(fm.assumptions)) {
    const twin = arr(fm.requirements).find((r) => r?.source === 'stated' && similar(r?.text, a?.description))
    if (twin) warn('DUPLICATE_STATEMENT', `${a?.id} restates stated requirement ${twin.id} — a stated rule is not an assumption`)
    const q = arr(fm['open-questions']).find((x) => similar(x?.question, a?.description))
    if (q) warn('DUPLICATE_STATEMENT', `${q.id} restates ${a?.id} — reference the id instead`)
  }

  // Delivery plan
  if (!nonEmpty(slices)) err('MVS_INCOMPLETE', 'delivery-plan.slices must list at least one slice')
  const seenSlices = new Set()
  for (const { fm: parentFm } of chain.slice(1)) {
    for (const sl of arr(parentFm['delivery-plan']?.slices)) if (sl?.id) seenSlices.add(sl.id)
  }
  const storyOwner = new Map()
  for (const sl of slices) {
    const label = sl?.id ?? '(slice)'
    for (const dep of arr(sl?.['depends-on'])) {
      if (!seenSlices.has(dep)) err('SLICE_ORDER_INVALID', `${label} depends-on ${dep}, which is not an earlier slice`)
    }
    seenSlices.add(sl?.id)
    const tracks = arr(sl?.tracks)
    if (!nonEmpty(tracks) || tracks.some((t) => !TRACKS.includes(t))) err('SLICE_INVALID', `${label} tracks must be a non-empty subset of ${TRACKS.join(', ')}`)
    if (!str(sl?.title) || !str(sl?.goal)) err('SLICE_INVALID', `${label} needs title and goal`)
    for (const id of arr(sl?.['story-refs'])) {
      if (storyOwner.has(id)) err('SLICE_STORY_DUPLICATED', `${id} is in ${storyOwner.get(id)} and ${label}`)
      else storyOwner.set(id, label)
    }
    for (const field of ['story-refs', 'entity-refs', 'api-refs', 'screen-refs', 'agent-refs', 'rule-refs', 'state-machine-refs', 'notification-refs', 'permission-refs', 'done-when']) {
      checkRefs(label, field, sl?.[field])
    }
    if (nonEmpty(sl?.['api-refs']) && !tracks.includes('backend')) warn('SLICE_TRACK_MISMATCH', `${label} has api-refs but no backend track`)
    if (nonEmpty(sl?.['screen-refs']) && !tracks.includes('frontend')) warn('SLICE_TRACK_MISMATCH', `${label} has screen-refs but no frontend track`)
    if (nonEmpty(sl?.['agent-refs']) && !tracks.includes('agent')) warn('SLICE_TRACK_MISMATCH', `${label} has agent-refs but no agent track`)
    if (!nonEmpty(sl?.steps)) err('SLICE_INVALID', `${label} needs steps[]`)
    for (const step of arr(sl?.steps)) {
      if (!tracks.includes(step?.track)) warn('SLICE_TRACK_MISMATCH', `${label} step track ${JSON.stringify(step?.track)} is not in tracks`)
      if (!str(step?.do)) err('SLICE_INVALID', `${label} has a step with no "do"`)
      checkRefs(label, 'steps.refs', step?.refs)
    }
    if (!nonEmpty(sl?.['done-when'])) err('SLICE_INVALID', `${label} needs done-when AC ids`)
    const own = new Set(arr(sl?.['story-refs']))
    for (const acId of arr(sl?.['done-when'])) {
      const ac = ids.get(acId)?.item
      if (ac && !own.has(ac['story-ref'])) warn('SLICE_DONE_WHEN_FOREIGN', `${label} done-when ${acId} belongs to ${ac['story-ref']}, not this slice`)
    }
  }
  for (const s of stories) {
    if (s?.priority === 'must' && !storyOwner.has(s.id)) err('SLICE_STORY_UNASSIGNED', `${s.id} (must) is in no delivery slice`)
  }
  const inSlice = (field) => new Set(slices.flatMap((sl) => arr(sl?.[field])))
  const slicedApis = inSlice('api-refs')
  const slicedScreens = inSlice('screen-refs')
  for (const e of endpoints) if (!slicedApis.has(e?.id)) warn('SLICE_COVERAGE_GAP', `${e?.id} ${e?.method} ${e?.path} is in no slice`)
  // A permission is enforced where its endpoints are built: the slice listing it must build one of them.
  for (const sl of slices) {
    const own = new Set(arr(sl?.['api-refs']))
    for (const pid of arr(sl?.['permission-refs'])) {
      const apis = arr(ids.get(pid)?.item?.refs).filter((r) => ids.get(r)?.kind === 'endpoint')
      if (apis.length && !apis.some((r) => own.has(r))) warn('SLICE_PERMISSION_MISPLACED', `${sl?.id} lists ${pid}, but its endpoints (${apis.join(', ')}) are built in another slice`)
    }
  }
  for (const s of screens) if (!slicedScreens.has(s?.id)) warn('SLICE_COVERAGE_GAP', `${s?.id} ${s?.title} is in no slice`)
  // A rule is built where what it applies to is built. Build kits implement only their slice's
  // rule-refs, so a rule listed in a slice that builds none of its targets is never implemented
  // by the slice that does build them.
  const builds = (sl) => {
    const own = arr(sl?.['screen-refs']).map((id) => ids.get(id)?.item).filter(Boolean)
    return new Set([
      ...arr(sl?.['entity-refs']), ...arr(sl?.['api-refs']),
      ...own.map((s) => s?.['primary-entity']).filter(Boolean), ...own.flatMap((s) => arr(s?.['api-refs'])),
    ])
  }
  const built = new Map(slices.map((sl) => [sl?.id, builds(sl)]))
  for (const sl of slices) {
    for (const rid of arr(sl?.['rule-refs'])) {
      const targets = arr(ids.get(rid)?.item?.['applies-to'])
      if (!targets.length || targets.some((t) => built.get(sl?.id).has(t))) continue
      const first = slices.find((other) => targets.some((t) => built.get(other?.id).has(t)))
      warn('SLICE_RULE_MISPLACED', `${sl?.id} lists ${rid}, but builds none of what it applies to (${targets.join(', ')})${first ? `; ${first.id} builds it` : ''}`)
    }
  }
}

// Body must not hand-restate the YAML (views come from render-spec-views.mjs)
for (const heading of BODY_VIEW_HEADINGS) {
  if (new RegExp(`^##\\s+${heading}\\s*$`, 'm').test(body)) rule('BODY_DUPLICATES_YAML', `body section "## ${heading}" restates the YAML — remove it (spec.views.md is generated)`)
}
if (raw.length > 250_000) warn('SPEC_TOO_LARGE', `spec is ${Math.round(raw.length / 1024)} KB — check for restated sections`)

// --- Minimum Viable Spec (required before status: approved) ---
const ctx = fm.context ?? {}
const mvs = [
  [str(meta.title), 'metadata.title'],
  [str(ctx.problem), 'context.problem'],
  [str(ctx.goal), 'context.goal'],
  [nonEmpty(ctx['target-users']), 'context.target-users (≥1)'],
  [nonEmpty(stories), 'user-stories (≥1)'],
  [nonEmpty(nfr.accessibility), 'non-functional.accessibility (≥1)'],
  [nonEmpty(nfr.security), 'non-functional.security (≥1)'],
  v2
    ? [nonEmpty(fm.requirements), 'requirements (≥1)']
    : [nonEmpty(fm.traceability?.['source-requirements']), 'traceability.source-requirements (≥1)'],
]
const withAc = new Set(acs.map((a) => a?.['story-ref']))
const mvsFailures = mvs.filter(([ok]) => !ok).map(([, name]) => name)
const missingAc = [...storyIds].filter((id) => !withAc.has(id))
if (missingAc.length) mvsFailures.push(`acceptance-criteria for ${missingAc.join(', ')}`)
for (const f of mvsFailures) {
  if (requireApproved || fm.status === 'approved') err('MVS_INCOMPLETE', `minimum-viable-spec field missing: ${f}`)
  else warn('MVS_INCOMPLETE', `minimum-viable-spec field missing (blocks status:approved): ${f}`)
}

// --- Report ---
if (asJson) {
  console.log(JSON.stringify({ valid: errors.length === 0, version: String(fm['spec-version']), errors, warnings }, null, 2))
} else {
  for (const w of warnings) console.warn(`WARN  ${w}`)
  for (const e of errors) console.error(`ERROR ${e}`)
  console.log(`\n${errors.length ? 'INVALID' : 'VALID'} — ${errors.length} error(s), ${warnings.length} warning(s) — ${specPath}`)
}
process.exit(errors.length ? 1 : 0)
