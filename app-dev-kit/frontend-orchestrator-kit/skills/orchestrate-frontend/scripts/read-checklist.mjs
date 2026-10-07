#!/usr/bin/env node
// Read-only views of task-checklist.md, so this skill never loads the YAML (or unions ref lists)
// in chat.
//   node read-checklist.mjs <task-checklist.md> --summary
//     one line per feature (id, status, priority, title, slice, nested task titles, depends-on),
//     counts, the first open feature, and whether spec.md changed after the checklist's `updated`.
//   node read-checklist.mjs <task-checklist.md> --payload F-001 [--preflight accepted]
//     the Station 3 feature-dev field block: ids and paths only, ref unions in task order,
//     PARENT_BRANCH from the current HEAD when it is feature/*.
// Exit 0 ok, 1 unknown feature, 2 usage error.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const path = args[0]
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : ''
}
const mode = args.includes('--summary') ? 'summary' : opt('payload') ? 'payload' : ''
if (!path || path.startsWith('--') || !existsSync(path) || !mode) {
  console.error('usage: read-checklist.mjs <task-checklist.md> (--summary | --payload F-001 [--preflight accepted])')
  process.exit(2)
}

const mod = await import('yaml').catch(() => null)
const parse = mod?.parse ?? mod?.default?.parse
if (typeof parse !== 'function') {
  console.error('FATAL: the "yaml" package is not installed in this plugin directory. Run npm install from the plugin root.')
  process.exit(2)
}
const match = readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)
if (!match) {
  console.error(`FATAL: no YAML front matter in ${path}`)
  process.exit(2)
}
const front = parse(match[1])
const features = front.features ?? []
const list = (v) => (Array.isArray(v) ? v : [])
const union = (tasks, key) => [...new Set(tasks.flatMap((t) => list(t[key])))]

if (mode === 'summary') {
  const count = (s) => features.filter((f) => f.status === s).length
  const open = features.find((f) => f.status === 'in-progress') ?? features.find((f) => !['done', 'skipped'].includes(f.status))
  const spec = front['spec-ref']
  const specNewer = Boolean(spec && existsSync(spec) && front.updated && statSync(spec).mtime > new Date(front.updated))
  console.log(`spec-ref: ${spec ?? ''}`)
  console.log(`prototype-ref: ${front['prototype-ref'] || '(none)'}`)
  console.log(`features: ${features.length} — done ${count('done')}, in-progress ${count('in-progress')}, pending ${count('pending')}, blocked ${count('blocked')}, skipped ${count('skipped')}`)
  console.log(`first-open: ${open ? `${open.id} (${open.status})` : '(none)'}`)
  console.log(`spec-newer-than-checklist: ${specNewer}`)
  for (const f of features) {
    const tasks = list(f.tasks)
    const extra = [
      f['slice-ref'] ? f['slice-ref'] : '',
      list(f['depends-on']).length ? `depends-on ${f['depends-on'].join(',')}` : '',
      f['blocked-reason'] ? `blocked: ${f['blocked-reason']}` : '',
      f.branch ? `branch ${f.branch}` : '',
    ].filter(Boolean).join('; ')
    console.log(`- ${f.id} [${f.status}] ${f.priority ?? ''} — ${f.title}${extra ? ` (${extra})` : ''}`)
    console.log(`    tasks (${tasks.length}): ${tasks.map((t) => `${t.id} ${t.title}${t.status !== 'pending' ? ` [${t.status}]` : ''}${t.change === 'remove' ? ' [remove]' : ''}`).join(' · ')}`)
  }
  process.exit(0)
}

const feature = features.find((f) => f.id === opt('payload'))
if (!feature) {
  console.error(`FATAL: ${opt('payload')} is not in ${path}`)
  process.exit(1)
}
const tasks = list(feature.tasks).filter((t) => t.status !== 'skipped')
let head = ''
try {
  head = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
} catch {
  head = ''
}
const lines = [
  ['REQUEST', `Feature ${feature.id} (${feature['slug-hint']}). Nested tasks in CHECKLIST_PATH. Read UPSTREAM_SPEC.`],
  ['UPSTREAM_SPEC', front['spec-ref'] ?? ''],
  ['FEATURE_ID', feature.id],
  ['SLICE_REF', feature['slice-ref'] ?? ''],
  ['TASK_IDS', tasks.map((t) => t.id).join(',')],
  ['SCREEN_REFS', tasks.map((t) => t['screen-ref']).filter(Boolean).join(',')],
  ['STORY_REFS', union(tasks, 'story-refs').join(',')],
  ['AC_REFS', union(tasks, 'ac-refs').join(',')],
  ['ENTITY_REFS', union(tasks, 'entity-refs').join(',')],
  ['PROTOTYPE_REF', front['prototype-ref'] ?? ''],
  ['CHECKLIST_PATH', path],
  ['SLUG_HINT', feature['slug-hint'] ?? ''],
  ['PARENT_BRANCH', head.startsWith('feature/') ? head : ''],
  ['RESULT_OUT', join(dirname(path), 'results', `${feature.id}.json`)],
  ['CHANGE', tasks.some((t) => t.change === 'remove') ? 'remove' : ''],
  ['PREFLIGHT', opt('preflight')],
].filter(([key, value]) => value !== '' || ['PARENT_BRANCH', 'PROTOTYPE_REF'].includes(key))
const width = Math.max(...lines.map(([k]) => k.length)) + 2
for (const [key, value] of lines) console.log(`${`${key}:`.padEnd(width)}${value}`)
