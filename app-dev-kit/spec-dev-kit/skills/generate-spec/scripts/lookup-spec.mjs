#!/usr/bin/env node
// Print full spec items for the given ids or entity names, or the expanded build brief of a slice.
// Usage:
//   node lookup-spec.mjs --spec <spec.md> --ids Profile,US-003 [--out <file>]
//   node lookup-spec.mjs --spec <spec.md> --slice SL-002 [--out <file>]

import { writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { attachRequirements, endpointsOf, flag, loadSpecChain, loadYaml, readSpec, sliceBrief } from './lib-spec.mjs'

const args = process.argv.slice(2)
const specArg = String(flag(args, 'spec') || '')
const idsArg = flag(args, 'ids')
const sliceArg = flag(args, 'slice')
const outArg = flag(args, 'out')
const hasIds = idsArg && idsArg !== true
const hasSlice = sliceArg && sliceArg !== true
if (!specArg || (!hasIds && !hasSlice)) {
  console.error('usage: lookup-spec.mjs --spec <spec.md> (--ids Profile,US-003 | --slice SL-001) [--out <file>]')
  process.exit(2)
}

const specPath = isAbsolute(specArg) ? specArg : join(process.cwd(), specArg)
const { parse, stringify } = await loadYaml()
const { fm } = readSpec(specPath, parse)
attachRequirements(specPath, fm, parse)
const chain = loadSpecChain(specPath, parse, process.cwd())
const parents = chain.slice(1)

function emit(value) {
  const text = stringify(value, { lineWidth: 0, aliasDuplicateObjects: false })
  const body = text.endsWith('\n') ? text : `${text}\n`
  if (outArg && outArg !== true) {
    const outPath = isAbsolute(String(outArg)) ? String(outArg) : join(process.cwd(), String(outArg))
    writeFileSync(outPath, body)
  } else {
    process.stdout.write(body)
  }
}

if (hasSlice) {
  const slice = (fm['delivery-plan']?.slices ?? []).find((s) => s?.id === String(sliceArg))
  if (!slice) {
    console.error(`FATAL: no slice ${sliceArg} in delivery-plan.slices`)
    process.exit(1)
  }
  emit(sliceBrief(fm, slice, specArg, { parents, requirements: fm.requirements }))
  console.error(`OK: brief for ${slice.id}`)
  process.exit(0)
}

const wanted = new Set(String(idsArg).split(',').map((id) => id.trim()).filter(Boolean))
const take = (list) => (Array.isArray(list) ? list : []).filter((item) => wanted.has(item?.id) || wanted.has(item?.name))
const takeAll = (pick) => {
  const out = []
  const seen = new Set()
  for (const doc of [fm, ...parents.map((p) => p.fm)]) {
    for (const item of take(pick(doc))) {
      const key = item?.id ?? item?.name
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      out.push(item)
    }
  }
  return out
}

const found = {
  requirements: takeAll((doc) => doc.requirements),
  roles: takeAll((doc) => doc.roles),
  permissions: takeAll((doc) => doc.permissions),
  entities: takeAll((doc) => doc.entities),
  'state-machines': takeAll((doc) => doc['state-machines']),
  'business-rules': takeAll((doc) => doc['business-rules']),
  'user-stories': takeAll((doc) => doc['user-stories']),
  'acceptance-criteria': takeAll((doc) => doc['acceptance-criteria']),
  screens: takeAll((doc) => doc['ui-surface']?.screens),
  interactions: takeAll((doc) => doc['ui-surface']?.interactions),
  endpoints: takeAll((doc) => endpointsOf(doc)),
  agents: takeAll((doc) => doc['agent-surface']?.agents),
  tools: takeAll((doc) => doc['agent-surface']?.tools),
  'knowledge-bases': takeAll((doc) => doc['agent-surface']?.['knowledge-bases']),
  notifications: takeAll((doc) => doc.notifications),
  slices: takeAll((doc) => doc['delivery-plan']?.slices),
}
for (const key of Object.keys(found)) {
  if (!found[key].length) delete found[key]
}
emit(found)

const hit = new Set()
for (const list of Object.values(found)) {
  for (const item of list) {
    if (item?.id) hit.add(item.id)
    if (item?.name) hit.add(item.name)
  }
}
for (const id of wanted) {
  if (!hit.has(id)) console.error(`WARN: no item for ${id}`)
}
console.error(`OK: ${hit.size} item(s)`)
