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
