import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./collect-design-inputs.mjs', import.meta.url))

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

test('scans a brief and prototype/design without a spec', () => {
  const root = mkdtempSync(join(tmpdir(), 'prototype-inputs-'))
  try {
    writeFileSync(join(root, 'brief.md'), 'A freelance invoicing app for solo designers.\n')
    const plain = run(['--root', root, '--out', 'out/plain.json', '--brief', 'brief.md'])
    assert.equal(plain.status, 0, plain.stderr)
    assert.match(plain.stdout, /^NONE:/)
    assert.equal(JSON.parse(readFileSync(join(root, 'out/plain.json'), 'utf8')).binding, false)

    writeFileSync(join(root, 'brief.md'), 'Use a left sidebar. Primary colour #0A3D62.\n')
    const brief = run(['--root', root, '--out', 'out/brief.json', '--brief', 'brief.md'])
    assert.equal(brief.status, 0, brief.stderr)
    assert.match(brief.stdout, /^BINDING:/)
    const briefJson = JSON.parse(readFileSync(join(root, 'out/brief.json'), 'utf8'))
    assert.equal(briefJson.binding, true)
    assert.equal(briefJson.sources[0].origin, 'brief')

    mkdirSync(join(root, 'prototype/design'), { recursive: true })
    writeFileSync(join(root, 'prototype/design/brand.md'), 'Brand palette notes.\n')
    const dir = run(['--root', root, '--out', 'out/dir.json'])
    assert.equal(dir.status, 0, dir.stderr)
    const dirJson = JSON.parse(readFileSync(join(root, 'out/dir.json'), 'utf8'))
    assert.equal(dirJson.sources.some((s) => s.origin === 'design-dir'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('missing --out exits 2', () => {
  const result = run([])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /--out/)
})
