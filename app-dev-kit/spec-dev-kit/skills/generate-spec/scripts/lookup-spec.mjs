#!/usr/bin/env node
// Print full spec items for the given ids or entity names. Omits every other item.
// Usage: node lookup-spec.mjs --spec <spec.md> --ids Profile,US-003 [--out <file>]

import { writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { flag, loadYaml, readSpec } from './lib-spec.mjs'

const args = process.argv.slice(2)
const specArg = String(flag(args, 'spec') || '')
const idsArg = flag(args, 'ids')
const outArg = flag(args, 'out')
if (!specArg || !idsArg || idsArg === true) {
  console.error('usage: lookup-spec.mjs --spec <spec.md> --ids Profile,US-003 [--out <file>]')
  process.exit(2)
}

const specPath = isAbsolute(specArg) ? specArg : join(process.cwd(), specArg)
const { parse, stringify } = await loadYaml()
const { fm } = readSpec(specPath, parse)
const wanted = new Set(String(idsArg).split(',').map((id) => id.trim()).filter(Boolean))

function take(list) {
  return (list ?? []).filter((item) => wanted.has(item?.id) || wanted.has(item?.name))
}

const found = {
  entities: take(fm.entities),
  'user-stories': take(fm['user-stories']),
  'acceptance-criteria': take(fm['acceptance-criteria']),
  screens: take(fm['ui-surface']?.screens),
  interactions: take(fm['ui-surface']?.interactions),
  endpoints: take(fm['api-surface']?.endpoints),
  mutations: take(fm['api-surface']?.mutations),
  agents: take(fm['agent-surface']?.agents),
  tools: take(fm['agent-surface']?.tools),
}
for (const key of Object.keys(found)) {
  if (!found[key].length) delete found[key]
}

const text = stringify(found, { lineWidth: 0 })
const body = text.endsWith('\n') ? text : `${text}\n`
if (outArg && outArg !== true) {
  const outPath = isAbsolute(String(outArg)) ? String(outArg) : join(process.cwd(), String(outArg))
  writeFileSync(outPath, body)
} else {
  process.stdout.write(body)
}

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
