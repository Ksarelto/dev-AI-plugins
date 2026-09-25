#!/usr/bin/env node
// Scaffold .spec/spec/{spec-id}/ for a new feature.
// No current.json → first feature, ids start at 001.
// current.json present → copy the last spec to base.spec.md and write a compact prior-index.
// Does not read .spec/context/. Does not put the previous spec body on stdout.
//
// Usage: node continue-spec.mjs --slug <kebab> [--root <dir>] [--timecode YYYYMMDD-HHmmss]
// Prints MODE, SPEC_ID, RUN_DIR, PRIOR_INDEX, APP_SLUG, TIMECODE.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { flag, loadYaml, nextIds, readSpec, rel, screenIndex } from './lib-spec.mjs'

const args = process.argv.slice(2)
const slugArg = String(flag(args, 'slug') || '')
const root = flag(args, 'root') && flag(args, 'root') !== true ? String(flag(args, 'root')) : process.cwd()
const timecodeArg = String(flag(args, 'timecode') || '')

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugArg) && !existsSync(join(root, '.spec/app/current.json'))) {
  console.error('usage: continue-spec.mjs --slug <kebab> [--root <dir>] [--timecode YYYYMMDD-HHmmss]')
  process.exit(2)
}

const { parse } = await loadYaml()
const currentPath = join(root, '.spec/app/current.json')
const current = existsSync(currentPath) ? JSON.parse(readFileSync(currentPath, 'utf8')) : null
const appSlug = current?.slug || slugArg
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(appSlug)) {
  console.error(`error: app slug must be kebab-case (got '${appSlug}')`)
  process.exit(2)
}

const timecode = timecodeArg || new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-').slice(0, 15)
if (!/^\d{8}-\d{6}$/.test(timecode)) {
  console.error(`error: timecode must be YYYYMMDD-HHmmss (got '${timecode}')`)
  process.exit(2)
}

const specId = `spec-${timecode}_${appSlug}`
const runDir = join(root, '.spec/spec', specId)
if (existsSync(runDir)) {
  console.error(`error: run dir already exists: ${rel(root, runDir)}`)
  process.exit(1)
}
mkdirSync(join(runDir, 'artifacts'), { recursive: true })

const prior = {
  mode: 'first',
  app_slug: appSlug,
  base_spec: '',
  next: { US: 1, SCR: 1, AC: 1, INT: 1, API: 1, AGT: 1, TOOL: 1 },
  screens: [],
  stories: [],
  entities: [],
}

if (current?.spec_path) {
  const baseAbs = join(root, current.spec_path)
  if (!existsSync(baseAbs)) {
    console.error(`FATAL: current spec missing: ${current.spec_path}`)
    process.exit(1)
  }
  copyFileSync(baseAbs, join(runDir, 'base.spec.md'))
  const { fm } = readSpec(baseAbs, parse)
  prior.mode = 'continue'
  prior.base_spec = 'base.spec.md'
  prior.next = nextIds(fm)
  prior.screens = screenIndex(fm)
  prior.stories = (fm['user-stories'] ?? []).map((story) => ({ id: story.id, 'i-want': story['i-want'] ?? '' }))
  prior.entities = (fm.entities ?? []).map((entity) => entity.name).filter(Boolean)
}

const priorPath = join(runDir, 'artifacts/prior-index.json')
writeFileSync(priorPath, `${JSON.stringify(prior, null, 2)}\n`)

console.log(`MODE=${prior.mode}`)
console.log(`SPEC_ID=${specId}`)
console.log(`RUN_DIR=${rel(root, runDir)}`)
console.log(`PRIOR_INDEX=${rel(root, priorPath)}`)
console.log(`APP_SLUG=${appSlug}`)
console.log(`TIMECODE=${timecode}`)
