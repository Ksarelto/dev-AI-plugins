#!/usr/bin/env node
// Read-only views of task-checklist.md, so this skill never loads the YAML (or unions ref lists)
// in chat.
//   node read-checklist.mjs <task-checklist.md> --summary
//     one line per feature (id, status, priority, title, slice, nested task titles, depends-on),
//     counts, the first open feature, whether spec.md changed after the checklist's `updated`,
//     and a WARN slice-size line when one feature spans more than one behavior or piles
//     acceptance criteria onto one screen.
//   node read-checklist.mjs <task-checklist.md> --payload F-001 [--preflight accepted]
//     the Station 3 feature-dev field block: ids and paths only, ref unions in task order,
//     PARENT_BRANCH from the row's parent-branch, else the current HEAD when it is feature/* and not this row's branch.
// Exit 0 ok, 1 unknown feature, 2 usage error.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'

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
const VIEW_STATE = new Set(['loading', 'empty', 'error', 'success', 'populated', 'pending'])
// ponytail: title words after dropping view-state words, and more than 8 ACs on one screen. Split by real behavior labels when the checklist carries them.
function sliceSizeWarnings(feature, tasks) {
  const keys = new Set()
  for (const task of tasks) {
    const words = String(task.title ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VIEW_STATE.has(w))
    if (words.length) keys.add(words.join(' '))
  }
  const lines = []
  if (keys.size > 1 && !feature['slice-ref']) lines.push(`WARN slice-size: ${feature.id} spans ${keys.size} behaviors (${[...keys].join(' | ')}) — split before build`)
  const acs = union(tasks, 'ac-refs')
  const screens = new Set(tasks.map((t) => t['screen-ref']).filter(Boolean))
  if (screens.size <= 1 && acs.length > 8) lines.push(`WARN slice-size: ${feature.id} has ${acs.length} acceptance criteria on one screen — likely new shared primitives; split before build`)
  return lines
}

if (mode === 'summary') {
  const count = (s) => features.filter((f) => f.status === s).length
  const open = features.find((f) => f.status === 'in-progress') ?? features.find((f) => !['done', 'skipped'].includes(f.status))
  const spec = front['spec-ref']
  const derivedAt = front.derived || front.updated
  const specNewer = Boolean(spec && existsSync(spec) && derivedAt && statSync(spec).mtime > new Date(derivedAt))
  console.log(`spec-ref: ${spec ?? ''}`)
  console.log(`prototype-ref: ${front['prototype-ref'] || '(none)'}`)
  console.log(`features: ${features.length} — done ${count('done')}, in-progress ${count('in-progress')}, pending ${count('pending')}, blocked ${count('blocked')}, skipped ${count('skipped')}`)
  console.log(`first-open: ${open ? `${open.id} (${open.status})` : '(none)'}`)
  console.log(`spec-newer-than-checklist: ${specNewer}`)
  console.log(`approved: ${front.approved ?? ''}`)
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
    for (const line of sliceSizeWarnings(f, tasks)) console.log(`    ${line}`)
  }
  const seenFeature = new Set()
  const seenTask = new Set()
  for (const f of features) {
    if (seenFeature.has(f.id)) console.log(`ERROR duplicate-id: ${f.id}`)
    seenFeature.add(f.id)
    for (const task of list(f.tasks)) {
      if (seenTask.has(task.id)) console.log(`ERROR duplicate-id: ${task.id}`)
      seenTask.add(task.id)
    }
    if (f.status === 'done' && !f.branch) console.log(`ERROR done-without-branch: ${f.id}`)
    if (f.status === 'blocked' && !f['blocked-reason']) console.log(`ERROR blocked-without-reason: ${f.id}`)
    const envelopePath = join(dirname(path), 'results', `${f.id}.json`)
    if (f['slice-ref'] && existsSync(envelopePath)) {
      try {
        const env = JSON.parse(readFileSync(envelopePath, 'utf8'))
        const boardPath = env.slug ? join(dirname(path), '..', 'features', `${env.slug}.md`) : ''
        if (boardPath && existsSync(boardPath)) {
          const board = readFileSync(boardPath, 'utf8').match(/^slice-ref:\s*(\S+)/m)
          const boardSlice = board ? board[1].replace(/['"]/g, '') : ''
          if (boardSlice && boardSlice !== f['slice-ref']) {
            console.log(`WARN stale-envelope: ${f.id} envelope slug ${env.slug} is ${boardSlice}, row is ${f['slice-ref']}`)
          }
        }
      } catch { /* unreadable envelope is reported when Station 3 applies it */ }
    }
  }
  const featuresDir = join(dirname(path), '..', 'features')
  const checklistSlices = new Set(features.map((f) => f['slice-ref']).filter(Boolean))
  if (checklistSlices.size && existsSync(featuresDir)) {
    for (const name of readdirSync(featuresDir)) {
      if (!name.endsWith('.md')) continue
      const text = readFileSync(join(featuresDir, name), 'utf8')
      const status = text.match(/^status:\s*(\S+)/m)?.[1]
      const slice = text.match(/^slice-ref:\s*(\S+)/m)?.[1]?.replace(/['"]/g, '')
      if (status === 'done' && slice && slice !== 'none' && !checklistSlices.has(slice)) {
        console.log(`WARN orphan-board: ${name.replace(/\.md$/, '')} ${slice} is done but not on the checklist`)
      }
    }
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
function parentSpec(specFile) {
  if (!specFile || !existsSync(specFile)) return ''
  const match = readFileSync(specFile, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return ''
  const parent = parse(match[1])?.metadata?.['parent-spec']
  if (!parent) return ''
  return isAbsolute(parent) ? parent : join(process.cwd(), parent)
}
function resolveUpstream(featureRow) {
  const fallback = front['spec-ref'] ?? ''
  const source = featureRow['source-spec']
  if (!source || !fallback) return fallback
  let current = fallback
  const seen = new Set()
  while (current && !seen.has(current) && existsSync(current)) {
    seen.add(current)
    if (basename(dirname(current)) === source) return current
    current = parentSpec(current)
  }
  return fallback
}
const lines = [
  ['REQUEST', `Feature ${feature.id} (${feature['slug-hint']}). Nested tasks in CHECKLIST_PATH. Read UPSTREAM_SPEC.`],
  ['UPSTREAM_SPEC', resolveUpstream(feature)],
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
  ['PARENT_BRANCH', feature['parent-branch']
    ? feature['parent-branch']
    : (head.startsWith('feature/') && head !== (feature.branch ?? '') ? head : '')],
  ['RESULT_OUT', join(dirname(path), 'results', `${feature.id}.json`)],
  ['CHANGE', tasks.some((t) => t.change === 'remove') ? 'remove' : ''],
  ['PREFLIGHT', opt('preflight') || (String(front.preflight ?? '').startsWith('accepted') ? 'accepted' : '')],
].filter(([key, value]) => value !== '' || ['PARENT_BRANCH', 'PROTOTYPE_REF'].includes(key))
const width = Math.max(...lines.map(([k]) => k.length)) + 2
for (const [key, value] of lines) console.log(`${`${key}:`.padEnd(width)}${value}`)
