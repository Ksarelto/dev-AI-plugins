// Tests for js/store.js's runtime logic, as shipped in templates/store-js.md (the fenced
// ```javascript code block). Runs the extracted code in a sandboxed `vm` context — no browser, no
// real Alpine — so we can exercise ProtoStore and the entityList/entityDetail/entityForm Alpine
// data factories directly.
//
// Run with: node --test skills/generate-html/scripts/store-runtime.test.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'
import crypto from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const templatePath = join(here, '..', 'templates', 'store-js.md')

function extractCode(markdown) {
  const match = markdown.match(/```javascript\n([\s\S]*?)```/)
  if (!match) throw new Error('store-js.md: no ```javascript code block found')
  return match[1]
}

const SOURCE = extractCode(readFileSync(templatePath, 'utf8'))

// Objects/arrays returned from the vm sandbox live in a different realm than this test file, so
// their Object/Array prototypes differ from ours even when structurally identical — deepStrictEqual
// (what assert.deepEqual resolves to under 'node:assert/strict') treats that as unequal. A
// JSON round-trip normalizes plain data into this realm before comparing.
const plain = (value) => JSON.parse(JSON.stringify(value))

// ── static regression assertion: no bare `$store` identifier anywhere in the source ──
// (the original bug: a bare `$store...` call inside an Alpine.data factory method throws, because
// outside a template expression the magic property is `this.$store`, not a free `$store`
// identifier). We allow `$store` only when immediately preceded by `.` (as in `global.Alpine`'s
// callback referencing `global.Alpine.store` is fine too, since that's a different pattern) — the
// simplest correct check is: there is no standalone `$store` token that isn't part of a property
// access chain off `this`/`global`/`Alpine`. We assert there is no raw, unqualified `$store` at all;
// the source reaches the store via `global.Alpine.store('notification')`, never `$store`.
test('static: source never references a bare $store identifier', () => {
  assert.doesNotMatch(SOURCE, /[^.]\$store\b/, 'found a bare $store reference — this is the original crash bug')
})

// ── sandbox builder ──
function makeSandbox({ seed = {}, roles = [], search = '' } = {}) {
  const storageMap = new Map()
  const sessionStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
  }

  const registeredData = {}
  const registeredStores = {}
  const storeInstances = {}

  const Alpine = {
    data(name, factory) { registeredData[name] = factory },
    store(name, def) {
      if (def !== undefined) {
        storeInstances[name] = def
        registeredStores[name] = def
      }
      return storeInstances[name]
    },
  }

  let alpineInitCb = null
  const document = {
    addEventListener(event, cb) {
      if (event === 'alpine:init') alpineInitCb = cb
    },
  }

  const sandbox = {
    PROTOTYPE_SEED: seed,
    PROTOTYPE_ROLES: roles,
    sessionStorage,
    document,
    location: { search },
    crypto: { randomUUID: () => crypto.randomUUID() },
    URLSearchParams,
    console,
  }
  sandbox.window = sandbox
  sandbox.Alpine = Alpine

  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox)

  // Fire alpine:init manually (document.addEventListener captured it above, but the IIFE also
  // calls document.addEventListener('alpine:init', ...) during its own run — make sure it ran).
  if (alpineInitCb) alpineInitCb()

  return { sandbox, Alpine, registeredData, storeInstances, storageMap }
}

// ── ProtoStore round-trips ──

test('ProtoStore.all/byId/create/update/remove round-trip through fake sessionStorage', () => {
  const seed = { Widget: [{ id: 'w1', name: 'Alpha' }, { id: 'w2', name: 'Beta' }] }
  const { sandbox } = makeSandbox({ seed })
  const ProtoStore = sandbox.ProtoStore

  assert.deepEqual(plain(ProtoStore.all('Widget').map((w) => w.id)), ['w1', 'w2'])
  assert.equal(ProtoStore.byId('Widget', 'w2').name, 'Beta')
  assert.equal(ProtoStore.byId('Widget', 'nope'), null)

  const created = ProtoStore.create('Widget', { name: 'Gamma' })
  assert.ok(created.id)
  assert.equal(ProtoStore.all('Widget').length, 3)
  assert.equal(ProtoStore.all('Widget')[0].name, 'Gamma', 'create unshifts to the front')

  const updated = ProtoStore.update('Widget', created.id, { name: 'Gamma Prime' })
  assert.equal(updated.name, 'Gamma Prime')
  assert.equal(ProtoStore.byId('Widget', created.id).name, 'Gamma Prime')

  ProtoStore.remove('Widget', 'w1')
  assert.equal(ProtoStore.all('Widget').length, 2)
  assert.equal(ProtoStore.byId('Widget', 'w1'), null)
})

test('ProtoStore.update returns null for an unknown id and does not alter the pool', () => {
  const seed = { Widget: [{ id: 'w1', name: 'Alpha' }] }
  const { sandbox } = makeSandbox({ seed })
  const ProtoStore = sandbox.ProtoStore
  const result = ProtoStore.update('Widget', 'ghost', { name: 'x' })
  assert.equal(result, null)
  assert.equal(ProtoStore.all('Widget').length, 1)
})

// ── reset / resetAll ──

test('ProtoStore.reset/resetAll restores the seed as a deep copy, not the same array reference', () => {
  const seed = { Widget: [{ id: 'w1', name: 'Alpha' }] }
  const { sandbox } = makeSandbox({ seed })
  const ProtoStore = sandbox.ProtoStore

  ProtoStore.create('Widget', { name: 'Extra' })
  assert.equal(ProtoStore.all('Widget').length, 2)

  ProtoStore.reset('Widget')
  const restored = ProtoStore.all('Widget')
  assert.equal(restored.length, 1)
  assert.equal(restored[0].name, 'Alpha')
  assert.notEqual(restored, seed.Widget, 'restored pool is a deep copy, not the same array reference')
  assert.notEqual(restored[0], seed.Widget[0], 'restored records are deep-copied, not shared references')

  // mutate the restored copy and ensure the seed itself is untouched
  restored[0].name = 'Mutated'
  assert.equal(seed.Widget[0].name, 'Alpha', 'mutating a read pool must never mutate PROTOTYPE_SEED')

  ProtoStore.create('Widget', { name: 'Another' })
  ProtoStore.resetAll()
  assert.equal(ProtoStore.all('Widget').length, 1)
  assert.equal(ProtoStore.all('Widget')[0].name, 'Alpha')
})

// ── currentId ──

test('ProtoStore.currentId reads ?id= from location.search', () => {
  const { sandbox: withId } = makeSandbox({ search: '?id=abc123&x=1' })
  assert.equal(withId.ProtoStore.currentId(), 'abc123')

  const { sandbox: withoutId } = makeSandbox({ search: '' })
  assert.equal(withoutId.ProtoStore.currentId(), null)
})

// ── entityForm: submit() reaches the notification store via Alpine.store(), never a bare $store ──

function fakeForm({ valid = true, requiredIds = [] } = {}) {
  const classes = new Set()
  return {
    checkValidity: () => valid,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      has: (c) => classes.has(c),
    },
    querySelectorAll: (selector) => {
      if (selector !== '[required]') return []
      return requiredIds.map((id) => ({ id, value: '' }))
    },
    _classes: classes,
  }
}

test('entityForm.submit(): valid form persists via ProtoStore.create and notifies via Alpine.store(...), not a bare $store', () => {
  const seed = { Widget: [] }
  const { sandbox, Alpine, registeredData } = makeSandbox({ seed })

  const notifyCalls = []
  Alpine.store('notification', { success: (msg) => notifyCalls.push(msg) })

  const factory = registeredData.entityForm
  assert.ok(factory, 'entityForm must be registered with Alpine.data')
  const instance = factory('Widget')
  instance.draft = { name: 'New Widget' }

  const form = fakeForm({ valid: true })
  instance.submit(form)

  assert.deepEqual(notifyCalls, ['Saved'], 'submit() must notify via Alpine.store(\'notification\').success(...)')
  assert.equal(sandbox.ProtoStore.all('Widget').length, 1)
  assert.equal(sandbox.ProtoStore.all('Widget')[0].name, 'New Widget')
  assert.deepEqual(plain(instance.draft), {}, 'reset() clears the draft after a successful submit')
})

test('entityForm.submit(): invalid form sets was-validated and per-field errors, without notifying or creating', () => {
  const seed = { Widget: [] }
  const { sandbox, Alpine, registeredData } = makeSandbox({ seed })

  const notifyCalls = []
  Alpine.store('notification', { success: (msg) => notifyCalls.push(msg) })

  const factory = registeredData.entityForm
  const instance = factory('Widget')
  instance.draft = { name: '' }

  const form = fakeForm({ valid: false, requiredIds: ['name', 'email'] })
  instance.submit(form)

  assert.ok(form._classes.has('was-validated'), 'invalid submit must add was-validated to the form')
  assert.deepEqual(plain(instance.errors), { name: 'This field is required', email: 'This field is required' })
  assert.equal(notifyCalls.length, 0, 'an invalid submit must never notify success')
  assert.equal(sandbox.ProtoStore.all('Widget').length, 0, 'an invalid submit must never create a record')
})

test('entityForm.submit(): with an existing ?id= it updates instead of creating', () => {
  const seed = { Widget: [{ id: 'w1', name: 'Old' }] }
  const { sandbox, Alpine, registeredData } = makeSandbox({ seed, search: '?id=w1' })
  Alpine.store('notification', { success: () => {} })

  const factory = registeredData.entityForm
  const instance = factory('Widget')
  instance.draft = { name: 'Updated' }
  instance.submit(fakeForm({ valid: true }))

  assert.equal(sandbox.ProtoStore.all('Widget').length, 1, 'update must not add a new record')
  assert.equal(sandbox.ProtoStore.byId('Widget', 'w1').name, 'Updated')
})

// ── entityList / entityDetail factories are registered too ──

test('entityList and entityDetail are registered as Alpine data factories', () => {
  const { registeredData } = makeSandbox({ seed: { Widget: [] } })
  assert.equal(typeof registeredData.entityList, 'function')
  assert.equal(typeof registeredData.entityDetail, 'function')
})
