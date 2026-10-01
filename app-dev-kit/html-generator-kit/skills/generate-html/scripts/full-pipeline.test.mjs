// Capstone test (Phase 11): chains EVERY deterministic script this kit's remediation (Phases 0-10)
// built, in the REAL build order, against one shared fixture — the thing no per-script unit test
// (spec-model.test.mjs, build-design-system.test.mjs, copy-runtime-assets.test.mjs, wire-nav.test.mjs,
// qa-static.test.mjs) or even verify-prototype.conformance.test.mjs proves on its own: that the
// field names and path conventions each phase's script agreed on actually still fit together when
// run back-to-back, end to end, against a prototype assembled almost entirely by the kit's own code:
//
//   buildModel() (spec-model.mjs's parser, against tests/fixtures/specs/spec-2x/spec.md)
//     -> design-values.json (hand-written, minimal, 1 signature block)
//     -> build-design-system.mjs (real CLI) -> css/*.css + design-system-ref.md
//     -> copy-runtime-assets.mjs (real CLI) -> js/app.js + js/store.js + js/vendor/*
//     -> [hand-written page bodies for 3 real screens — the one part no script can produce, since
//        page authorship is screen-generator's LLM job — using the ACTUAL generated js/store.js
//        API, the ACTUAL generated CSS classes, real nav markers, and Phase 5's traceability
//        attributes]
//     -> wire-nav.mjs (real CLI) -> js/navigation.js + nav injected into every page + index.html
//     -> qa-static.mjs (real CLI) -> must report 0 criticals
//     -> verify-prototype.mjs (real CLI, full dir, real browser, --model + --brief) -> must report
//        0 criticals
//
// The three screens (catalogue: list, listings-id: detail, requests-id: detail) were chosen so
// every interaction target among them resolves to a page that's actually in this fixture (catalogue
// -> listings-id -> requests-id) — a 2-page subset would leave one interaction's target file
// missing, which is a real "screen not built yet" case Station 4.5/6.5 already model separately
// (see pipeline-flow.md), not what this capstone is testing.
//
// This test is what surfaced a real integration bug: `entityDetail`/`entityForm` in
// templates/runtime/store.js never defined an `items` alias, but the four-state markup every page
// must carry (page-shell.md; enforced by qa-static.mjs's S1-S3, literally and on every page
// regardless of type) is `x-show="!loading && !error && items.length === 0|>0"` — a detail page has
// no list of its own. Fixed at the source (templates/runtime/store.js, mirrored in
// templates/store-js.md and references/alpine-interaction-patterns.md): `entityDetail` now exposes
// `get items() { return this.item ? [this.item] : [] }`, so the universal state convention a
// Phase-0 template assumed and the Phase-3/4 entity-store factories actually provide now agree,
// without every detail-page author having to know to add this getter by hand.
//
// Run with: node --test skills/generate-html/scripts/full-pipeline.test.mjs

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parse as parseYaml } from 'yaml'
import { buildModel, parseFrontmatter } from './lib/spec-model.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const buildDesignSystemScript = join(here, 'build-design-system.mjs')
const copyRuntimeAssetsScript = join(here, 'copy-runtime-assets.mjs')
const wireNavScript = join(here, 'wire-nav.mjs')
const qaStaticScript = join(here, 'qa-static.mjs')
const verifyScript = join(here, 'verify-prototype.mjs')
const specPath = join(here, '..', '..', '..', 'tests', 'fixtures', 'specs', 'spec-2x', 'spec.md')

const PAGE_IDS = ['catalogue', 'listings-id', 'requests-id']

// ── Station 1.5/2 stand-in: a hand-written design-values.json, as design-strategist +
// design-system-author would hand build-design-system.mjs — minimal but real, 1 signature block.
function designValues() {
  return {
    palette: { neutralHue: 240, neutralChroma: 0.01, primaryL: 0.55, primaryC: 0.15, primaryH: 165, accentH: 165 },
    radius: '0.625rem',
    shadowAlpha: 0.08,
    fonts: { body: "'Inter'", display: "'Space Grotesk'", import: '' },
    density: { controlPy: '0.6rem', controlPx: '1rem', cellPy: '0.9rem', cellPx: '1.15rem', cardPad: '1.35rem', mainPadY: '2.5rem', mainPadX: '3rem' },
    motion: { durFast: '140ms', durBase: '220ms', durSlow: '360ms', liftY: '-2px' },
    signatureBlocks: ['glass'],
    layout: 'sidebar',
    designDirection: {
      archetype: 'modern SaaS', mood: 'calm', paletteNote: 'cool neutral + teal accent',
      typeNote: 'Inter + Space Grotesk', densityLabel: 'comfortable', motionFeel: 'snappy',
      composition: ['list: search + table', 'detail: header + content'], voice: 'plain', emphasize: 'status',
    },
  }
}

const PAGE_HEAD = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Shelf Share</title>
  <link rel="stylesheet" href="../css/tokens.css">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/components.css">
  <script src="../js/store.js" defer></script>
  <script src="../js/app.js" defer></script>
  <script src="../js/navigation.js" defer></script>
  <script src="../js/vendor/alpine-focus.min.js" defer></script>
  <script src="../js/vendor/alpine.min.js" defer></script>
</head>`

const TOAST_BLOCK = `  <div class="toast-container" aria-live="polite">
    <template x-for="n in $store.notification.items" :key="n.id">
      <div class="alert" :class="n.type === 'error' ? 'alert-destructive' : (n.type === 'success' ? 'alert-success' : '')"
           x-text="n.message" role="status"></div>
    </template>
  </div>`

const SIDEBAR = (brand) => `    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="../index.html" class="sidebar-brand link">${brand}</a>
        <span class="badge badge-primary">prototype</span>
      </div>
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>`

// Every page's status-chip reference strip — always visible (not state-gated), so the
// spec-conformance entity_statuses check (which reads rendered, VISIBLE innerText) finds every
// value regardless of which of the four states the live data happens to be in.
const statusChips = (statuses) =>
  `        <div class="chip-row" aria-hidden="false">\n${statuses
    .map((s) => `          <span class="badge badge-default">${s[0]}${s.slice(1).toLowerCase()}</span>`)
    .join('\n')}\n        </div>`

const DEV_PANEL = `        <div class="dev-panel" role="toolbar" aria-label="Prototype controls">
          <span class="dev-panel-label">States:</span>
          <button class="btn-ghost btn-sm" @click="loading=true;error=null" title="Loading state" aria-label="Preview loading state">⏳</button>
          <button class="btn-ghost btn-sm" @click="items=[];loading=false;error=null" title="Empty state" aria-label="Preview empty state">📭</button>
          <button class="btn-ghost btn-sm" @click="error='Failed to load';loading=false" title="Error state" aria-label="Preview error state">❌</button>
          <button class="btn-ghost btn-sm" @click="loading=false;error=null" title="Success state" aria-label="Preview success state">✅</button>
          <button class="btn-ghost btn-sm" @click="ProtoStore.resetAll(); reload()" title="Reset data" aria-label="Reset all data">🔄</button>
        </div>`

const FOUR_STATES = (successBlock) => `
        <div x-show="loading" data-state-root="loading" role="status" aria-label="Loading">
          <div class="skeleton"></div>
        </div>
        <div x-show="!loading && error" data-state-root="error" class="alert alert-destructive" role="alert">
          <p x-text="error"></p>
          <button class="btn-secondary mt-2" @click="reload()">Retry</button>
        </div>
        <div x-show="!loading && !error && items.length === 0" data-state-root="empty" class="empty-state">
          <p class="empty-state-title">No items yet</p>
        </div>
        <div x-show="!loading && !error && items.length > 0" data-state-root="success">
${successBlock}
        </div>`

// ── catalogue.html (list; entityList('Listing')) ──────────────────────────────────────────────
function catalogueHtml(modelPage) {
  const success = `          <div class="table" role="grid" aria-label="Listings" data-component="CatalogueList">
            <div class="table-row" role="row">
              <div class="table-cell" role="columnheader" data-field="name">Name</div>
            </div>
            <template x-for="item in filteredItems" :key="item.id">
              <div class="table-row" role="row">
                <a class="table-cell" role="gridcell" href="./listings-id.html" :href="'./listings-id.html?id=' + item.id"
                   data-interaction="INT-001" data-field="name" x-text="item.name"></a>
                <span class="table-cell" role="gridcell" data-field="status" data-component="ListingStatusWord" x-text="item.displayStatus"></span>
              </div>
            </template>
          </div>`
  return `${PAGE_HEAD('Catalogue')}
<body x-data x-cloak>
  <div class="app">
${SIDEBAR('Shelf Share')}
    <main class="main" data-spec-screen="${modelPage.spec_id}" x-data="entityList('Listing')" x-init="init()">
      <div class="content">
        <div class="page-header">
          <h1 class="page-title">Catalogue</h1>
        </div>
        <input class="form-input" type="search" x-model="filter.search" placeholder="Search listings" data-component="CatalogueSearchField" aria-label="Search listings">
${statusChips(modelPage.entity_statuses)}
        <p x-show="$store.session.role === 'Manager'" class="badge badge-primary">Manager tools</p>
${FOUR_STATES(success)}
        <div x-show="!loading && !error && items.length === 0" class="empty-state" data-component="EmptyCatalogueInvitation">
          <p>No listings yet — be the first to add one.</p>
        </div>
${DEV_PANEL}
      </div>
    </main>
  </div>
${TOAST_BLOCK}
</body>
</html>`
}

// ── listings-id.html (detail; entityDetail('Listing')) ───────────────────────────────────────
function listingsIdHtml(modelPage) {
  const success = `          <div class="page-header">
            <h1 class="page-title" data-field="name" x-text="item?.name" data-component="ListingDetailHeader"></h1>
          </div>
          <p data-field="description" x-text="item?.description"></p>
          <p data-field="status" x-text="item?.status"></p>
          <div data-component="RequestThisItemForm">
            <p>Request this item from its lender.</p>
          </div>`
  return `${PAGE_HEAD('Listing detail')}
<body x-data x-cloak>
  <div class="app">
${SIDEBAR('Shelf Share')}
    <main class="main" data-spec-screen="${modelPage.spec_id}" x-data="entityDetail('Listing')" x-init="init()">
      <div class="content">
${statusChips(modelPage.entity_statuses)}
        <p x-show="$store.session.role === 'Manager'" class="badge badge-primary">Manager tools</p>
        <!-- Always visible (not state-gated): a detail page can legitimately load with no seed
             record in this fixture (no data.js here — that's component-library-author's job, out
             of this deterministic-script chain), so the interaction trigger itself must not live
             inside the success-only block or it would never be clickable in that case. -->
        <a class="btn-primary" href="./requests-id.html" data-interaction="INT-002"
           @click="$store.notification.success('Request sent')">Request this item</a>
${FOUR_STATES(success)}
        <button type="button" data-modal-open @click="$store.modal.open('retire-listing')" class="btn-destructive">Retire</button>
        <template x-if="$store.modal.isOpen('retire-listing')">
          <div class="modal-overlay" data-modal-close @click.self="$store.modal.close()">
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="retire-title" data-component="RetireListingConfirmModal">
              <h2 id="retire-title" class="modal-title">Retire this listing?</h2>
              <div class="modal-actions">
                <button class="btn-secondary" data-modal-close @click="$store.modal.close()">Cancel</button>
                <button class="btn-destructive" @click="$store.modal.close(); $store.notification.success('Retired')">Retire</button>
              </div>
            </div>
          </div>
        </template>
${DEV_PANEL}
      </div>
    </main>
  </div>
${TOAST_BLOCK}
</body>
</html>`
}

// ── requests-id.html (detail; entityDetail('BorrowRequest')) — no outgoing interactions ──────
function requestsIdHtml(modelPage) {
  const success = `          <div class="page-header">
            <h1 class="page-title" data-field="id" x-text="item ? ('Request ' + item.id) : ''" data-component="RequestReadback"></h1>
          </div>
          <p data-field="status" x-text="item?.status"></p>
          <div class="page-actions" data-component="AcceptDeclineActions">
            <button type="button" class="btn-primary" @click="$store.notification.success('Accepted')">Accept</button>
            <button type="button" class="btn-secondary" @click="$store.notification.info('Declined')">Decline</button>
          </div>
          <div class="page-actions" data-component="CancelRequestAction">
            <button type="button" class="btn-ghost" @click="$store.notification.info('Cancelled')">Cancel request</button>
          </div>
          <div class="page-actions" data-component="HandoffConfirmActions">
            <button type="button" class="btn-secondary" @click="$store.notification.success('Collect confirmed')">Confirm collect</button>
          </div>`
  return `${PAGE_HEAD('Request')}
<body x-data x-cloak>
  <div class="app">
${SIDEBAR('Shelf Share')}
    <main class="main" data-spec-screen="${modelPage.spec_id}" x-data="entityDetail('BorrowRequest')" x-init="init()">
      <div class="content">
${statusChips(modelPage.entity_statuses)}
        <p x-show="$store.session.role === 'Manager'" class="badge badge-primary">Manager tools</p>
${FOUR_STATES(success)}
${DEV_PANEL}
      </div>
    </main>
  </div>
${TOAST_BLOCK}
</body>
</html>`
}

function indexHtml(pageList) {
  const cards = pageList.map((p) => `        <a class="card" href="pages/${p.id}.html">
          <h2 class="card-title">${p.title}</h2>
          <p>${p.description}</p>
        </a>`).join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shelf Share — Prototype</title>
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <script src="js/app.js" defer></script>
  <script src="js/navigation.js" defer></script>
  <script src="js/vendor/alpine-focus.min.js" defer></script>
  <script src="js/vendor/alpine.min.js" defer></script>
</head>
<body x-data x-cloak>
  <div class="app">
${SIDEBAR('Shelf Share').replace(/href="\.\.\/index\.html"/, 'href="index.html"')}
    <main class="main">
      <div class="content">
        <h1 class="page-title">Shelf Share</h1>
        <div class="card-grid">
${cards}
        </div>
      </div>
    </main>
  </div>
</body>
</html>`
}

const DESIGN_BRIEF = `# Design Brief — Shelf Share

Direction: modern SaaS · sidebar layout · signature: glass. No binding reference for this fixture —
first-principles direction (no \`## Binding reference\` section, so verify-prototype's locked-token
check is inert here; design-values.json carries no \`lockedTokens\`).
`

// Builds the full prototype dir end to end, in the real build order, using only real scripts.
function buildFixture(dir) {
  mkdirSync(join(dir, 'pages'), { recursive: true })

  // Station 0 — spec-model.json (buildModel() directly, filtered to this fixture's 3 screens —
  // same filtering pattern qa-static.test.mjs/verify-prototype.conformance.test.mjs use).
  const fm = parseFrontmatter(readFileSync(specPath, 'utf8'), parseYaml)
  const fullModel = buildModel(fm, {})
  const model = {
    ...fullModel,
    pages: fullModel.pages.filter((p) => PAGE_IDS.includes(p.id)),
    nav_structure: Object.fromEntries(
      Object.entries(fullModel.nav_structure)
        .map(([domain, ids]) => [domain, ids.filter((id) => PAGE_IDS.includes(id))])
        .filter(([, ids]) => ids.length),
    ),
  }
  writeFileSync(join(dir, 'spec-model.json'), JSON.stringify(model, null, 2))
  assert.equal(model.pages.length, 3, 'fixture setup: expected exactly 3 pages in the filtered model')

  // Station 1.5/2 — design-values.json -> build-design-system.mjs (real CLI).
  writeFileSync(join(dir, 'design-values.json'), JSON.stringify(designValues(), null, 2))
  execFileSync(process.execPath, [
    buildDesignSystemScript, '--values', join(dir, 'design-values.json'), '--out', dir,
  ], { encoding: 'utf8' })

  // Station 3 — copy-runtime-assets.mjs (real CLI): js/app.js, js/store.js, js/vendor/*.
  const copyOut = execFileSync(process.execPath, [copyRuntimeAssetsScript, '--out', dir], { encoding: 'utf8' })
  assert.match(copyOut, /^OK:/, `copy-runtime-assets.mjs failed: ${copyOut}`)
  writeFileSync(join(dir, 'component-manifest.md'), '# Component Manifest\n\nentityList(Listing) · entityDetail(Listing) · entityDetail(BorrowRequest)\n')

  // Station 4 — hand-written pages (the one part no script can do).
  const byId = Object.fromEntries(model.pages.map((p) => [p.id, p]))
  writeFileSync(join(dir, 'pages', 'catalogue.html'), catalogueHtml(byId['catalogue']))
  writeFileSync(join(dir, 'pages', 'listings-id.html'), listingsIdHtml(byId['listings-id']))
  writeFileSync(join(dir, 'pages', 'requests-id.html'), requestsIdHtml(byId['requests-id']))

  const pageList = model.pages.map((p) => ({ id: p.id, title: p.title, domain: p.domain, description: p.description }))
  writeFileSync(join(dir, 'index.html'), indexHtml(pageList))

  // Station 5 — wire-nav.mjs (real CLI): writes js/navigation.js, injects nav into every page + index.
  writeFileSync(join(dir, 'pages.json'), JSON.stringify(pageList, null, 2))
  writeFileSync(join(dir, 'nav-structure.json'), JSON.stringify(model.nav_structure, null, 2))
  const wireOut = execFileSync(process.execPath, [
    wireNavScript, '--dir', dir, '--pages', join(dir, 'pages.json'), '--nav', join(dir, 'nav-structure.json'),
    '--title', 'Shelf Share', '--layout', 'sidebar',
  ], { encoding: 'utf8' })
  assert.match(wireOut, /^OK:/, `wire-nav.mjs failed: ${wireOut}`)

  writeFileSync(join(dir, 'design-brief.md'), DESIGN_BRIEF)

  return model
}

let dir
test('setup: build the full prototype from real scripts in real build order', () => {
  dir = mkdtempSync(join(tmpdir(), 'full-pipeline-'))
  buildFixture(dir)
})

test('qa-static.mjs (Station 6, real CLI): 0 criticals against the hand-assembled-but-real prototype', () => {
  let res
  try {
    execFileSync(process.execPath, [qaStaticScript, '--dir', dir, '--model', join(dir, 'spec-model.json')], { encoding: 'utf8' })
    res = { code: 0 }
  } catch (e) {
    res = { code: e.status, stdout: e.stdout, stderr: e.stderr }
  }
  const report = JSON.parse(readFileSync(join(dir, '_qa', 'report.json'), 'utf8'))
  assert.deepEqual(report.critical, [], `expected 0 qa-static criticals, got: ${JSON.stringify(report.critical, null, 2)}`)
  assert.equal(report.passed, true)
  assert.equal(res.code, 0)
})

test('verify-prototype.mjs (Station 6.5, real CLI, real browser, full assembled output): 0 criticals', () => {
  let res
  try {
    const stdout = execFileSync(process.execPath, [
      verifyScript, dir, '--port', '4877',
      '--model', join(dir, 'spec-model.json'),
      '--brief', join(dir, 'design-brief.md'),
    ], { encoding: 'utf8', timeout: 180_000 })
    res = { code: 0, stdout }
  } catch (e) {
    res = { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
  const report = JSON.parse(readFileSync(join(dir, '_verify', 'report.json'), 'utf8'))
  assert.equal(report.browser, true, 'this capstone requires a real browser run, not the static-only path')
  assert.deepEqual(report.critical, [], `expected 0 verify-prototype criticals, got: ${JSON.stringify(report.critical, null, 2)}`)
  assert.equal(res.code, 0)
})

test('cleanup', () => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})
