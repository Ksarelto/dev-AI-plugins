#!/usr/bin/env node
// Deterministic mapper: spec-dev-kit YAML (+ optional html prototype) → feature blackboard.
// One screen-task per run. Usage:
//   node import-upstream.mjs --spec <spec.md> --out <feature.md> [filters] [--require-scoped]
// Exit 0 = wrote (or printed). Exit 1 = scoped-import failure. Exit 2 = usage/parse failure.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return undefined
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}
function listFlag(name) {
  const v = flag(name)
  if (!v || v === true) return []
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

const specPath = flag('spec')
const outPath = flag('out')
const requireScoped = Boolean(flag('require-scoped'))
const stdoutOnly = Boolean(flag('stdout-only'))
const taskId = flag('task-id') === true ? '' : (flag('task-id') || '')
const screenRef = flag('screen-ref') === true ? '' : (flag('screen-ref') || '')
const slugArg = flag('slug') === true ? '' : (flag('slug') || '')
const prototypeRef = flag('prototype-ref') === true ? '' : (flag('prototype-ref') || '')
const storyRefsArg = listFlag('story-refs')
const acRefsArg = listFlag('ac-refs')
const entityRefsArg = listFlag('entity-refs')

if (!specPath) {
  console.error('usage: node import-upstream.mjs --spec <spec.md> [--out <feature.md>] [--screen-ref SCR-001] [--task-id T-001] [--require-scoped]')
  process.exit(2)
}

let parse
try {
  const mod = await import('yaml')
  parse = mod.parse ?? mod.default?.parse
} catch {
  parse = undefined
}
if (typeof parse !== 'function') {
  console.error('FATAL: the "yaml" package is not resolvable. Run from the repo root.')
  process.exit(2)
}

function readFrontmatter(path) {
  const raw = readFileSync(path, 'utf8')
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) {
    console.error(`FATAL: no YAML front matter found in ${path}`)
    process.exit(2)
  }
  return { raw, fm: parse(match[1]), body: raw.slice(match[0].length) }
}

const { fm: spec } = readFrontmatter(specPath)
const screens = spec['ui-surface']?.screens ?? []
const interactions = spec['ui-surface']?.interactions ?? []
const stories = spec['user-stories'] ?? []
const acs = spec['acceptance-criteria'] ?? []
const entities = spec.entities ?? []
const endpoints = [
  ...(spec['api-surface']?.endpoints ?? []),
  ...(spec['api-surface']?.mutations ?? []),
]

const isApp = spec.type === 'app' || screens.length > 1
if (requireScoped && isApp && !screenRef && !taskId) {
  console.error('ERROR [REQUIRE_SCOPED] type:app (or multiple screens) imported with no TASK_ID / SCREEN_REF — one /feature-dev run is one screen-task')
  process.exit(1)
}

const screen = screenRef ? screens.find((s) => s.id === screenRef) : (screens.length === 1 ? screens[0] : null)
if (screenRef && !screen) {
  console.error(`ERROR [SCREEN_MISSING] screen-ref "${screenRef}" not in ui-surface.screens[]`)
  process.exit(1)
}

function titleKeywords(s) {
  return (s.title ?? '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
}

function derivedAcs() {
  if (!screen) return []
  const keywords = titleKeywords(screen)
  return acs.filter((ac) => {
    const viaInteraction = interactions.some(
      (i) => i['screen-ref'] === screen.id
        && (ac.when?.includes(i.trigger) || ac.then?.includes(i.response)),
    )
    const text = `${ac.given ?? ''} ${ac.when ?? ''} ${ac.then ?? ''}`.toLowerCase()
    return viaInteraction || text.includes(String(screen.id).toLowerCase()) || keywords.some((k) => text.includes(k))
  })
}

const filteredAcs = acRefsArg.length
  ? acs.filter((a) => acRefsArg.includes(a.id))
  : derivedAcs()
const storyIds = storyRefsArg.length
  ? storyRefsArg
  : [...new Set(filteredAcs.map((a) => a['story-ref']).filter(Boolean))]
const filteredStories = stories.filter((s) => storyIds.includes(s.id))

function derivedEntities() {
  if (entityRefsArg.length) return entityRefsArg
  const names = entities.map((e) => e.name)
  if (!screen) return []
  return names.filter((name) => screen.components?.some((c) => String(c).includes(name)))
}
const entityNames = derivedEntities()
const filteredEntities = entities.filter((e) => entityNames.includes(e.name))

function mentionsEntity(blob, name) {
  return JSON.stringify(blob).includes(name)
}
const filteredEndpoints = endpoints.filter((ep) =>
  entityNames.length === 0 ? false : entityNames.some((n) => mentionsEntity(ep, n)),
)

function kebab(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ifPageExists(protoDir, id) {
  if (!protoDir || !id) return ''
  const rel = `pages/${id}.html`
  return existsSync(join(protoDir, rel)) ? rel : ''
}

function resolvePrototypePage(protoDir, s, ref) {
  if (!protoDir || !s) return ''

  const mapPath = join(protoDir, 'page-map.json')
  if (existsSync(mapPath) && ref) {
    try {
      const map = JSON.parse(readFileSync(mapPath, 'utf8'))
      const hit = ifPageExists(protoDir, map[ref])
      if (hit) return hit
    } catch {
      // fall through
    }
  }

  const readmePath = join(protoDir, 'README.md')
  if (existsSync(readmePath) && s.title) {
    const readme = readFileSync(readmePath, 'utf8')
    const re = new RegExp(`^[-*]\\s+([a-z0-9-]+):\\s+${escapeRe(String(s.title).trim())}\\s+[—-]`, 'mi')
    const m = readme.match(re)
    if (m) {
      const hit = ifPageExists(protoDir, m[1])
      if (hit) return hit
    }
  }

  const route = String(s.route ?? '').replace(/^\//, '')
  const parts = route.split('/').filter((p) => p && !p.startsWith(':'))
  const last = parts.at(-1) ?? ''
  const first = parts[0] ?? ''
  for (const id of [kebab(s.title), last, first]) {
    const hit = ifPageExists(protoDir, id)
    if (hit) return hit
  }
  return ''
}

const protoDir = prototypeRef || ''
const prototypePage = resolvePrototypePage(protoDir, screen, screenRef || screen?.id)
const slug = slugArg || kebab(screen?.title) || spec.metadata?.slug || 'feature'
const title = screen?.title ?? spec.metadata?.title ?? slug
const today = new Date().toISOString().slice(0, 10)

function acLine(ac) {
  return `Given ${ac.given}, when ${ac.when}, then ${ac.then}.`
}

const requestLines = [
  screen ? `${screen.title} (${screen.route}).` : (spec.metadata?.title ?? ''),
  spec.context?.goal ? `Goal: ${spec.context.goal}` : '',
  filteredStories.length
    ? 'User stories:\n' + filteredStories.map((s) => `- As a ${s.as}, I want ${s['i-want']}, so that ${s['so-that']}.`).join('\n')
    : '',
].filter(Boolean).join('\n\n')

const acMarkdown = filteredAcs.length
  ? filteredAcs.map((ac, i) => `${i + 1}. [${ac.id}] ${acLine(ac)}`).join('\n')
  : '1. TBD: no acceptance criteria mapped to this screen-task'

const uiMarkdown = screen
  ? [
      `- screen-ref: ${screen.id}`,
      `- title: ${screen.title}`,
      `- route: ${screen.route}`,
      `- states: ${(screen.states ?? []).join(', ')}`,
      `- components: ${(screen.components ?? []).join(', ')}`,
      screen.notes ? `- notes: ${screen.notes}` : '',
      prototypePage ? `- prototype-page: ${prototypePage}` : '',
      interactions.filter((i) => i['screen-ref'] === screen.id).length
        ? '- interactions:\n' + interactions
          .filter((i) => i['screen-ref'] === screen.id)
          .map((i) => `  - ${i.trigger} → ${i.response}`)
          .join('\n')
        : '',
    ].filter(Boolean).join('\n')
  : '<standalone feature — no ui-surface.screens[] row imported>'

function entityBlock(e) {
  const fields = (e.fields ?? []).slice(0, 12).map((f) => `${f.name}: ${f.type}`).join(', ')
  return `### ${e.name}\n${e.description ?? ''}\n\n\`${e.name}: { ${fields} }\``
}

const apiMarkdown = [
  filteredEntities.map(entityBlock).join('\n\n'),
  filteredEndpoints.length
    ? '### Endpoints\n' + filteredEndpoints.map((ep) => `- ${ep.method} ${ep.path} (${ep.id}) — ${ep.description ?? ''}`).join('\n')
    : '',
].filter(Boolean).join('\n\n') || '<no entities mapped to this screen-task>'

const compact = [
  `SLUG: ${slug}`,
  `TITLE: ${title}`,
  `TASK_ID: ${taskId || '(none)'}`,
  `SCREEN_REF: ${screen?.id || '(none)'}`,
  `PROTOTYPE_PAGE: ${prototypePage || '(none)'}`,
  `STORIES: ${filteredStories.map((s) => s.id).join(', ') || '(none)'}`,
  `ACS: ${filteredAcs.map((a) => a.id).join(', ') || '(none)'}`,
  `ENTITIES: ${filteredEntities.map((e) => e.name).join(', ') || '(none)'}`,
  `SCREENS_IMPORTED: ${screen ? 1 : 0}`,
].join('\n')

if (stdoutOnly && !outPath) {
  console.log(compact)
  process.exit(0)
}

if (!outPath) {
  console.error('FATAL: --out <feature.md> is required unless --stdout-only')
  process.exit(2)
}

const kitDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = join(kitDir, 'templates', 'feature-spec.md')
let board = existsSync(outPath)
  ? readFileSync(outPath, 'utf8')
  : existsSync(templatePath)
    ? readFileSync(templatePath, 'utf8')
    : ''

if (!board) {
  console.error('FATAL: no --out file and no templates/feature-spec.md')
  process.exit(2)
}

function replaceFm(key, value) {
  const re = new RegExp(`^${key}:\\s*.*$`, 'm')
  const line = `${key}: ${value}`
  if (re.test(board)) board = board.replace(re, line)
  else board = board.replace(/^---\n/, `---\n${line}\n`)
}

function replaceSection(heading, content) {
  const re = new RegExp(`(## ${heading}\\n)([\\s\\S]*?)(?=\\n## |$)`)
  if (!re.test(board)) {
    board = board.trimEnd() + `\n\n## ${heading}\n\n${content}\n`
    return
  }
  board = board.replace(re, `$1\n${content}\n`)
}

replaceFm('slug', slug)
replaceFm('created', today)
replaceFm('upstream-spec', specPath)
replaceFm('task-id', taskId || 'none')
replaceFm('screen-ref', screen?.id || 'none')
replaceFm('prototype-ref', protoDir || 'none')
board = board.replace(/# Feature: <name>/, `# Feature: ${title}`)
board = board.replace(/<feature-slug>/g, slug)

replaceSection('Request', requestLines || slug)
replaceSection('Acceptance Criteria', acMarkdown)
replaceSection('UI Surface', uiMarkdown)
replaceSection('API Contract / Data Model', apiMarkdown)

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, board, 'utf8')
console.log(`OK: wrote ${outPath}`)
console.log(compact)
process.exit(0)
