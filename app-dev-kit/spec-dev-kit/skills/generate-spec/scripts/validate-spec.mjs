#!/usr/bin/env node
// Deterministic structural validator for hybrid YAML+Markdown specs.
// Replaces the probabilistic spec-validator agent for the hard gate.
// Usage: node validate-spec.mjs <path-to-spec.md> [--require-approved]
// Exit 0 = valid (errors: 0). Exit 1 = invalid. Exit 2 = usage/parse failure.
// Schema of record: ../references/spec-schema.md

import { readFileSync } from 'node:fs'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const TYPES = ['feature', 'app', 'domain', 'integration']
const STATUSES = [
  'draft', 'awaiting-clarification', 'analyzing', 'enriching',
  'reviewing', 'approved', 'building', 'changes-requested', 'done',
]
const SUPPORTED_SCHEMA_VERSIONS = ['1.0', '1.1', '1.2']

const args = process.argv.slice(2)
const requireApproved = args.includes('--require-approved')
const specPath = args.find((a) => !a.startsWith('--'))

if (!specPath) {
  console.error('usage: node validate-spec.mjs <path-to-spec.md> [--require-approved]')
  process.exit(2)
}

let parse
try {
  const mod = await import('yaml')
  parse = mod.parse ?? mod.default?.parse
} catch {
  // fall through to the check below
}
if (typeof parse !== 'function') {
  console.error(
    'FATAL: the "yaml" package is not resolvable. Run this script from the repo root '
      + '(where node_modules/yaml exists), or `yarn add -D yaml`.',
  )
  process.exit(2)
}

let raw
try {
  raw = readFileSync(specPath, 'utf8')
} catch (err) {
  console.error(`FATAL: cannot read ${specPath}: ${err.message}`)
  process.exit(2)
}

const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
if (!fmMatch) {
  console.error('FATAL: no YAML front matter found (expected a leading --- ... --- block).')
  process.exit(2)
}

let fm
try {
  fm = parse(fmMatch[1])
} catch (err) {
  console.error(`FATAL: front matter is not valid YAML: ${err.message}`)
  process.exit(2)
}

const errors = []
const warnings = []
const err = (code, msg) => errors.push(`[${code}] ${msg}`)
const warn = (code, msg) => warnings.push(`[${code}] ${msg}`)
const isNonEmptyArray = (v) => Array.isArray(v) && v.length > 0
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0

// --- Validation Rules (spec-schema.md § Validation Rules) ---
if (!SUPPORTED_SCHEMA_VERSIONS.includes(String(fm['spec-version']))) {
  err('SCHEMA_VERSION_INVALID', `spec-version must be one of ${SUPPORTED_SCHEMA_VERSIONS.join(', ')} (got ${JSON.stringify(fm['spec-version'])})`)
}
if (!/^\d{8}-\d{6}$/.test(String(fm.timecode ?? ''))) {
  err('TIMECODE_FORMAT_INVALID', `timecode must match \\d{8}-\\d{6} (got ${JSON.stringify(fm.timecode)})`)
}
if (!TYPES.includes(fm.type)) {
  err('TYPE_INVALID', `type must be one of ${TYPES.join(', ')} (got ${JSON.stringify(fm.type)})`)
}
if (!STATUSES.includes(fm.status)) {
  err('STATUS_INVALID', `status must be a valid lifecycle value (got ${JSON.stringify(fm.status)})`)
}

const meta = fm.metadata ?? {}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(meta.slug ?? ''))) {
  err('SLUG_FORMAT_INVALID', `metadata.slug must be kebab-case (got ${JSON.stringify(meta.slug)})`)
}

const stories = Array.isArray(fm['user-stories']) ? fm['user-stories'] : []
const storyIds = new Set()
for (const s of stories) {
  if (!/^US-\d+$/.test(String(s?.id ?? ''))) {
    err('STORY_ID_FORMAT_INVALID', `user-stories[].id must match US-\\d+ (got ${JSON.stringify(s?.id)})`)
  } else {
    storyIds.add(s.id)
  }
}

const acs = Array.isArray(fm['acceptance-criteria']) ? fm['acceptance-criteria'] : []
for (const ac of acs) {
  if (!storyIds.has(ac?.['story-ref'])) {
    err('BROKEN_STORY_REF', `acceptance-criteria ${ac?.id ?? '(no id)'} story-ref ${JSON.stringify(ac?.['story-ref'])} does not match any user story id`)
  }
  if (typeof ac?.testable !== 'boolean') {
    err('TESTABLE_FLAG_MISSING', `acceptance-criteria ${ac?.id ?? '(no id)'} testable must be true|false`)
  }
}

const endpoints = fm['api-surface']?.endpoints
if (Array.isArray(endpoints)) {
  for (const e of endpoints) {
    if (!HTTP_METHODS.includes(e?.method)) {
      err('HTTP_METHOD_INVALID', `api-surface.endpoints ${e?.id ?? '(no id)'} method ${JSON.stringify(e?.method)} is not an HTTP verb`)
    }
  }
}

const AGENT_KINDS = ['conversational', 'rag', 'tool-using', 'graph']
const AGENT_RUNTIMES = ['openai-agents', 'langgraph']
const AGENT_EMBEDS = ['none', 'backend-route', 'frontend-widget']
const KB_RETRIEVAL = ['hybrid', 'dense', 'keyword']

const agentSurface = fm['agent-surface']
if (agentSurface && typeof agentSurface === 'object') {
  const agents = Array.isArray(agentSurface.agents) ? agentSurface.agents : []
  const tools = Array.isArray(agentSurface.tools) ? agentSurface.tools : []
  const kbs = Array.isArray(agentSurface['knowledge-bases']) ? agentSurface['knowledge-bases'] : []
  const toolIds = new Set(tools.map((t) => t?.id).filter(Boolean))
  const kbIds = new Set(kbs.map((k) => k?.id).filter(Boolean))
  const apiIds = new Set([
    ...(Array.isArray(fm['api-surface']?.endpoints) ? fm['api-surface'].endpoints : []),
    ...(Array.isArray(fm['api-surface']?.mutations) ? fm['api-surface'].mutations : []),
  ].map((e) => e?.id).filter(Boolean))

  for (const a of agents) {
    if (!/^AGT-\d+$/.test(String(a?.id ?? ''))) {
      err('AGENT_ID_FORMAT_INVALID', `agent-surface.agents[].id must match AGT-\\d+ (got ${JSON.stringify(a?.id)})`)
    }
    if (a?.kind && !AGENT_KINDS.includes(a.kind)) {
      err('AGENT_KIND_INVALID', `agent-surface.agents ${a?.id ?? '(no id)'} kind ${JSON.stringify(a.kind)} is invalid`)
    }
    if (a?.runtime && !AGENT_RUNTIMES.includes(a.runtime)) {
      err('AGENT_RUNTIME_INVALID', `agent-surface.agents ${a?.id ?? '(no id)'} runtime ${JSON.stringify(a.runtime)} is invalid`)
    }
    if (a?.embed && !AGENT_EMBEDS.includes(a.embed)) {
      err('AGENT_EMBED_INVALID', `agent-surface.agents ${a?.id ?? '(no id)'} embed ${JSON.stringify(a.embed)} is invalid`)
    }
    for (const ref of a?.['tool-refs'] ?? []) {
      if (!toolIds.has(ref)) err('BROKEN_TOOL_REF', `agent ${a?.id ?? '(no id)'} tool-ref ${JSON.stringify(ref)} does not match any TOOL id`)
    }
    for (const ref of a?.['knowledge-base-refs'] ?? []) {
      if (!kbIds.has(ref)) err('BROKEN_KB_REF', `agent ${a?.id ?? '(no id)'} knowledge-base-ref ${JSON.stringify(ref)} does not match any KB id`)
    }
  }
  for (const t of tools) {
    if (!/^TOOL-\d+$/.test(String(t?.id ?? ''))) {
      err('TOOL_ID_FORMAT_INVALID', `agent-surface.tools[].id must match TOOL-\\d+ (got ${JSON.stringify(t?.id)})`)
    }
    if (t?.['api-ref'] && !apiIds.has(t['api-ref'])) {
      err('BROKEN_API_REF', `tool ${t?.id ?? '(no id)'} api-ref ${JSON.stringify(t['api-ref'])} does not match any API id`)
    }
  }
  for (const k of kbs) {
    if (!/^KB-\d+$/.test(String(k?.id ?? ''))) {
      err('KB_ID_FORMAT_INVALID', `agent-surface.knowledge-bases[].id must match KB-\\d+ (got ${JSON.stringify(k?.id)})`)
    }
    if (k?.retrieval && !KB_RETRIEVAL.includes(k.retrieval)) {
      err('KB_RETRIEVAL_INVALID', `knowledge-base ${k?.id ?? '(no id)'} retrieval ${JSON.stringify(k.retrieval)} is invalid`)
    }
  }
}

const nfr = fm['non-functional'] ?? {}
if (!isNonEmptyArray(nfr.performance) || !isNonEmptyArray(nfr.accessibility)) {
  err('NFR_INCOMPLETE', 'non-functional.performance and non-functional.accessibility must both be non-empty')
}

// --- Minimum Viable Spec (required before status: approved) ---
const ctx = fm.context ?? {}
const mvsChecks = [
  [isNonEmptyStr(meta.title), 'metadata.title'],
  [isNonEmptyStr(ctx.problem), 'context.problem'],
  [isNonEmptyStr(ctx.goal), 'context.goal'],
  [isNonEmptyArray(ctx['target-users']), 'context.target-users (≥1)'],
  [isNonEmptyArray(stories), 'user-stories (≥1)'],
  [isNonEmptyArray(nfr.accessibility), 'non-functional.accessibility (≥1)'],
  [isNonEmptyArray(nfr.security), 'non-functional.security (≥1)'],
  [isNonEmptyArray(fm.traceability?.['source-requirements']), 'traceability.source-requirements (≥1)'],
]
const storiesWithAc = new Set(acs.map((a) => a?.['story-ref']))
const storiesMissingAc = [...storyIds].filter((id) => !storiesWithAc.has(id))

const mvsFailures = mvsChecks.filter(([ok]) => !ok).map(([, name]) => name)
if (storiesMissingAc.length) mvsFailures.push(`acceptance-criteria for ${storiesMissingAc.join(', ')}`)

if (requireApproved || fm.status === 'approved') {
  for (const f of mvsFailures) err('MVS_INCOMPLETE', `minimum-viable-spec field missing: ${f}`)
} else {
  for (const f of mvsFailures) warn('MVS_INCOMPLETE', `minimum-viable-spec field missing (blocks status:approved): ${f}`)
}

// --- Report ---
for (const w of warnings) console.warn(`WARN  ${w}`)
for (const e of errors) console.error(`ERROR ${e}`)
console.log(`\n${errors.length ? 'INVALID' : 'VALID'} — ${errors.length} error(s), ${warnings.length} warning(s) — ${specPath}`)
process.exit(errors.length ? 1 : 0)
