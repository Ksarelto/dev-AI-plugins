#!/usr/bin/env node
// Liveness pulse for orchestrate-app, orchestrate-frontend, and the kits they delegate to.
// Procedure: ../references/agent-liveness.md
//
//   node check-pulse.mjs --touch --pulse <path> --role <name>
//        [--agent-id] [--station] [--status working|awaiting-human|done]
//        [--artifact] [--detail] [--worker <id>] [--packet-json '<json>']
//   node check-pulse.mjs --check --pulse <path> [--stale-after 180] [--stall-after 900] [--worker <id>]
//   node check-pulse.mjs --watch <current.json> --pulse <path> --station <id> [--feature-id] [--rebuilds N]
//
// --check prints one label and exits:
//   0 fresh              working and recent, or status done
//   2 awaiting-human     human gate — do not resume or rebuild
//   3 not-responding     working, updated_at older than --stale-after seconds
//   4 missing            no file, corrupt JSON, unknown status, or unknown --worker
//   5 stalled            updated_at is fresh, but station and artifact are unchanged for --stall-after seconds

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)

function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return undefined
  const next = args[i + 1]
  if (next === undefined || next.startsWith('--')) return true
  return next
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function strFlag(name) {
  const value = flag(name)
  if (value === undefined || value === true) return ''
  return String(value)
}

function intFlag(name, fallback) {
  const raw = flag(name)
  if (raw === undefined) return fallback
  if (raw === true || !/^\d+$/.test(String(raw))) fail(`FATAL: --${name} must be a non-negative integer`)
  return Number(raw)
}

function readJson(path) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (error) {
    return { ok: false, missing: error?.code === 'ENOENT' }
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const STATUSES = new Set(['working', 'awaiting-human', 'done'])

function classify(entry, { staleAfter, stallAfter, now }) {
  if (!entry || typeof entry !== 'object') return { code: 4, label: 'missing' }
  if (entry.status === 'awaiting-human') return { code: 2, label: 'awaiting-human' }
  if (entry.status === 'done') return { code: 0, label: 'fresh' }
  if (entry.status !== 'working') return { code: 4, label: 'missing' }
  const updated = Date.parse(entry.updated_at)
  if (Number.isNaN(updated)) return { code: 4, label: 'missing' }
  if ((now - updated) / 1000 > staleAfter) return { code: 3, label: 'not-responding' }
  const progress = Date.parse(entry.progress_at || entry.updated_at)
  if (Number.isNaN(progress) || (now - progress) / 1000 > stallAfter) {
    return { code: 5, label: 'stalled' }
  }
  return { code: 0, label: 'fresh' }
}

function applyTouch(prev, fields, now) {
  const station = fields.station === undefined ? (prev.station ?? '') : String(fields.station)
  const artifact = fields.artifact === undefined ? (prev.artifact ?? '') : String(fields.artifact)
  const changed = !prev.progress_at || (prev.station ?? '') !== station || (prev.artifact ?? '') !== artifact
  const status = fields.status || prev.status || 'working'
  if (!STATUSES.has(status)) fail('FATAL: --status must be working, awaiting-human, or done')
  const next = {
    role: fields.role || prev.role || '',
    agent_id: fields.agent_id || prev.agent_id || '',
    station,
    status,
    updated_at: now,
    artifact,
    detail: fields.detail === undefined ? (prev.detail ?? '') : String(fields.detail),
    progress_at: changed ? now : prev.progress_at,
  }
  if (fields.worker) next.id = fields.worker
  else if (prev.id) next.id = prev.id
  return next
}

function findWorker(doc, id) {
  const workers = Array.isArray(doc.workers) ? doc.workers : []
  return workers.find((worker) => worker && (worker.id === id || worker.role === id || worker.agent_id === id))
}

const watch = flag('watch')
const touch = flag('touch') === true
const check = flag('check') === true
const modes = [typeof watch === 'string', touch, check].filter(Boolean).length
if (modes !== 1) {
  fail('usage: check-pulse.mjs --touch|--check|--watch <current.json> --pulse <path>')
}

const pulse = strFlag('pulse')
const nowIso = new Date().toISOString()

if (typeof watch === 'string') {
  if (!pulse) fail('FATAL: --watch requires --pulse')
  const station = strFlag('station')
  if (!station) fail('FATAL: --watch requires --station')
  const featureId = strFlag('feature-id')
  const rebuilds = intFlag('rebuilds', 0)
  writeJson(watch, {
    station,
    pulse,
    ...(featureId ? { feature_id: featureId } : {}),
    rebuilds,
    updated_at: nowIso,
  })
  console.log(`OK: wrote ${watch}`)
  process.exit(0)
}

if (!pulse) fail('FATAL: --pulse is required')

if (touch) {
  const role = strFlag('role')
  if (!role) fail('FATAL: --touch requires --role')
  const loaded = readJson(pulse)
  const doc = loaded.ok && loaded.value && typeof loaded.value === 'object' && !Array.isArray(loaded.value)
    ? loaded.value
    : {}
  const fields = {
    role,
    agent_id: strFlag('agent-id'),
    worker: strFlag('worker'),
  }
  if (flag('station') !== undefined) fields.station = strFlag('station')
  if (flag('artifact') !== undefined) fields.artifact = strFlag('artifact')
  if (flag('detail') !== undefined) fields.detail = strFlag('detail')
  if (strFlag('status')) fields.status = strFlag('status')

  const packetJson = flag('packet-json')
  if (packetJson !== undefined) {
    if (packetJson === true) fail('FATAL: --packet-json requires a JSON object')
    let parsed
    try {
      parsed = JSON.parse(String(packetJson))
    } catch {
      fail('FATAL: --packet-json is not JSON')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('FATAL: --packet-json must be an object')
    }
    const packetPath = join(dirname(pulse), 'packet.json')
    writeJson(packetPath, parsed)
    if (fields.artifact === undefined) fields.artifact = packetPath
  }

  if (fields.worker) {
    const workers = Array.isArray(doc.workers) ? [...doc.workers] : []
    const index = workers.findIndex((worker) => worker && (worker.id === fields.worker || worker.role === fields.worker || worker.agent_id === fields.worker))
    const next = applyTouch(index >= 0 ? workers[index] : {}, fields, nowIso)
    if (index >= 0) workers[index] = next
    else workers.push(next)
    doc.workers = workers
    writeJson(pulse, doc)
  } else {
    const workers = Array.isArray(doc.workers) ? doc.workers : []
    const next = applyTouch(doc, fields, nowIso)
    next.workers = workers
    writeJson(pulse, next)
  }
  console.log(`OK: wrote ${pulse}`)
  process.exit(0)
}

const staleAfter = intFlag('stale-after', 180)
const stallAfter = intFlag('stall-after', 900)
const workerId = strFlag('worker')
const loaded = readJson(pulse)
if (!loaded.ok || !loaded.value || typeof loaded.value !== 'object' || Array.isArray(loaded.value)) {
  console.log('missing')
  process.exit(4)
}
const entry = workerId ? findWorker(loaded.value, workerId) : loaded.value
const result = classify(entry, { staleAfter, stallAfter, now: Date.now() })
console.log(result.label)
process.exit(result.code)
