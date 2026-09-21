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
if (!raw.includes('## Acceptance Criteria')) errors.push('missing ## Acceptance Criteria')
if (!raw.includes('## Data Model') && !raw.includes('## API Contract')) {
  errors.push('missing ## Data Model or ## API Contract')
}
if (!/^---\n[\s\S]*?\n---/.test(raw)) errors.push('missing YAML front matter')
for (const e of errors) console.error(`ERROR ${e}`)
console.log(errors.length ? 'INVALID' : 'VALID')
process.exit(errors.length ? 1 : 0)
