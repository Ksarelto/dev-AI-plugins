#!/usr/bin/env node
// Station timeline for measuring a run before optimizing it (Optimization.md X-6).
// Appends {"at","kit","station","event"} to a JSONL file; prints nothing on success.
// A station's end is the next station's start, so log `start` only unless a station is last.
// Usage: node log-timing.mjs --out <timings.jsonl> --kit <name> --station <label> [--event start|end]
// Exit 0 ok, 2 usage error.

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : ''
}
const out = opt('out')
const station = opt('station')
const event = opt('event') || 'start'
if (!out || !station || !['start', 'end'].includes(event)) {
  console.error('usage: log-timing.mjs --out <timings.jsonl> --kit <name> --station <label> [--event start|end]')
  process.exit(2)
}
mkdirSync(dirname(out), { recursive: true })
appendFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), kit: opt('kit'), station, event })}\n`)
