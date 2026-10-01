// Generic entity store + Alpine data factories — shared by every entity, every page.
// Persists to sessionStorage so create/edit/delete survive navigating to another page within the
// same browser session (a dev-panel "Reset data" action clears back to the seed).
;(function (global) {
  'use strict'

  const SEED = global.PROTOTYPE_SEED || {}
  const ROLES = global.PROTOTYPE_ROLES || []

  function storageKey(entity) { return `proto:${entity}` }

  function readPool(entity) {
    try {
      const raw = sessionStorage.getItem(storageKey(entity))
      if (raw) return JSON.parse(raw)
    } catch {}
    return JSON.parse(JSON.stringify(SEED[entity] || []))
  }

  function writePool(entity, items) {
    try { sessionStorage.setItem(storageKey(entity), JSON.stringify(items)) } catch {}
  }

  function randomId() {
    try { return global.crypto.randomUUID() } catch { return 'id-' + Math.random().toString(36).slice(2, 10) }
  }

  const ProtoStore = {
    all(entity) { return readPool(entity) },
    byId(entity, id) { return readPool(entity).find((item) => String(item.id) === String(id)) || null },
    create(entity, record) {
      const items = readPool(entity)
      const withId = { id: record.id || randomId(), ...record }
      items.unshift(withId)
      writePool(entity, items)
      return withId
    },
    update(entity, id, patch) {
      const items = readPool(entity)
      const idx = items.findIndex((item) => String(item.id) === String(id))
      if (idx === -1) return null
      items[idx] = Object.assign({}, items[idx], patch)
      writePool(entity, items)
      return items[idx]
    },
    remove(entity, id) {
      writePool(entity, readPool(entity).filter((item) => String(item.id) !== String(id)))
    },
    reset(entity) { try { sessionStorage.removeItem(storageKey(entity)) } catch {} },
    resetAll() { Object.keys(SEED).forEach((entity) => ProtoStore.reset(entity)) },
    currentId() {
      try { return new URLSearchParams(global.location.search).get('id') } catch { return null }
    },
    roles() { return ROLES },
  }

  global.ProtoStore = ProtoStore

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('alpine:init', () => {
      const Alpine = global.Alpine
      if (!Alpine) return

      Alpine.store('session', {
        role: (function () {
          try { return sessionStorage.getItem('proto:role') || (ROLES[0] || '') } catch { return ROLES[0] || '' }
        })(),
        roles: ROLES,
        setRole(role) {
          this.role = role
          try { sessionStorage.setItem('proto:role', role) } catch {}
        },
      })

      // ── list pages: x-data="entityList('EntityName')" ──────────────
      Alpine.data('entityList', (entity) => ({
        items: [],
        defaultItems: [],
        loading: false,
        error: null,
        filter: { search: '', status: '' },
        init() { this.reload() },
        get filteredItems() {
          const q = this.filter.search.trim().toLowerCase()
          return this.items.filter((it) => {
            const matchesSearch = !q || Object.values(it).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
            const matchesStatus = !this.filter.status || it.status === this.filter.status
            return matchesSearch && matchesStatus
          })
        },
        reload() {
          this.loading = true
          this.error = null
          setTimeout(() => {
            this.items = ProtoStore.all(entity)
            this.defaultItems = JSON.parse(JSON.stringify(this.items))
            this.loading = false
          }, 400)
        },
        remove(id) {
          ProtoStore.remove(entity, id)
          this.items = this.items.filter((it) => String(it.id) !== String(id))
        },
      }))

      // ── detail pages: x-data="entityDetail('EntityName')" — reads ?id= automatically ──
      Alpine.data('entityDetail', (entity) => ({
        item: null,
        loading: false,
        error: null,
        // The universal four-state markup (page-shell.md / qa-static.mjs's S1-S3) is
        // `x-show="!loading && !error && items.length === 0|>0"` on EVERY page, list or not — a
        // detail page has no list of its own, so alias the single `item` as a one-or-zero-length
        // array instead of requiring every detail/form page to hand-roll this getter itself.
        get items() { return this.item ? [this.item] : [] },
        init() { this.reload() },
        reload() {
          this.loading = true
          this.error = null
          setTimeout(() => {
            const id = ProtoStore.currentId()
            this.item = id ? ProtoStore.byId(entity, id) : null
            this.loading = false
            if (!this.item) this.error = 'Not found'
          }, 300)
        },
      }))

      // ── form pages: x-data="entityForm('EntityName')" — create when no ?id=, else edit ──
      Alpine.data('entityForm', (entity) => ({
        draft: {},
        errors: {},
        loading: false,
        error: null,
        init() {
          const id = ProtoStore.currentId()
          if (!id) return
          this.loading = true
          setTimeout(() => {
            this.draft = Object.assign({}, ProtoStore.byId(entity, id) || {})
            this.loading = false
          }, 300)
        },
        submit(form) {
          this.errors = {}
          if (form && !form.checkValidity()) {
            form.classList.add('was-validated')
            form.querySelectorAll('[required]').forEach((el) => {
              if (!el.value) this.errors[el.id] = 'This field is required'
            })
            return
          }
          const id = ProtoStore.currentId()
          if (id) ProtoStore.update(entity, id, this.draft)
          else ProtoStore.create(entity, this.draft)
          const notify = global.Alpine && global.Alpine.store('notification')
          if (notify) notify.success('Saved')
          this.reset(form)
        },
        reset(form) {
          this.draft = {}
          this.errors = {}
          if (form) form.classList.remove('was-validated')
        },
      }))
    })
  }
})(typeof window !== 'undefined' ? window : globalThis)
