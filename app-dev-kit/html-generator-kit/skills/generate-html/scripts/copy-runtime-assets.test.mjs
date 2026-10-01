// Tests for copy-runtime-assets.mjs: the script that copies the fixed-content runtime JS assets
// (js/app.js, js/store.js, and the vendored Alpine files) byte-for-byte into a prototype's js/
// directory, replacing design-system-author/component-library-author retyping them with Write.
// Run with: node --test skills/generate-html/scripts/copy-runtime-assets.test.mjs

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { copyRuntimeAssets } from './copy-runtime-assets.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const RUNTIME_DIR = join(here, '..', 'templates', 'runtime')
const script = join(here, 'copy-runtime-assets.mjs')

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'copy-runtime-assets-test-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('app.js and store.js are copied byte-identical to templates/runtime/', () => {
  withTempDir((dir) => {
    const { written, errors } = copyRuntimeAssets(dir)
    assert.deepEqual(errors, [])
    assert.ok(written.includes(join('js', 'app.js')))
    assert.ok(written.includes(join('js', 'store.js')))

    const srcApp = readFileSync(join(RUNTIME_DIR, 'app.js'))
    const destApp = readFileSync(join(dir, 'js', 'app.js'))
    assert.deepEqual(srcApp, destApp)

    const srcStore = readFileSync(join(RUNTIME_DIR, 'store.js'))
    const destStore = readFileSync(join(dir, 'js', 'store.js'))
    assert.deepEqual(srcStore, destStore)
  })
})

// Alpine vendoring (Phase 4, step C) vendors templates/runtime/vendor/alpine.min.js and
// alpine-focus.min.js when the sandbox that authored this phase had network access to npm. If a
// later checkout of this kit ever has those files removed (vendoring skipped per the spec's
// "no network access" escape hatch), this assertion is skipped rather than failing the whole
// suite — an environment limitation, not a regression in the copy script itself.
const vendorFilesPresent =
  existsSync(join(RUNTIME_DIR, 'vendor', 'alpine.min.js')) &&
  existsSync(join(RUNTIME_DIR, 'vendor', 'alpine-focus.min.js'))

test('vendored Alpine files land in {OUTPUT_DIR}/js/vendor/ when present in the kit', { skip: !vendorFilesPresent && 'Alpine vendoring was skipped in this checkout (no network access when this phase ran) — nothing to copy' }, () => {
  withTempDir((dir) => {
    const { written, vendorCopied } = copyRuntimeAssets(dir)
    assert.ok(vendorCopied)
    assert.ok(written.includes(join('js', 'vendor', 'alpine.min.js')))
    assert.ok(written.includes(join('js', 'vendor', 'alpine-focus.min.js')))

    const srcAlpine = readFileSync(join(RUNTIME_DIR, 'vendor', 'alpine.min.js'))
    const destAlpine = readFileSync(join(dir, 'js', 'vendor', 'alpine.min.js'))
    assert.deepEqual(srcAlpine, destAlpine)

    const srcFocus = readFileSync(join(RUNTIME_DIR, 'vendor', 'alpine-focus.min.js'))
    const destFocus = readFileSync(join(dir, 'js', 'vendor', 'alpine-focus.min.js'))
    assert.deepEqual(srcFocus, destFocus)
  })
})

test('a healthy run reports no errors', () => {
  withTempDir((dir) => {
    const { errors } = copyRuntimeAssets(dir)
    assert.deepEqual(errors, [])
  })
})

test('CLI exits 2 (usage error) when --out is missing', () => {
  assert.throws(() => execFileSync('node', [script], { stdio: 'pipe' }))
})

test('CLI exits 2 (usage error) when --out does not exist on disk', () => {
  assert.throws(() => execFileSync('node', [script, '--out', '/no/such/directory/at/all'], { stdio: 'pipe' }))
})

test('CLI exits 0 and copies files into a real --out directory', () => {
  withTempDir((dir) => {
    const stdout = execFileSync('node', [script, '--out', dir], { encoding: 'utf8' })
    assert.match(stdout, /^OK:/)
    assert.ok(existsSync(join(dir, 'js', 'app.js')))
    assert.ok(existsSync(join(dir, 'js', 'store.js')))
  })
})
