#!/usr/bin/env node
// Scoped spec YAML → backend blackboard. One resource per run.
// Usage: node import-upstream.mjs --spec <spec.md> --out <backend.md> [filters] [--require-scoped]

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
  console.error('FATAL: yaml package not resolvable')
  process.exit(2)
}

const raw = readFileSync(specPath, 'utf8')
const match = raw.match(/^---\n([\s\S]*?)\n---/)
if (!match) {
  console.error('FATAL: no YAML front matter')
  process.exit(2)
}
const spec = parse(match[1])
const entities = spec.entities ?? []
const endpoints = [
  ...(spec['api-surface']?.endpoints ?? []),
  ...(spec['api-surface']?.mutations ?? []),
]
const stories = spec['user-stories'] ?? []
const acs = spec['acceptance-criteria'] ?? []

const isApp = spec.type === 'app' || entities.length > 1 || endpoints.length > 3
if (requireScoped && isApp && !taskId && entityRefs.length === 0 && apiRefs.length === 0) {
  console.error('ERROR [REQUIRE_SCOPED] type:app imported with no TASK_ID / ENTITY_REFS / API_REFS')
  process.exit(1)
}

const keptEntities = entityRefs.length
  ? entities.filter((e) => entityRefs.includes(e.name))
  : entities
const keptApis = apiRefs.length
  ? endpoints.filter((e) => apiRefs.includes(e.id))
  : endpoints.filter((e) => keptEntities.some((ent) =>
    `${e.path ?? ''} ${e.description ?? ''}`.toLowerCase().includes(String(ent.name).toLowerCase())))
const keptStories = storyRefs.length
  ? stories.filter((s) => storyRefs.includes(s.id))
  : stories
const keptAcs = acRefs.length
  ? acs.filter((a) => acRefs.includes(a.id))
  : acs.filter((a) => keptStories.some((s) => s.id === a['story-ref']))

let protoHint = 'No prototype bound.'
if (prototypeRef && existsSync(join(prototypeRef, 'page-map.json'))) {
  protoHint = `page-map: ${join(prototypeRef, 'page-map.json')} (read by implementer; do not inline HTML)`
}

let fm = {}
if (existsSync(outPath)) {
  const existing = readFileSync(outPath, 'utf8')
  const fmMatch = existing.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) fm = parse(fmMatch[1]) ?? {}
}

const slug = fm.slug || ''
const front = {
  slug,
  status: fm.status ?? 'draft',
  created: fm.created ?? new Date().toISOString().slice(0, 10),
  branch: fm.branch ?? (slug ? `backend/${slug}` : ''),
  'upstream-spec': specPath,
  'task-id': taskId,
  'entity-refs': keptEntities.map((e) => e.name),
  'api-refs': keptApis.map((e) => e.id),
  'prototype-ref': prototypeRef,
}

const acLines = keptAcs.length
  ? keptAcs.map((a) => `- ${a.id} (${a['story-ref']}): Given ${a.given}; when ${a.when}; then ${a.then}`).join('\n')
  : '- (none imported)'
const model = keptEntities.length
  ? keptEntities.map((e) => {
    const fields = (e.fields ?? []).map((f) => `  - ${f.name}: ${f.type}${f.required ? ' (required)' : ''}`).join('\n')
    return `### ${e.name}\n${e.description ?? ''}\n${fields}`
  }).join('\n\n')
  : '- (none)'
const apiLines = keptApis.length
  ? keptApis.map((e) => `- ${e.id} ${e.method} ${e.path} auth=${e['auth-required'] ?? ''} — ${e.description ?? ''}`).join('\n')
  : '- (none)'

const body = `
# Backend increment — ${keptEntities.map((e) => e.name).join(', ') || slug}

## Request

${spec.metadata?.title ?? ''} — ${spec.context?.goal ?? ''}

## Clarifications

## Acceptance Criteria

${acLines}

## Data Model

${model}

## API Contract

${apiLines}

## Contract Hints

${protoHint}

## Reuse Map

## Dependencies

## Build Plan

## Gate Log

## Human Review

## Decisions & Open Questions
`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `---\n${stringify(front)}---\n${body}`)
console.log(`OK: wrote ${outPath}`)
process.exit(0)
