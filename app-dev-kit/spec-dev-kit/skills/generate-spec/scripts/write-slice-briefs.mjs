#!/usr/bin/env node
// Write one build brief per delivery slice: {spec dir}/slices/SL-NNN.yaml.
// A brief is the slice plus every spec item it references (stories, ACs, entities, state machines,
// rules, permissions, endpoints, screens, notifications, agent items, open items that affect it).
// Build kits read the brief for their slice instead of re-deriving scope from the whole spec.
// Stale briefs (slices no longer in the spec) are removed.
// Usage: node write-slice-briefs.mjs <spec.md> [--root <dir>]

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { attachRequirements, flag, loadSpecChain, loadYaml, readSpec, rel, sliceBrief } from './lib-spec.mjs'

const args = process.argv.slice(2)
const root = flag(args, 'root') && flag(args, 'root') !== true ? String(flag(args, 'root')) : process.cwd()
const specArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--root')
if (!specArg) {
  console.error('usage: node write-slice-briefs.mjs <spec.md> [--root <dir>]')
  process.exit(2)
}
const specAbs = isAbsolute(specArg) ? specArg : join(root, specArg)
const { parse, stringify } = await loadYaml()
const { fm } = readSpec(specAbs, parse)
attachRequirements(specAbs, fm, parse)
const chain = loadSpecChain(specAbs, parse, root)
const parents = chain.slice(1)
const slices = fm['delivery-plan']?.slices ?? []
const outDir = join(dirname(specAbs), 'slices')

if (!slices.length) {
  console.log('OK: no delivery-plan.slices — no briefs written (1.x spec)')
  process.exit(0)
}
mkdirSync(outDir, { recursive: true })
const keep = new Set(slices.map((s) => `${s.id}.yaml`))
for (const name of existsSync(outDir) ? readdirSync(outDir) : []) {
  if (/^SL-\d+\.yaml$/.test(name) && !keep.has(name)) rmSync(join(outDir, name))
}
const specRel = rel(root, specAbs)
for (const slice of slices) {
  const brief = sliceBrief(fm, slice, specRel, { parents, requirements: fm.requirements })
  writeFileSync(join(outDir, `${slice.id}.yaml`), stringify(brief, { lineWidth: 0, aliasDuplicateObjects: false }))
}
console.log(`OK: wrote ${slices.length} brief(s) to ${rel(root, outDir)}/`)
