#!/usr/bin/env node
// Structural check of a backend blackboard.
// Usage: node validate-backend-spec.mjs <path-to-backend.md>
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: node validate-backend-spec.mjs <backend.md>')
  process.exit(2)
}

const raw = readFileSync(path, 'utf8')
const errors = []
const STATUSES = [
  'draft', 'awaiting-clarification', 'investigating', 'awaiting-dep-approval',
  'approved', 'building', 'review', 'awaiting-human', 'changes-requested', 'done',
]
if (!raw.includes('## Acceptance Criteria')) errors.push('missing ## Acceptance Criteria')
if (!raw.includes('## Data Model') && !raw.includes('## API Contract')) {
  errors.push('missing ## Data Model or ## API Contract')
}
const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
if (!fm) errors.push('missing YAML front matter')
else {
  const status = fm[1].match(/^status:\s*['"]?([A-Za-z-]+)['"]?\s*$/m)?.[1]
  if (!STATUSES.includes(status)) errors.push(`status must be one of ${STATUSES.join(', ')}`)
}
const acHeading = raw.search(/^## Acceptance Criteria\s*$/m)
const acLines = []
if (acHeading >= 0) {
  for (const line of raw.slice(acHeading).split('\n').slice(1)) {
    if (/^## /.test(line)) break
    if (/^\s*-\s+\S/.test(line) && !/none imported/i.test(line)) acLines.push(line)
  }
}
if (!acLines.length) errors.push('Acceptance Criteria has no criterion line')
for (const e of errors) console.error(`ERROR ${e}`)
console.log(errors.length ? 'INVALID' : 'VALID')
process.exit(errors.length ? 1 : 0)
