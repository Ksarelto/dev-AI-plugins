#!/usr/bin/env node
// Deterministic contract mock-flow for feature-dev-kit (no LLM, no src/ build).
// Usage: node mock-flow.mjs
// Exit 0 = all checks passed. Exit 1 = a check failed.

import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync, cpSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { parse as parseYaml } from 'yaml'

const here = dirname(fileURLToPath(import.meta.url))
const kitDir = join(here, '../../..')
const repoRoot = join(kitDir, '../..')
const skillDir = join(kitDir, 'skills/feature-dev')
const agentsDir = join(kitDir, 'agents')
const skillsRoot = join(kitDir, 'skills')
const pipelinePath = join(skillDir, 'references/pipeline-flow.md')
const packetsDir = join(skillDir, 'templates/packets')
const specFixture = join(here, 'fixtures/building-cupboard/spec.md')
const protoFixture = join(here, 'fixtures/prototype')
const checklistScript = join(repoRoot, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/build-checklist.mjs')
const importScript = join(here, 'import-upstream.mjs')
const validateScript = join(here, 'validate-feature-spec.mjs')
const inventoryScript = join(here, 'extract-prototype-inventory.mjs')

const EXTERNAL_SKILLS = new Set(['testing', 'code-review', 'architecture-audit'])
const HUMAN_ONLY = new Set(['create-pr'])
const PACKET_TYPES = ['CLARIFY_PACKET', 'DEP_PACKET', 'REVIEW_PACKET', 'ESCALATION_PACKET', 'CONTINUE_PACKET']
const STATION_NEEDLES = [
  'Station 0', 'import-upstream.mjs', 'spec-analyst', 'Station 0.5',
  'Station 1', 'code-explorer', 'Station 1.5', 'architecture-auditor',
  'Station 1a', 'research-analyst', 'Station 1b', 'DEP_PACKET',
  'Station 2', 'Station 3', 'shared-engineer', 'Station 4', 'entities-engineer',
  'Station 5', 'features-engineer', 'Station 6', 'composition-engineer',
  'Station 7', 'app-engineer', 'Station 8', 'test-engineer',
  'Station 9', 'run-gates.sh', 'Station 9.5', 'Station 10', 'code-reviewer',
  'Station 11', 'Station 12', 'slice-engineer', 'REVIEW_PACKET',
]

let failed = 0
function pass(msg) { console.log(`OK    ${msg}`) }
function fail(msg) { console.error(`FAIL  ${msg}`); failed++ }

function parseFrontmatter(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { raw, fm: null }
  return { raw, fm: parseYaml(match[1]) }
}

function checkPrototypeInventory(boardPath) {
  const invPath = join(dirname(boardPath), 'sign-in.context/prototype-inventory.md')
  const wrote = node(inventoryScript, ['--spec', boardPath])
  if (wrote.status !== 0 || !existsSync(invPath)) {
    fail(`extract-prototype-inventory --spec failed: ${wrote.stderr || wrote.stdout}`)
    return
  }
  const inv = readFileSync(invPath, 'utf8')
  const needles = [
    'States in prototype: loading, empty, error, success',
    '| heading | Sign in |',
    '| field | How you are known | input text, name displayName, required, placeholder "e.g. Marta 4B" |',
    '| validation | Enter the name the manager wrote down. |',
    '| button | Retry | variant secondary |',
    '| badge | Not signed in yet | variant default |',
  ]
  const missing = needles.filter((n) => !inv.includes(n))
  if (missing.length) fail(`prototype inventory missing rows: ${missing.join(' ; ')}`)
  else pass('prototype inventory extracts states, copy, fields, validation, and variants')
  if (/Preview (loading|empty) state/.test(inv)) fail('prototype inventory leaked the dev-panel')

  const blank = node(inventoryScript, ['--check', invPath])
  if (blank.status !== 1) fail(`--check should fail an unfilled inventory (exit ${blank.status})`)
  else pass('--check fails an unfilled inventory')

  const filled = inv.split('\n').map((line) => {
    if (!/^\| \d+ \|/.test(line)) return line
    return line.replace(/\|\s*\|\s*\|$/, /\| icon \|/.test(line) ? '|  | n/a: lucide icon replaces the emoji |' : '| src/pages/sign-in/ui/sign-in-page.tsx | done |')
  }).join('\n')
  writeFileSync(invPath, filled)
  const ok = node(inventoryScript, ['--check', invPath])
  if (ok.status !== 0) fail(`--check should pass a filled inventory: ${ok.stdout}`)
  else pass('--check passes a filled inventory')

  const rewrote = node(inventoryScript, ['--spec', boardPath])
  const kept = node(inventoryScript, ['--check', invPath])
  if (rewrote.status !== 0 || kept.status !== 0) fail('re-extract dropped filled React target / Status columns')
  else pass('re-extract keeps filled React target / Status')

  writeFileSync(invPath, readFileSync(invPath, 'utf8').split('\n').map((line) => (/^\| \d+ \| error /.test(line) ? line.replace(/\| done \|$/, '| missing |') : line)).join('\n'))
  const gap = node(inventoryScript, ['--check', invPath])
  if (gap.status !== 1 || !/state "error" has no done row/.test(gap.stdout)) fail('--check should fail when a prototype state is not built')
  else pass('--check fails a missing prototype state')
}

function toolsList(fm) {
  const t = fm?.tools ?? fm?.['allowed-tools']
  if (!t) return []
  if (Array.isArray(t)) return t.map(String)
  return String(t).split(',').map((s) => s.trim())
}

function node(script, args, opts = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
    ...opts,
  })
}

// --- 1. Agent / skill contracts ---
const localSkillNames = new Set(
  readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const p = join(skillsRoot, e.name, 'SKILL.md')
      if (!existsSync(p)) return null
      return parseFrontmatter(p).fm?.name
    })
    .filter(Boolean),
)

const agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'))
if (agentFiles.length < 13) fail(`expected ≥13 agents, found ${agentFiles.length}`)
else pass(`${agentFiles.length} agent files`)

for (const file of agentFiles) {
  const path = join(agentsDir, file)
  const { raw, fm } = parseFrontmatter(path)
  if (!fm?.name || !fm?.description) {
    fail(`${file}: missing name/description frontmatter`)
    continue
  }
  const tools = toolsList(fm)
  if (tools.includes('AskUserQuestion')) fail(`${fm.name}: tools include AskUserQuestion`)
  const skills = fm.skills ?? []
  const skillArr = Array.isArray(skills) ? skills : String(skills).split(',').map((s) => s.trim())
  for (const s of skillArr) {
    if (!localSkillNames.has(s) && !EXTERNAL_SKILLS.has(s)) {
      fail(`${fm.name}: skills: [${s}] is not in this plugin and not a documented frontend-dev-kit skill`)
    }
  }
  if (fm.name === 'feature-orchestrator') {
    if (!tools.includes('Write') && !tools.includes('Edit')) {
      fail('feature-orchestrator: needs Write/Edit for the blackboard')
    }
    if (tools.includes('Skill')) {
      fail('feature-orchestrator: must not hold Skill — spawn architecture-auditor instead')
    }
    if (!/never write files under `src\/`/i.test(raw) && !/Never write files under\s+`src\/`/i.test(raw)) {
      fail('feature-orchestrator: must forbid src/ writes in the prompt')
    }
    if (!/spawn `architecture-auditor`/i.test(raw)) {
      fail('feature-orchestrator: Stations 1.5/9.5 must spawn architecture-auditor')
    }
    if (/invoke skill `frontend-dev-kit:architecture-audit`/.test(raw)) {
      fail('feature-orchestrator: must not invoke architecture-audit by skill name')
    }
  }
  if (fm.name === 'architecture-auditor') {
    if (tools.includes('Edit') || tools.includes('Skill')) {
      fail('architecture-auditor: must not hold Edit or Skill')
    }
    if (!tools.includes('Write')) {
      fail('architecture-auditor: needs Write for the context handoff file')
    }
    if (!/\.context\//.test(raw) || !/never write `src\/`|Never write `src\/`/i.test(raw)) {
      fail('architecture-auditor: Write must be limited to .context/ and must forbid src/')
    }
    if (!skillArr.includes('architecture-audit')) {
      fail('architecture-auditor: must preload skills: [architecture-audit]')
    }
    if (!/REPORT_ONLY/.test(raw)) {
      fail('architecture-auditor: body must require REPORT_ONLY')
    }
  }
}
pass('agent frontmatter, no AskUserQuestion, skills lists resolve')

for (const dirent of readdirSync(skillsRoot, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue
  const p = join(skillsRoot, dirent.name, 'SKILL.md')
  if (!existsSync(p)) continue
  const { fm } = parseFrontmatter(p)
  if (!fm?.name) { fail(`${dirent.name}/SKILL.md: missing name`); continue }
  const dmi = fm['disable-model-invocation']
  if (HUMAN_ONLY.has(fm.name)) {
    if (dmi !== true) fail(`${fm.name}: must remain disable-model-invocation: true`)
  } else if (fm.name !== 'feature-dev' && dmi === true) {
    fail(`${fm.name}: factory skill must not be disable-model-invocation: true`)
  }
}
pass('create-pr is human-only; factory scaffolds are invokable')

const skillFm = parseFrontmatter(join(skillDir, 'SKILL.md')).fm
const skillTools = toolsList(skillFm)
if (!skillTools.includes('AskUserQuestion')) fail('feature-dev skill must allow AskUserQuestion')
else pass('feature-dev skill owns AskUserQuestion')

const writeResultScript = join(skillDir, 'scripts/write-kit-result.mjs')
if (!existsSync(writeResultScript)) {
  fail('missing scripts/write-kit-result.mjs')
} else {
  const tmpEnv = mkdtempSync(join(tmpdir(), 'kit-result-'))
  try {
    const outp = join(tmpEnv, 'kit-result.json')
    const also = join(tmpEnv, 'also.json')
    const wr = node(writeResultScript, [
      '--out', outp, '--also', also,
      '--kit', 'feature-dev', '--outcome', 'approved',
      '--slug', 'sign-in', '--branch', 'feature/sign-in',
      '--feature-spec', '.spec/features/sign-in.md',
    ])
    if (wr.status !== 0) fail(`write-kit-result.mjs: ${wr.stderr || wr.stdout}`)
    else {
      const env = JSON.parse(readFileSync(outp, 'utf8'))
      if (env.envelope !== 'app-dev-kit/kit-result/v1' || env.outcome !== 'approved' || env.slug !== 'sign-in') {
        fail('kit-result.json schema mismatch')
      } else if (!existsSync(also)) fail('write-kit-result --also did not write second path')
      else pass('write-kit-result.mjs envelope')
    }
  } finally {
    rmSync(tmpEnv, { recursive: true, force: true })
  }
}

const featureSkillBody = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
if (!featureSkillBody.includes('kit-result.json')) fail('feature-dev SKILL.md must write kit-result.json')
else pass('feature-dev SKILL.md path-only envelope')

// --- 2. Station graph ---
const pipeline = readFileSync(pipelinePath, 'utf8')
for (const needle of STATION_NEEDLES) {
  if (!pipeline.includes(needle)) fail(`pipeline-flow.md missing "${needle}"`)
}
pass('pipeline-flow.md station graph + architecture-auditor')

if (!pipeline.includes('TIER')) fail('pipeline-flow.md missing TIER')
else pass('pipeline-flow.md names TIER')
if (!/do \*\*not\*\* spawn `feature-orchestrator`/i.test(featureSkillBody)) {
  fail('feature-dev SKILL.md patch tier must not spawn feature-orchestrator')
} else pass('patch tier does not spawn feature-orchestrator')

const gatesScript = readFileSync(join(skillDir, 'scripts/run-gates.sh'), 'utf8')
if (!gatesScript.includes('--until')) fail('run-gates.sh missing --until')
else pass('run-gates.sh supports --until')
if (!/GATES=\(types lint fsd conventions build coverage\)/.test(gatesScript)) fail('run-gates.sh gate order must be types lint fsd conventions build coverage')
else pass('run-gates.sh runs the conventions gate after fsd')

// --- 2b. Conventions gate against fixtures ---
const conventionsScript = join(here, 'check-conventions.mjs')
const conventionsFixtures = join(here, 'fixtures/conventions')
const runConventions = (dir) => node(conventionsScript, ['--root', join(conventionsFixtures, dir), '--all', '--json'])
const goodRun = runConventions('good')
if (goodRun.status === 2) {
  pass(`check-conventions skipped — ${goodRun.stderr.trim()}`)
} else {
  const good = JSON.parse(goodRun.stdout || '{}')
  if (goodRun.status !== 0 || !good.passed) {
    fail(`check-conventions flagged the good fixture: ${(good.findings ?? []).map((f) => `${f.file}:${f.line} ${f.rule}`).join('; ')}`)
  } else pass(`check-conventions passes the good fixture (${good.checked} files)`)

  const badRun = runConventions('bad')
  const bad = JSON.parse(badRun.stdout || '{}')
  const rules = new Set((bad.findings ?? []).map((f) => f.rule))
  const expected = [
    'comment', 'inline-class', 'nested-ternary', 'jsx-ternary', 'inline-handler', 'hardcoded-copy', 'magic-prop',
    'missing-test', 'unused-export', 'export-star', 'motion-utility', 'string-map', 'motion-css',
  ]
  const missing = expected.filter((r) => !rules.has(r))
  if (badRun.status !== 1) fail(`check-conventions must exit 1 on the bad fixture (got ${badRun.status})`)
  else if (missing.length) fail(`check-conventions missed rules on the bad fixture: ${missing.join(', ')}`)
  else pass(`check-conventions catches all ${expected.length} rules on the bad fixture`)

  // unused-export: a segment file's export used only by its own test passes; an index.ts export
  // used only by a test is still a finding; --ignore unused-export (worker self-check) drops it.
  const scratch = mkdtempSync(join(conventionsFixtures, '.tmp-'))
  try {
    cpSync(join(conventionsFixtures, 'good'), scratch, { recursive: true })
    const orders = join(scratch, 'src/features/orders')
    writeFileSync(join(orders, 'api/fetchers.ts'), `${readFileSync(join(orders, 'api/fetchers.ts'), 'utf8')}\nexport const ordersPath = 'orders'\n`)
    writeFileSync(join(orders, 'api/tests/fetchers.test.ts'), readFileSync(join(orders, 'api/tests/fetchers.test.ts'), 'utf8')
      .replace("import { placeOrder } from '../fetchers'", "import { ordersPath, placeOrder } from '../fetchers'")
      .replace("expect(http.post).toHaveBeenCalledWith('orders'", 'expect(http.post).toHaveBeenCalledWith(ordersPath'))
    writeFileSync(join(orders, 'index.ts'), "export { PlaceOrder } from './ui/place-order'\nexport { placeOrder } from './api/fetchers'\n")
    writeFileSync(join(orders, 'ui/place-order/place-order.test.tsx'), `import { placeOrder } from '@/features/orders'\n${readFileSync(join(orders, 'ui/place-order/place-order.test.tsx'), 'utf8')}\nvoid placeOrder\n`)
    const run = (extra) => JSON.parse(node(conventionsScript, ['--root', scratch, '--all', '--json', ...extra]).stdout || '{}')
    const unused = (run([]).findings ?? []).filter((f) => f.rule === 'unused-export')
    if (unused.some((f) => f.file.endsWith('api/fetchers.ts'))) fail('unused-export flagged a segment export that its own test imports')
    else if (!unused.some((f) => f.file.endsWith('orders/index.ts'))) fail('unused-export must still flag an index.ts export that only a test imports')
    else pass('unused-export counts tests for segment files, not for index.ts')
    if ((run(['--ignore', 'unused-export']).findings ?? []).some((f) => f.rule === 'unused-export')) fail('--ignore unused-export did not drop the rule')
    else pass('--ignore unused-export drops the rule for layer self-checks')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// preflight-host.mjs ships in feature-dev-kit and frontend-orchestrator-kit; the copies must match.
const preflightCopy = join(repoRoot, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/preflight-host.mjs')
if (readFileSync(join(here, 'preflight-host.mjs'), 'utf8') !== readFileSync(preflightCopy, 'utf8')) fail('preflight-host.mjs copies differ between feature-dev-kit and frontend-orchestrator-kit')
else pass('preflight-host.mjs copies match')

const budget = readFileSync(join(skillDir, 'references/context-budget.md'), 'utf8')
if (!budget.includes('HANDOFF:')) fail('context-budget.md missing HANDOFF return')
else pass('context-budget.md HANDOFF return (no inlined report)')

// --- 3–5. Task derivation + scoped import + prototype ---
if (!existsSync(specFixture)) {
  fail(`missing fixture ${specFixture}`)
} else {
  const tmp = mkdtempSync(join(tmpdir(), 'feature-dev-mock-'))
  try {
    const specCopy = join(tmp, 'spec.md')
    copyFileSync(specFixture, specCopy)
    const built = node(checklistScript, [specCopy, '--prototype-ref', protoFixture])
    if (built.status !== 0) {
      fail(`build-checklist.mjs failed: ${built.stderr || built.stdout}`)
    } else {
      const checklistPath = join(tmp, 'task-checklist.md')
      const cl = parseFrontmatter(checklistPath).fm
      const features = cl?.features ?? []
      const tasks = features.length
        ? features.flatMap((f) => (f.tasks ?? []).map((t) => ({ ...t, _feature: f })))
        : (cl?.tasks ?? [])
      if (tasks.length < 1) fail('build-checklist produced zero tasks')
      else pass(`build-checklist produced ${features.length} features, ${tasks.length} tasks`)
      if (cl['checklist-version'] !== '1.1') fail(`checklist-version ${cl['checklist-version']} (want 1.1)`)
      else pass('checklist-version 1.1')
      const missingRefs = tasks.filter((t) => t['screen-ref'] && !(t['ac-refs']?.length >= 0))
      if (missingRefs.length) fail('a screen task is missing ac-refs')
      const signIn = tasks.find((t) => t['screen-ref'] === 'SCR-001' || /sign in/i.test(t.title ?? ''))
      if (!signIn) {
        fail('no Sign in / SCR-001 task derived')
      } else {
        const hint = signIn._feature?.['slug-hint'] || signIn['slug-hint']
        if (!hint) fail('sign-in feature missing slug-hint')
        else pass(`slug-hint ${hint}`)
        const outBoard = join(tmp, 'sign-in.md')
        const imported = node(importScript, [
          '--spec', specCopy,
          '--out', outBoard,
          '--slug', 'sign-in',
          '--task-id', signIn.id,
          '--screen-ref', signIn['screen-ref'],
          '--story-refs', (signIn['story-refs'] ?? []).join(','),
          '--ac-refs', (signIn['ac-refs'] ?? []).join(','),
          '--entity-refs', (signIn['entity-refs'] ?? []).join(','),
          '--prototype-ref', protoFixture,
          '--require-scoped',
        ])
        if (imported.status !== 0) {
          fail(`import-upstream.mjs failed: ${imported.stderr || imported.stdout}`)
        } else {
          pass('import-upstream wrote scoped blackboard')
          const board = readFileSync(outBoard, 'utf8')
          if (!board.includes('SCR-001')) fail('blackboard missing screen-ref SCR-001')
          const uiMatch = board.match(/## UI Surface\n([\s\S]*?)\n## /)
          const ui = uiMatch?.[1] ?? ''
          if (/Building catalogue/i.test(ui) && !/Sign in/i.test(ui)) {
            fail('UI Surface looks like the wrong screen')
          }
          const otherTitles = ['List an item', 'Admit an adult', 'Who has access', 'Manage listing']
          const leaked = otherTitles.filter((t) => new RegExp(`title: ${t}`, 'i').test(ui))
          if (leaked.length) fail(`UI Surface leaked sibling screens: ${leaked.join(', ')}`)
          else pass('UI Surface is scoped to one screen')
          if (!/prototype-page: pages\/sign-in\.html/.test(board)) {
            fail('prototype-page not bound to pages/sign-in.html')
          } else pass('prototype page bound')
          checkPrototypeInventory(outBoard)
          const validated = node(validateScript, [outBoard, '--require-scoped'])
          if (validated.status !== 0) fail(`validate-feature-spec.mjs: ${validated.stderr || validated.stdout}`)
          else pass('validate-feature-spec --require-scoped')
        }
      }

      const catalogue = tasks.find((t) => t['screen-ref'] === 'SCR-004' || /building catalogue/i.test(t.title ?? ''))
      if (!catalogue) {
        fail('no Building catalogue / SCR-004 task derived')
      } else {
        const catBoard = join(tmp, 'catalogue.md')
        const catImported = node(importScript, [
          '--spec', specCopy,
          '--out', catBoard,
          '--slug', 'building-catalogue',
          '--task-id', catalogue.id,
          '--screen-ref', catalogue['screen-ref'],
          '--story-refs', (catalogue['story-refs'] ?? []).join(','),
          '--ac-refs', (catalogue['ac-refs'] ?? []).join(','),
          '--entity-refs', (catalogue['entity-refs'] ?? []).join(','),
          '--prototype-ref', protoFixture,
          '--require-scoped',
        ])
        if (catImported.status !== 0) {
          fail(`import-upstream SCR-004 failed: ${catImported.stderr || catImported.stdout}`)
        } else {
          const cat = readFileSync(catBoard, 'utf8')
          if (/prototype-page: pages\/catalogue\.html/.test(cat)) {
            fail('SCR-004 bound to pages/catalogue.html — should be building-catalogue.html')
          }
          if (!/prototype-page: pages\/building-catalogue\.html/.test(cat)) {
            fail('prototype-page not bound to pages/building-catalogue.html for SCR-004')
          } else pass('SCR-004 prototype page bound to building-catalogue.html')
        }
      }

      const listing = tasks.find((t) => t['screen-ref'] === 'SCR-005')
      if (listing) {
        const listBoard = join(tmp, 'listing.md')
        const listImported = node(importScript, [
          '--spec', specCopy,
          '--out', listBoard,
          '--slug', 'listing-detail',
          '--task-id', listing.id,
          '--screen-ref', listing['screen-ref'],
          '--prototype-ref', protoFixture,
          '--require-scoped',
        ])
        if (listImported.status !== 0) {
          fail(`import-upstream SCR-005 failed: ${listImported.stderr || listImported.stdout}`)
        } else if (!/prototype-page: pages\/listing-detail\.html/.test(readFileSync(listBoard, 'utf8'))) {
          fail('SCR-005 prototype-page not bound to pages/listing-detail.html')
        } else pass('SCR-005 prototype page bound to listing-detail.html')
      }

      const readmeOnly = join(tmp, 'proto-readme-only')
      mkdirSync(join(readmeOnly, 'pages'), { recursive: true })
      const srcHtml = join(protoFixture, 'pages', 'building-catalogue.html')
      if (existsSync(srcHtml)) {
        copyFileSync(srcHtml, join(readmeOnly, 'pages', 'building-catalogue.html'))
        writeFileSync(join(readmeOnly, 'README.md'), `## Pages (1)\n\n- building-catalogue: Building catalogue — Browse listings.\n`)
        const readmeBoard = join(tmp, 'catalogue-readme.md')
        const readmeImported = node(importScript, [
          '--spec', specCopy,
          '--out', readmeBoard,
          '--slug', 'building-catalogue-readme',
          '--screen-ref', 'SCR-004',
          '--prototype-ref', readmeOnly,
          '--require-scoped',
        ])
        if (readmeImported.status !== 0) {
          fail(`README-only prototype bind failed: ${readmeImported.stderr || readmeImported.stdout}`)
        } else if (!/prototype-page: pages\/building-catalogue\.html/.test(readFileSync(readmeBoard, 'utf8'))) {
          fail('README title match did not bind building-catalogue.html')
        } else pass('README ## Pages title match binds prototype page')
      }
    }

    const dump = node(importScript, ['--spec', specCopy, '--require-scoped', '--stdout-only'])
    if (dump.status === 0) fail('import-upstream --require-scoped without SCREEN_REF should fail')
    else pass('require-scoped rejects a whole-app dump')

    const groupedSpec = join(tmp, 'grouped', 'spec.md')
    mkdirSync(join(tmp, 'grouped'), { recursive: true })
    writeFileSync(groupedSpec, `---
type: app
status: approved
metadata:
  title: Grouped
  slug: grouped
user-stories:
  - id: US-001
    as: a member
    i-want: sign in and see home
    so-that: I can start
    priority: must
acceptance-criteria:
  - id: AC-001
    story-ref: US-001
    given: signed out
    when: I open Sign in
    then: I see the form
  - id: AC-002
    story-ref: US-001
    given: signed in
    when: I open Home
    then: I see the dashboard
ui-surface:
  screens:
    - id: SCR-001
      title: Sign in
      route: /sign-in
      states: [empty]
      components: []
    - id: SCR-002
      title: Home
      route: /home
      states: [ready]
      components: []
---
# Grouped
`)
    const grouped = node(checklistScript, [groupedSpec])
    if (grouped.status !== 0) {
      fail(`grouped build-checklist failed: ${grouped.stderr || grouped.stdout}`)
    } else {
      const g = parseFrontmatter(join(tmp, 'grouped', 'task-checklist.md')).fm
      const gFeatures = g.features ?? []
      const gTasks = gFeatures.flatMap((f) => f.tasks ?? [])
      if (gFeatures.length !== 1 || gTasks.length !== 2) {
        fail(`two screens on one story should be 1 feature / 2 tasks (got ${gFeatures.length} / ${gTasks.length})`)
      } else pass('two screens on one story → one feature, two tasks')
      const both = node(importScript, [
        '--spec', groupedSpec,
        '--out', join(tmp, 'sign-in-and-see-home.md'),
        '--slug', 'sign-in-and-see-home',
        '--feature-id', gFeatures[0].id,
        '--task-ids', gTasks.map((t) => t.id).join(','),
        '--screen-refs', gTasks.map((t) => t['screen-ref']).join(','),
        '--require-scoped',
      ])
      if (both.status !== 0) {
        fail(`multi-screen import failed: ${both.stderr || both.stdout}`)
      } else {
        const board = readFileSync(join(tmp, 'sign-in-and-see-home.md'), 'utf8')
        if (!board.includes('SCR-001') || !board.includes('SCR-002')) {
          fail('multi-screen import dropped a nested screen')
        } else pass('multi-screen import includes both screens')
        const validated = node(validateScript, [join(tmp, 'sign-in-and-see-home.md'), '--require-scoped'])
        if (validated.status !== 0) fail(`multi-screen validate: ${validated.stderr || validated.stdout}`)
        else pass('multi-screen blackboard passes --require-scoped')
      }
      const unscoped = node(importScript, ['--spec', groupedSpec, '--require-scoped', '--stdout-only'])
      if (unscoped.status === 0) fail('unscoped two-screen dump should fail --require-scoped')
      else pass('unscoped two-screen dump still fails --require-scoped')
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// --- 5b. board.mjs: cards, single-note rows, appends, gate status off the board ---
{
  const tmpBoard = mkdtempSync(join(tmpdir(), 'feature-dev-board-'))
  try {
    const boardScript = join(here, 'board.mjs')
    const board = join(tmpBoard, 'demo.md')
    const ctx = join(tmpBoard, 'demo.context')
    writeFileSync(board, readFileSync(join(skillDir, 'templates/feature-spec.md'), 'utf8')
      .replace('## UI Surface\n\n<one screen: id, title, route, states, components. prototype-page if PROTOTYPE_REF bound>',
        '## UI Surface\n\n- screen-ref: SCR-001\n- title: Settings\n- route: /settings\n\n- screen-ref: SCR-002\n- title: Help\n- route: /help\n\n- screen-ref: SCR-003\n- title: Orders\n- route: /orders'))
    const plan = join(tmpBoard, 'plan.md')
    writeFileSync(plan, [
      '**Strategy**: one engineer per layer.', '',
      '| # | Station | Layer | Slice | Segments | Agent | Group | Status | Note |',
      '|---|---------|-------|-------|----------|-------|-------|--------|------|',
      '| 1 | 3 | shared | ui | Dialog | shared-engineer | — | todo | |',
      '| 2 | 6 | pages | settings, help | ui | composition-engineer | B1 | todo | |', '',
      '### Not building', '', '- Dark mode.',
    ].join('\n'))
    const b = (...a) => node(boardScript, a)
    const put = b('section', board, '--put', 'Build Plan', '--from', plan)
    const card = b('card', board, '--row', '2', '--agent', 'composition-engineer')
    const cardPath = put.status === 0 && card.status === 0 ? JSON.parse(card.stdout).card : ''
    const cardText = cardPath && existsSync(cardPath) ? readFileSync(cardPath, 'utf8') : ''
    if (!cardText.includes('| 2 | 6 | pages | settings, help') || cardText.includes('| 1 | 3 | shared') || cardText.includes('## Gate Log') || !cardText.includes('Dark mode.')) {
      fail(`board.mjs card must carry only its rows, the Not building list, and no Gate Log: ${card.stderr}`)
    } else pass('board.mjs card carries its rows and sections, not the board')
    if (!cardText.includes('- screen-ref: SCR-001') || !cardText.includes('- screen-ref: SCR-002')) fail('batch card dropped a screen of its batch row')
    else if (cardText.includes('- screen-ref: SCR-003')) fail('batch card kept a screen outside its batch row')
    else pass('batch card keeps exactly the screens of its batch row')
    b('row', board, '--row', '2', '--status', 'in-progress', '--note', 'first')
    b('row', board, '--row', '2', '--status', 'done', '--note', 'pages built')
    const rowLine = readFileSync(board, 'utf8').split('\n').find((l) => l.startsWith('| 2 |')) ?? ''
    if (!/\| done \| pages built \|$/.test(rowLine) || rowLine.includes('first')) fail(`board.mjs row must replace the note, not append: ${rowLine}`)
    else pass('board.mjs row keeps one current note per row')
    b('append', board, '--section', 'Reuse Map', '--line', '| Dialog | `@/shared/ui/dialog` | reuse |')
    if (!readFileSync(board, 'utf8').includes('| Dialog | `@/shared/ui/dialog` | reuse |')) fail('board.mjs append did not add the Reuse Map row')
    else pass('board.mjs append adds a Reuse Map row')
    const before = readFileSync(board, 'utf8')
    b('gate', board, '--station', 'Station 3', '--json', '{"passed":true,"log":".spec/.gate-log","gates":[{"gate":"types","status":"pass","duration_s":1}]}')
    b('gate', board, '--station', 'Station 9', '--json', '{"passed":false,"log":".spec/.gate-log","gates":[{"gate":"types","status":"fail","duration_s":1}]}')
    const status = existsSync(join(ctx, 'gate-status.md')) ? readFileSync(join(ctx, 'gate-status.md'), 'utf8') : ''
    if (readFileSync(board, 'utf8') !== before) fail('board.mjs gate wrote the blackboard')
    else if (!/\| types \| fail \| Station 9 \|/.test(status) || /\| types \| pass/.test(status)) fail(`gate-status.md must hold only the latest result per gate: ${status}`)
    else pass('gate results go to gate-status.md (latest per gate), not the board')
    const timings = existsSync(join(ctx, 'timings.jsonl')) ? readFileSync(join(ctx, 'timings.jsonl'), 'utf8').trim().split('\n') : []
    if (!timings.some((l) => l.includes('"event":"spawn"')) || !timings.some((l) => l.includes('"event":"gate"'))) fail('timings.jsonl missing spawn / gate events')
    else pass('timings.jsonl records spawns and gates')
  } finally {
    rmSync(tmpBoard, { recursive: true, force: true })
  }
}

// --- 6. Packet fixtures ---
for (const type of PACKET_TYPES) {
  const p = join(packetsDir, `${type}.json`)
  if (!existsSync(p)) { fail(`missing packet fixture ${type}.json`); continue }
  let obj
  try { obj = JSON.parse(readFileSync(p, 'utf8')) } catch (e) {
    fail(`${type}.json: ${e.message}`); continue
  }
  if (obj.type !== type) fail(`${type}.json type mismatch (${obj.type})`)
  if (!obj.spec_path) fail(`${type}.json missing spec_path`)
}
pass('packet fixtures parse')

if (failed) {
  console.error(`\nINVALID — ${failed} mock-flow check(s) failed`)
  process.exit(1)
}
console.log('\nVALID — feature-dev-kit mock-flow passed')
process.exit(0)
