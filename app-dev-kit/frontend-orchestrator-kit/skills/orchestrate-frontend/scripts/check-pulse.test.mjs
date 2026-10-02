import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-pulse.mjs')

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' })
    return { code: 0, stdout: stdout.trim(), stderr: '' }
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: String(error.stdout ?? '').trim(),
      stderr: String(error.stderr ?? '').trim(),
    }
  }
}

function iso(msAgo) {
  return new Date(Date.now() - msAgo).toISOString()
}

function writePulse(path, entry) {
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`)
}

test('fresh working pulse exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'pulse.json')
  try {
    const now = new Date().toISOString()
    writePulse(pulse, {
      role: 'feature-orchestrator',
      status: 'working',
      station: '6',
      artifact: 'handoff.md',
      updated_at: now,
      progress_at: now,
    })
    const result = run(['--check', '--pulse', pulse])
    assert.equal(result.code, 0)
    assert.equal(result.stdout, 'fresh')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('awaiting-human exits 2 even when the timestamp is old', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'pulse.json')
  try {
    writePulse(pulse, {
      role: 'html-orchestrator',
      status: 'awaiting-human',
      station: '9',
      artifact: 'packet.json',
      updated_at: iso(60 * 60 * 1000),
      progress_at: iso(60 * 60 * 1000),
    })
    const result = run(['--check', '--pulse', pulse])
    assert.equal(result.code, 2)
    assert.equal(result.stdout, 'awaiting-human')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('working pulse older than stale-after exits 3', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'pulse.json')
  try {
    const old = iso(10 * 60 * 1000)
    writePulse(pulse, {
      role: 'spec-orchestrator',
      status: 'working',
      station: '4',
      artifact: 'analysis.json',
      updated_at: old,
      progress_at: old,
    })
    const result = run(['--check', '--pulse', pulse])
    assert.equal(result.code, 3)
    assert.equal(result.stdout, 'not-responding')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('not-responding wins over a stalled progress_at', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'pulse.json')
  try {
    writePulse(pulse, {
      role: 'feature-orchestrator',
      status: 'working',
      station: '6',
      artifact: 'handoff.md',
      updated_at: iso(10 * 60 * 1000),
      progress_at: iso(20 * 60 * 1000),
    })
    const result = run(['--check', '--pulse', pulse])
    assert.equal(result.code, 3)
    assert.equal(result.stdout, 'not-responding')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing file and corrupt JSON exit 4', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'pulse.json')
  try {
    const missing = run(['--check', '--pulse', pulse])
    assert.equal(missing.code, 4)
    assert.equal(missing.stdout, 'missing')
    writeFileSync(pulse, '{not json')
    const corrupt = run(['--check', '--pulse', pulse])
    assert.equal(corrupt.code, 4)
    assert.equal(corrupt.stdout, 'missing')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fresh updated_at with unchanged station and artifact exits 5', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'pulse.json')
  try {
    writePulse(pulse, {
      role: 'feature-orchestrator',
      status: 'working',
      station: '6',
      artifact: 'handoff.md',
      updated_at: new Date().toISOString(),
      progress_at: iso(20 * 60 * 1000),
    })
    const result = run(['--check', '--pulse', pulse])
    assert.equal(result.code, 5)
    assert.equal(result.stdout, 'stalled')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('done exits 0 even when timestamps are old', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'pulse.json')
  try {
    const old = iso(60 * 60 * 1000)
    writePulse(pulse, {
      role: 'feature-orchestrator',
      status: 'done',
      station: '12',
      artifact: 'packet.json',
      updated_at: old,
      progress_at: old,
    })
    const result = run(['--check', '--pulse', pulse])
    assert.equal(result.code, 0)
    assert.equal(result.stdout, 'fresh')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('touch keeps progress_at until station or artifact changes, and preserves workers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'nested', 'pulse.json')
  try {
    const first = run([
      '--touch', '--pulse', pulse,
      '--role', 'feature-orchestrator',
      '--station', '6',
      '--artifact', 'handoff.md',
      '--agent-id', 'orch-1',
    ])
    assert.equal(first.code, 0)
    const opened = JSON.parse(readFileSync(pulse, 'utf8'))
    const worker = run([
      '--touch', '--pulse', pulse,
      '--worker', 'composition-engineer',
      '--role', 'composition-engineer',
      '--station', '6',
      '--artifact', 'slice.md',
      '--agent-id', 'worker-1',
    ])
    assert.equal(worker.code, 0)
    const withWorker = JSON.parse(readFileSync(pulse, 'utf8'))
    assert.equal(withWorker.updated_at, opened.updated_at)
    assert.equal(withWorker.progress_at, opened.progress_at)
    assert.equal(withWorker.workers.length, 1)
    assert.equal(withWorker.workers[0].id, 'composition-engineer')

    const second = run([
      '--touch', '--pulse', pulse,
      '--role', 'feature-orchestrator',
      '--station', '6',
      '--artifact', 'handoff.md',
      '--agent-id', 'orch-1',
    ])
    assert.equal(second.code, 0)
    const held = JSON.parse(readFileSync(pulse, 'utf8'))
    assert.equal(held.progress_at, opened.progress_at)
    assert.equal(held.workers.length, 1)
    assert.notEqual(held.updated_at, '')

    const moved = run([
      '--touch', '--pulse', pulse,
      '--role', 'feature-orchestrator',
      '--station', '7',
      '--artifact', 'handoff.md',
      '--agent-id', 'orch-1',
    ])
    assert.equal(moved.code, 0)
    const advanced = JSON.parse(readFileSync(pulse, 'utf8'))
    assert.equal(advanced.station, '7')
    assert.equal(advanced.progress_at, advanced.updated_at)
    assert.notEqual(advanced.progress_at, opened.progress_at)
    assert.equal(advanced.workers[0].role, 'composition-engineer')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('unknown worker exits 4 and a known worker can be fresh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'pulse.json')
  try {
    const touched = run([
      '--touch', '--pulse', pulse,
      '--worker', 'screen-generator',
      '--role', 'screen-generator',
      '--station', '4',
      '--status', 'working',
      '--artifact', 'pages/home.html',
    ])
    assert.equal(touched.code, 0)
    const fresh = run(['--check', '--pulse', pulse, '--worker', 'screen-generator'])
    assert.equal(fresh.code, 0)
    assert.equal(fresh.stdout, 'fresh')
    const unknown = run(['--check', '--pulse', pulse, '--worker', 'other'])
    assert.equal(unknown.code, 4)
    assert.equal(unknown.stdout, 'missing')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('packet-json writes packet.json and watch writes current.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'))
  const pulse = join(dir, 'watch', 'pulse.json')
  const current = join(dir, 'current.json')
  try {
    const packet = run([
      '--touch', '--pulse', pulse,
      '--role', 'spec-orchestrator',
      '--status', 'awaiting-human',
      '--packet-json', JSON.stringify({ type: 'CLARIFY_PACKET', questions: ['Which role?'] }),
    ])
    assert.equal(packet.code, 0)
    const written = JSON.parse(readFileSync(pulse, 'utf8'))
    assert.equal(written.status, 'awaiting-human')
    const packetBody = JSON.parse(readFileSync(join(dir, 'watch', 'packet.json'), 'utf8'))
    assert.equal(packetBody.type, 'CLARIFY_PACKET')
    assert.equal(written.artifact, join(dir, 'watch', 'packet.json'))

    const watch = run([
      '--watch', current,
      '--station', '3',
      '--pulse', pulse,
      '--feature-id', 'F-001',
      '--rebuilds', '1',
    ])
    assert.equal(watch.code, 0)
    const pointer = JSON.parse(readFileSync(current, 'utf8'))
    assert.equal(pointer.station, '3')
    assert.equal(pointer.pulse, pulse)
    assert.equal(pointer.feature_id, 'F-001')
    assert.equal(pointer.rebuilds, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('usage errors exit 1', () => {
  const result = run(['--pulse', 'x'])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /usage/)
})
