#!/usr/bin/env node
// Station 4 requirements register, deterministic part. Every intake raw_requirements entry becomes
// one REQ (source: stated, source_ref file#Lline, intake_refs) so source fidelity holds by
// construction; spec-enricher writes only judgement — requirement_edits plus the other sections.
//
// Seed:  node build-enriched.mjs --intake <intake.json> --seed <requirements.seed.json> [--prior-index <p>]
//        → prints {"count":N,"next":"REQ-0NN"}; the enricher numbers its additions from `next`.
// Merge: node build-enriched.mjs --intake <intake.json> --patch <p1.json[,p2.json]> --out <enriched.json> [--prior-index <p>]
//
// Patch = enriched.json without `requirements`, plus:
//   "requirement_edits": {
//     "modify": [{ "id": "REQ-004", "text"?, "type"?, "priority"?, "scope"? }],
//     "add":    [{ "id": "REQ-031", "text", "type", "source": "answered", "source_ref": "qa-log Round 1 Q2", "priority", "scope" },
//                { "id": "REQ-032", "split_from": "REQ-004", "text" }] }
// Later patches win: arrays merge by id (term / name / gap_id), scalars overwrite.
// Exit 0 ok, 1 invalid patch, 2 usage error.

import { readFileSync, writeFileSync } from 'node:fs'
import { flag } from './lib-spec.mjs'

const args = process.argv.slice(2)
const value = (name) => {
  const v = flag(args, name)
  return v && v !== true ? String(v) : ''
}
const intakePath = value('intake')
const seedPath = value('seed')
const patchPaths = value('patch').split(',').filter(Boolean)
const outPath = value('out')
if (!intakePath || (!seedPath && !(patchPaths.length && outPath))) {
  console.error('usage: build-enriched.mjs --intake <intake.json> (--seed <out.json> | --patch <p.json[,p2.json]> --out <enriched.json>) [--prior-index <p>]')
  process.exit(2)
}
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const priorPath = value('prior-index')
const start = priorPath ? Number(readJson(priorPath).next?.REQ ?? 1) : 1
const reqId = (n) => `REQ-${String(n).padStart(3, '0')}`

const KIND_TYPE = { metric: 'nfr', behavior: 'behavior', rule: 'rule', constraint: 'constraint', nfr: 'nfr', data: 'data', copy: 'copy' }
const OPTIONAL = /\b(nice[- ]to[- ]have|optional|later|eventually|if time|phase 2|v2|could)\b/i
const seed = (readJson(intakePath).raw_requirements ?? []).map((r, i) => ({
  id: reqId(start + i),
  type: KIND_TYPE[r.kind_hint] ?? 'behavior',
  text: r.text,
  source: 'stated',
  source_file: r.source_file,
  source_line: r.source_line,
  source_ref: `${r.source_file}#L${r.source_line}`,
  priority: r.scope_hint === 'non-goal' ? 'wont' : OPTIONAL.test(r.text) ? 'could' : /\bshould\b/i.test(r.text) ? 'should' : 'must',
  scope: r.scope_hint === 'non-goal' ? 'non-goal' : 'in',
  intake_refs: [r.id],
}))
const next = reqId(start + seed.length)

if (seedPath) {
  writeFileSync(seedPath, `${JSON.stringify({ next, requirements: seed }, null, 2)}\n`)
  console.log(JSON.stringify({ count: seed.length, next }))
  process.exit(0)
}

const keyOf = (item) => item?.id ?? item?.gap_id ?? item?.term ?? item?.name
function mergeInto(target, patch) {
  for (const [key, val] of Object.entries(patch)) {
    if (key === 'requirement_edits') continue
    if (Array.isArray(val) && Array.isArray(target[key])) {
      for (const item of val) {
        const i = keyOf(item) === undefined ? -1 : target[key].findIndex((t) => keyOf(t) === keyOf(item))
        if (i >= 0) target[key][i] = item
        else target[key].push(item)
      }
    } else target[key] = val
  }
}

const enriched = {}
const edits = { modify: [], add: [] }
for (const p of patchPaths) {
  const patch = readJson(p)
  mergeInto(enriched, patch)
  edits.modify.push(...(patch.requirement_edits?.modify ?? []))
  edits.add.push(...(patch.requirement_edits?.add ?? []))
}

const errors = []
const byId = new Map(seed.map((r) => [r.id, r]))
for (const a of edits.add) {
  if (!a.id || !a.text) errors.push(`add entry needs id and text: ${JSON.stringify(a)}`)
  else if (byId.has(a.id) && !byId.get(a.id).added) errors.push(`${a.id} already exists — number additions from ${next}`)
  else {
    const parent = a.split_from ? byId.get(a.split_from) : null
    if (a.split_from && !parent) errors.push(`${a.id}: split_from ${a.split_from} does not exist`)
    const { split_from: _, ...rest } = a
    const req = parent
      ? { ...parent, ...rest, source: parent.source, intake_refs: parent.intake_refs }
      : { type: 'behavior', priority: 'must', scope: 'in', source: 'answered', ...rest }
    if (!['stated', 'answered'].includes(req.source)) errors.push(`${a.id}: source must be stated or answered — an inference is an assumption`)
    byId.set(a.id, { ...req, added: true })
  }
}
for (const m of edits.modify) {
  const req = byId.get(m.id)
  if (!req) errors.push(`modify: ${m.id} does not exist`)
  else Object.assign(req, m, { id: req.id, source: req.source, intake_refs: req.intake_refs })
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

enriched.requirements = [...byId.values()].map(({ added: _, ...r }) => r)
writeFileSync(outPath, `${JSON.stringify(enriched, null, 2)}\n`)
console.log(JSON.stringify({ out: outPath, requirements: enriched.requirements.length, modified: edits.modify.length, added: edits.add.length }))
