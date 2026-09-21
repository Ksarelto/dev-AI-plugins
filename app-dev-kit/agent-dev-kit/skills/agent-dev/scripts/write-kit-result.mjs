#!/usr/bin/env node
// Writes app-dev-kit/kit-result/v1 JSON.
// Schema: app-orchestrator-kit/skills/orchestrate-app/references/result-envelope.md
// Usage: node write-kit-result.mjs --out <path> --kit <name> --outcome approved|aborted|error [fields]
// Optional: --also <second-path>

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}

const out = flag('out')
if (!out || out === true) {
  console.error('usage: write-kit-result.mjs --out <path> --kit <name> --outcome approved|aborted|error')
  process.exit(2)
}

const outcome = String(flag('outcome') || '')
if (!['approved', 'aborted', 'error'].includes(outcome)) {
  console.error('FATAL: --outcome must be approved, aborted, or error')
  process.exit(2)
}

function str(name) {
  const v = flag(name)
  return String(v === true ? '' : v || '')
}

const result = {
  envelope: 'app-dev-kit/kit-result/v1',
  kit: str('kit'),
  outcome,
  spec_path: str('spec-path'),
  prototype_ref: str('prototype-ref'),
  feature_spec: str('feature-spec'),
  backend_spec: str('backend-spec'),
  agent_spec: str('agent-spec'),
  work_plan: str('work-plan'),
  slug: str('slug'),
  branch: str('branch'),
  run_dir: str('run-dir'),
  reason: str('reason'),
  written: new Date().toISOString(),
}

function write(path) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(`OK: wrote ${path}`)
}

write(out)
const also = flag('also')
if (also && also !== true) write(also)
