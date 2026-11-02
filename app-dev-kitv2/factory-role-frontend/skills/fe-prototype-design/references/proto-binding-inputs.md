# Finding binding design inputs

A brand colour, font, layout or mockup the human provided is **binding**: it is applied verbatim
and wins over the neutral defaults, ui-ux-pro-max and your own taste. The designer finds these by
reading — there is no script for it in v2. This is the reading procedure, adapted from the v1
html-generator-kit `collect-design-inputs.mjs` signals.

## Where to look, in priority order

| Priority | Origin | Path | Counts as a source |
|---|---|---|---|
| 1 | Human notes | `human-notes.yaml` (inlined in T1) | any note that states a design value or structure |
| 2 | Design folder | `.factory/design/**` | **every** readable file, signals or not, and every image |
| 3 | Inbox | `.factory/inbox/**` | an image always; a text file when it has a strong signal |
| 4 | Spec | the PRD or delta-spec (T2), its `sources` | a strong signal in the text |
| 5 | Normalised sources | `.factory/context/normalised/*.md` | a strong signal; use it to find the inbox line |
| 6 | Existing prototype | `.factory/prototype/design-brief.md` | earlier binding rows stay unless overridden |

When two sources disagree, the higher priority wins; inside one origin, the newer file wins. Record
the loser as a deviation (`conflicts with <file:line>`).

None of these folders is a T2 input of the prototype stage, so reach them with **scoped** searches
— Glob with `path: .factory/design` (or `.factory/inbox`, …; an unscoped Glob is blocked) and
`grep -rnE` through Bash on those folders — and spend Reads only on files that matched. A Glob that
finds no `.factory/design` folder is fine.

## Signals

Search the text files with `grep -rniE '<pattern>' .factory/design .factory/inbox .factory/context/normalised`
(Bash; the designer has no Grep tool), then open each hit with `offset`/`limit` around
the line (about 20 lines) and the whole section under a design-related heading.

**VALUE signals** — a line holding a concrete design value:

- a colour: `#` plus 6 or 8 hex digits, or `rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `oklab(`, `lab(`, `lch(`;
- a CSS custom property declaration: `--name:`;
- `font-family:`.

Pattern: `#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|--[a-z][\w-]*\s*:|font-family\s*:`

**STRONG phrases** — a design statement even without a value: palette, colour scheme / palette /
theme, primary / secondary / accent / brand colour(s), dark / light / brand / corporate theme,
theming, brand guide(lines) / book / identity / fonts, branding, style guide, design system / tokens
/ language / reference, look and feel, typeface, typography, font family / pairing, sidebar, side
nav, top nav(igation), navbar, nav bar, tab bar, bottom nav, figma, mockup(s), wireframe(s).

Pattern (case-insensitive): `palette|colou?r (scheme|palette|theme)|(primary|secondary|accent|brand) colou?rs?|theming|branding|brand (guide|book|identity|fonts?)|style ?guide|design (system|tokens?|language|reference)|look and feel|typeface|typography|font (family|pairing)|side ?nav|sidebar|top ?nav|navbar|nav bar|tab bar|bottom nav|figma|mockups?|wireframes?`

**Weak words** — theme, colour, font, layout, header, footer, rounded, radius, shadow, spacing,
density, logo — are not a source on their own: "status shown as words, not colour alone" is an
accessibility rule, "Brand" may be an entity name. Read the line before treating it as design.

**Images** (`.png .jpg .jpeg .webp .gif .svg`) in the design folder or the inbox are always a
source. Open each with Read and look at it: layout archetype, nav items and their order, header
contents, colours you can name only approximately (an image colour is a structure hint, not a
binding hex — unless the image is a swatch sheet that prints the values).

## What to extract

For each source, every **concrete** statement:

- colours: primary, secondary, accent, background, surface, text, border, status colours;
- fonts: body and heading families (weights only if stated);
- shape: radius, shadow (flat or not), density (compact or comfortable);
- structure: sidebar or top nav, nav items and their order, header contents, page composition,
  component styling (pill buttons, flat cards), light by default.

Write each into the brief's binding table with `file:line` (or the image name) and how it is
applied. Values that map to a token also go into the report's `binding` list; structure rows stay
in the brief and steer `screens.yaml`, the shell and `navigation.js`.

A provided **dark** theme or a request for motion is recorded as a deviation ("the prototype is
light only and static"), never applied.

## No binding inputs

If nothing matched after reading, write `Binding reference: none — no source stated a concrete
design value` in the brief, set `design_authority: neutral` (or `derived` when only structure was
stated), leave `binding: []`, and use the neutral defaults in [proto-tokens.md](proto-tokens.md).
List the files you checked in `design_sources` anyway, so the human sees what was looked at.
