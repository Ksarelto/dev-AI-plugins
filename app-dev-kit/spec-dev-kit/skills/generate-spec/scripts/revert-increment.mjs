#!/usr/bin/env node
// Point current.json at the parent spec and prototype recorded on an increment.
// Leaves the newer spec and prototype folders on disk.
//
// Usage: node revert-increment.mjs [--id INC-002] [--root <dir>]

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { flag, loadYaml, nextIds, readSpec } from './lib-spec.mjs'

const args = process.argv.slice(2)
const root = flag(args, 'root') && flag(args, 'root') !== true ? String(flag(args, 'root')) : process.cwd()
const want = String(flag(args, 'id') || '')
const incDir = join(root, '.spec/app/increments')
if (!existsSync(incDir)) {
  console.error('FATAL: no increments')
  process.exit(1)
}

const files = readdirSync(incDir).filter((name) => /^INC-\d+\.json$/.test(name))
const increments = files.map((name) => JSON.parse(readFileSync(join(incDir, name), 'utf8')))
increments.sort((a, b) => a.id.localeCompare(b.id))
const target = want ? increments.find((item) => item.id === want) : increments.at(-1)
if (!target) {
  console.error(`FATAL: increment not found${want ? `: ${want}` : ''}`)
  process.exit(1)
}

const currentPath = join(root, '.spec/app/current.json')
const current = existsSync(currentPath) ? JSON.parse(readFileSync(currentPath, 'utf8')) : {}
const parentInc = increments.find((item) => item.spec_path && item.spec_path === target.parent_spec_path)
const parentSpec = target.parent_spec_path ?? ''
const parentProto = target.parent_prototype_ref ?? ''

let next = current.next_ids ?? {}
let slug = current.slug ?? target.slug ?? ''
if (parentSpec && existsSync(join(root, parentSpec))) {
  const { parse } = await loadYaml()
  const { fm } = readSpec(join(root, parentSpec), parse)
  next = nextIds(fm)
  slug = fm.metadata?.slug ?? slug
}

const updated = {
  slug,
  spec_path: parentSpec,
  spec_id: parentSpec ? basename(dirname(parentSpec)) : '',
  prototype_ref: parentProto,
  prototype_id: parentProto ? basename(parentProto.replace(/\/$/, '')) : '',
  next_ids: next,
  increment_id: parentInc?.id ?? '',
}
writeFileSync(currentPath, `${JSON.stringify(updated, null, 2)}\n`)
console.log(`OK: reverted ${target.id} → spec ${updated.spec_path || '(none)'} prototype ${updated.prototype_ref || '(none)'}`)
