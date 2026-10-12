#!/usr/bin/env node
// Section-level access to a feature blackboard (.spec/features/<slug>.md), so no agent has to Read
// or rewrite the whole file to touch one part of it. Every file write is a temp file plus rename,
// so a crash cannot leave a partial board.
//
//   board.mjs section <board.md> --get "<Header>"                  print one section body
//   board.mjs section <board.md> --put "<Header>" --from <file>    replace one section body
//                     "Build Plan" is refused when it breaks templates/build-plan.md rules 4, 7, 8, or 10
//   board.mjs append  <board.md> --section "<Header>" --line "<text>"   append one line (table row or bullet)
//   board.mjs row     <board.md> --row 4[,5] --status todo|in-progress|done|blocked [--note "<text>"]
//                     sets the Build Plan Status cell and replaces the row's single Note (no history)
//   board.mjs card    <board.md> --row 4[,5] --agent <name> [--layer <layer>] [--kit <KIT_DIR>] [--station <label>]
//                     writes cards/common.md once (request, decisions, reuse map) and
//                     cards/row-4[-5].md (rows, acceptance criteria, FSD Impact paths, this row's screens, scoped API).
//   board.mjs handoff <board.md> --name <stem> --outcome <text> --paths <a,b> --decisions <a;b> --gates <text>
//                     writes <slug>.context/<stem>.md, at most 15 lines. A --gates "fail" is refused
//                     unless --outcome starts with "blocked:" (and the row is marked blocked).
//   board.mjs gate    <board.md> --station "<label>" (--json '<run-gates JSON>' | --gate <name> --result pass|fail [--note "<text>"])
//                     appends to <slug>.context/gate-log.jsonl and rewrites gate-status.md (latest per gate)
//   board.mjs timing  <board.md> --station "<label>" --event start|end|spawn [--agent <name>]
//                     appends to <slug>.context/timings.jsonl (card and gate append there too)
//   board.mjs timing  <board.md> --summary
//                     seconds per station (each spawn runs until the next event) plus time between steps
//   board.mjs parent-map <board.md>
//                     writes FSD Impact + Reuse Map of the stack parent and of each feature-id named in
//                     ## Change request to <slug>.context/parent-map.md; NONE, exit 1 when there is none
//   board.mjs snapshot <board.md> --round <n>
//                     writes the worktree hash (tracked + untracked) to <slug>.context/fix-round-<n>.tree
//   board.mjs changed  <board.md> --since <n>
//                     prints a comma list of paths that differ from that snapshot
//   board.mjs audit-scope <board.md> [--prior <report.md>]
//                     REUSE <path> when the parent audit still covers this feature; FULL otherwise
//
// Exit 0 ok, 1 not found (section, row), 2 usage error.

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [cmd, boardPath, ...rest] = process.argv.slice(2)
const opt = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 && rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[i + 1] : ''
}
const usage = (msg) => {
  console.error(`usage: board.mjs section|append|row|card|handoff|gate|timing|snapshot|changed|audit-scope|parent-map <board.md> … — ${msg}`)
  process.exit(2)
}
if (!cmd || cmd === '--help' || cmd === 'help') {
  const header = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1)
  console.log(header.slice(0, header.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(cmd ? 0 : 2)
}
if (!boardPath) usage('missing board path')
if (!existsSync(boardPath)) usage(`no board at ${boardPath}`)

const writeAtomic = (path, contents) => {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, contents)
  renameSync(tmp, path)
}

const contextDir = boardPath.replace(/\.md$/, '.context')
const now = () => new Date().toISOString()
const read = () => readFileSync(boardPath, 'utf8')
const oneLine = (t) => String(t ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim()
const jsonl = (name, entry) => {
  mkdirSync(contextDir, { recursive: true })
  appendFileSync(join(contextDir, name), `${JSON.stringify({ at: now(), ...entry })}\n`)
}

// [start, end) of a section body: after the "## Header" line, up to the next "## " heading.
function locate(text, header) {
  const lines = text.split('\n')
  const want = header.trim().toLowerCase()
  const start = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').trim().toLowerCase() === want)
  if (start < 0) return null
  let end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l))
  if (end < 0) end = lines.length
  return { lines, start, end }
}
const body = (text, header) => {
  const at = locate(text, header)
  return at ? at.lines.slice(at.start + 1, at.end).join('\n').trim() : null
}
function putBody(text, header, rawContent) {
  const own = rawContent.trim().split('\n')
  const content = /^##\s+/.test(own[0]) && own[0].replace(/^##\s+/, '').trim().toLowerCase() === header.trim().toLowerCase()
    ? own.slice(1).join('\n')
    : rawContent
  const at = locate(text, header)
  if (!at) return `${text.trimEnd()}\n\n## ${header}\n\n${content.trim()}\n`
  const { lines, start, end } = at
  return [...lines.slice(0, start + 1), '', content.trim(), '', ...lines.slice(end)].join('\n')
}

// The Build Plan table: the first table whose header has a "#" column.
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const rowLine = (values) => `| ${values.join(' | ')} |`
function planTable(lines, start, end) {
  for (let i = start; i < end; i++) {
    if (!lines[i].trim().startsWith('|')) continue
    const head = cells(lines[i])
    if (!head.includes('#')) continue
    let last = i + 1
    while (last + 1 < end && lines[last + 1].trim().startsWith('|')) last++
    return { header: i, sep: i + 1, first: i + 2, last, head }
  }
  return null
}
const rowIds = () => String(opt('row')).split(',').map((s) => s.trim()).filter(Boolean)

// The templates/build-plan.md rules whose breach costs an extra worker spawn.
function planErrors(content) {
  const lines = content.split('\n')
  const table = planTable(lines, 0, lines.length)
  const head = table?.head.map((h) => h.toLowerCase()) ?? []
  if (!head.includes('layer') || !head.includes('slice')) return []
  const rows = lines.slice(table.first, table.last + 1).map(cells).map((vals) => {
    const at = (name) => String(vals[head.indexOf(name)] ?? '').trim()
    return { id: at('#'), layer: at('layer').toLowerCase(), slice: at('slice'), note: at('note'), text: `${at('slice')} ${at('segments')} ${at('note')}` }
  })
  const errors = []
  const bySlice = new Map()
  for (const r of rows.filter((r) => !['shared', 'app'].includes(r.layer))) {
    const key = `${r.layer}/${r.slice}`
    bySlice.set(key, [...(bySlice.get(key) ?? []), r.id])
  }
  for (const [slice, ids] of bySlice) {
    if (ids.length > 2) errors.push(`rule 4 — ${slice} is split over rows ${ids.join(', ')}. One slice is one row; past ~12 files, two (non-UI segments, then ui + locales)`)
  }
  const shared = rows.filter((r) => r.layer === 'shared' && !/hand-(written|authored)/i.test(r.note))
  if (shared.length > 1) {
    errors.push(`rule 8 — shared rows ${shared.map((r) => r.id).join(', ')} are one batch row (primitives in one shadcn add, theme port, query keys). Only a hand-written shared/ui component gets its own row, with "hand-written" in its Note`)
  }
  for (const r of rows) {
    if (/^(confirm|verify|check)\b|\bconfirm (that|the existing)\b/i.test(r.note)) errors.push(`rule 10 — row ${r.id} only confirms existing code. Make it a preamble note; the gates still run over it`)
  }
  const themeRows = rows.filter((r) => r.layer === 'shared' && /\btheme\b|globals\.css|port-prototype-theme/i.test(r.text))
  const ref = read().match(/^prototype-ref:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  const globals = 'src/shared/ui/theme/globals.css'
  if (themeRows.length && ref && ref !== 'none' && existsSync(globals)) {
    const script = join(dirname(fileURLToPath(import.meta.url)), 'port-prototype-theme.mjs')
    const check = spawnSync(process.execPath, [script, '--check', '--prototype', ref, '--globals', globals], { encoding: 'utf8' })
    if (check.status === 0) errors.push(`rule 7 — the theme is in sync (port-prototype-theme --check passed). Drop the theme port from row ${themeRows.map((r) => r.id).join(', ')} and write "Theme: in sync" in the preamble`)
  }
  return errors
}

// The board in the same folder whose `branch:` is this board's `parent-branch:`, or ''.
function parentBoard() {
  const unquote = (v) => (v ?? '').trim().replace(/^['"]|['"]$/g, '')
  const parent = unquote(read().match(/^parent-branch:\s*(.*)$/m)?.[1])
  if (!parent || parent === 'none') return ''
  const featuresDir = dirname(boardPath)
  for (const name of readdirSync(featuresDir)) {
    if (!name.endsWith('.md')) continue
    const candidate = join(featuresDir, name)
    if (resolve(candidate) === resolve(boardPath)) continue
    if (unquote(readFileSync(candidate, 'utf8').match(/^branch:\s*(.*)$/m)?.[1]) === parent) return candidate
  }
  return ''
}

// Rows of the ## FSD Impact table as `layer/slice` paths. The Slice cell may be bare (`profile`),
// layer-prefixed (`entities/profile`), or src-prefixed. Placeholder template rows are dropped.
function impactRows(content) {
  const tableLines = (content ?? '').split('\n').filter((line) => line.trim().startsWith('|'))
  if (tableLines.length < 3) return []
  const head = cells(tableLines[0]).map((h) => h.toLowerCase())
  const real = (value) => value && !/^-+$/.test(value) && !/^<[^>]*>$/.test(value)
  return tableLines.slice(2).map((line) => {
    const vals = cells(line)
    const at = (name) => {
      const index = head.indexOf(name)
      return index >= 0 ? String(vals[index] ?? '').trim() : ''
    }
    const layer = real(at('layer').replace(/`/g, '')) ? at('layer').replace(/`/g, '') : ''
    const rawSlice = at('slice').replace(/`/g, '').replace(/^src\//, '')
    const slice = real(rawSlice) ? rawSlice : ''
    const path = layer && slice && !slice.startsWith(`${layer}/`) ? `${layer}/${slice}` : slice || layer
    const extra = [at('segments'), at('change')].filter(real).join(' — ')
    return { path, slice, extra }
  }).filter((row) => row.path)
}

// Path list from ## FSD Impact, filtered to this card's slices.
function impactPaths(content, names, kebab) {
  const rows = impactRows(content)
  const sliceOf = (row) => kebab(row.slice.split('/').pop())
  const matched = names.length
    ? rows.filter((row) => names.some((n) => {
      const slice = sliceOf(row)
      return slice && (slice === n || slice.endsWith(`-${n}`) || n.endsWith(`-${slice}`))
    }))
    : []
  return (matched.length ? matched : rows).map((row) => `- \`${row.path}\`${row.extra ? ` — ${row.extra}` : ''}`).join('\n')
}

if (cmd === 'section') {
  const text = read()
  const get = opt('get')
  const put = opt('put')
  if (get) {
    const content = body(text, get)
    if (content === null) {
      console.error(`NOT FOUND: ## ${get}`)
      process.exit(1)
    }
    process.stdout.write(`${content}\n`)
  } else if (put && opt('from')) {
    const errors = put === 'Build Plan' ? planErrors(readFileSync(opt('from'), 'utf8')) : []
    if (errors.length) {
      for (const e of errors) console.error(`REFUSED: Build Plan ${e}`)
      process.exit(1)
    }
    if (put === 'Build Plan' && !rest.includes('--force')) {
      const current = body(text, 'Build Plan') ?? ''
      const hasDone = current.split('\n').some((line) => {
        if (!line.trim().startsWith('|')) return false
        return cells(line).some((cell) => cell.trim().toLowerCase() === 'done')
      })
      if (hasDone) {
        console.error('REFUSED: Build Plan has a done row. Pass --force to replace it.')
        process.exit(1)
      }
    }
    writeAtomic(boardPath, putBody(text, put, readFileSync(opt('from'), 'utf8')))
    console.log(`OK: replaced ## ${put}`)
  } else usage('section needs --get "<Header>" or --put "<Header>" --from <file>')
} else if (cmd === 'append') {
  const section = opt('section')
  const line = opt('line')
  if (!section || !line) usage('append needs --section and --line')
  const text = read()
  const at = locate(text, section)
  if (!at) {
    writeAtomic(boardPath, putBody(text, section, line))
  } else {
    const { lines, start, end } = at
    let last = end - 1
    while (last > start && !lines[last].trim()) last--
    // Drop an empty template placeholder row ("| | |") when the first real row arrives.
    if (/^\|(\s*\|)+\s*$/.test(lines[last]) && line.trim().startsWith('|')) lines.splice(last--, 1)
    lines.splice(last + 1, 0, line)
    writeAtomic(boardPath, lines.join('\n'))
  }
  console.log(`OK: appended to ## ${section}`)
} else if (cmd === 'row') {
  const ids = rowIds()
  const status = opt('status')
  if (!ids.length || !['todo', 'in-progress', 'done', 'blocked'].includes(status)) usage('row needs --row <n> and --status todo|in-progress|done|blocked')
  const text = read()
  const at = locate(text, 'Build Plan')
  const table = at && planTable(at.lines, at.start + 1, at.end)
  if (!table) {
    console.error('NOT FOUND: Build Plan table')
    process.exit(1)
  }
  const { lines } = at
  let noteCol = table.head.findIndex((h) => h.toLowerCase() === 'note')
  if (noteCol < 0) {
    // Older boards: add the Note column once, then every row has exactly one current note.
    for (let i = table.header; i <= table.last; i++) {
      const c = cells(lines[i])
      c.push(i === table.header ? 'Note' : i === table.sep ? '------' : '')
      lines[i] = rowLine(c)
    }
    table.head.push('Note')
    noteCol = table.head.length - 1
  }
  const statusCol = table.head.findIndex((h) => h.toLowerCase() === 'status')
  const idCol = table.head.indexOf('#')
  const missing = new Set(ids)
  for (let i = table.first; i <= table.last; i++) {
    const c = cells(lines[i])
    if (!ids.includes(c[idCol])) continue
    missing.delete(c[idCol])
    if (statusCol >= 0) c[statusCol] = status
    if (opt('note') || rest.includes('--note')) c[noteCol] = oneLine(opt('note'))
    lines[i] = rowLine(c)
  }
  if (missing.size) {
    console.error(`NOT FOUND: Build Plan row(s) ${[...missing].join(', ')}`)
    process.exit(1)
  }
  writeAtomic(boardPath, lines.join('\n'))
  console.log(`OK: row ${ids.join(',')} → ${status}`)
} else if (cmd === 'card') {
  const ids = rowIds()
  const agent = opt('agent')
  if (!ids.length || !agent) usage('card needs --row <n> and --agent <name>')
  const kitDir = opt('kit') || join(dirname(fileURLToPath(import.meta.url)), '../../..')
  const text = read()
  const at = locate(text, 'Build Plan')
  const table = at && planTable(at.lines, at.start + 1, at.end)
  if (!table) {
    console.error('NOT FOUND: Build Plan table')
    process.exit(1)
  }
  const { lines } = at
  const idCol = table.head.indexOf('#')
  const picked = []
  for (let i = table.first; i <= table.last; i++) if (ids.includes(cells(lines[i])[idCol])) picked.push(lines[i])
  if (picked.length !== ids.length) {
    console.error(`NOT FOUND: Build Plan row(s) among ${ids.join(', ')}`)
    process.exit(1)
  }
  const col = (name) => table.head.findIndex((h) => h.toLowerCase() === name)
  const layers = [...new Set(picked.map((l) => cells(l)[col('layer')]).filter(Boolean))]
  const layer = opt('layer') || layers.join(', ')

  const rendersUi = ['features-engineer', 'composition-engineer', 'app-engineer', 'slice-engineer', 'shared-engineer'].includes(agent)
  const filled = (heading) => {
    const content = body(text, heading)
    return content && !/^<[^>]*>$/.test(content.trim()) ? content : ''
  }

  // Build Plan context that is not a row: strategy / human decisions above the table, and the
  // "Not building" list — the cheapest guard against scope invention.
  const preamble = lines.slice(at.start + 1, table.header).join('\n').trim()
  const planRest = lines.slice(table.last + 1, at.end).join('\n')
  const notBuilding = planRest.match(/###\s+Not building[\s\S]*?(?=\n###\s|$)/)?.[0]?.trim() ?? ''

  // Page / widget / feature rows get only their own screen blocks of ## UI Surface (matched by the
  // slice name against each screen's route and title); no match → every block, so nothing is lost.
  const kebab = (t) => String(t ?? '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const uiAll = body(text, 'UI Surface') ?? ''
  const blocks = uiAll.split(/\n(?=- screen-ref:)/)
  const names = picked.flatMap((l) => String(cells(l)[col('slice')]).split(/\s*,\s*/))
    .map((n) => kebab(n.split('/').pop())).filter((n) => n && n !== '-')
  const matches = (b) => {
    const route = b.match(/^- route:\s*(.+)$/m)?.[1] ?? ''
    const title = b.match(/^- title:\s*(.+)$/m)?.[1] ?? ''
    const words = [kebab(title), ...route.split('/').map(kebab)].filter(Boolean)
    return names.some((n) => words.some((w) => w === n || w.endsWith(`-${n}`) || w.startsWith(`${n}-`)))
  }
  const scoped = ['composition-engineer', 'features-engineer'].includes(agent) && blocks.length > 1 ? blocks.filter(matches) : []
  const uiBody = scoped.length ? scoped.join('\n') : uiAll

  const slug = boardPath.replace(/^.*\//, '').replace(/\.md$/, '')
  const glossary = join(contextDir, 'glossary.md')
  const inventory = join(contextDir, 'prototype-inventory.md')
  const protoRef = text.match(/^prototype-ref:\s*(.+)$/m)?.[1]?.trim()
  const protoPages = [...uiBody.matchAll(/^- prototype-page:\s*(.+)$/gm)].map((m) => m[1].trim())
  const reads = [
    rendersUi && existsSync(glossary) ? `- Glossary — \`${glossary}\`. Read before writing any user-facing text.` : '',
    rendersUi && existsSync(inventory) ? `- Prototype inventory — \`${inventory}\`. Read the rows for your page/state only.` : '',
    agent === 'composition-engineer' && protoRef && protoRef !== 'none' && protoPages.length
      ? `- Prototype page(s) — ${protoPages.map((p) => `\`${protoRef}/${p}\``).join(', ')}. Visual contract; React + shadcn replace the HTML.`
      : '',
    rendersUi ? `- Rule file — \`${kitDir}/rules/ui-quality.mdc\` (Cursor attaches it by glob; on Claude read it once).` : '',
  ].filter(Boolean)

  const cellAt = (line, name) => {
    const index = col(name)
    return index >= 0 ? String(cells(line)[index] ?? '') : ''
  }
  const needles = picked.flatMap((l) => [
    ...cellAt(l, 'slice').split(/[,\s/]+/),
    ...cellAt(l, 'note').split(/[^\w./-]+/),
  ]).filter((word) => word.length > 3)
  const apiAll = filled('API Contract / Data Model')
  // Another slice's endpoints, rules, and permissions are scope guards here: ids and titles, not bodies.
  const compactOwned = (block) => {
    const [head, ...rest] = block.split('\n')
    if (!/owned by other slices/i.test(head)) return block
    const intro = rest.find((l) => l.trim() && !/^\s*-/.test(l)) ?? ''
    const items = rest.filter((l) => /^- /.test(l)).map((l) => {
      const title = l.split(' — ')[0]
      return title.length > 100 ? `${title.slice(0, 100)}…` : title
    })
    return [head, '', intro, '', ...items].join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }
  const apiBody = apiAll.split(/\n(?=### )/).filter((block) =>
    needles.some((word) => block.toLowerCase().includes(word.toLowerCase())),
  ).map(compactOwned).join('\n\n').trim()
  // The plan's coverage table maps each criterion id to its rows. A criterion with no id, or one
  // the table does not list, stays on every card.
  const coverage = new Map()
  for (const line of (planRest.match(/###\s+Acceptance-criteria coverage[\s\S]*?(?=\n###\s|$)/)?.[0] ?? '').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const [criterion, covered] = cells(line)
    const acId = criterion?.match(/\bAC-\d+\b/)?.[0]
    if (acId) coverage.set(acId, String(covered).split(/[^\d]+/).filter(Boolean))
  }
  const ownsAc = (line) => {
    const acId = line.match(/\bAC-\d+\b/)?.[0]
    return !acId || !coverage.has(acId) || coverage.get(acId).some((row) => ids.includes(row))
  }
  const acBody = filled('Acceptance Criteria').split('\n').filter(ownsAc).join('\n').trim()
  const wantsImpact = ['shared-engineer', 'entities-engineer', 'features-engineer', 'composition-engineer', 'app-engineer', 'slice-engineer', 'research-analyst'].includes(agent)
  const impactBody = wantsImpact ? impactPaths(filled('FSD Impact'), names, kebab) : ''
  const sections = [
    acBody ? `## Acceptance Criteria\n\n${acBody}` : '',
    impactBody ? `## FSD Impact\n\n${impactBody}` : '',
    uiBody && !/^<[^>]*>$/.test(uiBody.trim())
      ? `## UI Surface${scoped.length ? ` (this row's screens — ${scoped.length} of ${blocks.length})` : ''}\n\n${uiBody}`
      : '',
    apiBody ? `## API Contract / Data Model\n\n${apiBody}` : '',
  ].filter(Boolean)

  const commonPath = join(contextDir, 'cards', 'common.md')
  const common = [
    `# Shared card — ${slug}`,
    '',
    'Read this once. A row card has only that row, its acceptance criteria, its screens, and the API contract for names in the row.',
    '',
    preamble,
    notBuilding,
    filled('Request') ? `## Request\n\n${filled('Request')}` : '',
    filled('Clarifications') ? `## Clarifications\n\n${filled('Clarifications')}` : '',
    filled('Decisions & Open Questions') ? `## Decisions & Open Questions\n\n${filled('Decisions & Open Questions')}` : '',
    filled('Reuse Map') ? `## Reuse Map\n\n${filled('Reuse Map')}` : '',
    reads.length ? `## Read by path\n\n${reads.join('\n')}` : '',
  ].filter(Boolean).join('\n\n') + '\n'
  mkdirSync(dirname(commonPath), { recursive: true })
  writeAtomic(commonPath, common)

  const card = [
    `# Work card — ${slug} · row ${ids.join(', ')} · ${agent} · ${layer}`,
    '',
    `Generated from \`${boardPath}\`. Read this card, not the board. Shared sections: \`${commonPath}\`.`,
    'Write back only with',
    `\`node ${kitDir}/skills/feature-dev/scripts/board.mjs\` (\`row\` for your rows, \`append\` for`,
    '`Reuse Map` / `Decisions & Open Questions`, `handoff` for the return).',
    '',
    '## Your rows',
    '',
    rowLine(table.head),
    lines[table.sep],
    ...picked,
    notBuilding ? `\n${notBuilding}` : '',
    '',
    sections.join('\n\n'),
    '',
  ].filter((part) => part !== '').join('\n')
  const out = join(contextDir, 'cards', `row-${ids.join('-')}.md`)
  writeAtomic(out, card)
  const bytes = Buffer.byteLength(card)
  if (bytes > 12 * 1024) console.error(`WARN card ${out} is ${bytes} bytes (limit 12288)`)
  const station = opt('station') || (picked.map((l) => cells(l)[col('station')]).find(Boolean) ?? '')
  jsonl('timings.jsonl', { event: 'spawn', station, rows: ids, agent })
  console.log(JSON.stringify({ card: out, common: commonPath, bytes, board_bytes: Buffer.byteLength(text) }))
} else if (cmd === 'handoff') {
  const name = opt('name')
  if (!name) usage('handoff needs --name <stem>')
  if (/\bfail/i.test(opt('gates')) && !/^blocked:/i.test(oneLine(opt('outcome')))) {
    console.error('HANDOFF_RED: a self-check failed. Fix it inside BOUNDARY, or mark the row blocked (board.mjs row --status blocked) and pass --outcome "blocked: <what is missing, in which slice>".')
    process.exit(1)
  }
  const bullets = (flagName) => String(opt(flagName) || '').split(flagName === 'paths' ? ',' : ';').map((part) => oneLine(part)).filter(Boolean)
  const handoffLines = [
    `outcome: ${oneLine(opt('outcome')) || 'done'}`,
    'paths:',
    ...bullets('paths').map((part) => `- ${part}`),
    'decisions:',
    ...bullets('decisions').map((part) => `- ${part}`),
    `gates: ${oneLine(opt('gates'))}`,
  ]
  if (handoffLines.length > 15) {
    console.error(`HANDOFF_TOO_LONG: ${handoffLines.length} lines (limit 15)`)
    process.exit(1)
  }
  const out = join(contextDir, `${name}.md`)
  mkdirSync(contextDir, { recursive: true })
  writeAtomic(out, `${handoffLines.join('\n')}\n`)
  console.log(JSON.stringify({ handoff: out, lines: handoffLines.length }))
} else if (cmd === 'gate') {
  const station = opt('station')
  if (!station) usage('gate needs --station')
  let gates
  if (opt('json')) {
    const parsed = JSON.parse(opt('json'))
    gates = (parsed.gates ?? []).map((g) => ({ gate: g.gate, result: g.status, note: g.status === 'fail' && parsed.log ? `see ${parsed.log}` : '', duration_s: g.duration_s }))
  } else if (opt('gate') && ['pass', 'fail'].includes(opt('result'))) {
    gates = [{ gate: opt('gate'), result: opt('result'), note: oneLine(opt('note')) }]
  } else usage('gate needs --json <run-gates output> or --gate <name> --result pass|fail')
  for (const g of gates) jsonl('gate-log.jsonl', { station, ...g })
  jsonl('timings.jsonl', { event: 'gate', station, gates: gates.map((g) => `${g.gate}:${g.result}`) })
  // Latest result per gate, rebuilt from the full history.
  const latest = new Map()
  for (const line of readFileSync(join(contextDir, 'gate-log.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(line)
    latest.set(e.gate, e)
  }
  const table = [
    '# Gate status — latest result per gate',
    '',
    'Written by `board.mjs gate` (via `run-gates.sh --spec`). History: `gate-log.jsonl`.',
    '',
    '| Gate | Result | Station | At | Note |',
    '|------|--------|---------|----|------|',
    ...[...latest.values()].map((e) => rowLine([e.gate, e.result, e.station, e.at, oneLine(e.note)])),
    '',
  ].join('\n')
  writeAtomic(join(contextDir, 'gate-status.md'), table)
  console.log(`OK: ${gates.map((g) => `${g.gate}:${g.result}`).join(', ')} → ${join(contextDir, 'gate-status.md')}`)
} else if (cmd === 'snapshot' || cmd === 'changed') {
  // Temp index so `git add -A` + `write-tree` sees untracked files without touching the real index.
  const flag = cmd === 'snapshot' ? 'round' : 'since'
  const round = opt(flag)
  if (!/^\d+$/.test(round)) usage(`${cmd} needs --${flag} <n>`)
  const rootRun = spawnSync('git', ['-C', resolve(dirname(boardPath)), 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (rootRun.status !== 0) {
    console.error((rootRun.stderr || 'not a git repo').trim())
    process.exit(1)
  }
  const root = rootRun.stdout.trim()
  const index = join(tmpdir(), `board-tree-${process.pid}`)
  const run = (args) => {
    const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: index } })
    if (r.status !== 0) {
      rmSync(index, { force: true })
      console.error((r.stderr || r.stdout || 'git failed').trim())
      process.exit(r.status || 1)
    }
    return r.stdout.trim()
  }
  let tree
  try {
    run(['add', '-A'])
    tree = run(['write-tree'])
  } finally {
    rmSync(index, { force: true })
  }
  if (cmd === 'snapshot') {
    mkdirSync(contextDir, { recursive: true })
    writeAtomic(join(contextDir, `fix-round-${round}.tree`), `${tree}\n`)
    console.log(tree)
  } else {
    const file = join(contextDir, `fix-round-${round}.tree`)
    if (!existsSync(file)) {
      console.error(`no snapshot ${file}`)
      process.exit(1)
    }
    const diff = spawnSync('git', ['-C', root, 'diff', '--name-only', readFileSync(file, 'utf8').trim(), tree], { encoding: 'utf8' })
    if (diff.status !== 0) {
      console.error((diff.stderr || 'git diff failed').trim())
      process.exit(diff.status || 1)
    }
    const names = diff.stdout.split('\n').filter((p) => p && !/fix-round-\d+\.tree$/.test(p) && !/fix-scope-\d+\.txt$/.test(p))
    process.stdout.write(names.length ? `${names.join(',')}\n` : '')
  }
} else if (cmd === 'timing') {
  if (rest.includes('--summary')) {
    const file = join(contextDir, 'timings.jsonl')
    if (!existsSync(file)) {
      console.log('(no timings)')
      process.exit(0)
    }
    // Each interval between two events belongs to the earlier one: a spawn or a start owns it,
    // anything after a gate or an end is orchestrator, skill, or human time.
    const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    const label = (station) => (/^\d/.test(String(station)) ? `Station ${station}` : String(station))
    const totals = new Map()
    const agents = new Map()
    for (let i = 0; i < events.length - 1; i++) {
      const e = events[i]
      const key = e.event === 'spawn' || e.event === 'start' ? label(e.station) : 'between steps'
      totals.set(key, (totals.get(key) ?? 0) + Math.max(0, Date.parse(events[i + 1].at) - Date.parse(e.at)))
      if (e.event === 'spawn' && e.agent) agents.set(key, [...(agents.get(key) ?? []), e.agent])
    }
    if (!totals.size) console.log('(fewer than two events)')
    for (const [key, ms] of totals) {
      const spawned = agents.get(key) ?? []
      const counts = [...new Set(spawned)].map((a) => `${a} ×${spawned.filter((x) => x === a).length}`).join(', ')
      console.log(`${key}: ${Math.round(ms / 1000)}s${counts ? ` (${counts})` : ''}`)
    }
    const last = events.at(-1)
    console.log(`total: ${Math.round((Date.parse(last.at) - Date.parse(events[0].at)) / 1000)}s · open: ${last.event} ${label(last.station)}${last.agent ? ` ${last.agent}` : ''}`)
  } else {
    const station = opt('station')
    const event = opt('event')
    if (!station || !['start', 'end', 'spawn'].includes(event)) usage('timing needs --station and --event start|end|spawn [--agent <name>], or --summary')
    if (event === 'spawn' && !opt('agent')) usage('timing --event spawn needs --agent <name>')
    jsonl('timings.jsonl', event === 'spawn' ? { event, station, agent: opt('agent') } : { event, station })
    console.log(`OK: ${station} ${event}`)
  }
} else if (cmd === 'parent-map') {
  // The stack parent plus every board whose feature-id the ## Change request names ("already built by F-002").
  const text = read()
  const featureId = (t) => (t.match(/^feature-id:\s*(.*)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '')
  const named = new Set((body(text, 'Change request') ?? '').match(/\bF-\d+\b/g) ?? [])
  named.delete(featureId(text))
  const boards = new Set([parentBoard()].filter(Boolean))
  for (const name of readdirSync(dirname(boardPath))) {
    const candidate = join(dirname(boardPath), name)
    if (!name.endsWith('.md') || resolve(candidate) === resolve(boardPath)) continue
    if (named.has(featureId(readFileSync(candidate, 'utf8')))) boards.add(candidate)
  }
  const parts = [...boards].flatMap((path) => {
    const t = readFileSync(path, 'utf8')
    const impact = body(t, 'FSD Impact')
    if (!impact || /^<[^>]*>$/.test(impact.trim())) return []
    return [`# ${path}\n\n## FSD Impact\n\n${impact}\n\n## Reuse Map\n\n${body(t, 'Reuse Map') ?? ''}`]
  })
  if (!parts.length) {
    console.log('NONE')
    process.exit(1)
  }
  const out = join(contextDir, 'parent-map.md')
  mkdirSync(contextDir, { recursive: true })
  writeAtomic(out, `${parts.join('\n\n---\n\n')}\n`)
  console.log(out)
} else if (cmd === 'audit-scope') {
  const text = read()
  const parentPath = opt('prior') ? '' : parentBoard()
  const priorPath = opt('prior') || (parentPath ? join(parentPath.replace(/\.md$/, '.context'), 'architecture-auditor-9.5.md') : '')
  const impact = body(text, 'FSD Impact') ?? ''
  const wanted = new Set(impactRows(impact).map((row) => row.path))
  const prose = impact.split('\n').filter((line) => !line.trim().startsWith('|')).join('\n')
  for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
    const found = match[1].replace(/^src\//, '').trim()
    if (found.includes('/')) wanted.add(found)
  }
  const full = () => {
    console.log('FULL')
    process.exit(0)
  }
  if (!priorPath || !existsSync(priorPath)) full()
  const report = readFileSync(priorPath, 'utf8')
  const sha = (report.match(/^AUDITED-AT:\s*(\S+)/m)?.[1] ?? '').trim()
  const scope = (report.match(/^SCOPE-PATHS:\s*(.*)$/m)?.[1] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  if (!sha || !scope.length) full()
  const gateLog = join(dirname(priorPath), 'gate-log.jsonl')
  let passed = false
  if (existsSync(gateLog)) {
    for (const line of readFileSync(gateLog, 'utf8').split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line)
        if (entry.gate === 'architecture-audit') passed = entry.result === 'pass'
      } catch { /* a bad line does not count as a pass */ }
    }
  }
  if (!passed) full()
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { encoding: 'utf8' })
  if (ancestor.status !== 0) full()
  const covers = (path) => scope.some((item) => path === item || path.startsWith(`${item}/`) || item.startsWith(`${path}/`) || path.endsWith(item) || item.endsWith(path))
  const uncovered = [...wanted].filter((path) => !covers(path))
  const diff = spawnSync('git', ['diff', '--name-only', sha, '--', ...scope], { encoding: 'utf8' })
  const changed = (diff.stdout || '').split('\n').map((item) => item.trim()).filter(Boolean)
  const out = [...new Set([...uncovered, ...changed])]
  if (!out.length) console.log(`REUSE ${priorPath}`)
  else for (const path of out) console.log(path)
} else usage(`unknown command ${cmd}`)
