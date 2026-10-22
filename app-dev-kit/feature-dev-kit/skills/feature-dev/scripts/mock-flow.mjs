#!/usr/bin/env node
// Deterministic contract mock-flow for feature-dev-kit (no LLM, no src/ build).
// Usage: node mock-flow.mjs
// Exit 0 = all checks passed. Exit 1 = a check failed.

import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync, cpSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

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
  'Station 7', 'app-engineer', 'test-engineer',
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
    'missing-test', 'unused-export', 'export-star', 'motion-utility', 'string-map', 'motion-css', 'dark-variant',
    'cross-slice-mock', 'inline-query-key', 'env-access', 'client-option',
    'lib-imports-api', 'arrow-body', 'max-len', 'block-gap', 'wrapped-expr', 'node-access', 'class-constant', 'translated-local',
    'component-let', 'iife', 'query-outside-api', 'query-state-local',
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
    writeFileSync(join(orders, 'ui/place-order/tests/place-order.test.tsx'), `import { placeOrder } from '@/features/orders'\n${readFileSync(join(orders, 'ui/place-order/tests/place-order.test.tsx'), 'utf8')}\nvoid placeOrder\n`)
    const run = (extra) => JSON.parse(node(conventionsScript, ['--root', scratch, '--all', '--json', ...extra]).stdout || '{}')
    const unused = (run([]).findings ?? []).filter((f) => f.rule === 'unused-export')
    if (unused.some((f) => f.file.endsWith('api/fetchers.ts'))) fail('unused-export flagged a segment export that its own test imports')
    else if (!unused.some((f) => f.file.endsWith('orders/index.ts'))) fail('unused-export must still flag an index.ts export that only a test imports')
    else pass('unused-export counts tests for segment files, not for index.ts')
    if ((run(['--ignore', 'unused-export']).findings ?? []).some((f) => f.rule === 'unused-export')) fail('--ignore unused-export did not drop the rule')
    else pass('--ignore unused-export drops the rule for layer self-checks')

    const tableDir = join(scratch, 'src/shared/ui/data-table')
    mkdirSync(tableDir, { recursive: true })
    writeFileSync(join(tableDir, 'types.ts'), 'export interface DataTableProps {\n  caption: string\n}\n')
    writeFileSync(join(tableDir, 'index.ts'), "export const DataTablePart = 'part'\nexport type { DataTableProps } from './types'\n")
    const sharedUnused = (run([]).findings ?? []).filter((f) => f.rule === 'unused-export' && f.file.includes('shared/ui/data-table'))
    if (sharedUnused.some((f) => f.message.includes('DataTablePart'))) fail('unused-export flagged a shared/ui value export (registry parts are exempt)')
    else if (!sharedUnused.some((f) => f.message.includes('DataTableProps'))) fail('unused-export must flag an unused shared/ui type export')
    else pass('unused-export in shared/ui checks type exports only')
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

      const clPath = join(tmp, 'grouped', 'task-checklist.md')
      const clDoc = parseFrontmatter(clPath).fm
      clDoc.features[0].tasks.find((t) => t['screen-ref'] === 'SCR-002').change = 'remove'
      const clBody = readFileSync(clPath, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${stringifyYaml(clDoc)}---`)
      writeFileSync(clPath, clBody)
      const mixed = node(importScript, [
        '--spec', groupedSpec,
        '--out', join(tmp, 'mixed.md'),
        '--slug', 'mixed',
        '--feature-id', gFeatures[0].id,
        '--screen-refs', 'SCR-001,SCR-002',
        '--checklist', clPath,
        '--require-scoped',
      ])
      const mixedBoard = mixed.status === 0 ? readFileSync(join(tmp, 'mixed.md'), 'utf8') : ''
      if (mixed.status !== 0) fail(`mixed remove import failed: ${mixed.stderr || mixed.stdout}`)
      else if (!mixedBoard.includes('Remove these screens only') || !mixedBoard.includes('- SCR-002') || /^change: remove$/m.test(mixedBoard) || !mixedBoard.includes('SCR-001')) {
        fail(`mixed feature must remove only SCR-002 and keep SCR-001: ${mixedBoard.slice(0, 800)}`)
      } else pass('mixed feature removes only the checklist task marked remove')
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
      '| 1 | 3 | shared | ui | Dialog, Button, Input | shared-engineer | — | todo | |',
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
    const sharedCard = b('card', board, '--row', '1', '--agent', 'shared-engineer')
    const sharedPath = sharedCard.status === 0 ? JSON.parse(sharedCard.stdout).card : ''
    const sharedText = sharedPath && existsSync(sharedPath) ? readFileSync(sharedPath, 'utf8') : ''
    if (!sharedText.includes('Dialog, Button, Input') || sharedText.includes('| 2 | 6 | pages')) fail('shared batch card must list every primitive on one row')
    else pass('shared batch row is one card listing every primitive')
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
    b('timing', board, '--station', 'Station 3', '--event', 'start')
    b('timing', board, '--station', 'Station 3', '--event', 'end')
    const summary = b('timing', board, '--summary')
    if (summary.status !== 0 || !/Station 3: \d+s/.test(summary.stdout)) fail(`timing --summary: ${summary.stdout}${summary.stderr}`)
    else pass('timing --summary prints a station duration')
    const badPlan = join(tmpBoard, 'bad-plan.md')
    writeFileSync(badPlan, [
      '| # | Station | Layer | Slice | Segments | Agent | Group | Status | Note |',
      '|---|---------|-------|-------|----------|-------|-------|--------|------|',
      '| 1 | 3 | shared | ui | Dialog | shared-engineer | — | todo | |',
      '| 2 | 3 | shared | api | query-keys | shared-engineer | — | todo | |',
      '| 3 | 3 | shared | ui | data-table | shared-engineer | — | todo | Hand-written headless shell. |',
      '| 4 | 5 | features | orders | model | slice-engineer | — | todo | |',
      '| 5 | 5 | features | orders | api | slice-engineer | — | todo | |',
      '| 6 | 5 | features | orders | ui | slice-engineer | — | todo | |',
      '| 7 | 7 | app | router | routes | app-engineer | — | todo | Confirm the route is mounted. |',
    ].join('\n'))
    const lint = b('section', board, '--put', 'Build Plan', '--from', badPlan, '--force')
    if (lint.status === 0 || !lint.stderr.includes('rule 4 — features/orders is split over rows 4, 5, 6') || !lint.stderr.includes('shared rows 1, 2 are')
      || !lint.stderr.includes('rule 10 — row 7')) fail(`Build Plan lint: ${lint.status} ${lint.stderr}`)
    else pass('Build Plan put refuses a split slice, split shared rows, and a confirm-only row')
    const red = b('handoff', board, '--name', 'red', '--outcome', 'built', '--gates', 'typecheck: fail')
    const blocked = b('handoff', board, '--name', 'red', '--outcome', 'blocked: useOrders missing in entities/order', '--gates', 'typecheck: fail')
    if (red.status === 0 || !red.stderr.includes('HANDOFF_RED') || blocked.status !== 0) fail(`handoff red guard: ${red.status} ${blocked.status} ${blocked.stderr}`)
    else pass('handoff refuses a failed self-check unless the outcome is blocked')
    const help = b('--help')
    if (help.status !== 0 || !help.stdout.includes('handoff')) fail(`board.mjs --help: ${help.status} ${help.stderr}`)
    else pass('board.mjs --help prints the command list')
  } finally {
    rmSync(tmpBoard, { recursive: true, force: true })
  }
}

// --- 5c. Theme port, token check, fix-scope snapshot ---
{
  const portScript = join(here, 'port-prototype-theme.mjs')
  const boardScript = join(here, 'board.mjs')
  const scratch = mkdtempSync(join(here, '.tmp-parity-'))
  try {
    const globals = join(scratch, 'globals.css')
    copyFileSync(join(here, 'fixtures/theme/globals.css'), globals)
    const port = () => node(portScript, ['--prototype', protoFixture, '--globals', globals])
    const before = node(portScript, ['--check', '--prototype', protoFixture, '--globals', globals])
    if (before.status !== 1 || !before.stdout.includes('DIFF --primary')) fail(`theme --check before port: ${before.status} ${before.stdout}`)
    else pass('port-prototype-theme --check reports token diffs')
    const first = port()
    if (first.status !== 0) fail(`port-prototype-theme: ${first.stderr}`)
    else {
      const css = readFileSync(globals, 'utf8')
      const second = port()
      if (!css.includes('--primary: oklch(0.55 0.15 165)')) fail('port did not copy --primary')
      else if (css.includes('oklch(0.18')) fail('port copied .dark')
      else if (!css.includes('--color-success:')) fail('port missed @theme color mapping')
      else if (second.status !== 0 || !/UNCHANGED/.test(second.stdout) || readFileSync(globals, 'utf8') !== css) fail('port second run was not a no-op')
      else pass('port-prototype-theme copies :root, skips .dark, second run unchanged')
      const after = node(portScript, ['--check', '--prototype', protoFixture, '--globals', globals])
      if (after.status !== 0) fail(`theme --check after port: ${after.stdout}${after.stderr}`)
      else pass('port-prototype-theme --check passes after the port')
      mkdirSync(join(scratch, 'src/shared/ui/theme'), { recursive: true })
      copyFileSync(globals, join(scratch, 'src/shared/ui/theme/globals.css'))
      writeFileSync(join(scratch, 'demo.md'), `---\nprototype-ref: ${protoFixture}\n---\n\n## Build Plan\n\n_tbd_\n`)
      writeFileSync(join(scratch, 'plan.md'), '| # | Layer | Slice | Segments | Note |\n|---|---|---|---|---|\n| 1 | shared | ui | Button, theme port | |\n')
      const synced = node(boardScript, ['section', 'demo.md', '--put', 'Build Plan', '--from', 'plan.md'], { cwd: scratch })
      if (synced.status === 0 || !synced.stderr.includes('rule 7')) fail(`Build Plan lint must refuse a theme row when the theme is in sync: ${synced.status} ${synced.stderr}`)
      else pass('Build Plan put refuses a theme row when port-prototype-theme --check passes')
      const formatted = readFileSync(globals, 'utf8').replace('--primary: oklch(0.55 0.15 165)', '--primary: oklch(0.550 0.150 165.0)')
      writeFileSync(globals, formatted)
      const reformatted = node(portScript, ['--check', '--prototype', protoFixture, '--globals', globals])
      const rePort = port()
      if (reformatted.status !== 0) fail(`theme --check failed on a formatter-only change: ${reformatted.stdout}`)
      else if (!/UNCHANGED/.test(rePort.stdout)) fail('port rewrote a token that differs only in number format')
      else pass('port-prototype-theme ignores formatter-only differences')
    }

    const dup = join(scratch, 'dup.css')
    writeFileSync(dup, '@import "tailwindcss";\n\n:root {\n  --radius: 0.625rem;\n  --chart-1: oklch(0.6 0.2 40);\n}\n\n.dark {\n  --primary: #000;\n}\n\n:root {\n  --radius: 6px;\n  --lift:\n    0 4px 12px #0001;\n}\n')
    const dupBefore = node(portScript, ['--check', '--prototype', protoFixture, '--globals', dup])
    const dupPort = node(portScript, ['--prototype', protoFixture, '--globals', dup])
    const merged = readFileSync(dup, 'utf8')
    const dupAfter = node(portScript, ['--check', '--prototype', protoFixture, '--globals', dup])
    if (dupBefore.status !== 1 || !dupBefore.stdout.includes('DUPLICATE :root')) fail(`theme --check missed duplicate :root: ${dupBefore.stdout}`)
    else if (dupPort.status !== 0) fail(`port on duplicate :root: ${dupPort.stderr}`)
    else if ((merged.match(/:root\s*\{/g) || []).length !== 1) fail(`port left ${merged}`)
    else if (!merged.includes('--chart-1: oklch(0.6 0.2 40)') || !merged.includes('--lift: 0 4px 12px #0001') || !merged.includes('--radius: 1rem') || !merged.includes('.dark')) fail(`port merge lost tokens: ${merged}`)
    else if (dupAfter.status !== 0) fail(`theme --check after merge: ${dupAfter.stdout}`)
    else pass('port-prototype-theme merges duplicate :root blocks; --check flags them first')

    const repo = join(scratch, 'repo')
    const tpl = join(scratch, 'tpl')
    mkdirSync(tpl)
    mkdirSync(join(repo, '.spec/features'), { recursive: true })
    const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
    const init = git(['init', '-q', '--template', tpl])
    if (init.status !== 0) fail(`git init for snapshot: ${init.stderr}`)
    else {
      git(['config', 'user.email', 't@t'])
      git(['config', 'user.name', 't'])
      const board = join(repo, '.spec/features/demo.md')
      writeFileSync(board, '# board\n')
      writeFileSync(join(repo, 'src.txt'), 'a\n')
      git(['add', '-A'])
      git(['commit', '-q', '-m', 'init'])
      const snap = node(boardScript, ['snapshot', board, '--round', '1'])
      writeFileSync(join(repo, 'src.txt'), 'b\n')
      writeFileSync(join(repo, 'extra.txt'), 'new\n')
      const changed = node(boardScript, ['changed', board, '--since', '1'])
      const names = changed.stdout.trim().split(',').filter(Boolean).sort()
      if (snap.status !== 0 || changed.status !== 0) fail(`snapshot: ${snap.stderr} ${changed.stderr}`)
      else if (names.join(',') !== 'extra.txt,src.txt') fail(`changed files: ${names.join(',')}`)
      else pass('board.mjs snapshot/changed lists only files touched after the snapshot')
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// --- 5d. Unreachable state, AC ownership, slice-size warning ---
{
  const scratch = mkdtempSync(join(here, '.tmp-reach-'))
  try {
    const boardFor = (name, ac, ui) => {
      const sections = ['Request', 'Clarifications', 'Acceptance Criteria', 'FSD Impact', 'API Contract / Data Model', 'UI Surface', 'Architecture Baseline', 'Reuse Map', 'Tech Investigation', 'Dependencies', 'Build Plan', 'Gate Log', 'Human Review', 'Decisions & Open Questions']
      const bodies = {
        Request: 'Show the document list to a signed-in resident.',
        'Acceptance Criteria': ac,
        'UI Surface': ui,
      }
      const path = join(scratch, `${name}.md`)
      writeFileSync(path, `---\nslug: ${name}\nstatus: draft\ncreated: 2026-01-01\n---\n# Feature: ${name}\n\n${sections.map((s) => `## ${s}\n\n${bodies[s] ?? ''}\n`).join('\n')}`)
      return path
    }
    const states = '- screen-ref: SCR-001\n- states: loading, empty, error, success, filtered-empty\n- components: DocumentTable'
    const bad = node(validateScript, [boardFor('reach', '1. The page shows a filtered-empty state when no rows match.\n2. Clear filters returns the full list of documents.', states)])
    if (bad.status !== 1 || !bad.stderr.includes('STATE_UNREACHABLE')) fail(`STATE_UNREACHABLE missing: ${bad.stderr || bad.stdout}`)
    else pass('validate-feature-spec rejects a filtered-empty state with no filter control')
    const ownedUi = '- screen-ref: SCR-001\n- states: loading, empty, error, success\n- components: DocumentTable\n\n### Filters owned by other slices (context — do not build)\n- filtered-empty and clear filters'
    const owned = node(validateScript, [boardFor('owned', '1. The page shows the empty state when there are no documents.\n2. The page shows an error when the list request fails.', ownedUi)])
    if (owned.status !== 0) fail(`owned-by-other filter state should pass: ${owned.stderr}`)
    else pass('a filter state owned by another slice is not this slice\'s problem')
    const ready = node(validateScript, [boardFor('ready', '1. The page shows a filtered-empty state when no rows match.\n2. Clear filters returns the full list of documents.', `${states}\n- components: filter`)])
    if (ready.status !== 0) fail(`filter control in scope should pass: ${ready.stderr}`)
    else pass('a filter control in scope clears STATE_UNREACHABLE')

    const spec = join(scratch, 'spec.md')
    writeFileSync(spec, `---
spec-version: "2.0"
type: app
status: approved
metadata:
  title: Demo
  slug: demo
context:
  goal: Show documents.
ui-surface:
  screens:
    - id: SCR-001
      title: Document list
      route: /documents
      states: [success]
      components: [DocumentTable]
user-stories:
  - id: US-001
    as: a resident
    i-want: see the document list
    so-that: I know what exists
  - id: US-002
    as: a resident
    i-want: sort the document list
    so-that: I find a row
acceptance-criteria:
  - id: AC-001
    story-ref: US-001
    given: the document list is empty
    when: the page loads
    then: the empty state is shown
  - id: AC-002
    story-ref: US-002
    given: the document list has rows
    when: the user sorts the table
    then: the document list reorders
delivery-plan:
  slices:
    - id: SL-001
      title: List states
      screen-refs: [SCR-001]
      story-refs: [US-001]
      ac-refs: [AC-001]
    - id: SL-002
      title: Table sort
      screen-refs: [SCR-001]
      story-refs: [US-002]
      ac-refs: [AC-002]
---
# spec
`)
    const out = join(scratch, 'list-states.md')
    const imported = node(importScript, ['--spec', spec, '--out', out, '--slug', 'list-states', '--slice-ref', 'SL-001', '--screen-ref', 'SCR-001', '--require-scoped'])
    const board = imported.status === 0 && existsSync(out) ? readFileSync(out, 'utf8') : ''
    if (imported.status !== 0) fail(`import ownership: ${imported.stderr || imported.stdout}`)
    else if (!board.includes('1. [AC-001]') || /2\. \[AC-002\]/.test(board)) fail(`AC-002 should not be a built criterion:\n${board.slice(0, 1500)}`)
    else if (!board.includes('AC-002 (SL-002)') || !board.includes('Acceptance criteria owned by other slices')) fail('AC-002 was not listed as owned by SL-002')
    else if (!board.includes('US-002 (SL-002)')) fail('US-002 was not listed as owned by SL-002')
    else pass('import keeps another slice\'s acceptance criterion and story as context')

    const checklist = join(scratch, 'task-checklist.md')
    writeFileSync(checklist, `---
checklist-version: "1.1"
updated: "2026-01-01T00:00:00Z"
features:
  - id: F-002
    title: Documents
    status: pending
    priority: must
    tasks:
      - id: T-1
        title: List states
        screen-ref: SCR-1
        ac-refs: [AC-1]
        status: pending
      - id: T-2
        title: Table settings
        screen-ref: SCR-1
        ac-refs: [AC-2]
        status: pending
---
`)
    const summary = node(join(repoRoot, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/read-checklist.mjs'), [checklist, '--summary'])
    if (summary.status !== 0 || !summary.stdout.includes('WARN slice-size: F-002 spans')) fail(`slice-size warning: ${summary.stdout}${summary.stderr}`)
    else pass('read-checklist --summary warns when a feature spans two behaviors')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// --- 6. Resume, checklist, and write guards ---
{
  const scratch = mkdtempSync(join(tmpdir(), 'flow-guards-'))
  const updateScript = join(repoRoot, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/update-checklist.mjs')
  const readScript = join(repoRoot, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/read-checklist.mjs')
  const boardScript = join(here, 'board.mjs')
  const spec = (id, parent, screens, slices) => `---
metadata:
  title: ${id}
  slug: demo
  ${parent ? `parent-spec: ${parent}` : ''}
ui-surface:
  screens:
${screens}
user-stories:
  - id: US-001
    priority: must
    i-want: sign in
  - id: US-002
    priority: must
    i-want: open documents
acceptance-criteria:
  - id: AC-001
    story-ref: US-001
    given: a
    when: b
    then: c
  - id: AC-002
    story-ref: US-002
    given: a
    when: b
    then: c
delivery-plan:
  slices:
${slices}
---
# ${id}
`
  try {
    const baseDir = join(scratch, 'spec', 'spec-base')
    const childDir = join(scratch, 'spec', 'spec-child')
    mkdirSync(baseDir, { recursive: true })
    mkdirSync(childDir, { recursive: true })
    const baseSpec = join(baseDir, 'spec.md')
    const childSpec = join(childDir, 'spec.md')
    writeFileSync(baseSpec, spec('base', '', `    - id: SCR-001\n      title: Sign in\n      story-refs: [US-001]\n`, `    - id: SL-001\n      title: Sign in\n      tracks: [frontend]\n      screen-refs: [SCR-001]\n      story-refs: [US-001]\n      depends-on: []\n`))
    writeFileSync(childSpec, spec('child', baseSpec, `    - id: SCR-010\n      title: Documents\n      story-refs: [US-002]\n`, `    - id: SL-002\n      title: Documents\n      tracks: [frontend]\n      screen-refs: [SCR-010]\n      story-refs: [US-002]\n      depends-on: [SL-001]\n`))
    const featuresDir = join(scratch, 'features')
    mkdirSync(featuresDir, { recursive: true })
    writeFileSync(join(featuresDir, 'sign-in.md'), `---
status: done
slug: sign-in
branch: feature/sign-in
parent-branch: main
feature-id: F-001
slice-ref: SL-001
---
# Feature: sign-in
`)
    writeFileSync(join(featuresDir, 'sign-in.kit-result.json'), JSON.stringify({ outcome: 'approved', slug: 'sign-in', branch: 'feature/sign-in', parent_branch: 'main' }))
    const dry = node(checklistScript, [childSpec, '--dry-run'], { cwd: scratch })
    const dryOut = `${dry.stdout}\n${dry.stderr}`
    if (dry.status !== 0) fail(`chain dry-run failed: ${dryOut}`)
    else if (!dryOut.includes('- F-001 [done] SL-001') || !dryOut.includes('depends-on F-001') || !dryOut.includes('adopted: 1')) fail(`chain dry-run shape:\n${dryOut}`)
    else pass('continue-only generate adopts done boards and resolves depends-on')

    const reopenSpec = join(scratch, 'reopen.md')
    writeFileSync(reopenSpec, spec('reopen', '', `    - id: SCR-001\n      title: Sign in\n      story-refs: [US-001]\n    - id: SCR-002\n      title: Sign in help\n      story-refs: [US-001]\n`, `    - id: SL-001\n      title: Sign in\n      tracks: [frontend]\n      screen-refs: [SCR-001, SCR-002]\n      story-refs: [US-001]\n`))
    const reopenList = join(scratch, 'task-checklist.md')
    writeFileSync(reopenList, `---
checklist-version: "1.2"
spec-ref: ${reopenSpec}
approved: "2026-01-01T00:00:00.000Z"
features:
  - id: F-001
    title: Sign in
    slice-ref: SL-001
    status: done
    slug: sign-in
    branch: feature/sign-in
    tasks:
      - id: T-001
        title: Sign in
        slice-ref: SL-001
        screen-ref: SCR-001
        status: done
---
# log
`)
    const reopened = node(checklistScript, [reopenSpec, '--dry-run'], { cwd: scratch })
    const reopenOut = `${reopened.stdout}\n${reopened.stderr}`
    if (!reopenOut.includes('- F-001 [pending] SL-001') || !reopenOut.includes('reopened: 1')) fail(`new screen did not reopen:\n${reopenOut}`)
    else pass('a new screen in a done feature reopens it')

    const aheadSpec = join(scratch, 'ahead.md')
    writeFileSync(aheadSpec, spec('ahead', '', `    - id: SCR-001\n      title: First\n      story-refs: [US-001]\n    - id: SCR-002\n      title: Second\n      story-refs: [US-002]\n`, `    - id: SL-009\n      title: Both\n      tracks: [frontend]\n      screen-refs: [SCR-001, SCR-002]\n      story-refs: [US-001, US-002]\n`))
    const aheadList = join(dirname(aheadSpec), 'task-checklist.md')
    writeFileSync(aheadList, `---
checklist-version: "1.2"
spec-ref: ${aheadSpec}
features:
  - id: F-001
    title: Both
    slice-ref: SL-009
    status: pending
    tasks:
      - id: T-001
        title: Second
        slice-ref: SL-009
        screen-ref: SCR-002
        status: pending
---
# log
`)
    node(checklistScript, [aheadSpec], { cwd: scratch })
    const aheadDoc = parseFrontmatter(aheadList).fm
    const ids = (aheadDoc?.features?.[0]?.tasks ?? []).map((task) => task.id)
    if (new Set(ids).size !== ids.length) fail(`duplicate task ids: ${ids.join(',')}`)
    else pass('a screen inserted ahead does not reuse an existing task id')

    mkdirSync(join(scratch, 'app', 'results'), { recursive: true })
    const staleList = join(scratch, 'app', 'task-checklist.md')
    writeFileSync(staleList, `---
checklist-version: "1.2"
spec-ref: ${childSpec}
features:
  - id: F-002
    title: Documents
    slice-ref: SL-006
    status: in-progress
    tasks: []
---
# log
`)
    writeFileSync(join(scratch, 'app', 'results', 'F-002.json'), JSON.stringify({ outcome: 'approved', slug: 'sign-in', branch: 'feature/sign-in' }))
    const stale = node(updateScript, [staleList, '--feature', 'F-002', '--result', join(scratch, 'app', 'results', 'F-002.json')], { cwd: scratch })
    const staleDoc = parseFrontmatter(staleList).fm
    if (stale.status !== 0 || staleDoc?.features?.[0]?.status === 'done' || !stale.stdout.includes('stale') && !readFileSync(staleList, 'utf8').includes('stale envelope ignored')) fail(`stale envelope applied: ${stale.stdout}${stale.stderr}`)
    else pass('a stale envelope is ignored')

    const planBoard = join(featuresDir, 'plan.md')
    writeFileSync(planBoard, `---
status: building
parent-branch: none
---
# plan

## Build Plan

| # | Status |
| --- | --- |
| 1 | done |

## FSD Impact

- \`features/sign-in\`
`)
    const planFile = join(scratch, 'plan-body.md')
    writeFileSync(planFile, '| # | Status |\n| --- | --- |\n| 1 | todo |\n')
    const refused = node(boardScript, ['section', planBoard, '--put', 'Build Plan', '--from', planFile])
    if (refused.status === 0) fail('Build Plan put over a done row was allowed')
    else pass('Build Plan put over a done row is refused')

    const fixed = spawnSync('bash', [join(here, 'run-gates.sh'), '--fix', 'src/a.ts'], { cwd: scratch, encoding: 'utf8' })
    if (fixed.status !== 0 || !fixed.stdout.includes('SKIP')) fail(`run-gates --fix should SKIP: ${fixed.stdout}${fixed.stderr}`)
    else pass('run-gates --fix skips when the host has no fixer')

    const auditDir = join(featuresDir, 'plan.context')
    mkdirSync(auditDir, { recursive: true })
    writeFileSync(join(auditDir, 'architecture-auditor-9.5.md'), 'AUDITED-AT: deadbeef\nSCOPE-PATHS: features/sign-in\n')
    writeFileSync(join(auditDir, 'gate-log.jsonl'), `${JSON.stringify({ gate: 'architecture-audit', result: 'fail' })}\n`)
    const full = node(boardScript, ['audit-scope', planBoard, '--prior', join(auditDir, 'architecture-auditor-9.5.md')])
    if (!full.stdout.includes('FULL')) fail(`audit-scope should be FULL when the prior audit failed: ${full.stdout}`)
    else pass('audit-scope refuses a prior audit that did not pass')
    writeFileSync(join(auditDir, 'gate-log.jsonl'), `${JSON.stringify({ gate: 'architecture-audit', result: 'pass' })}\n`)
    const notAncestor = node(boardScript, ['audit-scope', planBoard, '--prior', join(auditDir, 'architecture-auditor-9.5.md')])
    if (!notAncestor.stdout.includes('FULL')) fail(`audit-scope should be FULL when AUDITED-AT is not an ancestor: ${notAncestor.stdout}`)
    else pass('audit-scope refuses a prior audit whose commit is not in HEAD')

    const repo = join(scratch, 'repo')
    mkdirSync(repo, { recursive: true })
    const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
    git(['init'])
    git(['config', 'user.email', 't@t'])
    git(['config', 'user.name', 't'])
    writeFileSync(join(repo, 'README.md'), 'hi\n')
    git(['add', 'README.md'])
    git(['commit', '-m', 'init'])
    mkdirSync(join(repo, '.spec', 'features'), { recursive: true })
    writeFileSync(join(repo, '.spec', 'note.md'), 'orchestrator\n')
    const clean = spawnSync('bash', [join(here, 'new-feature.sh'), 'demo', '', join(repo, '.spec/features')], { cwd: repo, encoding: 'utf8' })
    if (clean.status !== 0 || !clean.stdout.includes('CREATED=true')) fail(`new feature with only .spec dirty should start: ${clean.stdout}${clean.stderr}`)
    else pass('a dirty .spec does not block a new feature')
    writeFileSync(join(repo, 'src.txt'), 'wip\n')
    const resume = spawnSync('bash', [join(here, 'new-feature.sh'), 'demo', '', join(repo, '.spec/features')], { cwd: repo, encoding: 'utf8' })
    if (resume.status !== 0 || !resume.stdout.includes('CREATED=false') || resume.stdout.includes('PARENT=feature/demo')) fail(`resume on a dirty feature branch: ${resume.stdout}${resume.stderr}`)
    else pass('resuming the feature branch keeps uncommitted work and does not parent itself')

    const sha = git(['rev-parse', 'HEAD']).stdout.trim()
    const scopeBoard = join(repo, 'scope.md')
    writeFileSync(scopeBoard, `---
status: building
parent-branch: main
---
# scope

## FSD Impact

- \`features/sign-in\`
`)
    const scopeReport = join(repo, 'audit.md')
    const scopeLog = join(repo, 'gate-log.jsonl')
    writeFileSync(scopeReport, `AUDITED-AT: ${sha}\nSCOPE-PATHS: features/sign-in\n`)
    writeFileSync(scopeLog, '')
    mkdirSync(dirname(scopeLog), { recursive: true })
    writeFileSync(scopeLog, `${JSON.stringify({ gate: 'architecture-audit', result: 'pass' })}\n`)
    const reuse = node(boardScript, ['audit-scope', scopeBoard, '--prior', scopeReport], { cwd: repo })
    if (!reuse.stdout.includes(`REUSE ${scopeReport}`)) fail(`audit-scope should reuse an unchanged parent audit: ${reuse.stdout}${reuse.stderr}`)
    else pass('audit-scope reuses a parent audit when nothing changed')
    writeFileSync(scopeBoard, `---
status: building
parent-branch: main
---
# scope

## FSD Impact

- \`features/sign-in\`
- \`widgets/nav\`
`)
    const outside = node(boardScript, ['audit-scope', scopeBoard, '--prior', scopeReport], { cwd: repo })
    if (!outside.stdout.includes('widgets/nav')) fail(`audit-scope should print a path outside the prior scope: ${outside.stdout}`)
    else pass('audit-scope prints a path outside the prior scope')
    writeFileSync(scopeBoard, `---
status: building
parent-branch: main
---
# scope

## FSD Impact

| Slice | Layer | Segments | Change |
|-------|-------|----------|--------|
| \`sign-in\` | features | \`models/\`, \`ui/\` | modified |
| \`src/widgets/nav\` | widgets | \`ui/\` | new |
`)
    const table = node(boardScript, ['audit-scope', scopeBoard, '--prior', scopeReport], { cwd: repo })
    if (!table.stdout.includes('widgets/nav') || table.stdout.includes('models/')) fail(`audit-scope should read layer/slice from the FSD Impact table, not segments: ${table.stdout}`)
    else pass('audit-scope reads layer/slice from the FSD Impact table')
    mkdirSync(join(repo, 'features', 'sign-in'), { recursive: true })
    writeFileSync(join(repo, 'features', 'sign-in', 'a.ts'), 'export const a = 1\n')
    git(['add', 'features/sign-in/a.ts'])
    git(['commit', '-m', 'slice'])
    const afterSha = git(['rev-parse', 'HEAD']).stdout.trim()
    writeFileSync(scopeReport, `AUDITED-AT: ${afterSha}\nSCOPE-PATHS: features/sign-in\n`)
    writeFileSync(scopeBoard, `---
status: building
parent-branch: main
---
# scope

## FSD Impact

- \`features/sign-in\`
`)
    writeFileSync(join(repo, 'features', 'sign-in', 'a.ts'), 'export const a = 2\n')
    const changed = node(boardScript, ['audit-scope', scopeBoard, '--prior', scopeReport], { cwd: repo })
    if (!changed.stdout.includes('features/sign-in/a.ts')) fail(`audit-scope should print a changed path: ${changed.stdout}${changed.stderr}`)
    else pass('audit-scope prints a path that changed since the prior audit')

    const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
    const shared = readFileSync(join(kitDir, 'agents/shared-engineer.md'), 'utf8')
    const planDoc = readFileSync(join(skillDir, 'templates/build-plan.md'), 'utf8')
    const sharedUi = readFileSync(join(kitDir, 'skills/create-shared-ui/SKILL.md'), 'utf8')
    if (!skill.includes('kit-result.json` is missing, finish Step 6')) fail('feature-dev must finish Step 6 when a done feature has no envelope')
    else pass('done with no envelope finishes Step 6')
    if (!shared.includes('shadcn add a b c') || !planDoc.includes('shadcn add a b c') || !sharedUi.includes('add a b c')) fail('shared primitives must be one batch add')
    else pass('shared primitives are one batch add')

    const skipSpec = join(scratch, 'skip-spec.md')
    writeFileSync(skipSpec, spec('skip', '', `    - id: SCR-001\n      title: Sign in\n      story-refs: [US-001]\n`, `    - id: SL-001\n      title: Sign in\n      tracks: [frontend]\n      screen-refs: [SCR-001]\n      story-refs: [US-001]\n`).replace('---\nmetadata:\n', '---\nstatus: approved\nmetadata:\n'))
    const skipBoard = join(featuresDir, 'approved.md')
    writeFileSync(skipBoard, `---
status: approved
slug: approved
---
# Feature: approved

## Acceptance Criteria

1. [AC-001] given a
2. [AC-002] given a

SCR-001 US-001
`)
    const skipped = node(importScript, ['--spec', skipSpec, '--out', skipBoard, '--slug', 'approved', '--slice-ref', 'SL-001', '--screen-ref', 'SCR-001'])
    if (skipped.status !== 0 || !skipped.stdout.includes('SKIP: board at status approved')) fail(`import should skip an approved board: ${skipped.stdout}${skipped.stderr}`)
    else pass('import skips an approved board')
    writeFileSync(skipSpec, spec('skip', '', `    - id: SCR-001\n      title: Sign in\n      story-refs: [US-001]\n`, `    - id: SL-001\n      title: Sign in\n      tracks: [frontend]\n      screen-refs: [SCR-001]\n      story-refs: [US-001]\n`).replace('---\nmetadata:\n', '---\nstatus: approved\nmetadata:\n').replace('  - id: AC-002\n', '  - id: AC-009\n    story-ref: US-001\n    given: a\n    when: b\n    then: c\n  - id: AC-002\n'))
    const warned = node(importScript, ['--spec', skipSpec, '--out', skipBoard, '--slug', 'approved', '--slice-ref', 'SL-001', '--screen-ref', 'SCR-001'])
    if (!warned.stderr.includes('WARN upstream-changed: AC-009') && !warned.stdout.includes('WARN upstream-changed: AC-009')) fail(`import should warn when the spec adds an id: ${warned.stdout}${warned.stderr}`)
    else pass('import warns when an approved board is missing an upstream id')

    const original = readFileSync(planBoard, 'utf8')
    for (let i = 0; i < 30; i++) writeFileSync(planFile, `| # | Status |\n| --- | --- |\n| 1 | round-${i} |\n`)
    const puts = Array.from({ length: 30 }, (_, i) => node(boardScript, ['section', planBoard, '--put', 'Build Plan', '--from', planFile, '--force']))
    const after = readFileSync(planBoard, 'utf8')
    if (puts.some((result) => result.status !== 0) || !after.includes('## FSD Impact') || !after.startsWith('---')) fail('a board write dropped a section')
    else if (original && !after.includes('round-29')) fail('the last board write did not land')
    else pass('30 board writes left a complete file')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// --- 7. Packet fixtures ---
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
