#!/usr/bin/env node
// Set status: approved, then re-run the validator with --require-approved.
// On failure, put status back to reviewing and exit 1. Does not archive.
// On success, render spec.views.md and write slices/SL-NNN.yaml build briefs next to spec.md.
// Usage: node publish-spec.mjs <spec.md>

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadYaml, readSpec, writeSpec } from './lib-spec.mjs'

const specPath = process.argv[2]
if (!specPath || specPath.startsWith('--')) {
  console.error('usage: node publish-spec.mjs <spec.md>')
  process.exit(2)
}

const { parse, stringify } = await loadYaml()
const { fm, body } = readSpec(specPath, parse)
const here = dirname(fileURLToPath(import.meta.url))

function save(status) {
  fm.status = status
  writeFileSync(specPath, writeSpec(specPath, fm, body, stringify))
}

function node(script, scriptArgs) {
  const run = spawnSync(process.execPath, [join(here, script), ...scriptArgs], { encoding: 'utf8' })
  if (run.stdout) process.stdout.write(run.stdout)
  if (run.stderr) process.stderr.write(run.stderr)
  return run.status
}

save('approved')
if (node('validate-spec.mjs', [specPath, '--require-approved']) !== 0) {
  save('reviewing')
  console.error('FAIL: validation failed; status reverted to reviewing. Do not archive or write an approved envelope.')
  process.exit(1)
}
if (node('render-spec-views.mjs', [specPath]) !== 0 || node('write-slice-briefs.mjs', [specPath]) !== 0) {
  save('reviewing')
  console.error('FAIL: could not write spec.views.md or slice briefs; status reverted to reviewing.')
  process.exit(1)
}
console.log(`OK: ${specPath} status=approved`)
