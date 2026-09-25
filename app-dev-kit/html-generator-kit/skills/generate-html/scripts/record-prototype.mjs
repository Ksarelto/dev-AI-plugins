#!/usr/bin/env node
// Record the approved prototype on .spec/app/current.json and the open increment.
// Usage: node record-prototype.mjs --prototype-ref <dir> [--root <dir>]

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}

const root = flag('root') && flag('root') !== true ? String(flag('root')) : process.cwd()
const protoArg = String(flag('prototype-ref') || '')
if (!protoArg) {
  console.error('usage: record-prototype.mjs --prototype-ref <dir> [--root <dir>]')
  process.exit(2)
}

const currentPath = join(root, '.spec/app/current.json')
if (!existsSync(currentPath)) {
  console.error('FATAL: missing .spec/app/current.json — publish a spec first')
  process.exit(1)
}
const current = JSON.parse(readFileSync(currentPath, 'utf8'))
const prototypeRef = protoArg.replace(/\\/g, '/').replace(/\/$/, '')
const prototypeId = basename(prototypeRef)
current.prototype_ref = prototypeRef
current.prototype_id = prototypeId
writeFileSync(currentPath, `${JSON.stringify(current, null, 2)}\n`)

if (current.increment_id) {
  const incPath = join(root, '.spec/app/increments', `${current.increment_id}.json`)
  if (existsSync(incPath)) {
    const inc = JSON.parse(readFileSync(incPath, 'utf8'))
    inc.phase = 'prototype'
    inc.prototype_ref = prototypeRef
    inc.prototype_id = prototypeId
    writeFileSync(incPath, `${JSON.stringify(inc, null, 2)}\n`)
  }
}
console.log(`OK: prototype_ref → ${prototypeRef}`)
