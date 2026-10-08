#!/usr/bin/env node
// Deterministic clarification / pre-enrich gate (Stations 2 and 3). Reads analysis.json, recomputes
// the gap score from the gaps themselves (never trusts a stored score), and prints a decision.
//
// Decision:
//   ASK                      → spawn spec-interrogator, return CLARIFY_PACKET
//   PROCEED                  → Station 4; assumable gaps become assumptions
//   PROCEED_WITH_ASSUMPTIONS → round cap reached; open askable gaps become low-confidence
//                              assumptions AND blocking open-questions
//
// Askable = no safe default, OR high severity + blocks_synthesis (confirm the default instead of
// assuming it). Assumable gaps never force a question, however many there are.
//
// Usage: node gate-check.mjs <analysis.json> --round <n> [--max-rounds 3] [--threshold 25]
// Exit 0 always on a decision (read stdout JSON). Exit 2 on usage/parse failure.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { flag } from './lib-spec.mjs'

const args = process.argv.slice(2)
const path = args.find((a, i) => !a.startsWith('--') && !['--round', '--max-rounds', '--threshold'].includes(args[i - 1]))
if (!path) {
  console.error('usage: node gate-check.mjs <analysis.json> --round <n> [--max-rounds 3] [--threshold 25]')
  process.exit(2)
}
const num = (name, fallback) => {
  const v = flag(args, name)
  return v && v !== true && Number.isFinite(Number(v)) ? Number(v) : fallback
}
const round = num('round', 0)
const maxRounds = num('max-rounds', 3)
const threshold = num('threshold', 25)

let analysis
try {
  analysis = JSON.parse(readFileSync(path, 'utf8'))
} catch (e) {
  console.error(`FATAL: cannot read ${path}: ${e.message}`)
  process.exit(2)
}

if ('requirements_map' in analysis || 'qa_log' in analysis) {
  console.error('ERROR [ANALYSIS_BLOAT] analysis.json must not carry requirements_map or a qa_log copy')
  process.exit(2)
}
if (analysis.delta === true) {
  const basePath = join(dirname(path), 'analysis.base.json')
  if (!existsSync(basePath)) {
    console.error('ERROR [ANALYSIS_DELTA] delta: true but analysis.base.json is missing — copy the previous analysis.json there first')
    process.exit(2)
  }
  const base = JSON.parse(readFileSync(basePath, 'utf8'))
  analysis = {
    ...base,
    gaps: analysis.gaps ?? base.gaps,
    root_cause_groups: analysis.root_cause_groups ?? base.root_cause_groups,
    change_intents: analysis.change_intents ?? base.change_intents,
  }
  delete analysis.delta
  writeFileSync(path, `${JSON.stringify(analysis, null, 2)}\n`)
}

const gaps = Array.isArray(analysis.gaps) ? analysis.gaps : []
const open = gaps.filter((g) => (g?.status ?? 'open') === 'open')
const weight = (g) => {
  if (g.severity === 'high') return g.blocks_synthesis ? 15 : 10
  if (g.severity === 'medium') return 5
  return 2
}
function score(list) {
  let total = list.reduce((sum, g) => sum + weight(g), 0)
  const groups = new Map()
  for (const g of list) if (g.root_cause_group) groups.set(g.root_cause_group, (groups.get(g.root_cause_group) ?? 0) + 1)
  for (const size of groups.values()) if (size > 1) total -= (size - 1) * 5
  return Math.max(0, Math.min(100, total))
}

// High + blocks_synthesis is a "must be true" gap: ask even when a default exists — the
// interrogator offers that default as the (Recommended) option, so confirming costs one click.
const blocking = open.filter((g) => g.severity === 'high' && g.blocks_synthesis)
const askable = open.filter((g) => g.can_assume_default !== true || blocking.includes(g))
const assumable = open.filter((g) => !askable.includes(g))
const conflicts = (Array.isArray(analysis.conflicts) ? analysis.conflicts : [])
  .filter((c) => (c?.status ?? 'open') !== 'resolved' && ['contradiction', 'terminology_drift', undefined].includes(c?.type))
const crossStory = (Array.isArray(analysis.cross_story_conflicts) ? analysis.cross_story_conflicts : [])
  .filter((c) => (c?.status ?? 'open') !== 'resolved')

const gapScore = score(open)
const askableScore = score(askable)
let decision
let reason
if (round >= maxRounds) {
  decision = askable.length || conflicts.length ? 'PROCEED_WITH_ASSUMPTIONS' : 'PROCEED'
  reason = `round cap ${maxRounds} reached`
} else if (blocking.length || conflicts.length || crossStory.length) {
  decision = 'ASK'
  reason = `${blocking.length} blocking gap(s), ${conflicts.length + crossStory.length} open conflict(s)`
} else if (askableScore > threshold) {
  decision = 'ASK'
  reason = `askable gap score ${askableScore} > ${threshold}`
} else {
  decision = 'PROCEED'
  reason = `askable gap score ${askableScore} ≤ ${threshold}, no blocking gaps or conflicts`
}

const ids = (list, key = 'gap_id') => list.map((x) => x?.[key] ?? x?.id).filter(Boolean)
console.log(JSON.stringify({
  decision,
  reason,
  round,
  gap_score: gapScore,
  askable_score: askableScore,
  stored_gap_score: analysis.gap_score ?? null,
  blocking_gaps: ids(blocking),
  askable_gaps: ids(askable),
  assumable_gaps: ids(assumable),
  open_conflicts: [...ids(conflicts, 'conflict_id'), ...ids(crossStory)],
}, null, 2))
