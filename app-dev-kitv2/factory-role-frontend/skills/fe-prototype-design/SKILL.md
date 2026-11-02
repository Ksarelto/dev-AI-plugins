---
name: fe-prototype-design
description: Procedure for the factory prototype-designer — update the living app prototype's design brief, tokens, shared CSS and JS, navigation shell and screens.yaml for one feature. Preloaded by the prototype-designer; not for direct use.
user-invocable: false
---

# Prototype design (S2.5, first dispatch)

Runs on: prototype-designer (sonnet) — one dispatch per feature with a UI change: the shared design, shell and screen list of the app's one living HTML prototype, before the per-screen prototypers run.

There is ONE clickable static prototype for the whole app in `.factory/prototype/`. Its job is to
make the spec understandable: clear, not polished. Binding brand values are applied verbatim;
otherwise one neutral light theme. No signature effects, no motion, no dark mode, no build step.

| Topic | Reference |
|---|---|
| Statuses, removed pages, placeholders, brownfield first run, revisions | [proto-increment.md](references/proto-increment.md) |
| Finding binding values (signals, priority, images) | [proto-binding-inputs.md](references/proto-binding-inputs.md) |
| Token names, neutral defaults, contrast self-check | [proto-tokens.md](references/proto-tokens.md) |
| `base.css` / `components.css` vocabulary, `app.js`, `data.js`, `navigation.js`, `index.html` | [proto-shared-assets.md](references/proto-shared-assets.md) |
| The brief template, binding table, deviations | [proto-design-brief.md](references/proto-design-brief.md) |
| Optional ui-ux-pro-max lookup | [proto-uiux-pro-max.md](references/proto-uiux-pro-max.md) |

## 1. Orient

1. **T0.** The outputs and the paths you may write (`.factory/prototype/**`, the feature's
   `02b-prototype/prototype-report.yaml`), the exit check (`gate proto`), and the note that screen
   prototypers run after you. T3 on a retry: fix exactly what it lists.
2. **T2.** Stories (`ux.surfaces`, `ux.states`, Gherkin), UX notes (states per surface), the PRD or
   delta-spec (entities, exact values, NFRs), `screens.yaml` if a prototype exists, app profile,
   capability index and component inventory (brownfield), human notes.
3. **Existing prototype.** If `.factory/prototype/` exists: read `screens.yaml`, `design-brief.md`,
   `css/tokens.css`, `js/navigation.js`, `js/data.js`. You will not read or write the pages.
4. **Binding inputs.** Follow [proto-binding-inputs.md](references/proto-binding-inputs.md): scoped
   searches of `.factory/design`, `.factory/inbox`, `.factory/context/normalised`, open every image,
   note each concrete value with `file:line`. Your read budget is small (T4): `grep -rnE` in Bash first, Read only the hits.

## 2. Screens (`screens.yaml`)

Follow [proto-increment.md](references/proto-increment.md):

1. Reset every earlier screen to `unchanged` / `placeholder`; drop old `removed` entries.
2. One screen per story surface: id = kebab-case of the `ux.surfaces` name, or an existing id with
   `surface: <name>`.
3. Status per screen: `added`, `changed`, `unchanged`, `removed` (delete its page with `rm`),
   `placeholder` (brownfield areas not prototyped yet — no page, no href).
4. Each added or changed screen: `title`, `page_type`, `entity`, `stories` (this feature's ids,
   at least one), `features` (append), `states` (every story `ux.states` value kebab-cased, plus the
   UX notes' states), `nav` (`label`, `order`, `hidden` for detail pages reached from a list).
5. Top level: `app` (the app name) and `layout` (`sidebar` | `top-nav`).

The file is schema-checked when you write it (`prototype-screens`); fix any error the hook reports.

## 3. Shared design and assets

1. **Tokens.** First run: the neutral defaults from [proto-tokens.md](references/proto-tokens.md).
   Then each binding colour, font or radius as `<token>: <value>;` verbatim. Later features: change
   a token only for a new binding value. Never rename or remove a token.
2. **Contrast.** Run the self-check for every colour pair you set; a derived token that fails is
   adjusted, a provided one is kept and its pairing fixed, or an `a11y-risk` deviation is recorded.
3. **CSS.** `base.css` and `components.css` with the class vocabulary in
   [proto-shared-assets.md](references/proto-shared-assets.md), including `:focus-visible`. Add a
   class only when a new page type needs one; record it in the brief. No raw colour outside
   `tokens.css`, no transitions, no keyframes, no `.dark`, no `⟨…⟩` slot markers.
4. **`app.js`.** The generic states-and-stores file, as written in the reference.
5. **`data.js`.** One `Alpine.data('<Entity>Data', …)` block per entity this feature adds or changes,
   with records built from the ACs' exact values (codes, amounts, messages, limits) and one record
   per status the stories mention. Leave other entities' blocks alone.
6. **Shell.** `navigation.js` (`SCREENS`: every non-removed screen in nav order, `live` or
   `placeholder`) and `index.html` (a literal `href="pages/<id>.html"` card per live screen; a
   placeholder card without a link). Layout archetype from binding inputs, else sidebar for many
   areas, top-nav for few.
7. **Brief.** Update `design-brief.md` per [proto-design-brief.md](references/proto-design-brief.md):
   provenance, binding table, deviations, composition per page type, contrast table, increment log.
8. **ui-ux-pro-max** only if it is already on the machine
   ([proto-uiux-pro-max.md](references/proto-uiux-pro-max.md)); never claim it was used when it was not.

## 4. Report (`02b-prototype/prototype-report.yaml`)

```yaml
feature: FEAT-001
design_authority: provided          # provided | derived | neutral
design_sources: [.factory/design/brand.md, .factory/inbox/checkout-mock.png]
binding:
  - { attribute: Primary colour, value: "#0A3D62", source: ".factory/design/brand.md:4", token: --primary }
  - { attribute: Body font, value: "'Inter'", source: ".factory/design/brand.md:7", token: --font-sans }
deviations:
  - { attribute: Heading font, token: --font-display, provided: Brandon Grotesque, reason: "not on Google Fonts; system stack used" }
screens:
  - { name: CheckoutSummary, file: pages/checkout-summary.html, stories: [STORY-0001, STORY-0002] }
components:
  - { name: CouponField, screens: [checkout-summary], existing: false }
  - { name: Button, screens: [checkout-summary], existing: true }
spec_delta:
  - { change: "No story says where the user lands after removing the last coupon", breaking: false, kind: discovered, affects: [STORY-0001] }
```

- `binding`: every token row of the brief's binding table; `value` is the exact string in
  `tokens.css` (gate-proto greps `token: value;`). A deviation with a `token` skips its row.
- `screens`: this feature's added, changed and removed screens; `file` is `pages/<id>.html`.
- `components`: the building blocks the screens use; `existing: true` when the component inventory
  has it (brownfield), so the architect plans reuse.
- `spec_delta`: what you found while designing (an area the nav needs and no story covers, two
  stories that disagree on a surface). Classify `kind` and `breaking` as in the prototyper's
  [proto-spec-delta.md](../fe-prototype/references/proto-spec-delta.md). `[]` when none.

## 5. Exit check

Run `gate proto` from T0. Expected until the prototypers run: `missing-page`, `no-screen-note`,
`dead-link` and report `missing-page` lines for this feature's added or changed screens. Everything
else must pass: schemas, `status-untrue`, `removed-page-left`, `screen-without-story`,
`story-without-screen`, `surface-without-screen`, `state-not-on-screen`, `missing-shared`,
`not-linked`, `not-in-nav`, `leftover-slot`, `binding-not-applied`, `report-unknown-screen`.
Warnings (`no-focus-style`, `unchanged-marked-changed`) are worth fixing but never block.
On a retry, `needs-classes` (a screen note asked for classes) is yours: add them to
`css/components.css`; the engine then rebuilds that screen, whose new note drops the request.

## 6. Envelope

`artifacts_written`: every shared file you changed, `screens.yaml`, the report, any deleted page.
`summary`: design authority, binding values applied, deviations, the screens to build
(`added: …, changed: …`), placeholders. `deviations`: `{what, why}` per deviation. `status`:
`done`, or `needs_clarification` when two binding sources conflict and priority does not settle it.
