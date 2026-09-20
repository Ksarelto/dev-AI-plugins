# Template: base-css.md

Reset + typography for `css/base.css`. **CDN-free** for the design system (Google Fonts `<link>`
is allowed — it is not the Tailwind runtime the QA gate forbids).

CRITICAL: the root font-size is left at the browser default (16px). Do NOT set
`html { font-size: 62.5% }` — the old 1rem=10px trick shrinks every rem-based size to 62.5%
and is the cause of the "everything is tiny" bug. All rem values below assume a 16px root.

## FILL slots (from design-brief.md)

- `⟨FONT_IMPORT⟩` — the Google Fonts `@import url(...)` line for the brief's chosen families
  (body + display). Request only the weights used: 400;500;600;700 for body, 500;600;700 for display.
- Font *families* are referenced via `var(--font-sans)` / `var(--font-display)` (defined in
  `tokens.css`) — do NOT hardcode a family name here.

If the brief chose a system-only pairing (no webfont), omit the `@import` line entirely; the
`var(--font-*)` fallbacks in tokens.css already resolve to system stacks.

---

```css
⟨FONT_IMPORT⟩

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--foreground);
  background: var(--background);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4 {
  font-family: var(--font-display);
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.011em;
  color: var(--foreground);
}
h1 { font-size: var(--text-2xl); }
h2 { font-size: var(--text-xl); }
h3 { font-size: var(--text-lg); }

p { line-height: 1.6; }

a {
  color: inherit;
  text-decoration: none;
}

button, input, select, textarea {
  font: inherit;
  color: inherit;
}
button { cursor: pointer; background: none; border: none; }

ul, ol { list-style: none; }

img, svg { display: block; max-width: 100%; }

:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

::selection { background: var(--accent); color: var(--accent-foreground); }

/* Alpine: keep pre-init DOM hidden to avoid flash of un-evaluated markup */
[x-cloak] { display: none !important; }

/* Custom scrollbars (webkit) */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }

@media print {
  .sidebar, .dev-panel, .page-actions, .toast-container { display: none !important; }
  .main { padding: 0 !important; }
}
```
