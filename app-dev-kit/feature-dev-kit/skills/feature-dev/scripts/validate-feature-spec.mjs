#!/usr/bin/env node
// Deterministic structural validator for the feature blackboard.
// Gate at Station 0.5 (spec approval) — replaces "does this look complete?" judgement.
// Usage: node validate-feature-spec.mjs <path-to-.spec/features/slug.md> [--require-buildable]
// Exit 0 = valid. Exit 1 = structural errors. Exit 2 = usage/parse failure.
// Schema of record: ../references/feature-spec-format.md

import { readFileSync } from 'node:fs'

const STATUSES = [
  'draft', 'awaiting-clarification', 'investigating', 'awaiting-dep-approval',
  'approved', 'building', 'review', 'awaiting-human', 'changes-requested', 'done',
]

// Sections every spec must carry, in template order. Matching is case-insensitive.
const REQUIRED_SECTIONS = [
  'Request',
  'Clarifications',
  'Acceptance Criteria',
  'FSD Impact',
  'API Contract / Data Model',
  'UI Surface',
  'Architecture Baseline',
  'Reuse Map',
  'Tech Investigation',
  'Dependencies',
  'Build Plan',
  'Gate Log',
  'Human Review',
  'Decisions & Open Questions',
]

// Sections that must contain real content before the build may start.
const MUST_BE_FILLED = ['Request', 'Acceptance Criteria']

// Wording that makes an acceptance criterion unverifiable.
const VAGUE_TERMS = [
  'works well', 'user-friendly', 'looks good', 'fast', 'intuitive',
  'properly', 'correctly', 'as expected', 'nice', 'clean', 'etc.',
]

const PLACEHOLDER = /^\s*(<[^>]*>|TBD|TODO|\.\.\.|\|?\s*\|)\s*$/i

const args = process.argv.slice(2)
const requireBuildable = args.includes('--require-buildable')
const requireScoped = args.includes('--require-scoped')
const specPath = args.find((a) => !a.startsWith('--'))

if (!specPath) {
  console.error('usage: node validate-feature-spec.mjs <path-to-spec.md> [--require-buildable] [--require-scoped]')
  process.exit(2)
}

let raw
try {
  raw = readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`FATAL: cannot read ${specPath}: ${e.message}`)
  process.exit(2)
}

const errors = []
const warnings = []
const err = (code, msg) => errors.push(`[${code}] ${msg}`)
const warn = (code, msg) => warnings.push(`[${code}] ${msg}`)

// --- Front matter (hand-parsed: flat key: value only, no yaml dependency) ---
const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
if (!fmMatch) {
  console.error('FATAL: no YAML front matter found (expected a leading --- ... --- block).')
  process.exit(2)
}
const fm = Object.fromEntries(
  fmMatch[1]
    .split('\n')
    .map((line) => line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/i))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
)

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.slug ?? '')) {
  err('SLUG_FORMAT_INVALID', `slug must be kebab-case (got ${JSON.stringify(fm.slug)})`)
}
if (!STATUSES.includes(fm.status)) {
  err('STATUS_INVALID', `status must be one of ${STATUSES.join(', ')} (got ${JSON.stringify(fm.status)})`)
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.created ?? '')) {
  warn('CREATED_FORMAT', `created should be YYYY-MM-DD (got ${JSON.stringify(fm.created)})`)
}

const expectedSlug = specPath.split('/').pop().replace(/\.md$/, '')
if (fm.slug && fm.slug !== expectedSlug) {
  err('SLUG_PATH_MISMATCH', `slug "${fm.slug}" does not match filename "${expectedSlug}" — derived artifacts will orphan`)
}

const none = (v) => !v || v === 'none' || v === '<path to .spec/app/spec-*/spec.md, or none>'
if (fm['upstream-spec'] && !none(fm['upstream-spec'])) {
  if (!/\.spec\/app\/spec-/.test(fm['upstream-spec']) && !/spec\.md$/.test(fm['upstream-spec'])) {
    err('UPSTREAM_SPEC_FORMAT', `upstream-spec should point at spec.md under .spec/app/ (got ${JSON.stringify(fm['upstream-spec'])})`)
  }
}

const hasTask = !none(fm['task-id'])
const hasScreen = !none(fm['screen-ref'])
if (requireScoped && !hasTask && !hasScreen) {
  err('REQUIRE_SCOPED', 'task-id and screen-ref are both empty — a type:app spec must be imported as one screen-task')
}

// --- Sections ---
const body = raw.slice(fmMatch[0].length)
const sections = new Map()
const headingRe = /^##\s+(.+?)\s*$/gm
const found = [...body.matchAll(headingRe)]

found.forEach((m, i) => {
  const start = m.index + m[0].length
  const end = i + 1 < found.length ? found[i + 1].index : body.length
  const content = body
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((l) => l.trim() && !PLACEHOLDER.test(l))
    .join('\n')
    .trim()
  sections.set(m[1].trim().toLowerCase(), content)
})

for (const name of REQUIRED_SECTIONS) {
  if (!sections.has(name.toLowerCase())) {
    err('SECTION_MISSING', `required section "## ${name}" is absent`)
  }
}

if (hasScreen) {
  const ui = sections.get('ui surface') ?? ''
  if (ui && !ui.includes(fm['screen-ref'])) {
    err('SCREEN_REF_MISSING_FROM_UI', `"## UI Surface" must mention screen-ref ${fm['screen-ref']}`)
  }
}

for (const name of MUST_BE_FILLED) {
  const content = sections.get(name.toLowerCase())
  if (content !== undefined && content.length === 0) {
    err('SECTION_EMPTY', `"## ${name}" contains only placeholders — it must be filled before build`)
  }
}

// --- Acceptance criteria quality ---
const acRaw = sections.get('acceptance criteria') ?? ''
const criteria = acRaw
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^(\d+\.|[-*]\s*(\[[ x]\])?)\s*\S/.test(l))

if (criteria.length === 0) {
  err('AC_MISSING', 'no acceptance criteria found — expected a numbered or checkbox list')
} else if (criteria.length < 2) {
  warn('AC_THIN', `only ${criteria.length} acceptance criterion — most features need at least 2`)
}

for (const c of criteria) {
  const hit = VAGUE_TERMS.find((t) => c.toLowerCase().includes(t))
  if (hit) {
    err('AC_NOT_TESTABLE', `acceptance criterion is not verifiable ("${hit}"): ${c.slice(0, 80)}`)
  }
  if (c.replace(/^(\d+\.|[-*]\s*(\[[ x]\])?)\s*/, '').length < 15) {
    err('AC_TOO_SHORT', `acceptance criterion is too vague to test: ${c.slice(0, 80)}`)
  }
}

// --- Dependency approval (Station 1b) ---
const deps = sections.get('dependencies') ?? ''
if (/awaiting-human-approval/i.test(deps)) {
  const msg = 'Dependencies section has packages still awaiting human approval'
  if (['approved', 'building', 'review', 'awaiting-human', 'done'].includes(fm.status)) {
    err('DEP_UNAPPROVED', `${msg} but status is "${fm.status}" — approval must precede build`)
  } else {
    warn('DEP_UNAPPROVED', `${msg} — Station 1b must clear before Station 2`)
  }
}

// --- Buildable checks (Station 2 entry) ---
if (requireBuildable || ['building', 'review', 'awaiting-human'].includes(fm.status)) {
  for (const name of ['FSD Impact', 'Build Plan']) {
    if (!(sections.get(name.toLowerCase()) ?? '').length) {
      err('NOT_BUILDABLE', `"## ${name}" must be populated before the build may start`)
    }
  }
}

// --- Report ---
for (const w of warnings) console.warn(`WARN  ${w}`)
for (const e of errors) console.error(`ERROR ${e}`)
console.log(
  `\n${errors.length ? 'INVALID' : 'VALID'} — ${errors.length} error(s), ${warnings.length} warning(s), `
  + `${criteria.length} acceptance criteria — ${specPath}`,
)
process.exit(errors.length ? 1 : 0)
