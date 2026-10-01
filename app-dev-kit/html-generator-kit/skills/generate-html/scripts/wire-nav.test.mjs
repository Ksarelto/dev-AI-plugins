// Tests for wire-nav.mjs: the single source of truth for prototype navigation.
// Run with: node --test skills/generate-html/scripts/wire-nav.test.mjs

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { iconFor, injectNav, navHtml, navigationJs } from './wire-nav.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'wire-nav.mjs')

const PAGES = [
  { id: 'catalogue', title: 'Catalogue', domain: 'listings', description: 'Browse items' },
  { id: 'listing-detail', title: 'Listing detail', domain: 'listings', description: 'View one item' },
  { id: 'residents', title: 'Residents', domain: 'residents', description: 'Manage residents' },
]
const NAV = { listings: ['catalogue', 'listing-detail'], residents: ['residents'] }

function pageShell(body = '<main></main>') {
  return `<!DOCTYPE html>
<html lang="en">
<head><title>x</title></head>
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar">
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>
    ${body}
  </div>
</body>
</html>`
}

function buildPrototype(dir) {
  mkdirSync(join(dir, 'js'), { recursive: true })
  mkdirSync(join(dir, 'pages'), { recursive: true })
  writeFileSync(join(dir, 'index.html'), pageShell())
  for (const page of PAGES) writeFileSync(join(dir, 'pages', `${page.id}.html`), pageShell())
}

function writeInputs(dir) {
  writeFileSync(join(dir, 'pages.json'), JSON.stringify(PAGES))
  writeFileSync(join(dir, 'nav.json'), JSON.stringify(NAV))
}

// ── pure functions ──────────────────────────────────────────────────────

test('iconFor: matches by domain keyword, falls back to a default', () => {
  assert.equal(iconFor('listings'), '📦')
  assert.equal(iconFor('residents'), '👥')
  assert.equal(iconFor('totally-unknown-domain'), '•')
})

test('navHtml: groups pages by nav_structure domain, in that order, skipping unknown ids', () => {
  const html = navHtml(PAGES, { residents: ['residents'], listings: ['catalogue', 'ghost-id'] }, './')
  const residentsIdx = html.indexOf('residents')
  const listingsIdx = html.indexOf('nav-group-label">listings')
  assert.ok(residentsIdx < listingsIdx, 'nav_structure key order is preserved')
  assert.match(html, /href="\.\/catalogue\.html"/)
  assert.doesNotMatch(html, /ghost-id/, 'an id with no matching page is silently skipped, not a dangling link')
})

test('navHtml: escapes title/domain text', () => {
  const html = navHtml([{ id: 'a', title: '<script>', domain: 'x' }], { x: ['a'] }, './')
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})

test('injectNav: replaces content between markers, returns null if markers are missing', () => {
  const page = '<nav>\n<!-- nav:start -->\nSTALE\n<!-- nav:end -->\n</nav>'
  const out = injectNav(page, 'FRESH')
  assert.match(out, /FRESH/)
  assert.doesNotMatch(out, /STALE/)
  assert.equal(injectNav('<nav>no markers here</nav>', 'x'), null)
})

test('navigationJs: bakes PAGES/NAV_GROUPS as literals, no leftover placeholder text', () => {
  const js = navigationJs(PAGES, NAV)
  assert.doesNotMatch(js, /PAGES_ARRAY|NAV_GROUPS —/, 'no leftover template placeholder comment')
  assert.match(js, /"id": "catalogue"/)
  assert.match(js, /"listings": \[/)
})

// ── CLI ───────────────────────────────────────────────────────────────

test('wire-nav.mjs CLI: injects the same nav into index.html and every page, writes navigation.js', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wire-nav-'))
  try {
    buildPrototype(dir)
    writeInputs(dir)
    const stdout = execFileSync(process.execPath, [
      script, '--dir', dir, '--pages', join(dir, 'pages.json'), '--nav', join(dir, 'nav.json'),
      '--title', 'Shelf Share', '--layout', 'sidebar',
    ], { encoding: 'utf8' })
    assert.match(stdout, /3 page\(s\) \+ index\.html wired/)

    const index = readFileSync(join(dir, 'index.html'), 'utf8')
    assert.match(index, /href="pages\/catalogue\.html"/, 'index.html links use the pages/ prefix')

    const listingDetail = readFileSync(join(dir, 'pages', 'listing-detail.html'), 'utf8')
    assert.match(listingDetail, /href="\.\/catalogue\.html"/, 'a page links to its SIBLING using the ./ prefix')
    assert.match(listingDetail, /href="\.\/residents\.html"/, 'every page gets the FULL nav, not just its own domain')

    const navJs = readFileSync(join(dir, 'js', 'navigation.js'), 'utf8')
    assert.match(navJs, /"catalogue"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('wire-nav.mjs CLI: a reorder in nav.json reaches every page, not just one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wire-nav-reorder-'))
  try {
    buildPrototype(dir)
    writeFileSync(join(dir, 'pages.json'), JSON.stringify(PAGES))
    writeFileSync(join(dir, 'nav.json'), JSON.stringify({ residents: ['residents'], listings: ['catalogue', 'listing-detail'] }))
    execFileSync(process.execPath, [
      script, '--dir', dir, '--pages', join(dir, 'pages.json'), '--nav', join(dir, 'nav.json'), '--title', 'x',
    ], { encoding: 'utf8' })
    for (const page of PAGES) {
      const html = readFileSync(join(dir, 'pages', `${page.id}.html`), 'utf8')
      const residentsPos = html.indexOf('nav-group-label">residents')
      const listingsPos = html.indexOf('nav-group-label">listings')
      assert.ok(residentsPos > -1 && listingsPos > -1 && residentsPos < listingsPos,
        `${page.id}.html did not pick up the reordered nav`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('wire-nav.mjs CLI: exits 1 and names the file when a page has no marker pair', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wire-nav-nomarker-'))
  try {
    buildPrototype(dir)
    writeFileSync(join(dir, 'pages', 'catalogue.html'), '<html><body>no markers here</body></html>')
    writeInputs(dir)
    try {
      execFileSync(process.execPath, [
        script, '--dir', dir, '--pages', join(dir, 'pages.json'), '--nav', join(dir, 'nav.json'), '--title', 'x',
      ], { encoding: 'utf8' })
      assert.fail('expected a non-zero exit')
    } catch (e) {
      assert.equal(e.status, 1)
      assert.match(e.stderr, /catalogue\.html: no <!-- nav:start\/end --> marker pair found/)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('wire-nav.mjs CLI: exits 2 on bad usage', () => {
  try {
    execFileSync(process.execPath, [script, '--dir', '/nonexistent-dir-xyz'], { encoding: 'utf8' })
    assert.fail('expected a non-zero exit')
  } catch (e) {
    assert.equal(e.status, 2)
  }
})
