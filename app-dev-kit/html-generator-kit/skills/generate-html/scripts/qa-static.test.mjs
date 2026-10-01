// Tests for qa-static.mjs — the deterministic replacement for the qa-validator Haiku agent
// (Phase 7). Builds small real prototypes from this kit's own deterministic scripts
// (buildModel/parseFrontmatter against tests/fixtures/specs/spec-2x/spec.md, buildDesignSystem,
// copyRuntimeAssets, wire-nav's navHtml/injectNav/navigationJs) — same fixture-assembly pattern
// Phase 6's verify-prototype.conformance.test.mjs established — plus hand-written page bodies.
//
// No browser needed here: qa-static.mjs is a pure static/grep check, so every test runs fast.
//
// Run with: node --test skills/generate-html/scripts/qa-static.test.mjs

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parse as parseYaml } from 'yaml'
import { buildModel, parseFrontmatter } from './lib/spec-model.mjs'
import { buildDesignSystem } from './build-design-system.mjs'
import { copyRuntimeAssets } from './copy-runtime-assets.mjs'
import { navHtml, injectNav, navigationJs } from './wire-nav.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'qa-static.mjs')
const specPath = join(here, '..', '..', '..', 'tests', 'fixtures', 'specs', 'spec-2x', 'spec.md')

const PAGE_IDS = ['catalogue', 'listings-id']

function designValues() {
  return {
    palette: { neutralHue: 240, neutralChroma: 0.01, primaryL: 0.55, primaryC: 0.15, primaryH: 165, accentH: 165 },
    radius: '0.625rem',
    shadowAlpha: 0.08,
    fonts: { body: "'Inter'", display: "'Space Grotesk'", import: '' },
    density: { controlPy: '0.6rem', controlPx: '1rem', cellPy: '0.9rem', cellPx: '1.15rem', cardPad: '1.35rem', mainPadY: '2.5rem', mainPadX: '3rem' },
    motion: { durFast: '140ms', durBase: '220ms', durSlow: '360ms', liftY: '-2px' },
    signatureBlocks: [],
    lockedTokens: { '--primary': '#0A3D62' },
    layout: 'sidebar',
    designDirection: { archetype: 'modern SaaS', mood: 'calm', paletteNote: 'x', typeNote: 'y', densityLabel: 'comfortable', motionFeel: 'snappy', composition: ['list: search + table'], voice: 'plain', emphasize: 'status' },
  }
}

const PAGE_HEAD = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="../css/tokens.css">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/components.css">
  <script src="../js/store.js" defer></script>
  <script src="../js/app.js" defer></script>
  <script src="../js/vendor/alpine-focus.min.js" defer></script>
  <script src="../js/vendor/alpine.min.js" defer></script>
</head>`

const FOUR_STATES = `
        <div x-show="loading" data-state-root="loading" role="status" aria-label="Loading">
          <div class="skeleton"></div>
        </div>
        <div x-show="!loading && error" data-state-root="error" class="alert alert-destructive" role="alert">
          <p x-text="error"></p>
        </div>
        <div x-show="!loading && !error && items.length === 0" data-state-root="empty" class="empty-state">
          <p>No items yet</p>
        </div>
        <div x-show="!loading && !error && items.length > 0" data-state-root="success">
          <div class="table" role="grid" aria-label="Items">
            <div class="table-header" role="row">
              <div class="table-cell" role="columnheader" data-field="name">Name</div>
            </div>
            <template x-for="item in filteredItems" :key="item.id">
              <div class="table-row" role="row">
                <div class="table-cell" role="gridcell" data-field="name" x-text="item.name"></div>
              </div>
            </template>
          </div>
        </div>`

const DEV_PANEL = `
        <div class="dev-panel" role="toolbar" aria-label="Prototype controls">
          <span class="dev-panel-label">States:</span>
          <button class="btn-ghost btn-sm" @click="loading=true;error=null" aria-label="Preview loading state">⏳</button>
        </div>`

function pageHtml(id, title, extra = {}) {
  const inlineStyle = extra.inlineStyle ? '<style>.x{color:red}</style>' : ''
  const loremIpsum = extra.loremIpsum ? '<p>Lorem ipsum dolor sit amet</p>' : ''
  return `${PAGE_HEAD(title)}
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header"><a href="../index.html" class="sidebar-brand link">App</a></div>
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>
    <main class="main" data-spec-screen="SCR-${id}" x-data="{}" x-init="init()">
      <div class="content">
        ${inlineStyle}
        ${loremIpsum}
        <a href="./${id === 'catalogue' ? 'listings-id' : 'catalogue'}.html">Other page</a>
        ${FOUR_STATES}
        ${DEV_PANEL}
      </div>
    </main>
  </div>
</body>
</html>`
}

function indexHtml(pageList) {
  const links = pageList.map((p) => `<a href="pages/${p.id}.html">${p.title}</a>`).join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App — Prototype</title>
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
</head>
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header"><span class="sidebar-brand">App</span></div>
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>
    <main class="main">
      <div class="content"><h1 class="page-title">App</h1>${links}</div>
    </main>
  </div>
</body>
</html>`
}

const DESIGN_BRIEF_OK = `# Design Brief — App

## Binding reference
- Sources read: test fixture

| Attribute | Provided | Source | Applied as |
|-----------|----------|--------|------------|
| Primary colour | \`#0A3D62\` | fixture | \`--primary: #0A3D62\` |
`

const DESIGN_BRIEF_MISMATCH = `# Design Brief — App

## Binding reference
- Sources read: test fixture

| Attribute | Provided | Source | Applied as |
|-----------|----------|--------|------------|
| Primary colour | \`#114477\` | fixture | \`--primary: #114477\` |
`

// Builds a full prototype dir: spec-model.json (real buildModel, filtered to two pages), css/*
// (real buildDesignSystem), js/store.js + js/app.js + vendor (real copyRuntimeAssets), nav wired
// into every page (real wire-nav helpers), index.html + two hand-written pages.
//
// `mutate` lets a test knock one thing out of an otherwise-clean prototype.
function buildFixture(mutate = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-static-'))
  mkdirSync(join(dir, 'pages'), { recursive: true })

  const fm = parseFrontmatter(readFileSync(specPath, 'utf8'), parseYaml)
  const fullModel = buildModel(fm, {})
  const model = { ...fullModel, pages: fullModel.pages.filter((p) => PAGE_IDS.includes(p.id)) }
  writeFileSync(join(dir, 'spec-model.json'), JSON.stringify(model, null, 2))

  buildDesignSystem(designValues(), dir)
  const copyReport = copyRuntimeAssets(dir)
  if (copyReport.errors && copyReport.errors.length) throw new Error(`copyRuntimeAssets failed: ${copyReport.errors.join('; ')}`)
  writeFileSync(join(dir, 'component-manifest.md'), '# Component Manifest\n\nentityList(Listing) · entityDetail(Listing) · entityForm(Listing)\n')

  const pageList = model.pages.map((p) => ({ id: p.id, title: p.title, domain: p.domain, description: p.description }))

  if (!mutate.skipPage) {
    writeFileSync(join(dir, 'pages', 'catalogue.html'), pageHtml('catalogue', 'Catalogue', mutate.catalogueExtra))
  }
  writeFileSync(join(dir, 'pages', 'listings-id.html'), pageHtml('listings-id', 'Listing detail', mutate.listingsExtra))

  writeFileSync(join(dir, 'index.html'), indexHtml(mutate.dropIndexLink ? pageList.filter((p) => p.id !== mutate.dropIndexLink) : pageList))

  // Wire real nav into every page — same helpers wire-nav.mjs's CLI uses.
  const navPageList = mutate.dropNavId ? pageList.filter((p) => p.id !== mutate.dropNavId) : pageList
  const indexPageList = mutate.dropIndexLink ? navPageList.filter((p) => p.id !== mutate.dropIndexLink) : navPageList
  const navBlockPages = navHtml(navPageList, model.nav_structure, './')
  const navBlockIndex = navHtml(indexPageList, model.nav_structure, 'pages/')
  for (const id of PAGE_IDS) {
    const p = join(dir, 'pages', `${id}.html`)
    try {
      const injected = injectNav(readFileSync(p, 'utf8'), navBlockPages)
      if (injected !== null) writeFileSync(p, injected)
    } catch { /* page intentionally missing (skipPage) */ }
  }
  const indexInjected = injectNav(readFileSync(join(dir, 'index.html'), 'utf8'), navBlockIndex)
  writeFileSync(join(dir, 'index.html'), indexInjected)
  writeFileSync(join(dir, 'js', 'navigation.js'), navigationJs(navPageList, model.nav_structure))

  writeFileSync(join(dir, 'design-brief.md'), mutate.briefMismatch ? DESIGN_BRIEF_MISMATCH : DESIGN_BRIEF_OK)

  return dir
}

function run(dir, extraArgs = []) {
  try {
    const stdout = execFileSync(process.execPath, [
      script, '--dir', dir, '--model', join(dir, 'spec-model.json'), ...extraArgs,
    ], { encoding: 'utf8' })
    return { code: 0, stdout }
  } catch (e) {
    return { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function report(dir) {
  return JSON.parse(readFileSync(join(dir, '_qa', 'report.json'), 'utf8'))
}

let dirs = []
function track(dir) { dirs.push(dir); return dir }

test('a clean, fully-conformant prototype passes with zero critical issues', () => {
  const dir = track(buildFixture())
  const res = run(dir)
  const rep = report(dir)
  assert.deepEqual(rep.critical, [], `expected zero criticals, got: ${JSON.stringify(rep.critical)}`)
  assert.equal(rep.passed, true)
  assert.equal(res.code, 0)
})

test('a missing page file is critical, naming the missing page', () => {
  const dir = track(buildFixture({ skipPage: true }))
  const res = run(dir)
  const rep = report(dir)
  assert.ok(rep.critical.some((c) => c.includes('MISSING PAGE: pages/catalogue.html')), JSON.stringify(rep.critical))
  assert.equal(res.code, 1)
})

test('index.html missing a link to one page id is critical', () => {
  const dir = track(buildFixture({ dropIndexLink: 'listings-id' }))
  const rep = (run(dir), report(dir))
  assert.ok(
    rep.critical.some((c) => /index\.html does not link to pages\/listings-id\.html/.test(c)),
    `expected an index-link critical, got: ${JSON.stringify(rep.critical)}`,
  )
})

test('navigation.js missing a page id is critical', () => {
  const dir = track(buildFixture({ dropNavId: 'listings-id' }))
  const rep = (run(dir), report(dir))
  assert.ok(
    rep.critical.some((c) => /navigation\.js does not list page id "listings-id"/.test(c)),
    `expected a navigation.js critical, got: ${JSON.stringify(rep.critical)}`,
  )
})

test('an inline <style> block is critical', () => {
  const dir = track(buildFixture({ catalogueExtra: { inlineStyle: true } }))
  const rep = (run(dir), report(dir))
  assert.ok(
    rep.critical.some((c) => c.includes('pages/catalogue.html') && /inline <style>/.test(c)),
    `expected an inline-style critical, got: ${JSON.stringify(rep.critical)}`,
  )
})

test('a leftover Lorem ipsum is a warning, not critical', () => {
  const dir = track(buildFixture({ catalogueExtra: { loremIpsum: true } }))
  const rep = (run(dir), report(dir))
  assert.ok(
    rep.warnings.some((w) => w.includes('pages/catalogue.html') && /Lorem ipsum/.test(w)),
    `expected a Lorem-ipsum warning, got: ${JSON.stringify(rep.warnings)}`,
  )
  assert.ok(
    !rep.critical.some((c) => /Lorem ipsum/.test(c)),
    `Lorem ipsum must never be critical, got: ${JSON.stringify(rep.critical)}`,
  )
})

test('a design-brief.md locked token not applied in tokens.css is critical', () => {
  const dir = track(buildFixture({ briefMismatch: true }))
  const rep = (run(dir), report(dir))
  assert.ok(
    rep.critical.some((c) => /tokens\.css: provided --primary #114477 not applied/.test(c)),
    `expected a locked-token critical, got: ${JSON.stringify(rep.critical)}`,
  )
})

test('bad usage (missing --dir) exits 2', () => {
  let code
  try {
    execFileSync(process.execPath, [script, '--model', '/tmp/does-not-matter.json'], { encoding: 'utf8' })
    code = 0
  } catch (e) {
    code = e.status
  }
  assert.equal(code, 2)
})

test('cleanup', () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})
