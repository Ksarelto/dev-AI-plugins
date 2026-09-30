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

Layout and key typing are in `architecture-audit` `references/i18n.md`. This skill is the procedure.

## Instructions

1. **Copy files.** Feature strings: `features/{f}/locales/en.json` and `features/{f}/locales/keys.ts`. Shared strings: `shared/lib/i18n/locales/common/en.json` and `keys.ts`. Mechanism (`config.ts`, `format.ts`, `keys.ts`, `index.ts`) lives in `shared/lib/i18n/` and contains no translation strings. No `src/locales/` and no `shared/locales/`. Provider is `I18nProvider` in `app/providers/`.
2. **Type the keys.** Each `locales/keys.ts` exports `as const satisfies NestedKeysOf<typeof en>` (`NestedKeysOf` is in `shared/lib/i18n/keys.ts`). `en` is the source of truth — a key only in another locale is a bug.
3. **Call `t()` with the typed key**: `t(usersKeys.list.emptyState)` or `commonKeys`. Do not pass a raw `'list.emptyState'` literal. Do not import another feature's `locales/keys.ts`. `models/` never imports keys and never calls `t()`.
4. **Interpolate, don't concatenate**: `t(key, { name })`. Plurals use `count` plus `_one`/`_other` in the JSON, never `count === 1 ? ... : ...`.
5. **Copy with embedded markup or a link** is one key rendered with `<Trans i18nKey={usersKeys.termsNotice}>` — never split the sentence around JSX.
6. **Dates, numbers, currency** use the formatters in `shared/lib/i18n/format.ts` (`useCurrencyFormatter` and the rest). Currency code comes from the money value, not the locale. Do not call `toFixed`, `toLocaleString`, or construct `Intl.*` inside a component.
7. **Direction-safe styling**: logical Tailwind utilities (`ms-`/`me-`, `ps-`/`pe-`, `text-start`, `start-`) instead of `ml-`/`mr-`/`left-`/`right-`.
8. **Register the namespace** on `CustomTypeOptions.resources` in `shared/lib/i18n/config.ts` in the same change as a new namespace.

## Checklist

- [ ] No hardcoded user-facing string, including `aria-label`/`alt`/`title`/`placeholder`
- [ ] Strings live in `features/{f}/locales/` or `shared/lib/i18n/locales/common/` — not `src/locales/`
- [ ] UI calls `t(usersKeys....)` / `commonKeys`, not a raw key string
- [ ] New key added to `en.json` and `keys.ts` in this change
- [ ] Plurals use `count` + `_one`/`_other`, not a manual branch
- [ ] Embedded markup/links use `<Trans>`, not concatenated fragments
- [ ] Dates/numbers/currency use `shared/lib/i18n/format.ts`
- [ ] `models/` does not import translation keys
- [ ] Layout uses logical (`ms-`/`ps-`/`text-start`) utilities, not physical `ml-`/`left-`

See [examples.md](examples.md) for Bad/Good pairs covering keys, `<Trans>`, pluralization, and
formatters.
