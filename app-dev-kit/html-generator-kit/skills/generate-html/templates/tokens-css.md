# Template: tokens-css.md

Design tokens for `css/tokens.css`. **CDN-free** — no Tailwind runtime. Colours are OKLCH
(shadcn-style). Consumers reference tokens as `var(--token)` directly (NOT `hsl(var(--token))`).

## This is a FILL template, not a copy template

`tokens.css` is where a prototype's visual identity lives — so it must be **generated from
`design-brief.md`, not copied verbatim**. Copying verbatim is exactly what made every prototype
look identical (one indigo hue, one font). The design-system-author substitutes every `⟨SLOT⟩`
below with a concrete value derived from the brief.

### Slots (all come from `design-brief.md`)

| Slot | Source in brief | Example values |
|------|-----------------|----------------|
| `⟨NEUTRAL_HUE⟩` | neutral temperature | warm `70`, cool `264`, neutral `0` |
| `⟨NEUTRAL_CHROMA⟩` | neutral temperature | `0.002`–`0.02` (higher = more tinted gray) |
| `⟨PRIMARY_L⟩ ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩` | primary colour | e.g. `0.55 0.15 165` (teal) |
| `⟨ACCENT_H⟩` | accent colour | often == primary hue, or a complementary hue |
| `⟨RADIUS⟩` | radius personality | sharp `0.25rem` · balanced `0.625rem` · round `1rem` |
| `⟨SHADOW_ALPHA⟩` | shadow intensity | flat `0.04` · soft `0.08` · lifted `0.14` |
| `⟨FONT_BODY⟩` | font pairing (body) | `'Inter'`, `'Public Sans'`, `'IBM Plex Sans'` |
| `⟨FONT_DISPLAY⟩` | font pairing (headings) | `'Space Grotesk'`, `'Fraunces'`, `⟨FONT_BODY⟩` |
| `⟨DENSITY_*⟩` | density | compact vs comfortable (see density block) |

Rules:
- Keep the SAME token **names** — screen-generator and components.css depend on them.
- All neutral surface/border/text tokens share `⟨NEUTRAL_HUE⟩`/`⟨NEUTRAL_CHROMA⟩` so the greys feel
  intentional (warm product ≠ cool product).
- `--primary-foreground` must pass WCAG AA against `--primary` (the brief already checked this;
  re-verify: light text on a dark-enough primary, or dark text on a light primary).
- Fonts are loaded via a Google Fonts `<link>`/`@import` in `base.css` (the brief names them) with a
  system fallback — so an offline viewer still gets a sensible stack.

---

```css
:root {
  /* ── Typography families (from brief; system fallback keeps offline usable) ── */
  --font-sans: ⟨FONT_BODY⟩, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-display: ⟨FONT_DISPLAY⟩, var(--font-sans);

  /* ── Surface & text (neutral hue = ⟨NEUTRAL_HUE⟩) ─────────────── */
  --background: oklch(0.99 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --foreground: oklch(0.21 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.21 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.21 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --overlay: oklch(0.21 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩ / 0.45);

  /* ── Brand / actions (primary = ⟨PRIMARY_L⟩ ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩) ─── */
  --primary: oklch(⟨PRIMARY_L⟩ ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩);
  --primary-foreground: oklch(0.99 0.005 ⟨PRIMARY_H⟩);
  --primary-hover: oklch(calc(⟨PRIMARY_L⟩ - 0.06) ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩);

  --secondary: oklch(0.968 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --secondary-foreground: oklch(0.31 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --secondary-hover: oklch(0.93 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);

  --accent: oklch(0.96 0.02 ⟨ACCENT_H⟩);
  --accent-foreground: oklch(0.42 0.16 ⟨ACCENT_H⟩);

  /* ── Muted / subtle ─────────────────────────────── */
  --muted: oklch(0.968 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --muted-foreground: oklch(0.55 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);

  /* ── Feedback (semantic hues are stable across brands) ── */
  --success: oklch(0.62 0.16 152);
  --success-foreground: oklch(0.99 0.01 152);
  --success-subtle: oklch(0.95 0.05 152);

  --warning: oklch(0.79 0.15 78);
  --warning-foreground: oklch(0.32 0.06 78);
  --warning-subtle: oklch(0.96 0.06 90);

  --destructive: oklch(0.58 0.22 27);
  --destructive-foreground: oklch(0.99 0.01 27);
  --destructive-subtle: oklch(0.95 0.04 27);

  /* ── Lines & inputs ─────────────────────────────── */
  --border: oklch(0.92 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --input: oklch(0.92 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --ring: oklch(⟨PRIMARY_L⟩ ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩);

  /* ── Radius scale (personality = ⟨RADIUS⟩) ─────── */
  --radius: ⟨RADIUS⟩;
  --radius-sm: calc(var(--radius) - 0.25rem);
  --radius-lg: calc(var(--radius) + 0.25rem);

  /* ── Elevation (alpha = ⟨SHADOW_ALPHA⟩) ─────────── */
  --shadow-sm: 0 1px 2px 0 oklch(0.21 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩ / calc(⟨SHADOW_ALPHA⟩ - 0.02));
  --shadow-md: 0 4px 12px -2px oklch(0.21 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩ / ⟨SHADOW_ALPHA⟩), 0 2px 4px -2px oklch(0.21 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩ / calc(⟨SHADOW_ALPHA⟩ - 0.02));
  --shadow-lg: 0 12px 32px -8px oklch(0.21 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩ / calc(⟨SHADOW_ALPHA⟩ + 0.06));

  /* ── Typography scale ───────────────────────────── */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;

  /* ── Density (from brief: compact | comfortable) ──
     compact →     control 0.4/0.7 · cell 0.55/0.9 · card 1rem · main 1.5rem/2rem
     comfortable → control 0.6/1.0 · cell 0.9/1.15 · card 1.35rem · main 2.5rem/3rem */
  --control-py: ⟨DENSITY_CONTROL_PY⟩;
  --control-px: ⟨DENSITY_CONTROL_PX⟩;
  --cell-py: ⟨DENSITY_CELL_PY⟩;
  --cell-px: ⟨DENSITY_CELL_PX⟩;
  --card-pad: ⟨DENSITY_CARD_PAD⟩;
  --main-pad-y: ⟨DENSITY_MAIN_PAD_Y⟩;
  --main-pad-x: ⟨DENSITY_MAIN_PAD_X⟩;

  /* ── Layout rhythm ──────────────────────────────── */
  --sidebar-width: 16rem;
  --topnav-height: 3.75rem;
  --content-max: 1200px;
}

.dark {
  --background: oklch(0.18 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --foreground: oklch(0.96 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --card: oklch(0.22 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --card-foreground: oklch(0.96 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --popover: oklch(0.22 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --popover-foreground: oklch(0.96 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --overlay: oklch(0 0 0 / 0.6);

  --primary: oklch(calc(⟨PRIMARY_L⟩ + 0.13) ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩);
  --primary-foreground: oklch(0.18 0.02 ⟨PRIMARY_H⟩);
  --primary-hover: oklch(calc(⟨PRIMARY_L⟩ + 0.19) ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩);

  --secondary: oklch(0.28 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --secondary-foreground: oklch(0.96 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --secondary-hover: oklch(0.33 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);

  --accent: oklch(0.30 0.03 ⟨ACCENT_H⟩);
  --accent-foreground: oklch(0.88 0.05 ⟨ACCENT_H⟩);

  --muted: oklch(0.28 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --muted-foreground: oklch(0.70 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);

  --success-subtle: oklch(0.32 0.06 152);
  --warning-subtle: oklch(0.34 0.06 90);
  --destructive-subtle: oklch(0.32 0.06 27);

  --border: oklch(0.32 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --input: oklch(0.32 ⟨NEUTRAL_CHROMA⟩ ⟨NEUTRAL_HUE⟩);
  --ring: oklch(calc(⟨PRIMARY_L⟩ + 0.13) ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩);

  --shadow-sm: 0 1px 2px 0 oklch(0 0 0 / 0.30);
  --shadow-md: 0 4px 12px -2px oklch(0 0 0 / 0.45), 0 2px 4px -2px oklch(0 0 0 / 0.30);
  --shadow-lg: 0 12px 32px -8px oklch(0 0 0 / 0.55);
}
```

> **Note on `calc()` inside `oklch()`**: modern Chromium (used by the render check) supports it.
> If the design-system-author prefers, it may pre-compute the lightness arithmetic and emit literal
> values instead of `calc(...)` — either is acceptable as long as the hues/chroma come from the brief.
