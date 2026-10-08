#!/usr/bin/env node
// Join enriched.json requirements with artifacts/coverage.yaml and write requirements.yaml
// next to spec.md (one flow-style line per requirement). The synthesizer never re-types
// requirement text into spec.md.
//
// Usage: node build-requirements.mjs --run <run-dir> [--root <dir>]
// Exit 0 ok, 1 missing inputs, 2 usage error.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { flag, loadYaml } from './lib-spec.mjs'

const args = process.argv.slice(2)
const runArg = String(flag(args, 'run') || '')
const root = flag(args, 'root') && flag(args, 'root') !== true ? String(flag(args, 'root')) : process.cwd()
if (!runArg) {
  console.error('usage: build-requirements.mjs --run <run-dir> [--root <dir>]')
  process.exit(2)
}

const runDir = runArg.startsWith('/') ? runArg : join(root, runArg)
const enrichedPath = join(runDir, 'artifacts/enriched.json')
const coveragePath = join(runDir, 'artifacts/coverage.yaml')
const outPath = join(runDir, 'requirements.yaml')
if (!existsSync(enrichedPath)) {
  console.error(`FATAL: missing ${enrichedPath}`)
  process.exit(1)
}

const { parse } = await loadYaml()
const enriched = JSON.parse(readFileSync(enrichedPath, 'utf8'))
const coverage = existsSync(coveragePath) ? (parse(readFileSync(coveragePath, 'utf8')) ?? {}) : {}
const KIND = new Set(['behavior', 'rule', 'constraint', 'nfr', 'data', 'copy', 'metric'])

function yamlQuote(value) {
  return JSON.stringify(String(value ?? ''))
}

function flowItem(req) {
  const kind = KIND.has(req.kind) ? req.kind : KIND.has(req.type) ? req.type : 'behavior'
  const source = req.source || 'stated'
  const ref = req['source-ref'] ?? req.source_ref ?? req.ref ?? ''
  const priority = req.priority ?? 'must'
  const scope = req.scope ?? 'in'
  const covered = coverage[req.id] ?? req['covered-by'] ?? []
  const parts = [`id: ${req.id}`, `text: ${yamlQuote(req.text)}`]
  if (kind !== 'behavior') parts.push(`kind: ${kind}`)
  if (source !== 'stated') parts.push(`source: ${source}`)
  if (ref) parts.push(`ref: ${yamlQuote(ref)}`)
  if (priority !== 'must') parts.push(`priority: ${priority}`)
  if (scope !== 'in') parts.push(`scope: ${scope}`)
  if (covered.length) parts.push(`covered-by: [${covered.join(', ')}]`)
  return `  - {${parts.join(', ')}}`
}

const lines = ['requirements:', ...(enriched.requirements ?? []).map(flowItem), '']
writeFileSync(outPath, `${lines.join('\n')}\n`)
console.log(JSON.stringify({ out: outPath, requirements: (enriched.requirements ?? []).length }))
