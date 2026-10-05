#!/usr/bin/env node
// Station 5 completeness gate, deterministic part. The spec-completeness agent judges only the
// credit level per category (completeness-credits.json); this script does the rest:
//   - source fidelity: every intake raw_requirements id is in some enriched requirements[].intake_refs
//   - fidelity warnings: stated numbers with no rule param / retention, assumptions that restate a
//     requirement, too many assumptions
//   - assumption-only evidence capped at partial, weights, n/a re-normalisation, score, gate_passes
//
// Usage: node score-completeness.mjs --intake <intake.json> --enriched <enriched.json>
//          --credits <completeness-credits.json> --out <completeness.json> [--threshold 85]
// Exit 0 when the gate passes, 1 when it fails, 2 on usage error.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { flag } from './lib-spec.mjs'

const args = process.argv.slice(2)
const path = (name) => {
  const v = flag(args, name)
  return v && v !== true ? String(v) : ''
}
const [intakePath, enrichedPath, creditsPath, outPath] = ['intake', 'enriched', 'credits', 'out'].map(path)
if (!intakePath || !enrichedPath || !creditsPath || !outPath) {
  console.error('usage: score-completeness.mjs --intake <intake.json> --enriched <enriched.json> --credits <completeness-credits.json> --out <completeness.json> [--threshold 85]')
  process.exit(2)
}
const threshold = Number(path('threshold') || 85)

const CATEGORIES = [
  ['error_states', 'Error States', 15],
  ['permissions_roles', 'Permissions & Roles', 15],
  ['edge_cases', 'Edge Cases', 12],
  ['non_functional', 'Non-Functional', 12],
  ['backward_compatibility', 'Backward Compatibility', 8],
  ['undo_rollback', 'Undo / Rollback', 8],
  ['notifications', 'Notifications', 8],
  ['data_lifecycle', 'Data Lifecycle', 8],
  ['observability', 'Observability', 7],
  ['localization_accessibility', 'Localization & Accessibility', 7],
]

const readJson = (p) => {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
const list = (v) => (Array.isArray(v) ? v : [])
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const intake = readJson(intakePath) ?? {}
const enriched = readJson(enrichedPath)
const credits = readJson(creditsPath)?.categories ?? {}
const raw = list(intake.raw_requirements)

if (!enriched || !list(enriched.requirements).length) {
  const out = {
    completeness_score: 0,
    gate_passes: false,
    parse_error: true,
    unmapped_source_requirements: raw.map((r) => ({ id: r.id, text: r.text })),
    fidelity_warnings: [],
    category_scores: Object.fromEntries(CATEGORIES.map(([key, , max]) => [key, { awarded: 0, max, credit: 'none' }])),
    missing_categories: CATEGORIES.map(([, category, weight]) => ({ category, weight, gap_description: 'enriched.json missing or empty', example_question: '' })),
    partial_categories: [],
  }
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
  console.log(JSON.stringify({ completeness_score: 0, gate_passes: false, parse_error: true }))
  process.exit(1)
}

const mapped = new Set(list(enriched.requirements).flatMap((r) => list(r.intake_refs)))
const unmapped = raw.filter((r) => !mapped.has(r.id)).map((r) => ({ id: r.id, text: r.text }))

const warnings = []
const paramText = JSON.stringify([
  list(enriched.business_rules).map((b) => b.params ?? {}),
  list(enriched.entities).map((e) => e.retention ?? ''),
  list(enriched.state_machines).flatMap((m) => list(m.transitions).map((t) => t.after ?? '')),
]).toLowerCase()
const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fourteen: 14, thirty: 30 }
for (const r of raw) {
  if (r.scope_hint === 'non-goal' || r.kind_hint === 'metric' || r.kind_hint === 'copy') continue
  const nums = [
    ...String(r.text ?? '').matchAll(/\b(\d+(?:\.\d+)?)\s*(?:%|minutes?|hours?|days?|weeks?|months?|years?|items?|times|mb|kb|gb|characters?|seconds?)\b/gi),
  ].map((m) => m[1])
  for (const [word, n] of Object.entries(numberWords)) {
    if (new RegExp(`\\b${word}\\s+(?:minutes?|hours?|days?|weeks?|months?|years?|items?|active|times)\\b`, 'i').test(r.text ?? '')) nums.push(String(n))
  }
  const missing = [...new Set(nums)].filter((n) => !new RegExp(`(^|[^0-9])${n.replace('.', '\\.')}([^0-9]|$)`).test(paramText))
  if (missing.length) warnings.push(`${r.id}: stated number ${missing.join(', ')} is in no business_rules params, retention, or timer`)
}
const reqTexts = new Set(list(enriched.requirements).map((r) => norm(r.text)))
for (const a of list(enriched.assumptions)) {
  if (reqTexts.has(norm(a.description))) warnings.push(`${a.id}: assumption restates a stated requirement`)
}
const assumptionCount = list(enriched.assumptions).length
if (assumptionCount > 60) warnings.push(`${assumptionCount} assumptions (over ~60 — conventions or over-splitting)`)

const scores = {}
const missingCategories = []
const partialCategories = []
let awardedSum = 0
let weightSum = 0
for (const [key, category, max] of CATEGORIES) {
  const c = credits[key] ?? {}
  let credit = ['full', 'partial', 'none', 'n/a'].includes(c.credit) ? c.credit : 'none'
  const ids = String(c.evidence ?? '').match(/\b[A-Z]+-\d+\b/g) ?? []
  if (credit === 'full' && ids.length && ids.every((id) => id.startsWith('ASSM-'))) credit = 'partial'
  if (credit === 'n/a' && !c.reason) credit = 'none'
  const awarded = credit === 'full' ? max : credit === 'partial' ? Math.floor(max / 2) : 0
  scores[key] = { awarded, max, credit, ...(c.evidence ? { evidence: c.evidence } : {}), ...(c.reason ? { reason: c.reason } : {}) }
  if (credit === 'n/a') continue
  awardedSum += awarded
  weightSum += max
  const gap = { category, weight: max, gap_description: c.gap_description ?? '', example_question: c.example_question ?? '' }
  if (credit === 'none') missingCategories.push(gap)
  if (credit === 'partial') partialCategories.push(gap)
}
const score = weightSum ? Math.round((100 * awardedSum) / weightSum) : 0
const gatePasses = score >= threshold && unmapped.length === 0

const out = {
  completeness_score: score,
  gate_passes: gatePasses,
  unmapped_source_requirements: unmapped,
  fidelity_warnings: warnings,
  category_scores: scores,
  missing_categories: missingCategories,
  partial_categories: partialCategories,
}
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify({ completeness_score: score, gate_passes: gatePasses, unmapped: unmapped.length, fidelity_warnings: warnings.length }))
process.exit(gatePasses ? 0 : 1)
