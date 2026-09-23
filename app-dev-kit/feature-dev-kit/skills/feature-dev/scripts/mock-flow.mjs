#!/usr/bin/env node
// Deterministic contract mock-flow for feature-dev-kit (no LLM, no src/ build).
// Usage: node mock-flow.mjs
// Exit 0 = all checks passed. Exit 1 = a check failed.

import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
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
const specFixture = join(repoRoot, '.spec/app/spec-20260917-124658_building-cupboard/spec.md')
const protoFixture = join(repoRoot, '.spec/prototype/20260918-063204_building-cupboard')
const checklistScript = join(repoRoot, 'app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/build-checklist.mjs')
const importScript = join(here, 'import-upstream.mjs')
const validateScript = join(here, 'validate-feature-spec.mjs')

const EXTERNAL_SKILLS = new Set(['testing', 'code-review', 'architecture-audit'])
const HUMAN_ONLY = new Set(['create-pr'])
const PACKET_TYPES = ['CLARIFY_PACKET', 'DEP_PACKET', 'REVIEW_PACKET', 'ESCALATION_PACKET']
const STATION_NEEDLES = [
  'Station 0', 'upstream-interpreter', 'spec-analyst', 'Station 0.5',
  'Station 1', 'code-explorer', 'Station 1.5', 'architecture-auditor',
  'Station 1a', 'research-analyst', 'Station 1b', 'DEP_PACKET',
  'Station 2', 'Station 3', 'shared-engineer', 'Station 4', 'entities-engineer',
  'Station 5', 'features-engineer', 'Station 6', 'composition-engineer',
  'Station 7', 'app-engineer', 'Station 8', 'test-engineer',
  'Station 9', 'quality-gate-runner', 'Station 9.5', 'Station 10', 'code-reviewer',
  'Station 11', 'Station 12', 'slice-engineer', 'REVIEW_PACKET',
]

let failed = 0
function pass(msg) { console.log(`OK    ${msg}`) }
function fail(msg) { console.error(`FAIL  ${msg}`); failed++ }

function parseFrontmatter(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { raw, fm: null }
  return { raw, fm: parseYaml(match[1]) }
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
if (agentFiles.length < 15) fail(`expected ≥15 agents, found ${agentFiles.length}`)
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
      const tasks = cl?.tasks ?? []
      if (tasks.length < 1) fail('build-checklist produced zero tasks')
      else pass(`build-checklist produced ${tasks.length} tasks`)
      const missingRefs = tasks.filter((t) => t['screen-ref'] && !(t['ac-refs']?.length >= 0))
      if (missingRefs.length) fail('a screen task is missing ac-refs')
      const signIn = tasks.find((t) => t['screen-ref'] === 'SCR-001' || /sign in/i.test(t.title ?? ''))
      if (!signIn) {
        fail('no Sign in / SCR-001 task derived')
      } else {
        if (!signIn['slug-hint']) fail('sign-in task missing slug-hint')
        else pass(`slug-hint ${signIn['slug-hint']}`)
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
  } finally {
    rmSync(tmp, { recursive: true, force: true })
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
