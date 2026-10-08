#!/usr/bin/env node
// Two features, one at a time, with no model calls.
// Asserts the spec continues ids, the inbox is archived, the prototype is copied,
// and a revert points current.json back while leaving the new folders on disk.
// Then checks each kit's skill tells a fresh session to read .spec/app/current.json.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const specScripts = join(repo, 'app-dev-kit/spec-dev-kit/skills/generate-spec/scripts')
const htmlScripts = join(repo, 'app-dev-kit/html-generator-kit/skills/generate-html/scripts')
const checklistScript = join(repo, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/build-checklist.mjs')
const root = mkdtempSync(join(tmpdir(), 'incremental-app-'))
const failures = []

function fail(message) {
  failures.push(message)
}

function assert(cond, message) {
  if (!cond) fail(message)
}

function run(script, args) {
  return execFileSync('node', [script, ...args, '--root', root], { encoding: 'utf8' })
}

function write(rel, text) {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}

const specA = `---
spec-version: "1.2"
timecode: "20260101-000001"
type: app
status: approved
metadata:
  slug: campus
  title: Campus
  created: "2026-01-01T00:00:00Z"
  updated: "2026-01-01T00:00:00Z"
  source-files: [goal.md, stories.md, screens.md]
context:
  problem: Reviewers need a profile list.
  goal: List profiles.
  target-users: [reviewer]
  existing-system: None
  constraints: []
entities:
  - name: Profile
    description: A person
    fields:
      - name: id
        type: string
        required: true
        description: id
user-stories:
  - id: US-001
    as: reviewer
    i-want: list profiles
    so-that: I can review them
    priority: must
acceptance-criteria:
  - id: AC-001
    story-ref: US-001
    given: profiles exist
    when: I open the list
    then: I see profiles
    testable: true
ui-surface:
  screens:
    - id: SCR-001
      title: Profiles
      route: /profiles
      states: [success]
      components: [ProfilesTable]
      notes: List and filter all Profiles.
  interactions: []
---

# Campus
`

try {
  for (const name of ['goal.md', 'stories.md', 'screens.md']) {
    write(`.spec/context/${name}`, `# ${name}\n\nFeature one.\n`)
  }
  run(join(specScripts, 'continue-spec.mjs'), ['--slug', 'campus', '--timecode', '20260101-000001'])
  const runA = '.spec/spec/spec-20260101-000001_campus'
  write(`${runA}/spec.md`, specA)
  write(`${runA}/artifacts/intake.json`, '{}\n')
  write(`${runA}/artifacts/enriched.json`, '{}\n')
  write(`${runA}/artifacts/changes.json`, '{}\n')
  run(join(specScripts, 'archive-context.mjs'), ['--run', runA])

  const currentA = readJson('.spec/app/current.json')
  assert(currentA.spec_path === `${runA}/spec.md`, `spec pointer ${currentA.spec_path}`)
  assert(currentA.slug === 'campus', 'slug changed on first feature')
  assert(currentA.next_ids.US === 2 && currentA.next_ids.SCR === 2, `next ids ${JSON.stringify(currentA.next_ids)}`)
  assert(!existsSync(join(root, '.spec/context/goal.md')), 'inbox not cleared')
  assert(existsSync(join(root, `.spec/processed/${currentA.spec_id}/goal.md`)), 'context not archived')
  assert(existsSync(join(root, `.spec/processed/${currentA.spec_id}/stories.md`)), 'stories.md not archived')
  assert(existsSync(join(root, `.spec/processed/${currentA.spec_id}/screens.md`)), 'screens.md not archived')
  assert(existsSync(join(root, `.spec/processed/${currentA.spec_id}/artifacts/intake.json`)) && !existsSync(join(root, `${runA}/artifacts/intake.json`)), 'intake.json not archived')
  assert(existsSync(join(root, `.spec/processed/${currentA.spec_id}/artifacts/enriched.json`)), 'enriched.json not archived')
  assert(existsSync(join(root, `${runA}/artifacts/changes.json`)), 'changes.json must stay in the run folder')
  const incA = readJson(`.spec/app/increments/${currentA.increment_id}.json`)
  assert(incA.added.stories.includes('US-001') && incA.added.screens.includes('SCR-001'), 'increment missing first ids')

  execFileSync('node', [checklistScript, join(root, `${runA}/spec.md`)], { encoding: 'utf8' })
  const checklistPath = join(root, '.spec/app/task-checklist.md')
  const checklistA = readFileSync(checklistPath, 'utf8').replaceAll('status: pending', 'status: done')
  writeFileSync(checklistPath, checklistA)

  write('.spec/prototype/20260101-000001_campus/pages/profiles.html', '<main>Profiles</main>\n')
  write('.spec/prototype/20260101-000001_campus/page-map.json', '{"SCR-001":"profiles"}\n')
  write('.spec/prototype/20260101-000001_campus/design-brief.md', '# brief\n')
  write('.spec/prototype/20260101-000001_campus/css/tokens.css', ':root { --primary: blue; }\n')
  run(join(htmlScripts, 'record-prototype.mjs'), ['--prototype-ref', '.spec/prototype/20260101-000001_campus'])

  for (const name of ['goal.md', 'stories.md', 'screens.md']) {
    write(`.spec/context/${name}`, `# ${name}\n\nFeature two.\n`)
  }
  const continued = run(join(specScripts, 'continue-spec.mjs'), ['--slug', 'reviews', '--timecode', '20260101-000002'])
  assert(continued.includes('MODE=continue'), continued)
  assert(continued.includes('APP_SLUG=campus'), continued)
  const runB = '.spec/spec/spec-20260101-000002_campus'
  write(`${runB}/spec.md`, `---
spec-version: "1.2"
timecode: "20260101-000002"
type: app
status: reviewing
metadata:
  slug: campus
  title: Campus
  created: "2026-01-01T00:00:00Z"
  updated: "2026-01-01T00:00:00Z"
  source-files: [goal.md, stories.md, screens.md]
  parent-spec: ${runA}/spec.md
context:
  problem: Reviewers need a profile review.
  goal: Review a profile.
  target-users: [reviewer]
  existing-system: Campus
  constraints: []
user-stories:
  - id: US-002
    as: reviewer
    i-want: review a profile
    so-that: I can decide
    priority: must
acceptance-criteria:
  - id: AC-002
    story-ref: US-002
    given: a profile is open
    when: I submit a review
    then: the review is saved
    testable: true
ui-surface:
  screens:
    - id: SCR-002
      title: Review
      route: /profiles/:id/review
      states: [success]
      components: [ReviewForm]
      notes: Manage a single Profile review.
  interactions: []
---
`)
  run(join(specScripts, 'write-changes.mjs'), ['--run', runB])
  const specB = readFileSync(join(root, `${runB}/spec.md`), 'utf8')
  assert(specB.includes('parent-spec:') && specB.includes(`${runA}/spec.md`), 'second spec missing parent-spec')
  assert(!specB.includes('US-001') && !specB.includes('SCR-001'), 'second spec copied the first feature')
  assert(specB.includes('US-002') && specB.includes('SCR-002'), 'second spec missing the new feature')
  assert(/slug: ["']?campus["']?/.test(specB), 'second spec changed the app slug')
  write(`${runB}/spec.md`, specB.replace(/status: ["']?reviewing["']?/, 'status: approved'))
  run(join(specScripts, 'archive-context.mjs'), ['--run', runB])
  assert(!existsSync(join(root, '.spec/context/goal.md')), 'second inbox not cleared')
  assert(existsSync(join(root, '.spec/processed/spec-20260101-000002_campus/goal.md')), 'second context not archived')

  const currentB = readJson('.spec/app/current.json')
  assert(currentB.spec_path === `${runB}/spec.md`, `pointer did not move ${currentB.spec_path}`)
  assert(currentB.prototype_ref.endsWith('20260101-000001_campus'), 'prototype pointer moved before html')

  const protoB = '.spec/prototype/20260101-000002_campus'
  run(join(htmlScripts, 'clone-prototype.mjs'), ['--from', currentB.prototype_ref, '--to', protoB])
  run(join(htmlScripts, 'delta-pages.mjs'), [
    '--spec', `${runB}/spec.md`,
    '--page-map', `${protoB}/page-map.json`,
    '--out', `${protoB}/delta-pages.json`,
  ])
  const delta = readJson(`${protoB}/delta-pages.json`)
  const ancestor = (delta.assembly_pages ?? []).find((page) => page.spec_id === 'SCR-001')
  assert(
    delta.screens.length === 1
    && delta.screens[0].spec_id === 'SCR-002'
    && delta.screens[0].id === 'profiles-id-review'
    && ancestor?.title === 'Profiles'
    && ancestor?.id === 'profiles',
    `delta ${JSON.stringify(delta)}`,
  )
  run(join(htmlScripts, 'delta-pages.mjs'), [
    '--spec', `${runB}/spec.md`,
    '--page-map', `${protoB}/page-map.json`,
    '--out', `${protoB}/spec-summary.json`,
  ])
  const summary = readJson(`${protoB}/spec-summary.json`)
  const summaryAncestor = (summary.assembly_pages ?? []).find((page) => page.spec_id === 'SCR-001')
  assert(
    summary.screens.length === 1
    && summary.screens[0].spec_id === 'SCR-002'
    && summaryAncestor?.title === 'Profiles',
    `spec-summary ${JSON.stringify(summary.assembly_pages)}`,
  )
  assert(existsSync(join(root, `${protoB}/pages/profiles.html`)), 'clone dropped the first page')
  write(`${protoB}/pages/review.html`, '<main>Review</main>\n')
  const pageMap = readJson(`${protoB}/page-map.json`)
  pageMap['SCR-002'] = 'review'
  write(`${protoB}/page-map.json`, `${JSON.stringify(pageMap)}\n`)
  run(join(htmlScripts, 'record-prototype.mjs'), ['--prototype-ref', protoB])
  assert(existsSync(join(root, `${protoB}/pages/profiles.html`)), 'full prototype missing old page')
  assert(existsSync(join(root, `${protoB}/pages/review.html`)), 'full prototype missing new page')
  assert(existsSync(join(root, `${protoB}/design-brief.md`)), 'clone dropped the design brief')

  execFileSync('node', [checklistScript, join(root, `${runB}/spec.md`), '--prototype-ref', protoB], { encoding: 'utf8' })
  const checklistB = readFileSync(checklistPath, 'utf8')
  assert(checklistB.includes('SCR-001') && checklistB.includes('status: done'), 'shipped screen was not kept done')
  assert(checklistB.includes('SCR-002') && checklistB.includes('status: pending'), 'new screen was not pending')

  run(join(specScripts, 'revert-increment.mjs'), [])
  const reverted = readJson('.spec/app/current.json')
  assert(reverted.spec_path === `${runA}/spec.md`, `revert spec ${reverted.spec_path}`)
  assert(reverted.prototype_ref.endsWith('20260101-000001_campus'), `revert prototype ${reverted.prototype_ref}`)
  assert(existsSync(join(root, `${runB}/spec.md`)), 'revert deleted the newer spec')
  assert(existsSync(join(root, `${protoB}/pages/review.html`)), 'revert deleted the newer prototype')

  const mergeRun = '.spec/spec/spec-20260101-000003_campus'
  write(`${mergeRun}/spec.md`, `---
spec-version: "1.2"
timecode: "20260101-000003"
type: app
status: reviewing
metadata:
  slug: campus
  title: Campus
  created: "2026-01-01T00:00:00Z"
  updated: "2026-01-01T00:00:00Z"
  source-files: [goal.md]
  parent-spec: ${runA}/spec.md
context:
  problem: Reviewers need a profile list.
  goal: List profiles.
  target-users: [reviewer]
entities:
  - name: Profile
    description: A person
    fields:
      - name: id
        type: string
        required: true
        description: id
      - name: bio
        type: string
        required: false
        description: bio
user-stories:
  - id: US-001
    as: reviewer
    i-want: list profiles
    so-that: I can review them
    priority: must
---
`)
  run(join(specScripts, 'write-changes.mjs'), ['--run', mergeRun])
  const mergedProfile = readFileSync(join(root, `${mergeRun}/spec.md`), 'utf8')
  assert(mergedProfile.includes('name: id') && mergedProfile.includes('name: bio'), 'restated entity dropped old fields')
  const profileChanges = readJson(`${mergeRun}/artifacts/changes.json`)
  assert(profileChanges.entities.modified.includes('Profile'), `profile changes ${JSON.stringify(profileChanges.entities)}`)

  const storySpec = `---
spec-version: "1.2"
type: app
status: approved
metadata:
  slug: shop
  title: Shop
  created: "2026-01-01T00:00:00Z"
  updated: "2026-01-01T00:00:00Z"
  source-files: []
entities:
  - name: User
    description: Account
    fields:
      - name: id
        type: string
        required: true
  - name: Order
    description: Purchase
    fields:
      - name: id
        type: string
        required: true
    relationships:
      - entity: User
        type: many-to-one
        description: buyer
user-stories:
  - id: US-001
    as: user
    i-want: place an order
    so-that: it is delivered
    priority: must
  - id: US-002
    as: user
    i-want: see my account
    so-that: I can sign in
    priority: could
acceptance-criteria: []
api-surface:
  endpoints:
    - id: API-001
      method: GET
      path: /v1/orders
      description: list orders
      auth-required: true
---
`
  const storyWithoutUser = storySpec.replace(/  - name: User\n    description: Account\n    fields:\n      - name: id\n        type: string\n        required: true\n/, '')
  write('story-fixture/spec.md', storySpec)
  const analyzeScript = join(repo, 'app-dev-kit/app-orchestrator-kit/skills/orchestrate-app/scripts/analyze-capabilities.mjs')
  execFileSync('node', [analyzeScript, join(root, 'story-fixture/spec.md')], { encoding: 'utf8' })
  const planPath = join(root, 'story-fixture/work-plan.md')
  const planText = readFileSync(planPath, 'utf8')
  const planMatch = planText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const planFm = parse(planMatch[1])
  const userTask = planFm.tasks.find((task) => task.title === 'User')
  const orderTask = planFm.tasks.find((task) => task.title === 'Order')
  assert(userTask && !(userTask['story-refs'] ?? []).includes('US-001'), `User owns order story ${JSON.stringify(userTask?.['story-refs'])}`)
  assert(orderTask?.['story-refs']?.includes('US-001'), `Order missed its story ${JSON.stringify(orderTask?.['story-refs'])}`)
  userTask.status = 'done'
  write('story-fixture/work-plan.md', `---\n${stringify(planFm)}---\n${planText.slice(planMatch[0].length)}`)
  write('story-fixture/spec.md', storyWithoutUser)
  write('story-fixture/changes.json', `${JSON.stringify({ entities: { added: [], modified: [], removed: ['User'] } }, null, 2)}\n`)
  execFileSync('node', [analyzeScript, join(root, 'story-fixture/spec.md'), '--changes', join(root, 'story-fixture/changes.json')], { encoding: 'utf8' })
  const removedPlan = parse(readFileSync(planPath, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
  const removeTask = removedPlan.tasks.find((task) => task.title === 'User')
  assert(removeTask?.change === 'remove' && removeTask.status === 'pending', `remove task ${JSON.stringify(removeTask)}`)

  write('page-fixture/spec.md', specA.replace('route: /profiles', 'route: /products').replace('title: Profiles', 'title: Catalog'))
  write('page-fixture/page-map.json', `${JSON.stringify({ 'SCR-001': 'catalog' })}\n`)
  write('page-fixture/changes.json', `${JSON.stringify({ screens: { added: [], modified: ['SCR-001'], removed: [] } })}\n`)
  execFileSync('node', [
    join(htmlScripts, 'delta-pages.mjs'),
    '--spec', join(root, 'page-fixture/spec.md'),
    '--page-map', join(root, 'page-fixture/page-map.json'),
    '--changes', join(root, 'page-fixture/changes.json'),
    '--out', join(root, 'page-fixture/delta-pages.json'),
  ], { encoding: 'utf8' })
  const mappedDelta = readJson('page-fixture/delta-pages.json')
  assert(mappedDelta.screens[0]?.id === 'catalog' && mappedDelta.screens[0]?.spec_id === 'SCR-001', `page id ${JSON.stringify(mappedDelta.screens[0])}`)
  assert(mappedDelta.assembly_pages?.some((page) => page.id === 'catalog' && page.title === 'Catalog'), 'assembly page missing')

  writeFileSync(join(root, 'crlf-spec.md'), specA.replace(/\n/g, '\r\n'))
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { readFileSync } from 'node:fs'
    import { parse } from 'yaml'
    import { splitFront } from ${JSON.stringify(join(specScripts, 'lib-spec.mjs'))}
    const split = splitFront(readFileSync(${JSON.stringify(join(root, 'crlf-spec.md'))}, 'utf8'), parse)
    if (split?.fm?.metadata?.slug !== 'campus') process.exit(1)
  `], { encoding: 'utf8' })

  const lane = join(root, '.spec/spec/spec-20260201-000001_lane/spec.md')
  const laneNext = join(root, '.spec/spec/spec-20260201-000002_lane/spec.md')
  const laneSlice = (id, title, screen) => `    - id: ${id}
      title: ${title}
      tracks: [frontend]
      story-refs: [US-${id.slice(-3)}]
      screen-refs: [${screen}]
      depends-on: []`
  const laneScreen = (id, title, story) => `    - id: ${id}
      title: ${title}
      story-refs: [${story}]`
  const laneStory = (id) => `  - id: ${id}
    as: reviewer
    i-want: do ${id}
    so-that: it is done
    priority: must`
  write('.spec/spec/spec-20260201-000001_lane/spec.md', `---
spec-version: "2.0"
timecode: "20260201-000001"
type: feature
status: approved
metadata:
  slug: lane
  title: Lane
delivery-plan:
  slices:
${['001', '002', '003', '004'].map((n) => laneSlice(`SL-${n}`, `Slice ${n}`, `SCR-${n}`)).join('\n')}
ui-surface:
  screens:
${['001', '002', '003', '004'].map((n) => laneScreen(`SCR-${n}`, `Screen ${n}`, `US-${n}`)).join('\n')}
user-stories:
${['001', '002', '003', '004'].map((n) => laneStory(`US-${n}`)).join('\n')}
---
`)
  execFileSync('node', [checklistScript, lane], { encoding: 'utf8' })
  const laneChecklist = join(root, '.spec/app/task-checklist.md')
  const laneDone = readFileSync(laneChecklist, 'utf8').replaceAll('status: pending', 'status: done')
  writeFileSync(laneChecklist, laneDone)
  write('.spec/spec/spec-20260201-000002_lane/spec.md', `---
spec-version: "2.0"
timecode: "20260201-000002"
type: feature
status: reviewing
metadata:
  slug: lane
  title: Lane next
  parent-spec: ${lane}
delivery-plan:
  slices:
${laneSlice('SL-001', 'Slice 001 again', 'SCR-001')}
ui-surface:
  screens:
${laneScreen('SCR-009', 'Other', 'US-009')}
user-stories:
${laneStory('US-001')}
---
`)
  writeFileSync(laneChecklist, laneDone)
  const collision = spawnSync(process.execPath, [checklistScript, laneNext], { encoding: 'utf8' })
  assert(collision.status === 2 && collision.stderr.includes('ID_COLLISION'), `ID_COLLISION did not fire: ${collision.stderr}`)
  const reused = spawnSync(process.execPath, [join(specScripts, 'validate-spec.mjs'), laneNext, '--json'], { encoding: 'utf8' })
  assert(reused.stdout.includes('[ID_REUSED]'), `ID_REUSED did not fire: ${reused.stdout}`)
  write('.spec/spec/spec-20260201-000002_lane/spec.md', `---
spec-version: "2.0"
timecode: "20260201-000002"
type: feature
status: reviewing
metadata:
  slug: lane
  title: Lane next
  parent-spec: ${lane}
delivery-plan:
  slices:
${laneSlice('SL-005', 'Slice 005', 'SCR-005')}
ui-surface:
  screens:
${laneScreen('SCR-005', 'Screen 005', 'US-005')}
user-stories:
${laneStory('US-005')}
---
`)
  write('.spec/spec/spec-20260201-000002_lane/artifacts/changes.json', `${JSON.stringify({ screens: { modified: ['SCR-001'] }, slices: { modified: [] } })}\n`)
  writeFileSync(laneChecklist, laneDone)
  const appended = execFileSync('node', [checklistScript, laneNext, '--changes', join(root, '.spec/spec/spec-20260201-000002_lane/artifacts/changes.json')], { encoding: 'utf8' })
  assert(appended.includes('kept: 4') && appended.includes('appended: 1') && appended.includes('reopened: 1'), appended)
  const laneFm = parse(readFileSync(laneChecklist, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
  const reopened = laneFm.features.find((feature) => (feature.tasks ?? []).some((task) => task['screen-ref'] === 'SCR-001'))
  const stillDone = laneFm.features.filter((feature) => feature['slice-ref'] && feature['slice-ref'] !== 'SL-001' && feature['slice-ref'] !== 'SL-005' && feature.status === 'done')
  assert(reopened?.status === 'pending' && reopened['blocked-reason'] === 'spec changed', `reopen ${JSON.stringify(reopened)}`)
  assert(stillDone.length === 3, `kept done ${stillDone.length}`)
  assert(laneFm.features.some((feature) => feature['slice-ref'] === 'SL-005' && feature.status === 'pending'), 'new slice was not appended')
  write('.spec/spec/spec-20260201-000003_lane/spec.md', `---
spec-version: "2.0"
timecode: "20260201-000003"
type: feature
status: reviewing
metadata:
  slug: lane
  title: Lane extend
  parent-spec: ${lane}
delivery-plan:
  slices:
${laneSlice('SL-001', 'Slice 001', 'SCR-001').replace('screen-refs: [SCR-001]', 'screen-refs: [SCR-001, SCR-009]')}
ui-surface:
  screens:
${laneScreen('SCR-001', 'Screen 001', 'US-001')}
${laneScreen('SCR-009', 'Screen 009', 'US-009')}
user-stories:
${laneStory('US-001')}
${laneStory('US-009')}
---
`)
  write('.spec/spec/spec-20260201-000003_lane/artifacts/changes.json', `${JSON.stringify({ slices: { modified: ['SL-001'] }, screens: { modified: [], added: ['SCR-009'] } })}\n`)
  writeFileSync(laneChecklist, laneDone)
  const extended = execFileSync('node', [checklistScript, join(root, '.spec/spec/spec-20260201-000003_lane/spec.md'), '--changes', join(root, '.spec/spec/spec-20260201-000003_lane/artifacts/changes.json')], { encoding: 'utf8' })
  assert(extended.includes('kept: 4') && extended.includes('appended: 0') && extended.includes('reopened: 1'), extended)
  const extendedFm = parse(readFileSync(laneChecklist, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
  const extendedFeature = extendedFm.features.find((feature) => feature['slice-ref'] === 'SL-001')
  const extendedScreens = (extendedFeature?.tasks ?? []).map((task) => task['screen-ref'])
  assert(
    extendedFeature?.id === 'F-001'
    && extendedFeature?.status === 'pending'
    && extendedScreens.includes('SCR-001')
    && extendedScreens.includes('SCR-009')
    && extendedFm.features.filter((feature) => feature['slice-ref'] === 'SL-001').length === 1,
    `extended slice ${JSON.stringify(extendedFeature)}`,
  )
  const sized = spawnSync(process.execPath, [join(repo, 'scripts/check-artifact-sizes.mjs'), join(root, '.spec')], { encoding: 'utf8' })
  assert(sized.status === 0, `size budget: ${sized.stdout}${sized.stderr}`)
  const boardScript = join(repo, 'app-dev-kit/feature-dev-kit/skills/feature-dev/scripts/board.mjs')
  const demo = join(root, 'card-fixture/demo.md')
  write('card-fixture/demo.md', readFileSync(join(repo, 'app-dev-kit/feature-dev-kit/skills/feature-dev/templates/feature-spec.md'), 'utf8'))
  const plan = join(root, 'card-fixture/plan.md')
  write('card-fixture/plan.md', [
    '| # | Station | Layer | Slice | Segments | Agent | Group | Status | Note |',
    '|---|---------|-------|-------|----------|-------|-------|--------|------|',
    '| 1 | 6 | pages | settings | ui | composition-engineer | — | todo | Settings page |',
    '',
    '### Not building',
    '',
    '- Dark mode.',
  ].join('\n'))
  execFileSync('node', [boardScript, 'section', demo, '--put', 'Build Plan', '--from', plan], { encoding: 'utf8' })
  const impact = join(root, 'card-fixture/impact.md')
  write('card-fixture/impact.md', [
    '| Slice | Layer | Segments | Change |',
    '|-------|-------|----------|--------|',
    '| settings | pages | ui | modified |',
    '| other | entities | model | new |',
  ].join('\n'))
  execFileSync('node', [boardScript, 'section', demo, '--put', 'FSD Impact', '--from', impact], { encoding: 'utf8' })
  const card = JSON.parse(execFileSync('node', [boardScript, 'card', demo, '--row', '1', '--agent', 'composition-engineer'], { encoding: 'utf8' }))
  const cardText = readFileSync(card.card, 'utf8')
  assert(card.bytes <= 12 * 1024 && existsSync(card.common), `card ${JSON.stringify(card)}`)
  assert(cardText.includes('`pages/settings`') && !cardText.includes('entities/other'), `fsd paths missing from card: ${cardText}`)
  const handoff = JSON.parse(execFileSync('node', [boardScript, 'handoff', demo, '--name', 'composition-engineer-6', '--outcome', 'done', '--paths', 'src/pages/settings.tsx', '--decisions', 'used the button', '--gates', 'lint pass'], { encoding: 'utf8' }))
  assert(handoff.lines <= 15, `handoff lines ${handoff.lines}`)

  const importScript = join(repo, 'app-dev-kit/feature-dev-kit/skills/feature-dev/scripts/import-upstream.mjs')
  const extendChecklist = join(root, '.spec/app/extend-checklist.md')
  write('.spec/app/extend-checklist.md', `---
features:
  - id: F-001
    title: Profiles
    slug-hint: profiles
    status: done
    tasks:
      - id: T-001
        screen-ref: SCR-001
        status: done
---
`)
  const extendOut = join(root, '.spec/features/review.md')
  execFileSync('node', [importScript, '--spec', join(root, `${runA}/spec.md`), '--out', extendOut, '--slug', 'review', '--feature-id', 'F-002', '--screen-refs', 'SCR-001', '--checklist', extendChecklist], { encoding: 'utf8' })
  const extendBoard = readFileSync(extendOut, 'utf8')
  assert(extendBoard.includes('Extend existing') && extendBoard.includes('SCR-001 already built by F-001 (profiles)'), `extend ${extendBoard}`)
  const removeOut = join(root, '.spec/features/drop.md')
  execFileSync('node', [importScript, '--spec', join(root, `${runA}/spec.md`), '--out', removeOut, '--slug', 'drop', '--feature-id', 'F-002', '--screen-refs', 'SCR-001', '--checklist', extendChecklist, '--change', 'remove'], { encoding: 'utf8' })
  const removeBoard = readFileSync(removeOut, 'utf8')
  assert(
    removeBoard.includes('Remove. Do not scaffold a replacement.')
    && removeBoard.includes('change: remove')
    && !removeBoard.includes('Extend existing'),
    `remove ${removeBoard}`,
  )

  const skills = [
    'app-dev-kit/html-generator-kit/skills/generate-html/SKILL.md',
    'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/SKILL.md',
    'app-dev-kit/feature-dev-kit/skills/feature-dev/SKILL.md',
    'app-dev-kit/backend-dev-kit/skills/backend-dev/SKILL.md',
    'app-dev-kit/agent-dev-kit/skills/agent-dev/SKILL.md',
    'app-dev-kit/app-orchestrator-kit/skills/orchestrate-app/SKILL.md',
  ]
  for (const skill of skills) {
    const text = readFileSync(join(repo, skill), 'utf8')
    assert(text.includes('.spec/app/current.json'), `${skill} does not read current.json`)
  }
  const html = readFileSync(join(repo, skills[0]), 'utf8')
  assert(html.includes('clone-prototype.mjs'), 'generate-html does not clone the previous prototype')
  const feature = readFileSync(join(repo, skills[2]), 'utf8')
  assert(feature.includes('A `done` feature is not rebuilt'), 'feature-dev would rebuild a done feature')
} finally {
  if (failures.length === 0) rmSync(root, { recursive: true, force: true })
}

if (failures.length) {
  console.error(`FAIL (${root})`)
  for (const message of failures) console.error(`- ${message}`)
  process.exit(1)
}
console.log('OK: two features continued one app; revert restored the pointer; kits read current.json')
