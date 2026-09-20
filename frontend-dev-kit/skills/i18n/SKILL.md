---
name: i18n
description: Internationalize React components with react-i18next — key naming and namespacing, useTranslation, the Trans component for embedded markup, Intl formatters for dates/numbers/currency, plural forms, and RTL-safe layout. Use when adding translated copy or a new user-facing string, formatting a date/number/currency value, wiring up a plural count, or handling bidirectional text.
---

# i18n (react-i18next)

## When to use

- Adding any new user-facing string — including `aria-label`, `alt`, `title`, `placeholder`.
- Formatting a date, number, currency, relative time, or list for display.
- A string needs a plural form or embeds a link/bold text (`<Trans>`).
- Building layout that must work in both LTR and RTL locales.

The hard constraints live in the `i18n` rule and apply whether or not this skill is loaded. This
skill is the procedure, the formatter patterns, and the `<Trans>` templates.

## Instructions

1. **Locate or create the namespace file** — `src/locales/{lang}/{namespace}.json`, one per feature.
   Add the key to the default locale first; that file is the source of truth for structure.
2. **Name the key** hierarchically and specifically: `users.list.emptyState`, not `emptyState` or a
   raw sentence. Stop nesting at three levels.
3. **Call `t()` with a static literal**: `useTranslation('users')` then `t('list.emptyState')`. Never
   assemble a key at runtime unless every variant is enumerated in a typed `as const` map.
4. **Interpolate, don't concatenate**: `t('greeting', { name })`. For counts, use the `count` option
   and `_one`/`_other` suffixes in the JSON, never a manual `count === 1 ? ... : ...` branch.
5. **Copy with embedded markup or a link** becomes one key rendered with `<Trans>` — never split the
   sentence into fragments concatenated around JSX.
6. **Dates, numbers, currency** go through `Intl.DateTimeFormat` / `Intl.NumberFormat` /
   `Intl.RelativeTimeFormat` / `Intl.ListFormat`, built from the active locale and memoized — never a
   hand-built format or a formatter constructed per render.
7. **Direction-safe styling**: logical Tailwind utilities (`ms-`/`me-`, `ps-`/`pe-`, `text-start`,
   `start-`) instead of `ml-`/`mr-`/`left-`/`right-`. Leave room for translated copy to run ~3× longer.
8. **Sync the default locale entry** in the same change as any new key — a key present only in a
   translated locale is a bug, not a follow-up.

## Checklist

- [ ] No hardcoded user-facing string, including `aria-label`/`alt`/`title`/`placeholder`
- [ ] Key is namespaced, hierarchical, and a static literal passed to `t()`
- [ ] New key added to the default locale JSON in this change
- [ ] Plurals use `count` + `_one`/`_other`, not a manual branch
- [ ] Embedded markup/links use `<Trans>`, not concatenated fragments
- [ ] Dates/numbers/currency use `Intl.*` formatters built from the active locale, memoized
- [ ] Layout uses logical (`ms-`/`ps-`/`text-start`) utilities, not physical `ml-`/`left-`

See [examples.md](examples.md) for Bad/Good pairs covering keys, `<Trans>`, pluralization, and
formatters.
