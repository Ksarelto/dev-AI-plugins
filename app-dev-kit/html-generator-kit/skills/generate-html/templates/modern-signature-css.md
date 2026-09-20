# Template: modern-signature-css.md

The **contemporary layer**. Appended to `{OUTPUT_DIR}/css/components.css` by `design-system-author`,
after the base component vocabulary. This is what makes a prototype look like it was designed this
year rather than assembled from a 2019 admin template.

Two kinds of block below:

- **ALWAYS** — emit verbatim in every prototype. Motion tokens, focus rings, reduced-motion guard,
  and the small modern primitives (chips, tabular numerals, meters, avatars).
- **SWITCHED** — emit **only** the blocks named in the brief's `## Signature layer` list. Emitting
  all of them produces a busy, styleless prototype; the brief picks **1–3**.

Every rule uses existing tokens (`var(--primary)`, `var(--card)`, `var(--radius)`, …) so the layer
inherits the brief's palette automatically. **Zero Tailwind. Zero CDN assets. Zero JS dependencies.**

Whatever you emit, list its class names in `design-system-ref.md` — `screen-generator` may only use
classes that appear there.

---

## ALWAYS — motion tokens

Add to the `:root` block of `tokens.css` (not here):

```css
  /* ── Motion (from the brief's Motion spec) ──────── */
  --dur-fast: ⟨DUR_FAST⟩;      /* micro feedback: 120ms–160ms */
  --dur-base: ⟨DUR_BASE⟩;      /* hovers, reveals: 200ms–280ms */
  --dur-slow: ⟨DUR_SLOW⟩;      /* overlays, page reveal: 320ms–420ms */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
  --lift: ⟨LIFT_Y⟩;            /* hover translate: -1px (restrained) … -4px (playful) */
```

---

## ALWAYS — interaction feel, focus, reduced motion

```css
/* ══════════════════════════════════════════════════════════════
   MODERN LAYER — interaction feel
   ══════════════════════════════════════════════════════════════ */
.btn-primary, .btn-secondary, .btn-ghost, .btn-destructive,
.nav-item, .card, .badge, .chip, .form-input, .form-textarea {
  transition: background-color var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              transform var(--dur-base) var(--ease-out);
}
.btn-primary:active, .btn-secondary:active, .btn-destructive:active { transform: translateY(1px) scale(0.995); }

/* One focus treatment everywhere — visible, on-brand, keyboard-only */
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Hover lift — opt-in per element so tables/rows stay calm */
.hover-lift { will-change: transform; }
.hover-lift:hover { transform: translateY(var(--lift)); box-shadow: var(--shadow-lg); }

/* Entrance reveal — pure CSS, runs once on load, no JS */
.reveal { animation: reveal var(--dur-slow) var(--ease-out) both; }
.reveal-2 { animation-delay: 60ms; }
.reveal-3 { animation-delay: 120ms; }
.reveal-4 { animation-delay: 180ms; }
@keyframes reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* Skeletons shimmer instead of sitting flat */
.skeleton {
  background: linear-gradient(90deg, var(--muted) 25%, var(--secondary) 37%, var(--muted) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }

/* Non-negotiable: honour the OS setting (ui-ux-pro-max priority 1–2) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .hover-lift:hover { transform: none; }
}

/* Selection + scrollbar — cheap, and their absence is what reads as "unfinished" */
::selection { background: var(--primary); color: var(--primary-foreground); }
* { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); background-clip: content-box; }
```

---

## ALWAYS — modern primitives

```css
/* ══════════════════════════════════════════════════════════════
   MODERN LAYER — primitives
   ══════════════════════════════════════════════════════════════ */

/* Sticky page header — stays put while a long table scrolls under it.
   Deliberately CSS-only: no scroll listener, because pages carry no inline JS. */
.page-header-sticky {
  position: sticky; top: 0; z-index: 20;
  background: var(--background);
  padding-block: 0.75rem;
  border-bottom: 1px solid var(--border);
}

/* Filter pills — the current replacement for a row of bare selects */
.chip-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.chip {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.3rem 0.7rem;
  font-size: var(--text-sm); font-weight: 500;
  color: var(--muted-foreground);
  background: var(--secondary);
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
}
.chip:hover { color: var(--foreground); background: var(--secondary-hover); }
.chip-active { color: var(--primary); background: var(--accent); border-color: var(--primary); }

/* Tabular numerals — numbers that line up column to column */
.num { font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.stat-value, .table-cell .num { font-variant-numeric: tabular-nums; }

/* Metric delta next to a KPI */
.delta { display: inline-flex; align-items: center; gap: 0.2rem; font-size: var(--text-sm); font-weight: 600; font-variant-numeric: tabular-nums; }
.delta-up { color: var(--success); }
.delta-down { color: var(--destructive); }
.delta-flat { color: var(--muted-foreground); }

/* Progress / meter — no chart library needed */
.meter { height: 0.5rem; background: var(--muted); border-radius: 999px; overflow: hidden; }
.meter-fill { height: 100%; background: var(--primary); border-radius: 999px; transition: width var(--dur-slow) var(--ease-out); }

/* CSS-only bar sparkline: <div class="sparkbars"><i style="height:60%"></i>…</div> */
.sparkbars { display: flex; align-items: flex-end; gap: 2px; height: 2.5rem; }
.sparkbars > i { flex: 1; min-width: 2px; background: var(--primary); border-radius: 2px 2px 0 0; opacity: 0.75; }
.sparkbars > i:last-child { opacity: 1; }

/* Identity + keyboard affordances */
.avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; flex-shrink: 0;
  font-size: var(--text-xs); font-weight: 600;
  color: var(--primary); background: var(--accent);
  border-radius: 999px;
}
.avatar-group { display: flex; }
.avatar-group .avatar + .avatar { margin-left: -0.5rem; box-shadow: 0 0 0 2px var(--card); }
.kbd {
  padding: 0.1rem 0.35rem;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: var(--text-xs);
  color: var(--muted-foreground); background: var(--secondary);
  border: 1px solid var(--border); border-bottom-width: 2px; border-radius: var(--radius-sm);
}

/* Section divider with an optional label */
.divider { display: flex; align-items: center; gap: 0.75rem; color: var(--muted-foreground); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
```

---

## SWITCHED — pick 1–3, named in the brief

### `bento` — asymmetric dashboard grid

Modern dashboards are not four equal cards in a row. Use for dashboard/overview pages.

```css
.bento { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
.bento > * { min-width: 0; }
.bento-wide { grid-column: span 2; }
.bento-full { grid-column: 1 / -1; }
.bento-tall { grid-row: span 2; }
@media (max-width: 1024px) { .bento { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bento-tall { grid-row: auto; } }
@media (max-width: 640px)  { .bento { grid-template-columns: 1fr; } .bento-wide { grid-column: auto; } }
```

### `glass` — translucent sticky chrome

Apply to `.topnav` or `.page-header-sticky` only — never to content cards (legibility).

```css
.surface-glass {
  background: color-mix(in oklab, var(--card) 72%, transparent);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  border-bottom: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
}
@supports not (backdrop-filter: blur(1px)) { .surface-glass { background: var(--card); } }
```

### `gradient` — brand gradient on display type and hero surfaces

One gradient per page, maximum. Gradient text needs a solid-colour fallback.

```css
.text-gradient {
  background: linear-gradient(100deg, var(--primary), oklch(from var(--primary) l c calc(h + 45)));
  -webkit-background-clip: text; background-clip: text;
  color: transparent; -webkit-text-fill-color: transparent;
}
@supports not (background-clip: text) { .text-gradient { color: var(--primary); -webkit-text-fill-color: currentColor; } }
.surface-mesh {
  background:
    radial-gradient(60% 80% at 12% 0%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%),
    radial-gradient(50% 70% at 92% 8%, color-mix(in oklab, var(--accent-foreground) 14%, transparent), transparent 72%),
    var(--card);
}
```

### `edge-accent` — accent rail on the active surface

```css
.nav-item { position: relative; }
.nav-item-active::before {
  content: ''; position: absolute; inset-block: 0.35rem; inset-inline-start: 0;
  width: 3px; border-radius: 999px; background: var(--primary);
}
.card-accent { border-inline-start: 3px solid var(--primary); }
.app-topnav .nav-item-active::before { inset: auto 0.5rem 0 0.5rem; width: auto; height: 2px; }
```

### `soft-depth` — ring + inner highlight instead of a hard border

```css
.card, .modal, .stat-card {
  border: none;
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--border) 85%, transparent),
              inset 0 1px 0 color-mix(in oklab, white 55%, transparent),
              var(--shadow-md);
}
.dark .card, .dark .modal, .dark .stat-card {
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--border) 90%, transparent),
              inset 0 1px 0 color-mix(in oklab, white 8%, transparent),
              var(--shadow-md);
}
```

### `editorial` — oversized display type with tight tracking

For content/creative archetypes with an expressive display font.

```css
.page-title { font-size: clamp(1.75rem, 1.2rem + 2vw, 2.75rem); line-height: 1.05; letter-spacing: -0.03em; text-wrap: balance; }
.page-subtitle, .empty-state-desc, .card-content p { max-width: 62ch; text-wrap: pretty; }
.lede { font-size: var(--text-xl); line-height: 1.5; color: var(--muted-foreground); max-width: 58ch; }
```

### `underline-nav` — animated underline for horizontal nav / tabs

Pairs with the `top-nav` archetype.

```css
.tab-row { display: flex; gap: 1.25rem; border-bottom: 1px solid var(--border); }
.tab { padding: 0.6rem 0.1rem; position: relative; color: var(--muted-foreground); font-weight: 500; background: none; border: none; cursor: pointer; }
.tab::after { content: ''; position: absolute; inset-inline: 0; bottom: -1px; height: 2px; background: var(--primary); transform: scaleX(0); transform-origin: left; transition: transform var(--dur-base) var(--ease-out); }
.tab:hover { color: var(--foreground); }
.tab-active { color: var(--foreground); }
.tab-active::after { transform: scaleX(1); }
```

---

## Guardrails

- **Contrast beats style.** `glass`, `gradient`, and `soft-depth` all reduce edge contrast — if the
  axe pass at Station 6.5 flags contrast, drop the effect, don't tune the palette away from the brief.
- `.hover-lift` belongs on cards and stat cards. Never on table rows (jitter) or nav items.
- `.reveal` is for a page's first screenful only — max ~6 elements per page, or the prototype feels
  sluggish on every navigation.
- `oklch(from …)` and `color-mix(in oklab, …)` are supported by the Chromium used at Station 6.5.
  Both appear only in SWITCHED blocks, and each has a `@supports` fallback or degrades to a solid
  token.
- Emit **no** `!important` outside the reduced-motion block.
