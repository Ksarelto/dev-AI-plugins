#!/usr/bin/env node
// Set status: approved, then re-run the minimum-viable check.
// On failure, put status back to reviewing and exit 1. Does not archive.
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

function save(status) {
  fm.status = status
  writeFileSync(specPath, writeSpec(specPath, fm, body, stringify))
}

save('approved')

const validator = join(dirname(fileURLToPath(import.meta.url)), 'validate-spec.mjs')
const run = spawnSync(process.execPath, [validator, specPath, '--require-approved'], { encoding: 'utf8' })
if (run.stdout) process.stdout.write(run.stdout)
if (run.stderr) process.stderr.write(run.stderr)
if (run.status === 0) {
  console.log(`OK: ${specPath} status=approved`)
  process.exit(0)
}

save('reviewing')
console.error('FAIL: validation failed; status reverted to reviewing. Do not archive or write an approved envelope.')
process.exit(1)
