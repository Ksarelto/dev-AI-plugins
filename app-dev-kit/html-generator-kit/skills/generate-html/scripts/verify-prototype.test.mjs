// Regression tests for verify-prototype.mjs.
//
// Most tests force VERIFY_SKIP_BROWSER=1 so they stay fast and deterministic regardless of
// whether a browser binary happens to be installed in the environment running them — they target
// the STATIC gate, which must keep working on its own (a broken prototype must never be reported
// PASS just because the browser half didn't run).
//
// One test deliberately does NOT set that flag: it proves Playwright-core (installed as a kit
// dependency, see package.json) resolves from the kit's OWN node_modules regardless of the
// process's cwd — the fix for the #1 bug in the original audit, where `import('playwright')`
// resolved relative to the shell's cwd, so installing the kit's own dependencies never made the
// browser check runnable when the kit was used as an installed plugin.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'verify-prototype.mjs')

function run(dir, { env = {}, port = '4777', cwd } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [script, dir, '--port', port], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, ...env },
      ...(cwd ? { cwd } : {}),
    })
    return { code: 0, stdout }
  } catch (e) {
    return { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function minimalPrototype(dir) {
  mkdirSync(join(dir, 'css'), { recursive: true })
  mkdirSync(join(dir, 'js'), { recursive: true })
  mkdirSync(join(dir, 'pages'), { recursive: true })
  writeFileSync(join(dir, 'css', 'tokens.css'), ':root{--primary:oklch(0.5 0.1 250);}')
  writeFileSync(join(dir, 'css', 'base.css'), 'body{margin:0;}')
  writeFileSync(join(dir, 'css', 'components.css'), '.btn-primary{background:var(--primary);}')
  writeFileSync(join(dir, 'js', 'app.js'), '// stores')
  writeFileSync(join(dir, 'js', 'data.js'), '// data')
  writeFileSync(join(dir, 'js', 'navigation.js'), '// nav')
  const page = (title) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/components.css">
</head>
<body x-data x-cloak><main><h1>${title}</h1></main></body>
</html>`
  writeFileSync(join(dir, 'pages', 'home.html'), page('Home'))
}

test('verify-prototype.mjs: static gate fails on a Tailwind CDN reference even without a browser', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-static-'))
  try {
    minimalPrototype(dir)
    const page = readFileSync(join(dir, 'pages', 'home.html'), 'utf8')
    writeFileSync(join(dir, 'pages', 'home.html'), page.replace('</head>', '<script src="https://cdn.tailwindcss.com"></script></head>'))
    const { code, stdout } = run(dir, { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 1)
    assert.match(stdout, /Tailwind CDN present/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('verify-prototype.mjs: static gate fails on an inline <script> without src', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-static-'))
  try {
    minimalPrototype(dir)
    const page = readFileSync(join(dir, 'pages', 'home.html'), 'utf8')
    writeFileSync(join(dir, 'pages', 'home.html'), page.replace('</body>', '<script>alert(1)</script></body>'))
    const { code, stdout } = run(dir, { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 1)
    assert.match(stdout, /inline <script>/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('verify-prototype.mjs: static gate fails on a missing asset reference', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-static-'))
  try {
    minimalPrototype(dir)
    const page = readFileSync(join(dir, 'pages', 'home.html'), 'utf8')
    writeFileSync(join(dir, 'pages', 'home.html'), page.replace('</head>', '<link rel="stylesheet" href="../css/missing.css"></head>'))
    const { code, stdout } = run(dir, { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 1)
    assert.match(stdout, /missing asset/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('verify-prototype.mjs: VERIFY_SKIP_BROWSER forces a clean static-only run, reported as SKIPPED not silently green', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-static-'))
  try {
    minimalPrototype(dir)
    const { code, stdout } = run(dir, { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 0)
    // The summary line must name the gap — a human reading output must see this wasn't verified.
    assert.match(stdout, /browser: *SKIPPED/)
    const report = JSON.parse(readFileSync(join(dir, '_verify', 'report.json'), 'utf8'))
    assert.equal(report.browser, false)
    assert.ok(report.warnings.some((w) => /Playwright not installed/.test(w)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("playwright-core resolves from the kit's own node_modules (not cwd)", () => {
  // Regression for the #1 Phase-1 bug: `import('playwright')` used to resolve relative to the
  // shell's cwd, so installing the kit's own dependencies never made the browser check runnable.
  // Run the script from an unrelated cwd (tmpdir) and confirm it still finds playwright-core.
  // Deliberately does NOT set VERIFY_SKIP_BROWSER — this is the one test that exercises real
  // resolution. A sandbox with no network will still fail the render gate on the Alpine CDN
  // script (a genuine, separate problem — see Phase 4's vendoring plan), but module resolution
  // and the launch attempt itself must not silently stay in the "not installed" state.
  const dir = mkdtempSync(join(tmpdir(), 'verify-resolve-'))
  const elsewhere = mkdtempSync(join(tmpdir(), 'elsewhere-'))
  try {
    minimalPrototype(dir)
    const { stdout } = run(dir, { port: '4778', cwd: elsewhere })
    assert.doesNotMatch(stdout, /SKIPPED \(no playwright\)/, 'playwright-core must resolve from the kit directory, not cwd')
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(elsewhere, { recursive: true, force: true })
  }
})
