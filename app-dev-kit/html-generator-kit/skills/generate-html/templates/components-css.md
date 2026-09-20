# Template: components-css.md

Shared pattern classes + a small utility layer for `css/components.css`. **CDN-free** — this file
replaces Tailwind entirely. Every class the page/index templates reference is defined here.

## Mostly stable, but two brief-driven parts

Copy this file into `{OUTPUT_DIR}/css/components.css` **with two adjustments from `design-brief.md`:**

1. **Density**: padding/spacing come from the `--control-*`, `--cell-*`, `--card-pad`, `--main-pad-*`
   tokens (defined in tokens.css from the brief). They are already wired below — do not hardcode
   over them.
2. **Layout archetype**: keep the `LAYOUT — SIDEBAR` block if the brief chose `sidebar`; if it chose
   `top-nav`, ALSO keep the `LAYOUT — TOP-NAV` block (both are harmless to include — the shell markup
   picks one). Never delete a layout block the shell might reference.

Everything else is structural and stays as-is. Class vocabulary is authoritative: templates,
screen-generator and assembly-wiring must use ONLY these class names (no Tailwind utilities, no
slashed/colon class names).

---

```css
/* ══════════════════════════════════════════════════════════════
   LAYOUT — SIDEBAR (keep when brief archetype = sidebar)
   ══════════════════════════════════════════════════════════════ */
.app { display: flex; min-height: 100vh; }

.sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border-right: 1px solid var(--border);
}
.sidebar-header {
  padding: 1.25rem 1.25rem 1rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.sidebar-brand { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; letter-spacing: -0.02em; }
.sidebar-nav { flex: 1; overflow-y: auto; padding: 0.75rem; }

.main {
  flex: 1;
  min-width: 0;
  padding: var(--main-pad-y) var(--main-pad-x);
  overflow: auto;
}
.content { max-width: var(--content-max); margin: 0 auto; }

/* ══════════════════════════════════════════════════════════════
   LAYOUT — TOP-NAV (keep when brief archetype = top-nav)
   Shell: <div class="app app-topnav"><header class="topnav">…</header><main class="main">…</main></div>
   ══════════════════════════════════════════════════════════════ */
.app-topnav { display: block; }
.topnav {
  position: sticky;
  top: 0;
  z-index: 50;
  height: var(--topnav-height);
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0 var(--main-pad-x);
  background: var(--card);
  border-bottom: 1px solid var(--border);
}
.topnav .sidebar-brand { margin-right: 0.5rem; }
.topnav .sidebar-nav { display: flex; flex: 0 1 auto; gap: 0.25rem; padding: 0; overflow: visible; }
.topnav .nav-group { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 0; }
.topnav .nav-group-label { display: none; }
.app-topnav .main { padding: var(--main-pad-y) var(--main-pad-x); }

/* ══════════════════════════════════════════════════════════════
   PAGE HEADER + BREADCRUMB
   ══════════════════════════════════════════════════════════════ */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
}
.page-title { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 700; letter-spacing: -0.02em; }
.page-subtitle { color: var(--muted-foreground); margin-top: 0.35rem; }
.page-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
.breadcrumb { font-size: var(--text-sm); color: var(--muted-foreground); margin-bottom: 0.35rem; }
.breadcrumb a:hover { color: var(--foreground); text-decoration: underline; }
.breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

/* ══════════════════════════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════════════════════════ */
.nav-group { margin-bottom: 1rem; }
.nav-group-label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  padding: 0 0.75rem;
  margin-bottom: 0.35rem;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: var(--control-py) var(--control-px);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--foreground);
  transition: background 0.12s ease, color 0.12s ease;
}
.nav-item:hover { background: var(--muted); }
.nav-item-active {
  background: var(--accent);
  color: var(--accent-foreground);
  font-weight: 500;
}

/* ══════════════════════════════════════════════════════════════
   CARDS
   ══════════════════════════════════════════════════════════════ */
.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: var(--card-pad) var(--card-pad) calc(var(--card-pad) * 0.75);
}
.card-content { padding: 0 var(--card-pad) var(--card-pad); }
.card-footer { padding: calc(var(--card-pad) * 0.7) var(--card-pad); border-top: 1px solid var(--border); }
.card-link {
  display: block;
  transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.card-link:hover { box-shadow: var(--shadow-md); border-color: var(--primary); transform: translateY(-2px); }
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

/* KPI stat card (dashboard) */
.stat-card { padding: 1.25rem; }
.stat-value { font-size: var(--text-3xl); font-weight: 700; letter-spacing: -0.03em; }
.stat-label { color: var(--muted-foreground); font-size: var(--text-sm); }

/* ══════════════════════════════════════════════════════════════
   BADGES
   ══════════════════════════════════════════════════════════════ */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.4;
  border: 1px solid transparent;
}
.badge-default     { background: var(--muted); color: var(--muted-foreground); }
.badge-primary     { background: var(--accent); color: var(--accent-foreground); }
.badge-success     { background: var(--success-subtle); color: var(--success); }
.badge-warning     { background: var(--warning-subtle); color: var(--warning-foreground); }
.badge-destructive { background: var(--destructive-subtle); color: var(--destructive); }

/* ══════════════════════════════════════════════════════════════
   BUTTONS
   ══════════════════════════════════════════════════════════════ */
.btn, .btn-primary, .btn-secondary, .btn-ghost, .btn-destructive {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: var(--control-py) calc(var(--control-px) + 0.15rem);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease;
}
.btn-primary { background: var(--primary); color: var(--primary-foreground); }
.btn-primary:hover { background: var(--primary-hover); }
.btn-secondary { background: var(--secondary); color: var(--secondary-foreground); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--secondary-hover); }
.btn-ghost { background: transparent; color: var(--foreground); }
.btn-ghost:hover { background: var(--muted); }
.btn-destructive { background: var(--destructive); color: var(--destructive-foreground); }
.btn-destructive:hover { opacity: 0.9; }
.btn-sm { padding: 0.3rem 0.6rem; font-size: var(--text-xs); }
.btn-icon { padding: 0.4rem; }
[disabled] { opacity: 0.5; cursor: not-allowed; }

/* ══════════════════════════════════════════════════════════════
   TABLE (div-based grid, role="grid")
   ══════════════════════════════════════════════════════════════ */
.table {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--card);
}
.table-header {
  display: flex;
  background: var(--muted);
  border-bottom: 1px solid var(--border);
}
.table-row {
  display: flex;
  border-bottom: 1px solid var(--border);
  transition: background 0.1s ease;
}
.table-row:last-child { border-bottom: none; }
.table-row:hover { background: var(--muted); }
.table-cell {
  flex: 1;
  min-width: 0;
  padding: var(--cell-py) var(--cell-px);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
}
.table-header .table-cell { font-weight: 600; color: var(--muted-foreground); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; }
.table-cell-actions { flex: 0 0 auto; gap: 0.25rem; }

/* ══════════════════════════════════════════════════════════════
   FORMS
   ══════════════════════════════════════════════════════════════ */
.form-field { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1.1rem; }
.form-label { font-size: var(--text-sm); font-weight: 500; }
.form-input, .form-textarea, select.form-input {
  width: 100%;
  padding: var(--control-py) var(--control-px);
  border: 1px solid var(--input);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--foreground);
  font-size: var(--text-sm);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.form-input::placeholder, .form-textarea::placeholder { color: var(--muted-foreground); }
.form-input:focus, .form-textarea:focus, select.form-input:focus {
  outline: none;
  border-color: var(--ring);
  box-shadow: 0 0 0 3px var(--accent);
}
.form-textarea { min-height: 8rem; resize: vertical; line-height: 1.6; }
/* Invalid styling only after a submit attempt — never red on first paint */
.form-input.is-invalid, .form-textarea.is-invalid,
form.was-validated .form-input:invalid, form.was-validated .form-textarea:invalid {
  border-color: var(--destructive);
  box-shadow: 0 0 0 3px var(--destructive-subtle);
}
.form-error { color: var(--destructive); font-size: var(--text-xs); }
.form-hint { color: var(--muted-foreground); font-size: var(--text-xs); }
.filter-bar { display: flex; gap: 0.5rem; margin-bottom: 1.1rem; flex-wrap: wrap; }

/* ══════════════════════════════════════════════════════════════
   STATES: empty / skeleton / alert
   ══════════════════════════════════════════════════════════════ */
.empty-state {
  text-align: center;
  padding: 3.5rem 1.5rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--card);
}
.empty-state-icon { font-size: 2.75rem; line-height: 1; }
.empty-state-title { font-size: var(--text-lg); font-weight: 600; margin-top: 0.75rem; }
.empty-state-desc { color: var(--muted-foreground); margin-top: 0.35rem; }

.skeleton {
  height: 2.5rem;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--muted) 25%, var(--secondary-hover) 37%, var(--muted) 63%);
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}
@keyframes skeleton-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

.alert {
  padding: 0.9rem 1.1rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--card);
  font-size: var(--text-sm);
}
.alert-destructive { border-color: var(--destructive); background: var(--destructive-subtle); color: var(--destructive); }
.alert-success { border-color: var(--success); background: var(--success-subtle); color: var(--success); }

/* ══════════════════════════════════════════════════════════════
   MODAL / DIALOG
   ══════════════════════════════════════════════════════════════ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 100;
}
.modal {
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 26rem;
  padding: 1.5rem;
}
.modal-title { font-size: var(--text-lg); font-weight: 600; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.5rem; }

/* ══════════════════════════════════════════════════════════════
   DEV PANEL (fixed state switcher) + TOASTS
   ══════════════════════════════════════════════════════════════ */
.dev-panel {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.6rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: var(--shadow-md);
  z-index: 90;
}
.dev-panel-label { font-size: var(--text-xs); color: var(--muted-foreground); margin-right: 0.25rem; }

.toast-container {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 120;
  max-width: 22rem;
}

/* ══════════════════════════════════════════════════════════════
   UTILITY LAYER (curated, safe class names — no Tailwind)
   ══════════════════════════════════════════════════════════════ */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-1 { flex: 1; min-width: 0; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.flex-wrap { flex-wrap: wrap; }
.grid { display: grid; }
.hidden { display: none; }
.block { display: block; }
.w-full { width: 100%; }
.w-sm { width: 10rem; }
.w-75 { width: 75%; }
.w-90 { width: 90%; }
.gap-1 { gap: 0.25rem; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }

.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.mt-4 { margin-top: 1rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-3 { margin-bottom: 0.75rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-6 { margin-bottom: 1.5rem; }
.mb-8 { margin-bottom: 2rem; }
.ml-2 { margin-left: 0.5rem; }
.mr-1 { margin-right: 0.25rem; }
.mr-2 { margin-right: 0.5rem; }
.mx-auto { margin-left: auto; margin-right: auto; }

.text-xs { font-size: var(--text-xs); }
.text-sm { font-size: var(--text-sm); }
.text-lg { font-size: var(--text-lg); }
.text-xl { font-size: var(--text-xl); }
.text-2xl { font-size: var(--text-2xl); }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.uppercase { text-transform: uppercase; }
.tracking-wide { letter-spacing: 0.05em; }
.link:hover { text-decoration: underline; }

.text-muted, .text-muted-foreground { color: var(--muted-foreground); }
.text-primary { color: var(--primary); }
.text-destructive { color: var(--destructive); }
.text-success { color: var(--success); }
.bg-card { background: var(--card); }
.border { border: 1px solid var(--border); }
.rounded { border-radius: var(--radius-sm); }

/* grid column helpers + preformatted preview (avoids inline style attributes) */
.cols-1 { grid-template-columns: 1fr; }
.cols-2 { grid-template-columns: 1fr 1fr; }
.pre-wrap { white-space: pre-wrap; font-family: inherit; line-height: 1.6; margin: 0; }
```
