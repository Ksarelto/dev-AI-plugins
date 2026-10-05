#!/usr/bin/env node
// Station 1 intake, deterministic part (references/context-protocol.md § Atomic Extraction Rules).
// Splits .spec/context/*.md into raw_requirements: one entry per table row, bullet, or
// requirement-bearing sentence, with source_file, source_line, section, and keyword hints.
// Glossary / decisions / success-measure / out-of-scope / copy / open-question sections are routed
// by heading. Fields that need judgement are left empty for the skill: type_hint,
// consolidated_entities, consolidated_user_roles, potential_conflicts, terminology_drift.
//
// Usage: node extract-intake.mjs --context <dir> --out <intake.json> [--timecode <tc>]
//        node extract-intake.mjs --context <dir> --slug-hint     # print the derived slug only
// Exit 0 on success, 1 when no non-empty .md file exists, 2 on usage error.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { flag } from './lib-spec.mjs'

const args = process.argv.slice(2)
const value = (name) => {
  const v = flag(args, name)
  return v && v !== true ? String(v) : ''
}
const contextDir = value('context') || '.spec/context'
const outPath = value('out')
const slugOnly = args.includes('--slug-hint')
if (!slugOnly && !outPath) {
  console.error('usage: extract-intake.mjs --context <dir> --out <intake.json> [--timecode <tc>] | --slug-hint')
  process.exit(2)
}

let files = []
try {
  files = readdirSync(contextDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f, path: join(contextDir, f), stat: statSync(join(contextDir, f)) }))
    .filter((f) => f.stat.isFile() && f.stat.size > 0)
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
} catch {
  files = []
}
if (!files.length) {
  console.error(`No requirement files found in ${contextDir}/.`)
  process.exit(1)
}

const kebab = (s) => {
  const k = String(s).toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return k.length > 50 ? k.slice(0, 50).replace(/-[^-]*$/, '') : k
}
const GENERIC = /^(requirements?|readme|notes?|spec|context|index|untitled)$/i
function slugHint() {
  for (const f of files) {
    const name = basename(f.name, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/^(req|notes|spec|feature|requirements)-/i, '')
    if (!GENERIC.test(name)) return kebab(name)
  }
  for (const f of files) {
    const h1 = readFileSync(f.path, 'utf8').match(/^#\s+(.+)$/m)?.[1]
    if (h1) return kebab(h1.replace(/^(feature|spec|prd|requirements?)\s*[:—-]\s*/i, ''))
  }
  return `untitled-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
}
if (slugOnly) {
  console.log(slugHint())
  process.exit(0)
}

const SECTION = {
  glossary: /glossary|terms|words we use|vocabulary|definitions/i,
  decisions: /decisions?/i,
  metrics: /success|metrics?|kpis?|measures? of/i,
  nonGoal: /out of scope|non-?goals?|not in scope|won'?t (do|build)|excluded/i,
  copy: /\bcopy\b|voice|tone|wording/i,
  questions: /open questions?|unknowns?|tbd|to be decided/i,
  narrative: /^(\d+(\.\d+)*\.?\s*)?(background|problem|pain points?|motivation|introduction|overview|why)\b/i,
}
const SIGNAL = /\b(must|shall|should|cannot|can't|can not|may|never|always|only|at most|at least|up to|within|after|before|required|requires|allowed|not allowed|is told|are told|notif|limit|expire|lapse|retain)\b|\d/i
const KIND = [
  ['nfr', /performance|latency|p9\d|load time|wcag|accessib|screen reader|secur|encrypt|uptime|availability|gdpr|privacy|offline|scal/i],
  ['copy', /["“][^"”]{6,}["”]|\b(message|copy|says|wording|label)\b/i],
  ['data', /\b(field|stores?|stored|record|retain|retention|archive|history|delete[sd]? after)\b/i],
  ['rule', /\d|at most|at least|up to|within|limit|expire|lapse|only if|unless/i],
  ['constraint', /\b(must not|cannot|can't|never|only)\b/i],
]
const kindOf = (text) => KIND.find(([, re]) => re.test(text))?.[0] ?? 'behavior'
const CATEGORY_SIGNAL = {
  'Error States': /error|fail|invalid|reject|try again|denied/i,
  'Permissions & Roles': /role|permission|admin|manager|only the|allowed to|can see/i,
  'Edge Cases': /edge|if .* already|conflict|concurrent|duplicate|empty|offline|at the same time/i,
  'Non-Functional': /performance|latency|wcag|accessib|secur|uptime|p9\d|seconds?/i,
  'Backward Compatibility': /existing (users|data|api)|migrat|backward|legacy/i,
  'Undo / Rollback': /undo|cancel|revert|confirm|restore|reverse/i,
  Notifications: /notif|email|sms|push|is told|are told|reminder|alert/i,
  'Data Lifecycle': /archive|delete|retention|retain|expire|lifecycle|status/i,
  Observability: /audit|log|metric|monitor|trace|report/i,
  'Localization & Accessibility': /language|locale|translat|date format|currency|wcag|accessib|screen reader/i,
}

const raw = []
const glossary = []
const decisions = []
const metrics = []
const copyExamples = []
const openQuestions = []
let n = 0
const nextId = () => `R-${String(++n).padStart(3, '0')}`

for (const f of files) {
  const lines = readFileSync(f.path, 'utf8').split(/\r?\n/)
  const roleHint = /notes|meeting|slack|email|transcript|chat|call/i.test(f.name) ? 'discussion' : 'authoritative'
  let section = ''
  let inFence = false
  let tableHead = null
  const leadIns = []
  const add = (text, line, extra = {}) => {
    const clean = text.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()
    if (clean.length < 4) return
    if (SECTION.questions.test(section) || /\bTBD\b|\?\s*$/.test(clean)) {
      openQuestions.push(clean)
      return
    }
    if (SECTION.copy.test(section) && /^(good|bad)\s*:/i.test(clean)) {
      const kind = clean.match(/^(good|bad)/i)[1].toLowerCase()
      const last = copyExamples.at(-1)
      if (kind === 'bad' && last && !last.bad) last.bad = clean.replace(/^bad\s*:\s*/i, '')
      else copyExamples.push({ [kind]: clean.replace(/^(good|bad)\s*:\s*/i, ''), source_line: line })
      return
    }
    const id = nextId()
    const kind = SECTION.metrics.test(section) ? 'metric' : SECTION.copy.test(section) ? 'copy' : kindOf(clean)
    raw.push({
      id, text: clean, source_file: f.name, source_line: line, section,
      kind_hint: kind, role_hint: roleHint,
      scope_hint: SECTION.nonGoal.test(section) ? 'non-goal' : 'in',
      confidence: extra.table || /\b(must|shall|never|always|cannot)\b/i.test(clean) ? 'high' : 'medium',
    })
    if (SECTION.decisions.test(section)) decisions.push(id)
    if (kind === 'metric') metrics.push(id)
  }

  lines.forEach((rawLine, i) => {
    const line = i + 1
    const text = rawLine.trimEnd()
    if (/^\s*(```|~~~)/.test(text)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const heading = text.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (heading) {
      section = heading[1].trim()
      tableHead = null
      leadIns.length = 0
      return
    }
    if (/^\s*\|.*\|\s*$/.test(text)) {
      const cells = text.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return
      if (!tableHead) {
        tableHead = cells
        return
      }
      if (SECTION.glossary.test(section) && cells.length >= 2) {
        glossary.push({ term: cells[0].replace(/\*\*/g, ''), meaning: cells.slice(1).join(' — '), source_line: line })
        return
      }
      add(cells.map((c, k) => (tableHead[k] ? `${tableHead[k]}: ${c}` : c)).join('; '), line, { table: true })
      return
    }
    tableHead = null
    if (!text.trim()) return
    const bullet = text.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/)
    if (bullet) {
      const depth = bullet[1].replace(/\t/g, '  ').length
      while (leadIns.length && leadIns.at(-1).depth >= depth) leadIns.pop()
      const item = bullet[2].trim()
      if (item.endsWith(':')) {
        leadIns.push({ depth, text: item.slice(0, -1) })
        return
      }
      if (SECTION.narrative.test(section)) return
      const glossaryItem = SECTION.glossary.test(section) && item.match(/^\**([^:*—-]+?)\**\s*[:—-]\s+(.+)$/)
      if (glossaryItem) {
        glossary.push({ term: glossaryItem[1].trim(), meaning: glossaryItem[2].trim(), source_line: line })
        return
      }
      add([...leadIns.map((l) => l.text), item].join(': '), line)
      return
    }
    leadIns.length = 0
    if (SECTION.narrative.test(section)) return
    for (const sentence of text.trim().split(/(?<=[.!?])\s+(?=[A-Z"“])/)) {
      if (SIGNAL.test(sentence) || SECTION.metrics.test(section) || SECTION.decisions.test(section) || SECTION.nonGoal.test(section)) add(sentence, line)
    }
  })
}

const allText = raw.map((r) => `${r.section}\n${r.text}`).join('\n')
const intake = {
  timecode: value('timecode'),
  source_files: files.map((f) => f.name),
  source_modified_at: Object.fromEntries(files.map((f) => [f.name, f.stat.mtime.toISOString()])),
  slug_hint: slugHint(),
  type_hint: '',
  raw_requirements: raw,
  glossary,
  decisions_already_made: decisions,
  success_metrics: metrics,
  copy_examples: copyExamples,
  consolidated_entities: [],
  consolidated_user_roles: [],
  potential_conflicts: [],
  terminology_drift: [],
  context_starved_categories: Object.entries(CATEGORY_SIGNAL).filter(([, re]) => !re.test(allText)).map(([c]) => c),
  raw_open_questions: openQuestions,
}
writeFileSync(outPath, `${JSON.stringify(intake, null, 2)}\n`)
console.log(JSON.stringify({ out: outPath, files: files.length, raw_requirements: raw.length, glossary: glossary.length, open_questions: openQuestions.length }))
