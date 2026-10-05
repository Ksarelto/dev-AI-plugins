#!/usr/bin/env node
// Station 9 review packet, composed from the spec YAML and validator warnings — no model.
// Cycle 0: full one-screen summary. Cycle 1+: delta from artifacts/review-changes.json (written by
// the spec-review-facilitator apply pass), plus unconfirmed assumptions from cycle 2.
//
// Usage: node compose-review.mjs <spec.md> --cycle <n> [--views <spec.views.md>]
//          [--changes <review-changes.json>] [--out <review-packet.md>]
// Writes the packet (default {spec dir}/artifacts/review-packet.md) and prints its path.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { endpointsOf, flag, loadYaml, readSpec } from './lib-spec.mjs'

const args = process.argv.slice(2)
const value = (name) => {
  const v = flag(args, name)
  return v && v !== true ? String(v) : ''
}
const specPath = args.find((a, i) => !a.startsWith('--') && !['--cycle', '--views', '--changes', '--out'].includes(args[i - 1]))
if (!specPath) {
  console.error('usage: compose-review.mjs <spec.md> --cycle <n> [--views <path>] [--changes <path>] [--out <path>]')
  process.exit(2)
}
const cycle = Number(value('cycle') || 0)
const views = value('views') || join(dirname(specPath), 'spec.views.md')
const changesPath = value('changes') || join(dirname(specPath), 'artifacts/review-changes.json')
const outPath = value('out') || join(dirname(specPath), 'artifacts/review-packet.md')

const { parse } = await loadYaml()
const { fm } = readSpec(specPath, parse)
const list = (v) => (Array.isArray(v) ? v : [])

let warnings = []
try {
  const validator = join(dirname(fileURLToPath(import.meta.url)), 'validate-spec.mjs')
  const stdout = execFileSync(process.execPath, [validator, specPath, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  warnings = JSON.parse(stdout).warnings ?? []
} catch (e) {
  try {
    warnings = JSON.parse(e.stdout ?? '{}').warnings ?? []
  } catch {
    warnings = []
  }
}
const byCode = new Map()
for (const w of warnings) {
  const code = w.match(/^\[([A-Z_]+)\]/)?.[1] ?? 'WARN'
  byCode.set(code, (byCode.get(code) ?? 0) + 1)
}

const reqs = list(fm.requirements)
const must = reqs.filter((r) => r.priority === 'must')
const uncovered = must.filter((r) => (r.scope ?? 'in') === 'in' && !list(r['covered-by']).length)
const acs = list(fm['acceptance-criteria'])
const slices = list(fm['delivery-plan']?.slices)
const confirm = list(fm.assumptions).filter((a) => a['requires-confirmation'])
const blocking = list(fm['open-questions']).filter((q) => q.blocking && q.status !== 'resolved')
const rule = '──────────────────────────────────────────'

const status = [
  `  Requirements:  ${reqs.length} (${must.length} must) — ${uncovered.length} must without coverage`,
  `  Stories / ACs: ${list(fm['user-stories']).length} / ${acs.length} (${acs.filter((a) => a.kind !== 'happy').length} error/edge/permission)`,
  `  Rules / state machines / notifications / permissions: ${list(fm['business-rules']).length} / ${list(fm['state-machines']).length} / ${list(fm.notifications).length} / ${list(fm.permissions).length}`,
  `  Endpoints / screens: ${endpointsOf(fm).length} / ${list(fm['ui-surface']?.screens).length}`,
]
const confirmLines = [
  ...confirm.map((a) => `  ${a.id}: ${a.description}`),
  ...blocking.map((q) => `  ${q.id}${list(q.affects).length ? ` (blocks ${list(q.affects).join(', ')})` : ''}: ${q.question}`),
]
const notes = [...byCode].map(([code, n]) => `  ${code} ×${n}`)

const out = []
if (cycle === 0) {
  const metrics = list(fm.context?.['success-metrics']).map((m) => `${m.metric ?? m.id}${m.target ? ` ${m.target}` : ''}`)
  out.push(
    rule,
    ` SPEC REVIEW: ${fm.metadata?.title ?? fm.metadata?.slug ?? ''}`,
    ` ${fm.timecode ?? ''} | spec-version ${fm['spec-version']} | Status: ${fm.status}`,
    rule,
    'INTENT (confirm or correct):',
    `  - Outcome:      ${fm.context?.goal ?? ''}`,
    `  - Users:        ${list(fm.roles).map((r) => r.name).join(', ')}`,
    `  - Success:      ${metrics.length ? metrics.join('; ') : fm.context?.goal ?? ''}`,
    `  - Constraint:   ${list(fm.context?.constraints)[0] ?? '—'}`,
    `  - Out of scope: ${list(fm.context?.['non-goals']).join('; ') || '—'}`,
    '',
    'CONTENT',
    ...status,
    '',
    'BUILD ORDER (delivery plan)',
    ...slices.map((s, i) => `  ${i + 1}. ${s.id} ${s.title} [${list(s.tracks).join(', ')}] — ${s.goal ?? ''}${list(s['depends-on']).length ? ` (after ${list(s['depends-on']).join(', ')})` : ''}`),
  )
  if (confirmLines.length) out.push('', '⚠ NEEDS YOUR CONFIRMATION', ...confirmLines)
  if (notes.length) out.push('', 'ℹ NOTES (non-blocking validator warnings):', ...notes)
  out.push('', `Full tables and diagrams: ${views}`, rule, 'Reply "approved" to finalize, or describe what needs changing', '(you can reorder, merge, or split slices here).', rule)
} else {
  const changes = existsSync(changesPath) ? JSON.parse(readFileSync(changesPath, 'utf8')) : {}
  out.push(rule, ` SPEC UPDATE — CHANGES APPLIED (Round ${cycle})`, rule, '', 'CHANGES MADE:')
  for (const c of list(changes.changes_applied)) out.push(`  ✓ ${c.change_id}: ${c.summary ?? `${c.type} ${c.target}`}`)
  if (list(changes.unresolved_changes).length) out.push('', 'NOT APPLIED:', ...list(changes.unresolved_changes).map((c) => `  ✗ ${c.description ?? c}`))
  out.push('', 'CURRENT STATUS:', ...status)
  if (cycle >= 2 && confirm.length) out.push('', 'UNCONFIRMED ASSUMPTIONS — confirm or correct:', ...confirm.map((a) => `  ${a.id}: ${a.description}\n    → Confirm (keep as-is) or replace with: ___`))
  if (changes.convergence_detected) out.push('', '⚡ CONVERGENCE DETECTED: remaining changes are cosmetic. Approve as-is?')
  if (notes.length) out.push('', 'ℹ NOTES (non-blocking validator warnings):', ...notes)
  out.push('', rule, 'Approve these changes? Or describe further adjustments.', rule)
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${out.join('\n')}\n`)
console.log(outPath)
