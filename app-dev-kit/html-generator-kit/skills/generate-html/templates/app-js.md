# Template: app-js.md

**Superseded as a generation template** — `scripts/copy-runtime-assets.mjs` copies
`templates/runtime/app.js` to `{OUTPUT_DIR}/js/app.js` byte-for-byte now, and nothing reads this
`.md` file to produce output anymore. This file stays as a human-readable description of the
generated contract (the three global Alpine stores: `notification`, `modal`, `theme`) for anyone
reading a generated prototype's `js/app.js`. Source of truth is `templates/runtime/app.js` — this
file is a description of its contract, not the generator.

This file is generic — no entity-specific placeholders, no `⟨SLOT⟩`s, nothing for an agent to fill.

---

```javascript
// Global Alpine stores — loaded on every prototype page
document.addEventListener('alpine:init', () => {

  // ── Notification store ──────────────────────────────────────────────
  Alpine.store('notification', {
    items: [],

    show(message, type = 'success') {
      const id = Date.now()
      this.items.push({ id, message, type })
      setTimeout(() => this.dismiss(id), 3000)
    },

    dismiss(id) {
      this.items = this.items.filter(n => n.id !== id)
    },

    // Shorthand helpers
    success(msg) { this.show(msg, 'success') },
    error(msg)   { this.show(msg, 'error')   },
    warning(msg) { this.show(msg, 'warning') }
  })

  // ── Modal store ─────────────────────────────────────────────────────
  Alpine.store('modal', {
    _open: null,

    open(id)       { this._open = id },
    close()        { this._open = null },
    isOpen(id)     { return this._open === id },
    toggle(id)     { this._open = this._open === id ? null : id }
  })

  // ── Theme store ─────────────────────────────────────────────────────
  Alpine.store('theme', {
    isDark: localStorage.getItem('prototype-theme') === 'dark',

    init() {
      document.documentElement.classList.toggle('dark', this.isDark)
    },

    toggle() {
      this.isDark = !this.isDark
      localStorage.setItem('prototype-theme', this.isDark ? 'dark' : 'light')
      document.documentElement.classList.toggle('dark', this.isDark)
    }
  })

})

// Apply persisted theme before first paint
;(function () {
  const saved = localStorage.getItem('prototype-theme')
  if (saved === 'dark') document.documentElement.classList.add('dark')
})()
```

---

## Usage in pages

```html
<!-- Show a success toast -->
<button @click="$store.notification.success('Profile saved')">Save</button>

<!-- Open a confirmation modal -->
<button @click="$store.modal.open('confirm-delete-' + item.id)">Delete</button>

<!-- Modal dialog (use x-trap from @alpinejs/focus) -->
<div x-show="$store.modal.isOpen('confirm-delete-' + item.id)"
     role="dialog" aria-modal="true" aria-labelledby="modal-title"
     x-trap="$store.modal.isOpen('confirm-delete-' + item.id)"
     @keydown.escape="$store.modal.close()">
  <h2 id="modal-title">Confirm Delete</h2>
  <button @click="$store.modal.close()">Cancel</button>
  <button class="btn-destructive" @click="doDelete(item.id); $store.modal.close()">Delete</button>
</div>

<!-- Theme toggle -->
<button @click="$store.theme.toggle()" aria-label="Toggle dark mode">
  <span x-text="$store.theme.isDark ? '☀️' : '🌙'"></span>
</button>
```
