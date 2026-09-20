# Template: design-brief.md

The design direction for ONE prototype, written by `design-strategist` to
`{OUTPUT_DIR}/design-brief.md`. It is the single source of visual identity — `design-system-author`
fills every token/font/layout/signature slot from this file, and `screen-generator` reads the tone
notes and layout patterns to keep copy, emphasis, and composition on-brand.

Commit to ONE direction (the user chose auto-pick). Do not hedge with alternatives. Every value
below must be concrete enough to drop straight into CSS.

Values should come from a `ui-ux-pro-max` query wherever the § Provenance block says they do — see
`references/ui-ux-pro-max.md` for the query recipes and the hex→OKLCH mapping table.

---

```markdown
# Design Brief — {App title}

## Provenance
- Design authority: {ui-ux-pro-max ✅ | first-principles ⚠️ (ui-ux-pro-max unavailable)}
- Queries run: {list the exact search.py queries, or "none — dependency unavailable"}
- Dials used: variance {N} · motion {N} · density {N}

## Read of the product
- Domain: {e.g. financial reconciliation / creative content / healthcare intake / developer tooling}
- Audience: {who uses this daily — e.g. finance analysts, clinicians, indie makers}
- Job & mood: {what they need from it — e.g. "scan dense data fast, trust the numbers" → calm,
  precise, high-contrast; or "explore & create" → warm, expressive}
- Market archetype chosen: {one of: data-dense fintech · trustworthy enterprise · modern SaaS ·
  creative/editorial · healthcare/care · developer tool · consumer-friendly}
- One-line design intent: {the feeling in a sentence — this drives every choice below}
- Reference class: {how current, well-regarded products in this category look — principles only,
  never a specific brand's assets}

## Palette (OKLCH — concrete values)
- Source: {ui-ux-pro-max palette name + its primary hex → converted} | {reasoned}
- Neutral temperature: {warm | cool | pure} → hue `⟨NEUTRAL_HUE⟩`, chroma `⟨NEUTRAL_CHROMA⟩`
- Primary: `L C H` = `⟨PRIMARY_L⟩ ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩`  ({colour name}, {why it fits the domain})
- Accent hue: `⟨ACCENT_H⟩`  ({same as primary | complementary})
- Contrast self-check (WCAG AA):
  - primary-foreground on primary: {pass — light/dark text choice + approx ratio}
  - foreground on background: {pass}
  - Statement: "AA verified for body text and primary buttons."

## Typography (Google Fonts + system fallback)
- Source: {ui-ux-pro-max pairing name} | {reasoned}
- Body family: `⟨FONT_BODY⟩`  ({why})
- Display/heading family: `⟨FONT_DISPLAY⟩`  ({why — may equal body for a quieter look})
- @import line: `@import url('https://fonts.googleapis.com/css2?family=...&display=swap');`
  (weights: body 400;500;600;700 · display 500;600;700)
- If system-only (no webfont): say so; leave @import empty; families use system stacks.

## Shape & depth
- Radius personality: {sharp `0.25rem` | balanced `0.625rem` | round `1rem`} → `⟨RADIUS⟩`
- Shadow intensity: {flat `0.04` | soft `0.08` | lifted `0.14`} → `⟨SHADOW_ALPHA⟩`

## Density (drives control/table/card/page padding)
- Choice: {compact | comfortable} — {why: data-dense → compact; consumer → comfortable}
- Token values:
  - `⟨DENSITY_CONTROL_PY⟩ ⟨DENSITY_CONTROL_PX⟩` (buttons/inputs/nav)
  - `⟨DENSITY_CELL_PY⟩ ⟨DENSITY_CELL_PX⟩` (table cells)
  - `⟨DENSITY_CARD_PAD⟩` · `⟨DENSITY_MAIN_PAD_Y⟩ ⟨DENSITY_MAIN_PAD_X⟩`
  - compact ≈ `0.4rem 0.7rem` · `0.55rem 0.9rem` · `1rem` · `1.5rem 2rem`
  - comfortable ≈ `0.6rem 1rem` · `0.9rem 1.15rem` · `1.35rem` · `2.5rem 3rem`

## Layout archetype
- Choice: {sidebar | top-nav} — {why: many domains/deep nav → sidebar; few top-level areas,
  marketing-adjacent, or wide dashboards → top-nav}

## Signature layer (the contemporary look — pick 1–3, no more)
Named blocks from `templates/modern-signature-css.md`. `design-system-author` emits ONLY these.
- Selected: {1–3 of: `bento` · `glass` · `gradient` · `edge-accent` · `soft-depth` · `editorial` ·
  `underline-nav`}
- Why these fit the mood: {one line per pick}
- Explicitly rejected: {name at least one you deliberately did NOT pick, and why — this is what
  keeps the design a point of view instead of a pile of effects}

## Motion spec (CSS-only — no GSAP, no JS animation libraries)
- Feel: {restrained | responsive | playful} — from the `--motion` dial
- `⟨DUR_FAST⟩` = {120ms–160ms} · `⟨DUR_BASE⟩` = {200ms–280ms} · `⟨DUR_SLOW⟩` = {320ms–420ms}
- `⟨LIFT_Y⟩` = {-1px restrained · -2px responsive · -4px playful}
- Where motion applies: {e.g. "card hover lift + staggered reveal on dashboard KPIs + modal fade";
  name at most 3 places}
- Reduced-motion honoured: yes (always — the layer ships the `prefers-reduced-motion` guard)

## Composition patterns (what screen-generator should build, per page type)
- Dashboard: {e.g. `bento` grid — 1 wide hero stat + 3 KPI cards + full-width recent table}
- List: {e.g. `chip-row` status filters + search, table with `.num` tabular figures}
- Detail: {e.g. two-column: summary card rail + editable form}
- Form: {e.g. single column, max 58ch, grouped by `divider` labels}
- Settings: {e.g. `divider`-separated sections, one card per group}
Only describe the page types this app actually has.

## Tone notes for screen copy
- Voice: {e.g. terse & professional | friendly & encouraging}
- Emphasis: {what the UI should make prominent — e.g. status/amounts | primary CTA | search}
- Microcopy: {empty-state line, primary CTA label, error line — write the actual strings}
```

## Guidance for choosing values

- **Vary meaningfully across products.** A fintech tool and a content app must not both land on
  indigo + Inter + sidebar. Let the domain/mood pick the hue family:
  - trust/finance → teal, deep blue, slate-green · healthcare → calm blue/green ·
    creative → violet, coral, amber · developer → near-neutral + one electric accent ·
    consumer SaaS → violet/blue/pink with comfortable density.
- Keep primary lightness in ~`0.45–0.62` (light mode) so white or near-black foreground passes AA.
- Neutral chroma > 0 (e.g. `0.006–0.02`) tinted toward the primary hue reads more intentional than
  pure gray — but keep it subtle.
- Pick a display font with actual personality when the mood allows (grotesk, humanist, or a serif
  for editorial); keep the body font highly legible.

### What makes a prototype read as current (use when the database is unavailable)

These are the traits that separate a contemporary interface from a dated one. They are stack-neutral
and all expressible in the kit's plain CSS:

| Trait | Dated | Current |
|-------|-------|---------|
| Grid | 4 equal cards in a row | asymmetric `bento` — one hero cell, supporting cells |
| Depth | 1px grey border everywhere | `soft-depth` ring + soft shadow, borders only where they separate |
| Type scale | uniform 24px headings | large `clamp()` display with tight negative tracking, `text-wrap: balance` |
| Numbers | proportional figures | tabular numerals (`.num`) so columns align |
| Filters | row of bare `<select>`s | `chip-row` pills + one search field |
| Feedback | instant state swap | 150–250ms eased transitions, shimmer skeletons, staggered reveal |
| Focus | browser default / removed | one branded `:focus-visible` ring, offset 2px |
| Chrome | opaque bar | sticky header that gains its hairline on scroll (`glass` optional) |
| Colour | flat brand fill only | one gradient or mesh accent, used once per page |
| Empty state | "No data" | illustrated icon + a written next action |

Restraint is part of the look: **1–3 signature blocks, one gradient per page, ≤3 motion moments.**
A prototype carrying every effect at once reads as a demo, not a design.
