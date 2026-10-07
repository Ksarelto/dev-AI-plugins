#!/usr/bin/env node
// Section-level access to a feature blackboard (.spec/features/<slug>.md), so no agent has to Read
// or rewrite the whole file to touch one part of it. Every write is one atomic script call.
//
//   board.mjs section <board.md> --get "<Header>"                  print one section body
//   board.mjs section <board.md> --put "<Header>" --from <file>    replace one section body
//   board.mjs append  <board.md> --section "<Header>" --line "<text>"   append one line (table row or bullet)
//   board.mjs row     <board.md> --row 4[,5] --status todo|in-progress|done|blocked [--note "<text>"]
//                     sets the Build Plan Status cell and replaces the row's single Note (no history)
//   board.mjs card    <board.md> --row 4[,5] --agent <name> [--layer <layer>] [--kit <KIT_DIR>]
//                     writes <slug>.context/cards/row-4[-5].md: the rows plus the sections that agent
//                     needs, verbatim; prints its path. The worker reads the card, never the board.
//   board.mjs gate    <board.md> --station "<label>" (--json '<run-gates JSON>' | --gate <name> --result pass|fail [--note "<text>"])
//                     appends to <slug>.context/gate-log.jsonl and rewrites gate-status.md (latest per gate)
//   board.mjs timing  <board.md> --station "<label>" --event start|end
//                     appends to <slug>.context/timings.jsonl (card and gate append there too)
//
// Exit 0 ok, 1 not found (section, row), 2 usage error.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [cmd, boardPath, ...rest] = process.argv.slice(2)
const opt = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 && rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[i + 1] : ''
}
const usage = (msg) => {
  console.error(`usage: board.mjs section|append|row|card|gate|timing <board.md> … — ${msg}`)
  process.exit(2)
}
if (!cmd || !boardPath) usage('missing command or board path')
if (!existsSync(boardPath)) usage(`no board at ${boardPath}`)

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
function putBody(text, header, content) {
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
    writeFileSync(boardPath, putBody(text, put, readFileSync(opt('from'), 'utf8')))
    console.log(`OK: replaced ## ${put}`)
  } else usage('section needs --get "<Header>" or --put "<Header>" --from <file>')
} else if (cmd === 'append') {
  const section = opt('section')
  const line = opt('line')
  if (!section || !line) usage('append needs --section and --line')
  const text = read()
  const at = locate(text, section)
  if (!at) {
    writeFileSync(boardPath, putBody(text, section, line))
  } else {
    const { lines, start, end } = at
    let last = end - 1
    while (last > start && !lines[last].trim()) last--
    // Drop an empty template placeholder row ("| | |") when the first real row arrives.
    if (/^\|(\s*\|)+\s*$/.test(lines[last]) && line.trim().startsWith('|')) lines.splice(last--, 1)
    lines.splice(last + 1, 0, line)
    writeFileSync(boardPath, lines.join('\n'))
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
  writeFileSync(boardPath, lines.join('\n'))
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

  // Binding human input for every worker, then the sections that agent builds from.
  const BASE = ['Request', 'Clarifications', 'Decisions & Open Questions']
  const BY_AGENT = {
    'shared-engineer': ['Acceptance Criteria', 'FSD Impact', 'API Contract / Data Model', 'Reuse Map', 'Dependencies'],
    'entities-engineer': ['Acceptance Criteria', 'FSD Impact', 'API Contract / Data Model', 'Reuse Map'],
    'features-engineer': ['Acceptance Criteria', 'FSD Impact', 'API Contract / Data Model', 'UI Surface', 'Reuse Map'],
    'composition-engineer': ['Acceptance Criteria', 'FSD Impact', 'API Contract / Data Model', 'UI Surface', 'Reuse Map'],
    'app-engineer': ['Acceptance Criteria', 'FSD Impact', 'UI Surface', 'Reuse Map'],
    'test-engineer': ['Acceptance Criteria', 'UI Surface'],
  }
  const all = [...new Set(Object.values(BY_AGENT).flat())]
  const wanted = [...BASE.slice(0, 2), ...(BY_AGENT[agent] ?? all), BASE[2]]
  const rendersUi = ['features-engineer', 'composition-engineer', 'app-engineer', 'slice-engineer', 'shared-engineer'].includes(agent)

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

  const sections = wanted
    .map((h) => [h, h === 'UI Surface' ? uiBody : body(text, h)])
    .filter(([, b]) => b && !/^<[^>]*>$/.test(b.trim()))
    .map(([h, b]) => `## ${h}${h === 'UI Surface' && scoped.length ? ` (this row's screens — ${scoped.length} of ${blocks.length})` : ''}\n\n${b}`)
  const card = [
    `# Work card — ${slug} · row ${ids.join(', ')} · ${agent} · ${layer}`,
    '',
    `Generated from \`${boardPath}\`. Read this card, not the board. Write back only with`,
    `\`node ${kitDir}/skills/feature-dev/scripts/board.mjs\` (\`row\` for your rows, \`append\` for`,
    '`Reuse Map` / `Decisions & Open Questions`). Your handoff file holds the rest.',
    '',
    '## Your rows',
    '',
    rowLine(table.head),
    lines[table.sep],
    ...picked,
    preamble ? `\n${preamble}` : '',
    notBuilding ? `\n${notBuilding}` : '',
    reads.length ? `\n## Read by path\n\n${reads.join('\n')}` : '',
    '',
    sections.join('\n\n'),
    '',
  ].filter((part) => part !== '').join('\n')
  const out = join(contextDir, 'cards', `row-${ids.join('-')}.md`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, card)
  const station = picked.map((l) => cells(l)[col('station')]).find(Boolean) ?? ''
  jsonl('timings.jsonl', { event: 'spawn', station, rows: ids, agent })
  console.log(JSON.stringify({ card: out, bytes: Buffer.byteLength(card), board_bytes: Buffer.byteLength(text) }))
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
  writeFileSync(join(contextDir, 'gate-status.md'), table)
  console.log(`OK: ${gates.map((g) => `${g.gate}:${g.result}`).join(', ')} → ${join(contextDir, 'gate-status.md')}`)
} else if (cmd === 'timing') {
  const station = opt('station')
  const event = opt('event')
  if (!station || !['start', 'end'].includes(event)) usage('timing needs --station and --event start|end')
  jsonl('timings.jsonl', { event, station })
  console.log(`OK: ${station} ${event}`)
} else usage(`unknown command ${cmd}`)
