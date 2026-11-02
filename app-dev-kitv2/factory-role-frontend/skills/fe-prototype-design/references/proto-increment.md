# Updating the living prototype for one feature

There is one prototype for the whole app. Each feature with a UI change updates it in place; the
engine copied the folder to `02b-prototype/before/` when the stage started and compares pages by
content against that copy. Your `screens.yaml` must say truthfully what this feature does to each
page, and you must leave every other page byte-for-byte alone.

## Status per screen, relative to this feature

| Status | Meaning | Page file after the stage | Who writes the page |
|---|---|---|---|
| `added` | a new screen in this feature | exists, did not exist before | one prototyper |
| `changed` | an existing screen whose content this feature changes | exists, content differs | one prototyper |
| `unchanged` | exists and this feature does not touch it | identical to before | nobody |
| `removed` | this feature removes the screen | deleted (by you) | — |
| `placeholder` | a nav entry for a screen nobody has prototyped yet | none | — |

gate-proto checks the truth of it: a new page not marked `added`, a changed page not marked
`changed`, or a deleted page not marked `removed` fails `status-untrue`; `changed` on an identical
page is a warning (`unchanged-marked-changed`); a `removed` screen whose page still exists fails
`removed-page-left`.

## Procedure

1. **Reset statuses.** Statuses describe the current feature only. At the start, every screen of an
   earlier feature becomes `unchanged` (it has a page) or stays `placeholder` (it has none). Drop
   entries an earlier feature marked `removed`.
2. **Map stories to screens.** For each story of this feature with `ux.surfaces`, each surface name
   is one screen. Its id is the kebab-case of the name (`CheckoutSummary` → `checkout-summary`,
   `Order list` → `order-list`), or keep an existing id and set `surface: <name>` on it. gate-proto
   looks the surface up exactly that way (`surface-without-screen`).
3. **Decide each screen's status.**
   - surface with no screen yet → `added`;
   - surface whose screen is a `placeholder` → `added` (the page is new);
   - surface whose screen exists and the story changes what it shows or does → `changed`;
   - a delta-spec or story that removes a surface → `removed`, and delete `pages/<id>.html` (`rm`);
   - everything else → `unchanged`.
4. **Fill each added or changed screen**: `title`, `surface` (when the id differs from the kebab
   name), `page_type` (list, detail, form, dashboard, settings, wizard, other), `entity`, `stories`
   (this feature's story ids that touch it — at least one, or gate-proto fails
   `screen-without-story`), `features` (append this feature's id), `states`, `nav`.
5. **States.** The union of every story's `ux.states` for that surface, kebab-cased (`Invalid
   coupon` → `invalid-coupon`), plus the states the UX notes list for it. On a `changed` screen keep
   the states it already had unless a story removes one. Every one must be in `states`
   (`state-not-on-screen`), and the prototyper builds one `data-state` block per entry.
6. **Navigation.** Add new screens to `navigation.js` (`SCREENS`, in nav order) and to `index.html`
   (a card with `href="pages/<id>.html"`); turn a placeholder card into a link when it becomes
   `added`; remove `removed` screens from both. Nothing else in either file changes order or text
   without a reason in the increment log.
7. **Never touch a page.** You do not write `pages/*.html` at all. Not for a nav change (navigation is
   rendered from `navigation.js`), not for a token change (pages only use `var(--token)` through the
   CSS files), not to "tidy". Shared CSS and JS may change: pages pick it up without their own file
   changing.

## First run on a brownfield app

No `.factory/prototype/` exists yet, but the app does. Build the shell and only this feature's
pages:

- `layout` and nav groups from binding inputs, otherwise from the app's areas in
  `app-profile.yaml` / the capability index (T2) — one group per top-level area;
- each existing area the feature does not touch becomes a `placeholder` screen (an id, a `title`,
  `nav`, no page, no `stories`), shown as "not prototyped yet" in the nav and on the index;
- this feature's surfaces are `added`; even a surface that exists in the real app is `added` here,
  because its prototype page is new;
- components the screens need that the app already has go into the report's `components` with
  `existing: true` (from the component inventory), so the architect plans reuse.

On a greenfield app, there are no placeholders unless the PRD names areas outside this feature.

## A revision (T3 present)

- The fan-out re-runs only the screens whose page or note failed; a failure in a shared file,
  `screens.yaml` or the report re-runs you. Fix exactly what T3 lists.
- Read the screen notes in `02b-prototype/screens/*.yaml` of this feature: a `needs_classes` entry
  is a class a prototyper needed and the CSS lacks — add it to `components.css` (and to the brief's
  vocabulary line) or tell the prototyper which existing class to use, via the note in your summary.
- A human rejection at GATE-P comes with the human's note in T1; apply it to the shared design or to
  `screens.yaml`, then let the affected screens be rebuilt by marking them `changed`/`added` as they
  truly are.

## Worked example

Before FEAT-002: `checkout-summary` (added by FEAT-001), `orders` (placeholder). FEAT-002 stories:
STORY-0005 adds surface `OrderList` with states `[loading, empty, populated]`; STORY-0006 adds a
"Reorder" button to `CheckoutSummary`'s confirmation state.

```yaml
screens:
  - { id: checkout-summary, title: Checkout, page_type: detail, entity: Order, stories: [STORY-0006],
      features: [FEAT-001, FEAT-002], states: [empty, applied, invalid, loading, confirmed], status: changed,
      nav: { label: Checkout, order: 2 } }
  - { id: order-list, title: Orders, surface: OrderList, page_type: list, entity: Order, stories: [STORY-0005],
      features: [FEAT-002], states: [loading, empty, populated], status: added, nav: { label: Orders, order: 1 } }
```

The old `orders` placeholder becomes `order-list` (`added`, the id now follows the surface name);
`navigation.js` and `index.html` link `order-list`; the designer touches no page.
