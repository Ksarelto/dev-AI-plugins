// Regression tests for the --page <id> flag added in Phase 9 (Station 4.5's incremental per-page
// verify-and-fix). The flag restricts verification to exactly one page instead of looping over
// every .html file in PROTOTYPE_DIR — see the usage comment at the top of verify-prototype.mjs.
//
// Static-gate assertions use VERIFY_SKIP_BROWSER=1 (fast, deterministic, no browser dependency).
// The screenshot-scoping and graceful-cross-page-skip assertions need a real browser render, same
// as verify-prototype.conformance.test.mjs, so they're not gated behind VERIFY_SKIP_BROWSER.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'verify-prototype.mjs')

function run(dir, extraArgs = [], { env = {}, port = '4799' } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [script, dir, '--port', port, ...extraArgs], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, ...env },
    })
    return { code: 0, stdout }
  } catch (e) {
    return { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function page(title, bodyExtra = '', cssPrefix = '../css') {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="${cssPrefix}/tokens.css">
<link rel="stylesheet" href="${cssPrefix}/base.css">
<link rel="stylesheet" href="${cssPrefix}/components.css">
</head>
<body x-data x-cloak><main><h1>${title}</h1>${bodyExtra}</main></body>
</html>`
}

// A 3-page fixture: home (clean), about (clean), contact (deliberately broken — Tailwind CDN).
function threePagePrototype(dir) {
  mkdirSync(join(dir, 'css'), { recursive: true })
  mkdirSync(join(dir, 'js'), { recursive: true })
  mkdirSync(join(dir, 'pages'), { recursive: true })
  writeFileSync(join(dir, 'css', 'tokens.css'), ':root{--primary:oklch(0.5 0.1 250);}')
  writeFileSync(join(dir, 'css', 'base.css'), 'body{margin:0;}')
  writeFileSync(join(dir, 'css', 'components.css'), '.btn-primary{background:var(--primary);}')
  writeFileSync(join(dir, 'js', 'app.js'), '// stores')
  writeFileSync(join(dir, 'js', 'data.js'), '// data')
  writeFileSync(join(dir, 'js', 'navigation.js'), '// nav')
  writeFileSync(join(dir, 'pages', 'home.html'), page('Home'))
  writeFileSync(join(dir, 'pages', 'about.html'), page('About'))
  writeFileSync(
    join(dir, 'pages', 'contact.html'),
    page('Contact').replace('</head>', '<script src="https://cdn.tailwindcss.com"></script></head>'),
  )
  return dir
}

test('--page checks only the named page: a break on an UNselected page does not fail the run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-page-mode-'))
  try {
    threePagePrototype(dir)
    const { code, stdout } = run(dir, ['--page', 'home'], { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 0, `expected home-only check to pass, got: ${stdout}`)
    const report = JSON.parse(readFileSync(join(dir, '_verify', 'report.json'), 'utf8'))
    assert.equal(report.pages, 1, 'report.pages should count only the one page checked')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--page still catches a static-gate break when it names the broken page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-page-mode-'))
  try {
    threePagePrototype(dir)
    const { code, stdout } = run(dir, ['--page', 'contact'], { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 1)
    assert.match(stdout, /Tailwind CDN present/)
    assert.match(stdout, /pages\/contact\.html/)
    // The unrelated pages/about.html break would never even be inspected — confirm it's not named.
    assert.doesNotMatch(stdout, /pages\/about\.html/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--page with an id that has no file on disk yet is a setup error (exit 2), not a false pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-page-mode-'))
  try {
    threePagePrototype(dir)
    const { code, stderr } = run(dir, ['--page', 'does-not-exist'], { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 2)
    assert.match(stderr, /--page does-not-exist not found/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--page index checks index.html, not pages/index.html', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-page-mode-'))
  try {
    threePagePrototype(dir)
    writeFileSync(join(dir, 'index.html'), page('Home — index', '', 'css'))
    const { code } = run(dir, ['--page', 'index'], { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 0)
    const report = JSON.parse(readFileSync(join(dir, '_verify', 'report.json'), 'utf8'))
    assert.equal(report.pages, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('omitting --page reproduces full-prototype behavior: all 3 pages checked, break still caught', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-page-mode-'))
  try {
    threePagePrototype(dir)
    const { code, stdout } = run(dir, [], { env: { VERIFY_SKIP_BROWSER: '1' } })
    assert.equal(code, 1)
    assert.match(stdout, /Tailwind CDN present/)
    const report = JSON.parse(readFileSync(join(dir, '_verify', 'report.json'), 'utf8'))
    assert.equal(report.pages, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── Browser-backed assertions: screenshot scoping + graceful cross-page skip ─────────────────
// A page that links to a sibling page NOT yet on disk (simulating Station 4.5's pre-assembly
// state, before Station 5 wires nav / writes index.html) must not be reported as a dead link or a
// broken nav click-through target when checked in --page mode.
test('build fixture and run verify-prototype.mjs --page with a real browser', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-page-mode-browser-'))
  try {
    threePagePrototype(dir)
    // home.html links to pages/not-yet-built.html (never created in this fixture) and to
    // ../index.html (never created either, since Station 5/assembly hasn't run yet).
    writeFileSync(
      join(dir, 'pages', 'home.html'),
      page('Home', '<a href="pages/not-yet-built.html">Later</a><a href="../index.html">Dashboard</a>'),
    )
    const { stdout } = run(dir, ['--page', 'home'], { port: '4798' })
    const report = JSON.parse(readFileSync(join(dir, '_verify', 'report.json'), 'utf8'))
    if (!report.browser) {
      // No browser binary available in this environment — the static-gate tests above already
      // cover --page's deterministic behavior; skip the browser-only assertions rather than fail.
      return
    }
    assert.equal(report.pages, 1)
    assert.equal(report.checks.length, 1, 'only the named page should have a checks[] entry')
    assert.equal(report.checks[0].page, 'pages/home.html')
    // Only pages/home.html's three screenshots (desktop/mobile/dark) should exist — none for
    // about.html or contact.html, which --page home never touched.
    const shots = readdirSync(join(dir, '_verify', 'screenshots'))
    assert.deepEqual(shots.sort(), ['pages__home.png', 'pages__home__dark.png', 'pages__home__mobile.png'])
    // The links to not-yet-built.html / ../index.html must not be reported as dead — they're
    // gracefully skipped in --page mode, not a broken-link signal.
    assert.ok(!report.critical.some((c) => /dead nav link/.test(c)), `expected no dead-link critical, got: ${JSON.stringify(report.critical)}`)
    assert.ok(!report.critical.some((c) => /not-yet-built|index\.html/.test(c) && /unstyled|broken/.test(c)), `expected no broken-target critical, got: ${JSON.stringify(report.critical)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
