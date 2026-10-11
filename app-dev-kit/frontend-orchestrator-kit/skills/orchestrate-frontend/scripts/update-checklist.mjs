#!/usr/bin/env node
// Station 3 write-back for task-checklist.md (references/checklist-format.md § Status Lifecycle).
// Usage:
//   node update-checklist.mjs <task-checklist.md> --feature F-001 --status in-progress|skipped|pending|blocked [--reason <text>]
//   node update-checklist.mjs <task-checklist.md> --feature F-001 --result <RESULT_OUT> [--fallback <kit-result.json>]
// --result maps the feature-dev envelope: approved → done (slug/branch/parent-branch copied, nested
// tasks done), aborted → pending, error → blocked. No envelope: first time stays in-progress with
// a "no kit-result — re-running" log line; a second time → blocked (agent-failed).
// Prints {"feature","from","to","next"} where next is continue | rerun | ask | stop.
// Exit 0 ok, 1 bad state (unknown feature, done without slug/branch), 2 usage error.

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function writeAtomic(path, contents) {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, contents)
  renameSync(tmp, path)
}

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : ''
}
const path = args[0]
const featureId = opt('feature')
const status = opt('status')
const resultPath = opt('result')
const approve = args.includes('--approve')
const preflight = opt('preflight')
if (!path || path.startsWith('--') || !existsSync(path) || (!approve && !preflight && (!featureId || (!status && !resultPath)))) {
  console.error('usage: update-checklist.mjs <task-checklist.md> (--approve | --preflight accepted | --feature F-001 (--status in-progress|skipped|pending|blocked [--reason r] | --result <kit-result.json> [--fallback <p>]))')
  process.exit(2)
}

const mod = await import('yaml').catch(() => null)
const parse = mod?.parse ?? mod?.default?.parse
const stringify = mod?.stringify ?? mod?.default?.stringify
if (typeof parse !== 'function') {
  console.error('FATAL: the "yaml" package is not installed in this plugin directory. Run npm install from the plugin root.')
  process.exit(2)
}

const raw = readFileSync(path, 'utf8')
const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
if (!match) {
  console.error(`FATAL: no YAML front matter in ${path}`)
  process.exit(2)
}
const front = parse(match[1])
let body = raw.slice(match[0].length)
const now = new Date().toISOString()
const logs = []
if (approve || preflight) {
  if (approve) {
    front.approved = now
    front['approved-spec-ref'] = front['spec-ref'] ?? ''
    logs.push(`- ${now} — checklist approved`)
  }
  if (preflight) {
    if (preflight !== 'accepted') {
      console.error('FATAL: --preflight must be accepted')
      process.exit(2)
    }
    front.preflight = `accepted ${now}`
    logs.push(`- ${now} — preflight accepted`)
  }
  front.updated = now
  body = `${body.trimEnd()}\n${logs.join('\n')}\n`
  writeAtomic(path, `---\n${stringify(front)}---\n${body}`)
  console.log(JSON.stringify({ approved: front.approved ?? '', preflight: front.preflight ?? '' }))
  process.exit(0)
}
const feature = (front.features ?? []).find((f) => f.id === featureId)
if (!feature) {
  console.error(`FATAL: ${featureId} is not in ${path}`)
  process.exit(1)
}

function boardSlice(slug) {
  if (!slug) return ''
  const boardPath = join(dirname(path), '..', 'features', `${slug}.md`)
  if (!existsSync(boardPath)) return ''
  const found = readFileSync(boardPath, 'utf8').match(/^slice-ref:\s*(\S+)/m)
  return found ? found[1].replace(/['"]/g, '') : ''
}
function envelopeMatches(env) {
  if (env.feature_id) return env.feature_id === feature.id
  if (feature.slug && env.slug === feature.slug) return true
  const slice = boardSlice(env.slug)
  if (slice && feature['slice-ref']) return slice === feature['slice-ref']
  if (!feature.slug && slice && feature['slice-ref'] && slice !== feature['slice-ref']) return false
  return !feature.slug && !slice
}

const from = feature.status
let next = 'continue'
const setStatus = (to, detail = '') => {
  feature.status = to
  feature.rerun = false
  logs.push(`- ${now} — ${featureId} status: ${from} → ${to}${detail ? ` (${detail})` : ''}`)
}

if (status) {
  if (!['in-progress', 'skipped', 'pending', 'blocked'].includes(status) || (status === 'blocked' && !opt('reason'))) {
    console.error('FATAL: --status must be in-progress, skipped, pending, or blocked --reason <r> — done comes from --result')
    process.exit(2)
  }
  if (status === 'blocked') feature['blocked-reason'] = opt('reason')
  setStatus(status, opt('reason'))
} else {
  const envPath = [resultPath, opt('fallback')].find((p) => p && existsSync(p))
  let env = envPath ? JSON.parse(readFileSync(envPath, 'utf8')) : null
  if (env && !envelopeMatches(env)) {
    logs.push(`- ${now} — ${featureId} stale envelope ignored (${env.slug || env.feature_id || envPath})`)
    env = null
  }
  if (!env) {
    if (feature.rerun) {
      feature['blocked-reason'] = 'agent-failed'
      setStatus('blocked', 'agent-failed')
      next = 'ask'
    } else {
      feature.rerun = true
      logs.push(`- ${now} — ${featureId} no kit-result — re-running`)
      next = 'rerun'
    }
  } else if (env.outcome === 'approved') {
    if (!env.slug || !env.branch) {
      console.error(`FATAL: approved envelope ${envPath} has no slug/branch`)
      process.exit(1)
    }
    feature.slug = env.slug
    feature.branch = env.branch
    feature['parent-branch'] = env.parent_branch ?? ''
    feature['blocked-reason'] = ''
    for (const task of feature.tasks ?? []) if (task.status !== 'skipped') task.status = 'done'
    setStatus('done', `slug: ${env.slug}, branch: ${env.branch}, parent: ${env.parent_branch || '—'}`)
  } else if (env.outcome === 'aborted') {
    setStatus('pending', env.reason || 'aborted')
    next = 'stop'
  } else {
    feature['blocked-reason'] = env.reason || 'error'
    setStatus('blocked', feature['blocked-reason'])
    next = 'ask'
  }
}

front.updated = now
body = `${body.trimEnd()}\n${logs.join('\n')}\n`
writeAtomic(path, `---\n${stringify(front)}---\n${body}`)
console.log(JSON.stringify({ feature: featureId, from, to: feature.status, next }))
