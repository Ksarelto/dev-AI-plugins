#!/usr/bin/env node
// Spec 2.0 contract test, no model calls. Uses spec-dev-kit's golden fixture to check:
//   validator (clean pass + each rule fires), gate-check, publish → views + slice briefs,
//   continue-run merge (new slice, mutations folded), and every downstream consumer reading
//   the delivery plan: build-checklist, analyze-capabilities, feature / backend / agent imports,
//   delta-pages. Also checks a 1.x spec with endpoints duplicated into mutations is de-duplicated.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const kit = join(repo, 'app-dev-kit/spec-dev-kit/skills/generate-spec')
const S = (name) => join(kit, 'scripts', name)
const fixture = join(kit, 'fixtures/example-spec.md')
const root = mkdtempSync(join(tmpdir(), 'spec-contract-'))
const failures = []
const assert = (cond, message) => { if (!cond) failures.push(message) }
const node = (script, args, opts = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: root, ...opts })
const fm = (path) => parse(readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
const write = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text) }
const read = (rel) => readFileSync(join(root, rel), 'utf8')
const base = readFileSync(fixture, 'utf8')

try {
  // 1. Validator: fixture is clean; targeted breakages fire their codes.
  const clean = node(S('validate-spec.mjs'), [fixture, '--json'])
  const report = JSON.parse(clean.stdout)
  assert(clean.status === 0 && report.errors.length === 0 && report.warnings.length === 0, `fixture not clean: ${clean.stdout}`)
  const breakages = [
    ['REQUIREMENT_UNCOVERED', (t) => t.replace('covered-by: [BR-001]', 'covered-by: []')],
    ['PLACEHOLDER_DESCRIPTION', (t) => t.replace('description: What is included and what complete means', 'description: Field description.')],
    ['STORY_UNHAPPY_PATH_MISSING', (t) => t.replace('kind: error\n    given: a listing form', 'kind: happy\n    given: a listing form')],
    ['STATE_MACHINE_INVALID', (t) => t.replace('states: [FREE, PAUSED, RETIRED]', 'states: [FREE, PAUSED]')],
    ['UNKNOWN_ROLE', (t) => t.replace('as: Manager\n    i-want: retire', 'as: Janitor\n    i-want: retire')],
    ['BROKEN_REF', (t) => t.replace('rule-refs: [BR-001, BR-002, BR-003]', 'rule-refs: [BR-009]')],
    ['SLICE_ORDER_INVALID', (t) => t.replace('depends-on: [SL-001]', 'depends-on: [SL-003]')],
    ['SLICE_STORY_UNASSIGNED', (t) => t.replace('story-refs: [US-003, US-004, US-007]', 'story-refs: [US-004, US-007]')],
    ['MUTATIONS_DEPRECATED', (t) => t.replace('api-surface:\n  endpoints:', 'api-surface:\n  mutations: [{ id: API-099, method: POST, path: /v1/x }]\n  endpoints:')],
    ['DUPLICATE_ENDPOINT', (t) => t.replace('path: /v1/requests/{id}/cancellation', 'path: /v1/request/{id}/decision')],
    ['BODY_DUPLICATES_YAML', (t) => t.replace('## Design Rationale', '## Data Model')],
    ['RELATIONSHIP_INVALID', (t) => t.replace('type: many-to-one\n        via: lenderId', 'type: belongs-to\n        via: lenderId')],
    ['RULE_UNTESTED', (t) => t.replace('ac-refs: [AC-007]', 'ac-refs: []')],
    ['ENUM_VALUES_MISSING', (t) => t.replace('        values: [ACTIVE, ENDED]\n', '')],
    ['STATE_MACHINE_MISSING', (t) => t.replace(/  - id: SM-001\n[\s\S]*?ac-refs: \[AC-012\]\n/, '')],
    ['PLACEHOLDER_LEFT', (t) => t.replace('title: Shelf Share', 'title: "{{Title}}"')],
  ]
  for (const [code, mutate] of breakages) {
    const broken = mutate(base)
    assert(broken !== base, `breakage for ${code} did not change the fixture`)
    write(`broken/${code}.md`, broken)
    const run = node(S('validate-spec.mjs'), [join(root, `broken/${code}.md`), '--json'])
    const out = JSON.parse(run.stdout)
    assert(run.status === 1 && out.errors.some((e) => e.includes(`[${code}]`)), `${code} did not fire: ${out.errors.join(' | ')}`)
  }

  // 1b. Warnings: a rule listed in a slice that builds none of its targets.
  write('broken/SLICE_RULE_MISPLACED.md', base.replace('      rule-refs: []', '      rule-refs: [BR-002]'))
  const misplaced = JSON.parse(node(S('validate-spec.mjs'), [join(root, 'broken/SLICE_RULE_MISPLACED.md'), '--json']).stdout)
  assert(misplaced.warnings.some((w) => w.includes('[SLICE_RULE_MISPLACED] SL-001 lists BR-002') && w.includes('SL-002 builds it')), `SLICE_RULE_MISPLACED did not fire: ${misplaced.warnings.join(' | ')}`)

  // 2. gate-check: assumable gaps proceed; high+blocking gaps ask even with a default; cap proceeds.
  const gap = (id, severity, extra = {}) => ({ gap_id: id, severity, status: 'open', blocks_synthesis: false, can_assume_default: true, ...extra })
  const gate = (analysis, round) => {
    write('gate/analysis.json', JSON.stringify(analysis))
    return JSON.parse(node(S('gate-check.mjs'), [join(root, 'gate/analysis.json'), '--round', String(round)]).stdout)
  }
  const many = Array.from({ length: 20 }, (_, i) => gap(`GAP-${i}`, 'medium'))
  assert(gate({ gaps: many }, 1).decision === 'PROCEED', 'many assumable gaps forced a question')
  assert(gate({ gaps: [gap('GAP-1', 'high', { blocks_synthesis: true })] }, 1).decision === 'ASK', 'high blocking gap with a default was not asked')
  assert(gate({ gaps: [gap('GAP-1', 'medium', { can_assume_default: false })], conflicts: [{ conflict_id: 'C-1', type: 'contradiction', status: 'open' }] }, 1).decision === 'ASK', 'open contradiction was not asked')
  assert(gate({ gaps: [gap('GAP-1', 'high', { blocks_synthesis: true, can_assume_default: false })] }, 3).decision === 'PROCEED_WITH_ASSUMPTIONS', 'round cap did not proceed with assumptions')

  // 3. Publish: approve, views, one brief per slice, briefs carry the slice's scope.
  const run = '.spec/spec/spec-20260101-000001_shelf-share'
  write(`${run}/spec.md`, base.replace('status: approved', 'status: reviewing'))
  const pub = node(S('publish-spec.mjs'), [`${run}/spec.md`])
  assert(pub.status === 0, `publish failed: ${pub.stdout}${pub.stderr}`)
  assert(fm(join(root, run, 'spec.md')).status === 'approved', 'publish did not approve')
  assert(/## Delivery plan[\s\S]*## Requirement coverage[\s\S]*stateDiagram-v2/.test(read(`${run}/spec.views.md`)), 'views missing sections')
  assert(!read(`${run}/spec.md`).includes('&a1'), 'spec contains YAML anchors')
  const brief = parse(read(`${run}/slices/SL-002.yaml`))
  assert(brief.brief === 'app-dev-kit/slice-brief/v1' && brief.slice.id === 'SL-002', 'brief envelope wrong')
  assert(brief['business-rules'].length === 3 && brief['state-machines'].some((m) => m.id === 'SM-003'), 'brief missing rules / state machines')
  assert(brief['depends-on'][0]?.id === 'SL-001', 'brief missing depends-on')
  assert(!('requirements' in brief) && brief['requirement-ids'].includes('REQ-004'), `brief should carry requirement ids only: ${JSON.stringify(brief['requirement-ids'])}`)
  assert(brief.owners && typeof brief.owners === 'object', 'brief missing owners map')
  assert(existsSync(join(root, run, 'slices/SL-001.yaml')), 'SL-001 brief missing')

  // 4. Orchestrators plan from the delivery plan.
  execFileSync('node', [join(repo, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/build-checklist.mjs'), join(root, run, 'spec.md')], { encoding: 'utf8' })
  const checklist = fm(join(root, '.spec/app/task-checklist.md'))
  assert(checklist['checklist-version'] === '1.2', 'checklist not slice-based')
  assert(checklist.features.map((f) => f['slice-ref']).join() === 'SL-001,SL-002', `feature order ${checklist.features.map((f) => f['slice-ref'])}`)
  assert(checklist.features[1]['depends-on'][0] === checklist.features[0].id, 'feature depends-on missing')
  const reqTask = checklist.features[1].tasks.find((t) => t['screen-ref'] === 'SCR-004')
  assert(reqTask && reqTask['entity-refs'][0] === 'BorrowRequest' && reqTask['api-refs'].includes('API-005'), `SCR-004 task refs ${JSON.stringify(reqTask)}`)
  const detailTask = checklist.features[1].tasks.find((t) => t['screen-ref'] === 'SCR-003')
  assert(detailTask && detailTask['entity-refs'].includes('Listing') && detailTask['entity-refs'].includes('BorrowRequest'), `SCR-003 entity-refs ${JSON.stringify(detailTask?.['entity-refs'])}`)
  assert(detailTask?.['ac-refs']?.includes('AC-015'), `SCR-003 ac-refs missing done-when AC-015: ${JSON.stringify(detailTask?.['ac-refs'])}`)
  assert(checklist.features[1].tasks.find((t) => t['screen-ref'] === 'SCR-003')['story-refs'].join() === 'US-003', 'SCR-003 in SL-002 should only carry US-003')
  const readChecklist = join(repo, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/read-checklist.mjs')
  const summary = node(readChecklist, ['.spec/app/task-checklist.md', '--summary'])
  assert(summary.status === 0 && summary.stdout.includes(`first-open: ${checklist.features[0].id} (pending)`) && summary.stdout.includes('(SL-002; depends-on'), `read-checklist --summary: ${summary.stdout}${summary.stderr}`)
  const payload = node(readChecklist, ['.spec/app/task-checklist.md', '--payload', checklist.features[1].id])
  const field = (k) => payload.stdout.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1] ?? ''
  const tasks1 = checklist.features[1].tasks
  assert(field('SLICE_REF') === 'SL-002' && field('SCREEN_REFS') === tasks1.map((t) => t['screen-ref']).join(','), `payload refs: ${payload.stdout}`)
  assert(field('AC_REFS') === [...new Set(tasks1.flatMap((t) => t['ac-refs']))].join(','), 'payload AC_REFS is not the task union')
  assert(!/^CHANGE:/m.test(payload.stdout) && !/^PREFLIGHT:/m.test(payload.stdout), 'payload printed an empty optional field')

  execFileSync('node', [join(repo, 'app-dev-kit/app-orchestrator-kit/skills/orchestrate-app/scripts/analyze-capabilities.mjs'), join(root, run, 'spec.md')], { encoding: 'utf8' })
  const plan = fm(join(root, '.spec/app/work-plan.md'))
  const backendTasks = plan.tasks.filter((t) => t.track === 'backend')
  assert(plan['work-plan-version'] === '1.1' && backendTasks.map((t) => t['slice-ref']).join() === 'SL-001,SL-002', 'work-plan not slice-based')
  assert(backendTasks[1]['depends-on'][0] === backendTasks[0].id, 'backend depends-on missing')
  assert(plan.tracks.find((t) => t.id === 'agent').needed === false, 'agent track should not be needed')

  // 5. Build kits import a slice.
  const be = node(join(repo, 'app-dev-kit/backend-dev-kit/skills/backend-dev/scripts/import-upstream.mjs'),
    ['--spec', `${run}/spec.md`, '--out', '.spec/backend/request-and-answer.md', '--task-id', 'B-002', '--slice-ref', 'SL-002', '--require-scoped'])
  assert(be.status === 0, `backend import failed: ${be.stderr}`)
  const board = read('.spec/backend/request-and-answer.md')
  for (const want of ['## Business Rules', 'BR-001 active-borrow-cap', '## State Machines', 'after PT24H', '## Permissions', 'PERM-003', '## Slice Steps', 'error 409 ACTIVE_BORROW_CAP']) {
    assert(board.includes(want), `backend board missing "${want}"`)
  }
  assert(!board.includes('PERM-002'), 'backend board imported a permission the slice does not own')
  assert(node(join(repo, 'app-dev-kit/backend-dev-kit/skills/backend-dev/scripts/validate-backend-spec.mjs'), ['.spec/backend/request-and-answer.md']).status === 0, 'backend board invalid')

  const fe = node(join(repo, 'app-dev-kit/feature-dev-kit/skills/feature-dev/scripts/import-upstream.mjs'),
    ['--spec', `${run}/spec.md`, '--out', '.spec/features/request-and-answer.md', '--slug', 'request-and-answer', '--feature-id', 'F-002', '--screen-refs', 'SCR-003,SCR-004', '--slice-ref', 'SL-002', '--require-scoped'])
  assert(fe.status === 0, `feature import failed: ${fe.stderr}`)
  const fboard = read('.spec/features/request-and-answer.md')
  for (const want of ['slice-ref: SL-002', 'Slice steps (frontend', 'Rules the UI must surface', 'Status lifecycle', 'Notifications (copy)', '[AC-009]']) {
    assert(fboard.includes(want), `feature board missing "${want}"`)
  }
  assert(!fboard.includes('[AC-010]'), 'feature board imported an AC of another slice')
  assert(fe.stdout.includes('SOURCE: brief SL-002'), `feature import did not read the slice brief: ${fe.stdout}`)
  const ownedSection = fboard.split('### Permissions owned by other slices (context — do not build)')[1]?.split('###')[0] ?? ''
  assert(/PERM-00\d \(SL-001\)/.test(ownedSection), `feature board should list SL-001 permissions as owned by another slice: ${ownedSection}`)
  assert(!/^- PERM-00[124] /m.test(fboard.split('### Permissions (hide or disable')[1]?.split('###')[0] ?? ''), 'feature board builds a permission another slice owns')
  assert(existsSync(join(root, '.spec/features/request-and-answer.context/glossary.md')) && fboard.includes('request-and-answer.context/glossary.md'), 'glossary not written by path')
  const moved = node(join(repo, 'app-dev-kit/feature-dev-kit/skills/feature-dev/scripts/import-upstream.mjs'),
    ['--spec', `${run}/spec.md`, '--out', '.spec/features/moved.md', '--slug', 'moved', '--screen-refs', 'SCR-004,SCR-005', '--slice-ref', 'SL-002', '--require-scoped'])
  assert(moved.status === 0 && moved.stderr.includes('BRIEF_FALLBACK') && moved.stdout.includes('SOURCE: spec'), `moved screen did not fall back to the spec: ${moved.stderr}`)

  const feNarrow = node(join(repo, 'app-dev-kit/feature-dev-kit/skills/feature-dev/scripts/import-upstream.mjs'),
    ['--spec', `${run}/spec.md`, '--out', '.spec/features/request-narrow.md', '--slug', 'request-narrow', '--feature-id', 'F-002', '--screen-refs', 'SCR-003,SCR-004', '--slice-ref', 'SL-002', '--ac-refs', 'AC-009', '--require-scoped'])
  assert(feNarrow.status === 0, `narrow feature import failed: ${feNarrow.stderr}`)
  const narrow = read('.spec/features/request-narrow.md')
  assert(narrow.includes('[AC-009]') && narrow.includes('[AC-015]') && narrow.includes('the request moves Out and then Returned'), 'done-when AC-015 was dropped when --ac-refs named only AC-009')
  assert(!narrow.includes('[AC-010]'), 'narrow feature board imported an AC of another slice')

  const withAgent = base
    .replace('ui-surface:\n  screens:', `agent-surface:\n  agents:\n    - { id: AGT-001, name: lend-helper, kind: tool-using, runtime: openai-agents, description: Answers what is free, tool-refs: [TOOL-001], knowledge-base-refs: [], embed: none }\n  tools:\n    - { id: TOOL-001, name: request-item, description: Requests a free item, api-ref: API-004 }\n  knowledge-bases: []\nui-surface:\n  screens:`)
    .replace('tracks: [backend, frontend]\n      story-refs: [US-003, US-004, US-007]', 'tracks: [backend, frontend, agent]\n      story-refs: [US-003, US-004, US-007]')
    .replace('      agent-refs: []\n      rule-refs: [BR-001, BR-002, BR-003]', '      agent-refs: [AGT-001, TOOL-001]\n      rule-refs: [BR-001, BR-002, BR-003]')
  write('agent/spec.md', withAgent)
  const ag = node(join(repo, 'app-dev-kit/agent-dev-kit/skills/agent-dev/scripts/import-upstream.mjs'),
    ['--spec', 'agent/spec.md', '--out', '.spec/agents/lend-helper.md', '--slice-ref', 'SL-002', '--require-scoped'])
  assert(ag.status === 0, `agent import failed: ${ag.stderr}`)
  const aboard = read('.spec/agents/lend-helper.md')
  assert(aboard.includes('agent-ref: AGT-001') && aboard.includes('BR-001') && aboard.includes('POST /v1/requests'), 'agent board missing agent / guardrails / tool endpoint')
  assert(node(S('validate-spec.mjs'), [join(root, 'agent/spec.md')]).status === 0, 'agent fixture variant invalid')

  write('pm.json', '{}\n')
  const dp = node(join(repo, 'app-dev-kit/html-generator-kit/skills/generate-html/scripts/delta-pages.mjs'), ['--spec', `${run}/spec.md`, '--page-map', 'pm.json', '--out', 'delta.json'])
  assert(dp.status === 0, `delta-pages failed: ${dp.stderr}`)
  const delta = JSON.parse(read('delta.json'))
  const req = delta.screens.find((s) => s.spec_id === 'SCR-004')
  // `type` (not `page_type`) — screen-generator.md reads `page.type`; delta-pages.mjs and the
  // full-build spec-model.mjs (lib/spec-model.mjs) share one field name so build and append never
  // disagree. A prior version of delta-pages.mjs emitted `page_type` here, which screen-generator
  // never read — this assertion is the regression guard for that mismatch.
  assert(req?.type === 'detail' && req.entity === 'BorrowRequest' && req.entity_statuses.includes('LAPSED'), `delta-pages SCR-004 ${JSON.stringify(req)}`)

  // 6. Continue run: feature-only spec references the parent; write-changes reports new ids.
  const next = '.spec/spec/spec-20260101-000002_shelf-share'
  mkdirSync(join(root, next, 'artifacts'), { recursive: true })
  write(`${next}/spec.md`, `---
spec-version: "2.0"
timecode: "20260101-000002"
type: app
status: reviewing
metadata:
  slug: shelf-share
  title: Pause listings
  created: "2026-01-01T00:00:00Z"
  updated: "2026-01-01T00:00:00Z"
  source-files: [notes.md]
  requirements-file: requirements.yaml
  parent-spec: ${run}/spec.md
  pipeline-rounds: { clarification: 0, completeness: 0, review: 0 }
context:
  problem: Lenders cannot pause a listing while they are away.
  goal: A lender can pause a listing so it receives no requests.
  target-users: [Resident]
  existing-system: Shelf Share
  constraints: []
  non-goals: []
user-stories:
  - { id: US-008, as: Resident (lender), i-want: pause my listing, so-that: I am not asked while away, priority: should }
acceptance-criteria:
  - { id: AC-017, story-ref: US-008, kind: happy, given: a Free listing I lend, when: I pause it, then: it shows Paused and receives no requests, testable: true }
api-surface:
  endpoints:
    - { id: API-011, method: POST, path: "/v1/listings/{id}/holiday", description: Set a holiday pause, auth-required: true, roles: [Resident], story-refs: [US-008] }
delivery-plan:
  slices:
    - id: SL-003
      title: Pause listings
      goal: Lenders can pause and resume their listings.
      depends-on: [SL-001]
      tracks: [backend, frontend]
      story-refs: [US-008]
      entity-refs: [Listing]
      api-refs: [API-011]
      screen-refs: [SCR-003]
      steps:
        - { track: backend, do: Add the pause endpoint using SM-002., refs: [API-011, SM-002] }
        - { track: frontend, do: Add a pause control to listing detail., refs: [SCR-003] }
      done-when: [AC-017]
non-functional:
  performance: [p95 list < 2s]
  accessibility: [WCAG 2.2 AA]
  security: [auth]
---
`)
  write(`${next}/requirements.yaml`, `requirements:
  - { id: REQ-013, text: A lender may pause a listing., kind: behavior, source: stated, source-ref: notes.md#L3, priority: should, scope: in, covered-by: [AC-017] }
`)
  const written = node(S('write-changes.mjs'), ['--run', next])
  if (written.status !== 0) throw new Error(`write-changes failed: ${written.stdout}${written.stderr}`)
  const nfm = fm(join(root, next, 'spec.md'))
  assert(nfm['spec-version'] === '2.0' && nfm.metadata['parent-spec'] === `${run}/spec.md`, 'feature-only spec missing parent-spec')
  assert(!('requirements' in nfm) || !nfm.requirements, 'feature-only spec inlined the register')
  assert(nfm['delivery-plan'].slices.length === 1, 'feature-only spec should carry only the new slice')
  const changes = JSON.parse(read(`${next}/artifacts/changes.json`))
  assert(changes.slices?.added?.includes('SL-003') && changes.endpoints.added.includes('API-011'), `changes ${JSON.stringify(changes.slices)}`)
  const mv = node(S('validate-spec.mjs'), [join(root, next, 'spec.md'), '--json'])
  assert(mv.status === 0, `feature-only spec invalid: ${mv.stdout}`)

  // 7. Legacy 1.x: endpoints duplicated into mutations are read once.
  const legacy = `---
spec-version: "1.2"
timecode: "20260101-000003"
type: app
status: approved
metadata: { slug: legacy, title: Legacy }
context: { problem: p, goal: g, target-users: [user] }
entities:
  - name: Order
    description: A purchase
    fields: [{ name: id, type: string, required: true, description: Stable identifier }]
user-stories:
  - { id: US-001, as: user, i-want: place an order, so-that: it ships, priority: must }
acceptance-criteria:
  - { id: AC-001, story-ref: US-001, given: a cart, when: I order, then: the order is placed, testable: true }
api-surface:
  endpoints:
    - &a1 { id: API-001, method: POST, path: /v1/orders, description: create an order, auth-required: true }
  mutations:
    - *a1
non-functional: { performance: [fast], accessibility: [AA], security: [auth] }
traceability: { source-requirements: [{ file: r.md, section: s, maps-to: [US-001] }] }
---
`
  write('legacy/spec.md', legacy)
  assert(node(S('validate-spec.mjs'), [join(root, 'legacy/spec.md')]).status === 0, 'legacy 1.2 spec should still validate')
  const lb = node(join(repo, 'app-dev-kit/backend-dev-kit/skills/backend-dev/scripts/import-upstream.mjs'), ['--spec', 'legacy/spec.md', '--out', 'legacy/b.md'])
  assert(lb.status === 0 && read('legacy/b.md').match(/^- API-001/gm)?.length === 1, 'legacy endpoint imported twice')
} finally {
  if (failures.length === 0) rmSync(root, { recursive: true, force: true })
}

if (failures.length) {
  console.error(`FAIL (${root})`)
  for (const message of failures) console.error(`- ${message}`)
  process.exit(1)
}
console.log('OK: spec 2.0 contract — validator, gate, publish briefs, feature-only continue, and every consumer agree')
