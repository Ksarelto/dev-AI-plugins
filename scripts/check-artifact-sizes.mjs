#!/usr/bin/env node
// Report artifact size against the pipeline budgets. Exit 1 when a budget is exceeded.
// Usage: node scripts/check-artifact-sizes.mjs <dir>

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (!root) {
  console.error('usage: node scripts/check-artifact-sizes.mjs <dir>')
  process.exit(2)
}

const budgets = []
function walk(dir) {
  let names = []
  try { names = readdirSync(dir) } catch { return }
  for (const name of names) {
    const path = join(dir, name)
    let st
    try { st = statSync(path) } catch { continue }
    if (st.isDirectory()) walk(path)
    else budgets.push(path)
  }
}
walk(root)

let failed = 0
const files = []
function check(path, ok, detail) {
  files.push(path)
  const line = `${ok ? 'OK' : 'OVER'} ${detail} ${path}`
  console.log(line)
  if (!ok) failed++
}

const cardLines = []
for (const path of budgets) {
  const text = readFileSync(path, 'utf8')
  const lines = text.split(/\r?\n/).length
  if (path.endsWith('/spec.md') || path.endsWith(`${join('spec', 'spec.md')}`)) {
    // any spec.md
  }
  if (/(^|\/)spec\.md$/.test(path)) check(path, lines <= 4000, `spec.md ${lines} lines (limit 4000)`)
  if (/\/slices\/SL-\d+\.yaml$/.test(path)) check(path, Buffer.byteLength(text) <= 30 * 1024, `brief ${Buffer.byteLength(text)} bytes (limit 30720)`)
  if (/\/cards\/row-.*\.md$/.test(path)) {
    check(path, Buffer.byteLength(text) <= 12 * 1024, `card ${Buffer.byteLength(text)} bytes (limit 12288)`)
    cardLines.push(...text.split(/\r?\n/).filter((line) => line.trim().length > 20))
  }
  if (/\/features\/[^/]+\.md$/.test(path) && !path.includes('.context')) {
    check(path, Buffer.byteLength(text) <= 60 * 1024, `board ${Buffer.byteLength(text)} bytes (limit 61440)`)
  }
  if (text.startsWith('outcome:') && /\.context\/[^/]+\.md$/.test(path)) {
    check(path, lines <= 15, `handoff ${lines} lines (limit 15)`)
  }
}

if (cardLines.length > 10) {
  const unique = new Set(cardLines).size
  const dup = 1 - unique / cardLines.length
  const ok = dup <= 0.3
  console.log(`${ok ? 'OK' : 'OVER'} card duplicate-line ratio ${dup.toFixed(2)} (warn above 0.30)`)
  if (!ok) failed++
}

if (!files.length) console.log('OK no budgeted artifacts')
process.exit(failed ? 1 : 0)
