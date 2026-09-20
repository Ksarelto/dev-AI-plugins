#!/usr/bin/env node
// Writes app-dev-kit/kit-result/v1 JSON. Schema: orchestrator-kit references/result-envelope.md
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

const result = {
  envelope: 'app-dev-kit/kit-result/v1',
  kit: String(flag('kit') || ''),
  outcome,
  spec_path: String(flag('spec-path') === true ? '' : flag('spec-path') || ''),
  prototype_ref: String(flag('prototype-ref') === true ? '' : flag('prototype-ref') || ''),
  feature_spec: String(flag('feature-spec') === true ? '' : flag('feature-spec') || ''),
  slug: String(flag('slug') === true ? '' : flag('slug') || ''),
  branch: String(flag('branch') === true ? '' : flag('branch') || ''),
  run_dir: String(flag('run-dir') === true ? '' : flag('run-dir') || ''),
  reason: String(flag('reason') === true ? '' : flag('reason') || ''),
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
