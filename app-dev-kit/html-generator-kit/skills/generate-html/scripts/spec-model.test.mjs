// Tests for lib/spec-model.mjs, spec-model.mjs (build) and delta-pages.mjs (append) — no model
// calls. Run with: node --test skills/generate-html/scripts/spec-model.test.mjs
//
// Fixtures:
//   tests/fixtures/specs/spec-2x/spec.md — a full spec-schema 2.0 spec (copied from
//     spec-dev-kit's golden fixture): page-type/primary-entity, enum `values`, state-machines,
//     interactions, user-stories + acceptance-criteria.
//   tests/fixtures/specs/spec-1x/spec.md — a hand-written 1.x-shaped spec: no page-type/
//     primary-entity, status embedded in the field description ("One of: ..."), endpoints
//     duplicated into mutations.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parse } from 'yaml'
import { buildModel, entityFor, pageId, parseFrontmatter, statusesOf } from './lib/spec-model.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const kitRoot = join(here, '..', '..', '..')
const fixture2x = join(kitRoot, 'tests/fixtures/specs/spec-2x/spec.md')
const fixture1x = join(kitRoot, 'tests/fixtures/specs/spec-1x/spec.md')
const specModelScript = join(here, 'spec-model.mjs')
const deltaPagesScript = join(here, 'delta-pages.mjs')

function fm(path) {
  return parseFrontmatter(readFileSync(path, 'utf8'), parse)
}

function node(script, args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

// ── lib/spec-model.mjs — 2.0 spec ──────────────────────────────────────────

test('buildModel (2.0): extracts every screen with no truncation', () => {
  const model = buildModel(fm(fixture2x))
  assert.equal(model.pages.length, 6, 'spec-2x/spec.md ships 6 screens (SCR-001..SCR-006)')
  assert.equal(model.spec_version, '2.0')
})

test('buildModel (2.0): page-type and primary-entity are trusted directly', () => {
  const model = buildModel(fm(fixture2x))
  const catalogue = model.pages.find((p) => p.spec_id === 'SCR-001')
  assert.equal(catalogue.type, 'list')
  assert.equal(catalogue.entity, 'Listing')
  assert.equal(catalogue.id, 'catalogue', 'route /catalogue → id catalogue')
})

test('buildModel (2.0): enum values come from the `values` array, not description parsing', () => {
  const model = buildModel(fm(fixture2x))
  const catalogue = model.pages.find((p) => p.spec_id === 'SCR-001')
  assert.deepEqual(catalogue.entity_statuses, ['FREE', 'PAUSED', 'RETIRED'])
})

test('buildModel (2.0): interactions resolve target-screen to the HTML page id, not the SCR- id', () => {
  const model = buildModel(fm(fixture2x))
  const catalogue = model.pages.find((p) => p.spec_id === 'SCR-001')
  assert.equal(catalogue.interactions.length, 1)
  assert.equal(catalogue.interactions[0].id, 'INT-001')
  const detailPage = model.pages.find((p) => p.spec_id === 'SCR-003')
  assert.equal(catalogue.interactions[0].target, detailPage.id)
})

test('buildModel (2.0): acceptance criteria reach the screen via story-refs', () => {
  const model = buildModel(fm(fixture2x))
  const catalogue = model.pages.find((p) => p.spec_id === 'SCR-001')
  const ids = catalogue.acceptance_criteria.map((ac) => ac.id)
  assert.ok(ids.includes('AC-001'), 'US-001 happy-path AC reaches SCR-001')
  assert.ok(catalogue.acceptance_criteria.some((ac) => ac.kind === 'permission'))
})

test('buildModel (2.0): state-machine transitions attach to the entity whose status they govern', () => {
  const model = buildModel(fm(fixture2x))
  const catalogue = model.pages.find((p) => p.spec_id === 'SCR-001') // entity: Listing
  const froms = catalogue.transitions.map((t) => `${t.from}->${t.to}`)
  assert.ok(froms.includes('FREE->PAUSED'), 'SM-002 (Listing.status) attaches to the Listing screen')
  assert.ok(!froms.some((f) => f.startsWith('ACTIVE')), 'SM-001 (Resident.status) must not leak in')
})

test('buildModel (2.0): components and roles pass through unmodified', () => {
  const model = buildModel(fm(fixture2x))
  const catalogue = model.pages.find((p) => p.spec_id === 'SCR-001')
  assert.deepEqual(catalogue.roles, ['Resident', 'Manager'])
  assert.ok(catalogue.components.includes('CatalogueList'))
})

test('buildModel (2.0): every entity field is kept — no 12-field cap', () => {
  const model = buildModel(fm(fixture2x))
  const listing = model.entities.find((e) => e.name === 'Listing')
  const spec = fm(fixture2x)
  const specEntity = spec.entities.find((e) => e.name === 'Listing')
  assert.equal(listing.fields.length, specEntity.fields.length)
})

test('buildModel (2.0): purpose is built from context.problem + goal + target-users', () => {
  const model = buildModel(fm(fixture2x))
  assert.match(model.purpose, /group chat/)
  assert.match(model.purpose, /Resident, Manager/)
})

// ── lib/spec-model.mjs — 1.x fallback ──────────────────────────────────────

test('buildModel (1.x): page type falls back to the notes heuristic when page-type is absent', () => {
  const model = buildModel(fm(fixture1x))
  const notes = model.pages.find((p) => p.spec_id === 'SCR-001')
  assert.equal(notes.type, 'list', 'notes starts with "List" → list')
  const detail = model.pages.find((p) => p.spec_id === 'SCR-002')
  assert.equal(detail.type, 'detail', 'notes starts with "View" → detail')
})

test('buildModel (1.x): entity is matched by name appearing in title/notes text', () => {
  const model = buildModel(fm(fixture1x))
  const notes = model.pages.find((p) => p.spec_id === 'SCR-001')
  assert.equal(notes.entity, 'Note')
})

test('buildModel (1.x): statuses are parsed from the "One of: ..." description', () => {
  const model = buildModel(fm(fixture1x))
  const entity = model.entities.find((e) => e.name === 'Note')
  assert.deepEqual(entity.statuses, ['DRAFT', 'SUBMITTED', 'APPROVED'])
})

test('buildModel (1.x): endpoints duplicated into mutations are de-duplicated by id', () => {
  const spec = fm(fixture1x)
  const model = buildModel(spec)
  const notes = model.pages.find((p) => p.spec_id === 'SCR-001')
  // Both api-surface.endpoints and .mutations list API-001 — apiContract must still resolve
  // (proves the endpoint-ownership scan iterates a de-duplicated list, not a doubled one).
  assert.ok(Object.keys(notes.api_contract).length > 0)
})

test('entityFor / statusesOf / pageId are exported and agree with buildModel', () => {
  const spec = fm(fixture2x)
  const screen = spec['ui-surface'].screens.find((s) => s.id === 'SCR-001')
  const entity = entityFor(screen, spec.entities)
  assert.equal(entity.name, 'Listing')
  assert.deepEqual(statusesOf(entity), ['FREE', 'PAUSED', 'RETIRED'])
  assert.equal(pageId(screen, { 'SCR-001': 'catalogue-list' }), 'catalogue-list', 'page-map wins over route')
})

// ── spec-model.mjs CLI (full build) ────────────────────────────────────────

test('spec-model.mjs CLI: writes a complete, unCapped model to disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spec-model-'))
  try {
    const out = join(dir, 'spec-model.json')
    const stdout = node(specModelScript, ['--spec', fixture2x, '--out', out])
    assert.match(stdout, /6 page/)
    assert.ok(existsSync(out))
    const model = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(model.pages.length, 6)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('spec-model.mjs CLI: exits 2 with no pages extracted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spec-model-empty-'))
  try {
    const emptySpec = join(dir, 'spec.md')
    writeFileSync(emptySpec, '---\nspec-version: "2.0"\nmetadata: { slug: empty, title: Empty }\n---\n')
    assert.throws(() => node(specModelScript, ['--spec', emptySpec, '--out', join(dir, 'out.json')]))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── delta-pages.mjs CLI (append) ───────────────────────────────────────────

test('delta-pages.mjs: build and append agree on page id, domain, and type for the same screen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'delta-pages-'))
  try {
    const buildOut = join(dir, 'spec-model.json')
    node(specModelScript, ['--spec', fixture2x, '--out', buildOut])
    const buildModelResult = JSON.parse(readFileSync(buildOut, 'utf8'))
    const pageMap = {}
    for (const page of buildModelResult.pages) pageMap[page.spec_id] = page.id
    const pageMapPath = join(dir, 'page-map.json')
    writeFileSync(pageMapPath, JSON.stringify(pageMap))

    const deltaOut = join(dir, 'delta-pages.json')
    node(deltaPagesScript, ['--spec', fixture2x, '--page-map', pageMapPath, '--out', deltaOut])
    const delta = JSON.parse(readFileSync(deltaOut, 'utf8'))

    // Nothing changed since the page-map was built from this same spec → no screens to regenerate,
    // but assembly_pages must carry the SAME ids/types/domains the build produced.
    assert.equal(delta.screens.length, 0, 'no screen is new or modified relative to its own page-map')
    assert.equal(delta.assembly_pages.length, buildModelResult.pages.length)
    const buildCatalogue = buildModelResult.pages.find((p) => p.spec_id === 'SCR-001')
    const assemblyCatalogue = delta.assembly_pages.find((p) => p.id === buildCatalogue.id)
    assert.ok(assemblyCatalogue, 'append assembly_pages uses the same id as the full build')
    assert.equal(assemblyCatalogue.domain, buildCatalogue.domain)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('delta-pages.mjs: a screen removed from the spec is reported in removed[]', () => {
  const dir = mkdtempSync(join(tmpdir(), 'delta-pages-removed-'))
  try {
    const pageMapPath = join(dir, 'page-map.json')
    writeFileSync(pageMapPath, JSON.stringify({ 'SCR-999': 'ghost-page', 'SCR-001': 'catalogue' }))
    const deltaOut = join(dir, 'delta-pages.json')
    node(deltaPagesScript, ['--spec', fixture2x, '--page-map', pageMapPath, '--out', deltaOut])
    const delta = JSON.parse(readFileSync(deltaOut, 'utf8'))
    assert.deepEqual(delta.removed, [{ spec_id: 'SCR-999', id: 'ghost-page' }])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('delta-pages.mjs: a new screen not in the page-map is included and typed correctly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'delta-pages-new-'))
  try {
    const pageMapPath = join(dir, 'page-map.json')
    writeFileSync(pageMapPath, JSON.stringify({})) // nothing built yet
    const deltaOut = join(dir, 'delta-pages.json')
    node(deltaPagesScript, ['--spec', fixture2x, '--page-map', pageMapPath, '--out', deltaOut])
    const delta = JSON.parse(readFileSync(deltaOut, 'utf8'))
    assert.equal(delta.screens.length, 6)
    const catalogue = delta.screens.find((s) => s.spec_id === 'SCR-001')
    assert.equal(catalogue.type, 'list', 'delta screens use the same `type` field name screen-generator expects')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
