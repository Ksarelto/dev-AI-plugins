// Tests for the Phase 6 additions to verify-prototype.mjs: spec-conformance (--model), the
// locked-token check (--brief), the form false-pass fix, multi-form/multi-modal coverage, dead-
// button detection, and mobile overflow.
//
// Unlike verify-prototype.test.mjs (which forces VERIFY_SKIP_BROWSER for its static-gate tests),
// every test here needs a REAL browser — these are exactly the checks that only a render can prove.
// The fixture is assembled almost entirely from this kit's own deterministic scripts
// (spec-model.mjs's buildModel against tests/fixtures/specs/spec-2x/spec.md, buildDesignSystem,
// copyRuntimeAssets, wire-nav's navHtml/injectNav/navigationJs) plus a handful of hand-written page
// bodies that carry the Phase 5 traceability attributes — one clean, one deliberately missing a
// data-component the spec names, one deliberately pointing an interaction at the wrong target, and
// one deliberately "blocked" only by bare HTML5 :invalid with no app-level signal.
//
// Run with: node --test skills/generate-html/scripts/verify-prototype.conformance.test.mjs

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
const script = join(here, 'verify-prototype.mjs')
const specPath = join(here, '..', '..', '..', 'tests', 'fixtures', 'specs', 'spec-2x', 'spec.md')

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

const TOAST_BLOCK = `  <div class="toast-container" aria-live="polite">
    <template x-for="n in $store.notification.items" :key="n.id">
      <div class="alert" :class="n.type === 'error' ? 'alert-destructive' : (n.type === 'success' ? 'alert-success' : '')"
           x-text="n.message" role="status"></div>
    </template>
  </div>`

// catalogue.html — CONFORMANT: every data-spec-screen/data-component/data-interaction/data-field
// the model names is present, the interaction target is correct, the status enum is rendered, and
// the role-gated screen references $store.session.role. Also carries one genuinely dead button.
function catalogueHtml() {
  return `${PAGE_HEAD('Catalogue')}
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header"><a href="../index.html" class="sidebar-brand link">Shelf Share</a></div>
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>
    <main class="main" data-spec-screen="SCR-001" x-data="{}">
      <div class="content">
        <input class="form-input" type="search" placeholder="Search listings" data-component="CatalogueSearchField">
        <div class="table" data-component="CatalogueList">
          <div class="table-row">
            <a href="./listings-id.html" data-interaction="INT-001" data-field="name">Cordless drill</a>
            <span data-field="lenderId">resident-4b</span>
            <span data-field="description">18V drill with two batteries</span>
            <span data-field="longestBorrowLength">ONE_WEEK</span>
            <span data-field="status" class="badge badge-free" data-component="ListingStatusWord">Free</span>
          </div>
        </div>
        <div class="empty-state" data-component="EmptyCatalogueInvitation" style="display:none">
          <p>No listings yet</p>
        </div>
        <p x-show="$store.session && $store.session.role === 'Manager'">Manager tools</p>
        <p class="badge badge-paused">Paused</p>
        <p class="badge badge-retired">Retired</p>
        <button type="button" class="btn-ghost">Export CSV</button>
      </div>
    </main>
  </div>
${TOAST_BLOCK}
</body>
</html>`
}

// listings-id.html — NEGATIVE cases: omits data-component for "ListingDetailHeader" (a named spec
// component that was never built), and INT-002 (should land on pages/requests-id.html) instead
// points at catalogue.html (wrong target). Also carries the real modal (positive modal-flow case)
// and a wide, non-clipped element that forces real horizontal overflow at the 390px viewport.
function listingsIdHtml() {
  return `${PAGE_HEAD('Listing detail')}
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header"><a href="../index.html" class="sidebar-brand link">Shelf Share</a></div>
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>
    <main class="main" data-spec-screen="SCR-003" x-data="{}">
      <div class="content">
        <!-- ListingDetailHeader intentionally has NO data-component attribute — negative case -->
        <div class="page-header"><h1 class="page-title" data-field="name">Cordless drill</h1></div>
        <div data-component="RequestThisItemForm" data-field="collectFrom" data-field-returnBy="returnBy">
          <p>Request this item</p>
        </div>
        <a href="./catalogue.html" data-interaction="INT-002">Wrongly routed action</a>

        <button type="button" data-modal-open @click="$store.modal.open('retire-listing')" class="btn-destructive">Retire</button>
        <template x-if="$store.modal.isOpen('retire-listing')">
          <div class="modal-overlay" data-modal-close @click.self="$store.modal.close()">
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="retire-title" data-component="RetireListingConfirmModal">
              <h2 id="retire-title" class="modal-title">Retire this listing?</h2>
              <div class="modal-actions">
                <button class="btn-secondary" data-modal-close @click="$store.modal.close()">Cancel</button>
                <button class="btn-destructive" @click="$store.modal.close()">Retire</button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
  <!-- outside .main (which has overflow:auto and would otherwise contain this) — forces a REAL
       document-level horizontal scroll at the 390px mobile viewport, the thing being tested -->
  <div style="width: 900px; height: 10px;">forces horizontal overflow at the 390px viewport</div>
${TOAST_BLOCK}
</body>
</html>`
}

// listings-new.html — form coverage: form#1 is the REAL entityForm('Listing') flow (blocked →
// filled → success), form#2 is a plain native form with no app-level wiring at all — :invalid by
// HTML5 alone, with no .form-error / was-validated — proving the false-pass fix actually fails it.
function listingsNewHtml() {
  return `${PAGE_HEAD('List an item')}
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header"><a href="../index.html" class="sidebar-brand link">Shelf Share</a></div>
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>
    <main class="main" data-spec-screen="SCR-002" x-data="entityForm('Listing')" x-init="init()">
      <div class="content">
        <form data-component="ListingCreateForm" @submit.prevent="submit($el)" novalidate>
          <div class="form-field">
            <label class="form-label" for="name">Name</label>
            <input id="name" class="form-input" x-model="draft.name" required data-field="name" aria-describedby="name-err">
            <p class="form-error" id="name-err" x-show="errors.name" x-text="errors.name"></p>
          </div>
          <div class="form-field">
            <label class="form-label" for="description">Description</label>
            <textarea id="description" class="form-input" x-model="draft.description" required data-field="description"></textarea>
            <p class="form-error" x-show="errors.description" x-text="errors.description"></p>
          </div>
          <div class="form-field">
            <label class="form-label" for="longestBorrowLength">Longest borrow length</label>
            <select id="longestBorrowLength" class="form-input" x-model="draft.longestBorrowLength" required data-field="longestBorrowLength">
              <option value="">Choose…</option>
              <option value="SAME_DAY">Same day</option>
              <option value="ONE_NIGHT">One night</option>
              <option value="ONE_WEEK">One week</option>
            </select>
          </div>
          <div class="page-actions">
            <button type="submit" class="btn-primary">List item</button>
          </div>
        </form>

        <!-- form#2: deliberately bare-native-:invalid-only, no .form-error, no was-validated -->
        <form class="mt-4">
          <div class="form-field">
            <label class="form-label" for="reason">Reason (unwired form)</label>
            <input id="reason" class="form-input" required>
          </div>
          <button type="submit" class="btn-secondary">Submit (unwired)</button>
        </form>
      </div>
    </main>
  </div>
${TOAST_BLOCK}
</body>
</html>`
}

function indexHtml() {
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
  <script src="js/vendor/alpine-focus.min.js" defer></script>
  <script src="js/vendor/alpine.min.js" defer></script>
</head>
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header"><span class="sidebar-brand">Shelf Share</span></div>
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>
    <main class="main">
      <div class="content"><h1 class="page-title">Shelf Share</h1></div>
    </main>
  </div>
</body>
</html>`
}

// Builds a full prototype dir: spec-model.json (real buildModel), css/* (real buildDesignSystem),
// js/app.js + js/store.js + js/vendor/* (real copyRuntimeAssets), nav wired into every page (real
// wire-nav helpers), index.html + three hand-written pages carrying the fixtures above.
function buildFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'verify-conformance-'))
  mkdirSync(join(dir, 'pages'), { recursive: true })

  const fm = parseFrontmatter(readFileSync(specPath, 'utf8'), parseYaml)
  const model = buildModel(fm, {})
  writeFileSync(join(dir, 'spec-model.json'), JSON.stringify(model, null, 2))

  buildDesignSystem(designValues(), dir)
  const copyReport = copyRuntimeAssets(dir)
  if (copyReport.errors && copyReport.errors.length) throw new Error(`copyRuntimeAssets failed: ${copyReport.errors.join('; ')}`)

  writeFileSync(join(dir, 'index.html'), indexHtml())
  writeFileSync(join(dir, 'pages', 'catalogue.html'), catalogueHtml())
  writeFileSync(join(dir, 'pages', 'listings-id.html'), listingsIdHtml())
  writeFileSync(join(dir, 'pages', 'listings-new.html'), listingsNewHtml())

  // Wire real nav into every page — exercises the same helpers wire-nav.mjs's CLI uses.
  const pagesList = model.pages.filter((p) => ['catalogue', 'listings-id', 'listings-new'].includes(p.id))
  const navBlockPages = navHtml(pagesList, model.nav_structure, './')
  const navBlockIndex = navHtml(pagesList, model.nav_structure, 'pages/')
  for (const id of ['catalogue', 'listings-id', 'listings-new']) {
    const p = join(dir, 'pages', `${id}.html`)
    const injected = injectNav(readFileSync(p, 'utf8'), navBlockPages)
    if (injected === null) throw new Error(`${id}.html: no nav marker pair`)
    writeFileSync(p, injected)
  }
  const indexInjected = injectNav(readFileSync(join(dir, 'index.html'), 'utf8'), navBlockIndex)
  writeFileSync(join(dir, 'index.html'), indexInjected)
  writeFileSync(join(dir, 'js', 'navigation.js'), navigationJs(pagesList, model.nav_structure))

  // A tiny design-brief.md with one Binding reference row that does NOT match what
  // buildDesignSystem actually wrote to tokens.css (#0A3D62) — forces the locked-token mismatch.
  writeFileSync(join(dir, 'design-brief.md'), `# Design Brief — Shelf Share

## Binding reference
- Sources read: test fixture

| Attribute | Provided | Source | Applied as |
|-----------|----------|--------|------------|
| Primary colour | \`#114477\` | fixture | \`--primary: #114477\` |
`)

  return dir
}

function run(dir, port) {
  try {
    const stdout = execFileSync(process.execPath, [
      script, dir, '--port', String(port),
      '--model', join(dir, 'spec-model.json'),
      '--brief', join(dir, 'design-brief.md'),
    ], { encoding: 'utf8', timeout: 180_000 })
    return { code: 0, stdout }
  } catch (e) {
    return { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function report(dir) {
  return JSON.parse(readFileSync(join(dir, '_verify', 'report.json'), 'utf8'))
}

// One shared fixture + one verify run for every assertion below — a real browser run is expensive,
// so every spec-conformance / form / modal / dead-button / overflow / locked-token assertion rides
// the same single invocation instead of paying for its own prototype + browser launch.
let dir, rep;
test('build fixture and run verify-prototype.mjs once', () => {
  dir = buildFixture()
  run(dir, 4812)
  rep = report(dir)
  assert.equal(rep.browser, true, 'this suite requires a real browser run, not the static-only path')
})

test('a conformant page (catalogue) has zero spec-conformance criticals', () => {
  const mine = rep.critical.filter((c) => c.startsWith('pages/catalogue.html:') && c.includes('spec-conformance'));
  assert.deepEqual(mine, [])
  const entry = rep.conformance.find((c) => c.page === 'pages/catalogue.html')
  assert.ok(entry, 'catalogue.html should have a conformance entry')
  assert.deepEqual(entry.missing_components, [])
  assert.deepEqual(entry.missing_interactions, [])
  assert.deepEqual(entry.wrong_targets, [])
})

test('a missing data-component for a named spec component is reported critical, naming the component', () => {
  const hit = rep.critical.find((c) => c.includes('pages/listings-id.html') && c.includes('ListingDetailHeader'))
  assert.ok(hit, `expected a critical naming ListingDetailHeader, got: ${JSON.stringify(rep.critical)}`)
  const entry = rep.conformance.find((c) => c.page === 'pages/listings-id.html')
  assert.ok(entry.missing_components.includes('ListingDetailHeader'))
})

test('an interaction whose target lands on the wrong page is reported critical', () => {
  const entry = rep.conformance.find((c) => c.page === 'pages/listings-id.html')
  assert.ok(entry.wrong_targets.some((w) => w.interaction === 'INT-002' && w.expected === 'requests-id'))
  assert.ok(
    rep.critical.some((c) => c.includes('INT-002') && /should land on pages\/requests-id\.html but landed on/.test(c)),
    `expected a wrong-target critical, got: ${JSON.stringify(rep.critical)}`
  )
})

test('empty-submit-blocked no longer passes on bare :invalid with no .form-error/was-validated', () => {
  assert.ok(
    rep.critical.some((c) => c.includes('pages/listings-new.html') && /empty.*not blocked/.test(c)),
    `expected the unwired form#2 to fail as "not blocked", got: ${JSON.stringify(rep.critical)}`
  )
  const failFlow = rep.flows.find((f) => f.page === 'pages/listings-new.html' && f.status === 'fail' && /form/.test(f.name))
  assert.ok(failFlow, 'expected a failing form flow entry')
})

test('a second form on a page is actually checked (not skipped)', () => {
  const formFlows = rep.flows.filter((f) => f.page === 'pages/listings-new.html' && /^form/.test(f.name))
  assert.ok(formFlows.length >= 2, `expected at least 2 form flow entries, got: ${JSON.stringify(formFlows)}`)
})

test('the real entityForm flow (form#1) validates and succeeds', () => {
  const passFlow = rep.flows.find((f) => f.page === 'pages/listings-new.html' && f.status === 'pass' && /^form/.test(f.name))
  assert.ok(passFlow, `expected one passing form flow, got: ${JSON.stringify(rep.flows.filter((f) => f.page === 'pages/listings-new.html'))}`)
})

test('the modal on listings-id opens and closes', () => {
  const modalFlow = rep.flows.find((f) => f.page === 'pages/listings-id.html' && /modal/.test(f.name))
  assert.ok(modalFlow, 'expected a modal flow entry for listings-id.html')
  assert.equal(modalFlow.status, 'pass')
})

test('a dead button (no handler, not submit, not modal trigger) is flagged as a warning', () => {
  assert.ok(
    rep.warnings.some((w) => w.includes('pages/catalogue.html') && /dead button/.test(w)),
    `expected a dead-button warning, got: ${JSON.stringify(rep.warnings)}`
  )
})

test('horizontal overflow at 390px is flagged critical', () => {
  assert.ok(
    rep.critical.some((c) => c.includes('pages/listings-id.html') && /horizontal overflow/.test(c)),
    `expected a horizontal-overflow critical, got: ${JSON.stringify(rep.critical)}`
  )
})

test('a locked-token mismatch is flagged critical', () => {
  assert.ok(
    rep.critical.some((c) => /locked --primary computed as/.test(c)),
    `expected a locked-token critical, got: ${JSON.stringify(rep.critical)}`
  )
})

test('cleanup', () => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})
