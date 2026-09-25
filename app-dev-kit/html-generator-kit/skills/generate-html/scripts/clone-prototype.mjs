#!/usr/bin/env node
// Copy a prototype directory to a new proto-id. Does not delete the source.
// Usage: node clone-prototype.mjs --from <dir> --to <dir> [--root <dir>]

import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}

const root = flag('root') && flag('root') !== true ? String(flag('root')) : process.cwd()
const fromArg = String(flag('from') || '')
const toArg = String(flag('to') || '')
if (!fromArg || !toArg) {
  console.error('usage: clone-prototype.mjs --from <dir> --to <dir> [--root <dir>]')
  process.exit(2)
}

const from = fromArg.startsWith('/') ? fromArg : join(root, fromArg)
const to = toArg.startsWith('/') ? toArg : join(root, toArg)
if (!existsSync(from)) {
  console.error(`FATAL: prototype missing: ${fromArg}`)
  process.exit(1)
}
if (existsSync(to)) {
  console.error(`FATAL: destination exists: ${toArg}`)
  process.exit(1)
}
cpSync(from, to, { recursive: true })
console.log(`OK: cloned ${fromArg} → ${toArg}`)
