#!/usr/bin/env node
// Scoped spec YAML → agent blackboard. One agent-surface row per run.
// Usage: node import-upstream.mjs --spec <spec.md> --out <agent.md> [filters] [--require-scoped]

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
const agents = spec['agent-surface']?.agents ?? []
const tools = spec['agent-surface']?.tools ?? []
const kbs = spec['agent-surface']?.['knowledge-bases'] ?? []
const stories = spec['user-stories'] ?? []
const acs = spec['acceptance-criteria'] ?? []

if (requireScoped && agents.length > 1 && !agentRef && !taskId) {
  console.error('ERROR [REQUIRE_SCOPED] multiple agents imported with no AGENT_REF / TASK_ID')
  process.exit(1)
}

const keptAgent = agentRef
  ? agents.find((a) => a.id === agentRef)
  : agents[0]
const keptTools = tools.filter((t) => (keptAgent?.['tool-refs'] ?? []).includes(t.id))
const keptKbs = kbs.filter((k) => (keptAgent?.['knowledge-base-refs'] ?? []).includes(k.id))
const keptStories = storyRefs.length
  ? stories.filter((s) => storyRefs.includes(s.id))
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
  const fmMatch = existing.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) fm = parse(fmMatch[1]) ?? {}
}

const slug = fm.slug || ''
const front = {
  slug,
  status: fm.status ?? 'draft',
  created: fm.created ?? new Date().toISOString().slice(0, 10),
  branch: fm.branch ?? (slug ? `agent/${slug}` : ''),
  'upstream-spec': specPath,
  'task-id': taskId,
  'agent-ref': keptAgent?.id ?? agentRef,
  'prototype-ref': prototypeRef,
}

const acLines = keptAcs.length
  ? keptAcs.map((a) => `- ${a.id} (${a['story-ref']}): Given ${a.given}; when ${a.when}; then ${a.then}`).join('\n')
  : '- (none imported)'
const toolLines = keptTools.length
  ? keptTools.map((t) => `- ${t.id} ${t.name} api-ref=${t['api-ref'] ?? ''} — ${t.description ?? ''}`).join('\n')
  : '- (none)'
const kbLines = keptKbs.length
  ? keptKbs.map((k) => `- ${k.id} ${k.name} retrieval=${k.retrieval ?? ''} source=${k.source ?? ''}`).join('\n')
  : '- (none)'

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
writeFileSync(outPath, `---\n${stringify(front)}---\n${body}`)
console.log(`OK: wrote ${outPath}`)
process.exit(0)
