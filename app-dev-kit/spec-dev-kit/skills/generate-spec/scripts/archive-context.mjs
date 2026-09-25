#!/usr/bin/env node
// After human approval: move .spec/context/*.md to .spec/processed/{spec-id}/,
// point .spec/app/current.json at this spec, and write increments/INC-00N.json.
// Does not delete the previous spec or prototype. Aborted runs must not call this.
//
// Usage: node archive-context.mjs --run <run-dir> [--root <dir>]

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { flag, idsOf, loadYaml, nextIds, readSpec, rel } from './lib-spec.mjs'

const args = process.argv.slice(2)
const runArg = String(flag(args, 'run') || '')
const root = flag(args, 'root') && flag(args, 'root') !== true ? String(flag(args, 'root')) : process.cwd()
if (!runArg) {
  console.error('usage: archive-context.mjs --run <run-dir> [--root <dir>]')
  process.exit(2)
}

const runDir = runArg.startsWith('/') ? runArg : join(root, runArg)
const specAbs = join(runDir, 'spec.md')
if (!existsSync(specAbs)) {
  console.error(`FATAL: missing ${specAbs}`)
  process.exit(1)
}

const { parse } = await loadYaml()
const { fm } = readSpec(specAbs, parse)
const specId = basename(runDir)
const appDir = join(root, '.spec/app')
const currentPath = join(appDir, 'current.json')
const prev = existsSync(currentPath) ? JSON.parse(readFileSync(currentPath, 'utf8')) : {}

const processedDir = join(root, '.spec/processed', specId)
mkdirSync(processedDir, { recursive: true })
const inbox = join(root, '.spec/context')
if (existsSync(inbox)) {
  for (const name of readdirSync(inbox)) {
    if (!name.endsWith('.md')) continue
    renameSync(join(inbox, name), join(processedDir, name))
  }
}

const basePath = join(runDir, 'base.spec.md')
const baseFm = existsSync(basePath) ? readSpec(basePath, parse).fm : null
const storyIds = idsOf(fm, 'stories')
const screenIds = idsOf(fm, 'screens')
const prevStories = new Set(baseFm ? idsOf(baseFm, 'stories') : [])
const prevScreens = new Set(baseFm ? idsOf(baseFm, 'screens') : [])

const incDir = join(appDir, 'increments')
mkdirSync(incDir, { recursive: true })
let maxInc = 0
if (existsSync(incDir)) {
  for (const name of readdirSync(incDir)) {
    const match = name.match(/^INC-(\d+)\.json$/)
    if (match) maxInc = Math.max(maxInc, Number(match[1]))
  }
}
const incId = `INC-${String(maxInc + 1).padStart(3, '0')}`
const specPath = rel(root, specAbs)
const increment = {
  id: incId,
  phase: 'spec',
  slug: fm.metadata?.slug ?? prev.slug ?? '',
  spec_id: specId,
  spec_path: specPath,
  parent_spec_path: prev.spec_path ?? '',
  prototype_id: '',
  prototype_ref: '',
  parent_prototype_ref: prev.prototype_ref ?? '',
  processed: rel(root, processedDir),
  added: {
    stories: storyIds.filter((id) => !prevStories.has(id)),
    screens: screenIds.filter((id) => !prevScreens.has(id)),
  },
  written: new Date().toISOString(),
}
writeFileSync(join(incDir, `${incId}.json`), `${JSON.stringify(increment, null, 2)}\n`)

function hoist(name) {
  const dest = join(appDir, name)
  if (existsSync(dest) || !prev.spec_path) return
  const src = join(root, dirname(prev.spec_path), name)
  if (existsSync(src)) copyFileSync(src, dest)
}
hoist('task-checklist.md')
hoist('work-plan.md')

const current = {
  slug: increment.slug,
  spec_path: specPath,
  spec_id: specId,
  prototype_ref: prev.prototype_ref ?? '',
  prototype_id: prev.prototype_id ?? '',
  next_ids: nextIds(fm),
  increment_id: incId,
}
writeFileSync(currentPath, `${JSON.stringify(current, null, 2)}\n`)
console.log(`OK: archived context to ${increment.processed}`)
console.log(`OK: current.json → ${specPath} (${incId})`)
