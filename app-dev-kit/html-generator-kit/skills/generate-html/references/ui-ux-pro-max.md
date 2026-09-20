# ui-ux-pro-max Integration

`ui-ux-pro-max` is an **open-source, third-party design-intelligence skill** (MIT,
[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)).
It ships a queryable CSV database — 84 styles, 192 palettes, 74 font pairings, 192 product-type
rule sets, 98 UX guidelines, 104 icon entries, 16 motion presets, 25 chart types across 22 stacks —
plus a pure-stdlib Python search engine.

This kit uses it as its **design authority**. Without it, the pipeline invents palettes and layouts
from model priors, which is what produced generic, samey mockups. With it, every visual and UX
decision traces to a rule row that says *why* — and the trend directives below turn those rules into
a prototype that reads as current, not as a 2019 bootstrap dashboard.

It is an **optional-but-strongly-recommended dependency**: the pipeline degrades to first-principles
reasoning when it is absent, and says so in the review packet.

---

## Install (once per machine or per project)

```bash
npm install -g ui-ux-pro-max-cli
uipro init --ai claude        # project-local  → .claude/skills/ui-ux-pro-max/
uipro init --ai claude --global   # all projects → ~/.claude/skills/ui-ux-pro-max/
uipro init --ai cursor        # Cursor          → .cursor/skills/ui-ux-pro-max/
```

Without a global npm install:

```bash
npx -y -p ui-ux-pro-max-cli uipro init --ai claude    # or --ai cursor
```

The `generate-html` skill picks `--ai cursor` when `.cursor/` or `$CURSOR_PROJECT_DIR` is present,
otherwise `--ai claude`. Do not default to Claude on a Cursor host.

Requires **Python 3.x** (standard library only — no pip installs, no network calls at query time).
Verify with `python3 --version`.

Maintenance: `uipro update` / `uipro update --global` refreshes the database; `uipro versions` lists
available versions; `uipro uninstall --ai claude` removes it.

---

## Path resolution (`UIUX_DIR`)

The skill lands in a different directory per host, so **never hardcode one path**. Resolve it once
in `generate-html` (Step 2.5) and pass the result down as `UIUX_DIR`:

```bash
for d in \
  "$CLAUDE_PLUGIN_ROOT/.claude/skills/ui-ux-pro-max" \
  ".claude/skills/ui-ux-pro-max" \
  "$HOME/.claude/skills/ui-ux-pro-max" \
  ".cursor/skills/ui-ux-pro-max" \
  "$HOME/.cursor/skills/ui-ux-pro-max" \
  ".agents/skills/ui-ux-pro-max" \
  "$HOME/.agents/skills/ui-ux-pro-max" \
  ".windsurf/skills/ui-ux-pro-max" \
  ".factory/skills/ui-ux-pro-max"; do
  [ -f "$d/scripts/search.py" ] && echo "UIUX_DIR=$d" && break
done
```

`UIUX_DIR` is `none` when no candidate matched. Every agent that queries the database must check for
`none` first and fall back (see § Degradation).

---

## Query recipes used by this kit

All invocations are `python3 "{UIUX_DIR}/scripts/search.py" …`. Output is ASCII by default; add
`-f markdown` for a cleaner block to paste into a brief, or `--json` for untruncated structured data.

| # | Station / agent | Command | Feeds |
|---|-----------------|---------|-------|
| 1 | 1.5 `design-strategist` | `"<archetype> <domain> <mood>" --design-system -p "<TITLE>" -f markdown --variance <1-10> --motion <1-10> --density <1-10>` | whole design brief |
| 2 | 1.5 `design-strategist` | `"<mood> <archetype>" --domain style -f markdown` | signature style + trend picks |
| 3 | 1.5 `design-strategist` | `"<mood> <display-font-feel>" --domain typography -f markdown` | font pairing |
| 4 | 1.5 `design-strategist` | `"<page-type> <domain>" --domain ux -f markdown` (once per distinct page type) | `ux-directives.md` |
| 5 | 1.5 `design-strategist` | `"<mood> micro-interactions" --domain animation -f markdown` | motion spec in the brief |
| 6 | 1.5 `design-strategist` | `"dashboard <domain> metrics" --domain chart -f markdown` (only if a dashboard page exists) | chart guidance in `ux-directives.md` |
| 7 | 2 `design-system-author` | `"<archetype> component styling" --stack html-tailwind -f markdown` | implementation notes |

Notes on the dials (they tune recommendations without changing the query string):

- `--variance` 1 = minimal/safe → 10 = asymmetric/expressive. Pick from the brief's mood:
  enterprise/healthcare `3–4`, modern SaaS `5–6`, creative/consumer `7–9`.
- `--motion` 1 = subtle → 10 = complex choreography. This kit is CDN-free with no GSAP, so **cap at
  6** — anything above that cannot be expressed in plain CSS transitions.
- `--density` 1 = spacious → 10 = dense. Maps to the brief's density choice: `comfortable` ≈ `3`,
  `compact` ≈ `8`.

Optional persistence — writes a `design-system/MASTER.md` the reviewer can read alongside the brief:

```bash
python3 "{UIUX_DIR}/scripts/search.py" "<query>" --design-system --persist -p "<TITLE>"
```

The kit does **not** rely on `--persist` output; `design-brief.md` stays the single source of truth.

---

## Mapping its output into this kit's token vocabulary

The database returns hex/named colours and prose; this kit's tokens are OKLCH. Translate, don't paste:

| It returns | Becomes |
|------------|---------|
| Palette primary hex (e.g. `#0F766E`) | `⟨PRIMARY_L⟩ ⟨PRIMARY_C⟩ ⟨PRIMARY_H⟩` — convert to OKLCH, then clamp `L` into `0.45–0.62` for light mode so AA still passes |
| Palette neutral ("warm sand", "cool slate") | `⟨NEUTRAL_HUE⟩` + `⟨NEUTRAL_CHROMA⟩` (warm ≈ 50–80, cool ≈ 250–270, pure = 0; chroma `0.002–0.02`) |
| Accent / secondary hex | `⟨ACCENT_H⟩` |
| Font pairing (display + body) | `⟨FONT_DISPLAY⟩` / `⟨FONT_BODY⟩` + the Google Fonts `@import` line |
| Style row (radius, elevation, surface treatment) | `⟨RADIUS⟩`, `⟨SHADOW_ALPHA⟩`, and the signature-layer switches |
| Density recommendation | `⟨DENSITY_*⟩` set (compact vs comfortable) |
| UX guideline rows | `ux-directives.md` bullets, scoped per page type |
| Animation preset | brief's Motion spec → `--dur-*`/`--ease-*` tokens + `.hover-lift`/`.reveal` classes |

**A returned colour never overrides the WCAG self-check.** If the recommended primary fails AA at the
foreground it implies, adjust lightness until it passes and record the adjustment in the brief.

---

## Priority order when rules conflict

The database ranks rule categories 1–10. This kit resolves conflicts in this order:

1. **Accessibility / touch targets** (its priority 1–2) — always wins, including over a style pick.
2. **This kit's hard invariants** — CDN-free CSS, the `design-system-ref.md` class vocabulary, the
   four view states, the testable interaction hooks. A recommendation that needs Tailwind, GSAP, or
   an external asset is out of scope; express the *intent* in plain CSS or drop it.
3. **Performance / style selection** (its 3–4).
4. **Everything else**, charts last (its 10).

---

## Pre-delivery checklist

`{UIUX_DIR}/references/pro-rules.md` is the upstream pre-launch checklist (icons, interaction
feedback, contrast, safe areas, a11y). `qa-validator` reads it when `UIUX_DIR != none` and reports
misses as warnings — the kit's own `qa-checklist.md` remains the blocking gate.

---

## Degradation

When `UIUX_DIR == none`, or `python3` is missing, or a query exits non-zero:

- Do **not** fail the station and do **not** retry more than once.
- Fall back to first-principles reasoning plus the trend directives in `templates/design-brief.md`
  (those are self-contained and do not need the database).
- Record `design_authority: first-principles (ui-ux-pro-max unavailable)` in the brief's provenance
  block so the reviewer knows the design was not rule-sourced.
- The orchestrator surfaces this in the REVIEW_PACKET as
  `Design authority: ui-ux-pro-max ✅ | first-principles ⚠️ (run: npm i -g ui-ux-pro-max-cli && uipro init --ai claude)`.

Never invent database output. If a query returned nothing usable, say so rather than fabricating a
rule row.
