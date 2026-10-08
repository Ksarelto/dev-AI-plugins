#!/usr/bin/env node
// Compare this run's spec.md to the parent chain and write artifacts/changes.json
// (added / modified / removed ids per section). Downstream kits pass --changes with this file.
// Removals come from artifacts/removed.yaml.
//
// Usage: node write-changes.mjs --run <run-dir> [--root <dir>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { endpointsOf, flag, loadSpecChain, loadYaml } from './lib-spec.mjs'

const args = process.argv.slice(2)
const runArg = String(flag(args, 'run') || '')
const root = flag(args, 'root') && flag(args, 'root') !== true ? String(flag(args, 'root')) : process.cwd()
if (!runArg) {
  console.error('usage: write-changes.mjs --run <run-dir> [--root <dir>]')
  process.exit(2)
}

const runDir = runArg.startsWith('/') ? runArg : join(root, runArg)
const specPath = join(runDir, 'spec.md')
if (!existsSync(specPath)) {
  console.error(`FATAL: missing ${specPath}`)
  process.exit(1)
}

const { parse } = await loadYaml()
const chain = loadSpecChain(specPath, parse, root)
const current = chain[0]?.fm
if (!current) {
  console.error(`FATAL: cannot parse ${specPath}`)
  process.exit(1)
}
const ancestors = chain.slice(1)
const idOf = (item) => item?.id ?? item?.name ?? item?.term ?? ''
const list = (v) => (Array.isArray(v) ? v : [])

function collect(fm) {
  const ui = fm['ui-surface'] ?? {}
  const agent = fm['agent-surface'] ?? {}
  return {
    requirements: list(fm.requirements),
    roles: list(fm.roles),
    glossary: list(fm.glossary),
    permissions: list(fm.permissions),
    'business-rules': list(fm['business-rules']),
    'state-machines': list(fm['state-machines']),
    notifications: list(fm.notifications),
    'user-stories': list(fm['user-stories']),
    'acceptance-criteria': list(fm['acceptance-criteria']),
    risks: list(fm.risks),
    assumptions: list(fm.assumptions),
    'open-questions': list(fm['open-questions']),
    entities: list(fm.entities),
    screens: list(ui.screens),
    interactions: list(ui.interactions),
    endpoints: endpointsOf(fm),
    agents: list(agent.agents),
    tools: list(agent.tools),
    'knowledge-bases': list(agent['knowledge-bases']),
    slices: list(fm['delivery-plan']?.slices),
    decisions: list(fm.traceability?.decisions),
    'success-metrics': list(fm.context?.['success-metrics']),
  }
}

const ancestorIds = new Map()
for (const { fm } of ancestors) {
  const sections = collect(fm)
  for (const [key, items] of Object.entries(sections)) {
    const set = ancestorIds.get(key) ?? new Set()
    for (const item of items) {
      const id = idOf(item)
      if (id) set.add(id)
    }
    ancestorIds.set(key, set)
  }
}

const removedPath = join(runDir, 'artifacts/removed.yaml')
const removed = existsSync(removedPath) ? (parse(readFileSync(removedPath, 'utf8')) ?? {}) : {}
const currentSections = collect(current)
const changes = {}
for (const [key, items] of Object.entries(currentSections)) {
  const prior = ancestorIds.get(key) ?? new Set()
  const added = []
  const modified = []
  for (const item of items) {
    const id = idOf(item)
    if (!id) continue
    if (prior.has(id)) modified.push(id)
    else added.push(id)
  }
  changes[key] = {
    added,
    modified,
    removed: list(removed[key]).map(String),
  }
}
changes.mutations = { added: [], modified: [], removed: list(removed.mutations).map(String) }
changes.fields = removed.fields ?? {}

mkdirSync(join(runDir, 'artifacts'), { recursive: true })
writeFileSync(join(runDir, 'artifacts/changes.json'), `${JSON.stringify(changes, null, 2)}\n`)
console.log(`OK: wrote ${join(runDir, 'artifacts/changes.json')}`)
