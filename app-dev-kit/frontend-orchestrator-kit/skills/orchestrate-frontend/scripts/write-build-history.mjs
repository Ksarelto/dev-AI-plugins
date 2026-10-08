#!/usr/bin/env node
// Appends one run entry to build-history.md.
// Records spec version, prototype version, and which features completed this run (done status).
// Usage: node write-build-history.mjs --spec <spec.md> --prototype <ref|""> --checklist <task-checklist.md> --out <build-history.md>

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : ''
}

const specPath = opt('spec')
const protoRef = opt('prototype')
const checklistPath = opt('checklist')
const outPath = opt('out')

if (!specPath || !checklistPath || !outPath) {
  console.error('usage: write-build-history.mjs --spec <spec.md> --prototype <ref> --checklist <task-checklist.md> --out <build-history.md>')
  process.exit(2)
}

const mod = await import('yaml').catch(() => null)
const parse = mod?.parse ?? mod?.default?.parse
if (typeof parse !== 'function') {
  console.error('FATAL: the "yaml" package is not installed. Run npm install from the plugin root.')
  process.exit(2)
}

function readFront(path) {
  const raw = readFileSync(path, 'utf8')
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) { console.error(`FATAL: no front matter in ${path}`); process.exit(2) }
  return parse(m[1])
}

const checklist = readFront(checklistPath)
const features = checklist.features ?? []

const done = features.filter((f) => f.status === 'done')
const counts = {
  total: features.length,
  done: done.length,
  skipped: features.filter((f) => f.status === 'skipped').length,
  blocked: features.filter((f) => f.status === 'blocked').length,
  pending: features.filter((f) => f.status === 'pending').length,
}

// specId = the run folder name (e.g. "spec-20261007-120000-my-app")
const specId = basename(dirname(specPath))

const doneLines = done.map((f) => {
  const branch = f.branch ? ` → branch \`${f.branch}\`` : ''
  const parent = f['parent-branch'] ? ` (parent \`${f['parent-branch']}\`)` : ''
  return `- ${f.id} — ${f.title}${branch}${parent}`
}).join('\n') || '(none this run)'

const stamp = new Date().toISOString()

const entry = [
  '',
  `## Run ${stamp}`,
  `**Spec version**: ${specId}`,
  `**Spec path**: ${specPath}`,
  `**Prototype**: ${protoRef || '(none)'}`,
  '',
  '### Features completed',
  doneLines,
  '',
  `### Stats: ${counts.done}/${counts.total} done, ${counts.skipped} skipped, ${counts.blocked} blocked, ${counts.pending} pending`,
  '',
  '---',
].join('\n')

mkdirSync(dirname(outPath), { recursive: true })
const prior = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '# Frontend Build History\n'
writeFileSync(outPath, prior.trimEnd() + '\n' + entry + '\n', 'utf8')

console.log(`OK: appended run entry to ${outPath} (${counts.done} done features)`)
process.exit(0)
