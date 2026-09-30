---
name: i18n
description: Internationalize React components with react-i18next — every user-visible string as a typed key (global copy in shared/lib/i18n/locales, feature copy in the feature's locales), no hardcoded strings or string-map objects, useTranslation, the Trans component for embedded markup, Intl formatters for dates/numbers/currency, plural forms, translated zod messages, and RTL-safe layout. Use when adding translated copy or a new user-facing string, formatting a date/number/currency value, wiring up a plural count, or handling bidirectional text.
---

# i18n (react-i18next)

## When to use

- Adding any new user-facing string — including `aria-label`, `alt`, `title`, `placeholder`, `sr-only` text, toasts, validation messages, and empty/error/fallback copy.
- Porting copy from the HTML prototype into the app.
- Formatting a date, number, currency, relative time, or list for display.
- A string needs a plural form or embeds a link/bold text (`<Trans>`).
- Building layout that must work in both LTR and RTL locales.

Hard constraints: `rules/i18n.mdc`. Layout and key typing are in `architecture-audit` `references/i18n.md`. This skill is the procedure.

## What must be translated

Everything a user can see or hear that did not come from the server:

| Translate | Do not translate |
|-----------|------------------|
| JSX text, headings, button labels, badges | Server data rendered as-is (`user.name`, `listing.description`) |
| `aria-label`, `alt`, `title`, `placeholder`, `sr-only` | A server message the API returns for display |
| `label` / `description` props passed to shared components | Ids, route paths, class names, `data-*` values |
| `notify.success/error` messages | Enum wire values (`'ASKED_FOR'`) — map them to a key |
| Zod validation messages | Developer-only `Error` messages that are never rendered |
| Loading / empty / error / error-boundary copy | |

## Instructions

1. **Copy files.** Shared strings: `shared/lib/i18n/locales/common/en.json` + `keys.ts` (`commonKeys`) — actions (`save`, `cancel`, `retry`, `close`), generic states, error-boundary copy. Feature strings: `features/{f}/locales/en.json` + `keys.ts`. An entity, widget, or page that owns copy uses the same pair in its own `locales/`. Mechanism (`config.ts`, `format.ts`, `keys.ts`, `translate-message.ts`, `index.ts`) lives in `shared/lib/i18n/` and contains no strings. No `src/locales/`, no `shared/locales/`, no `shared/config/textContent.ts`. Provider is `I18nProvider` in `app/providers/`.
2. **No string maps.** Never write an object of English strings — `const LABELS = {…}`, `TextContent`, `STATUS_LABELS`, a `constants.ts` of messages. A union that needs labels maps to **keys**, and `t()` runs at render:

   ```ts
   export const LISTING_STATUS_KEY = {
     [ListingStatus.Free]: catalogueKeys.status.free,
     [ListingStatus.Out]: catalogueKeys.status.out,
   } satisfies Record<ListingStatusValue, string>;
   ```
3. **Type the keys.** Each `locales/keys.ts` exports `as const satisfies NestedKeysOf<typeof en>` (`NestedKeysOf` is in `shared/lib/i18n/keys.ts`). `en` is the source of truth — a key only in another locale is a bug.
4. **Call `t()` with the typed key**: `t(usersKeys.list.emptyState)` or `commonKeys`. No raw `'list.emptyState'` literal. Do not import another feature's `locales/keys.ts`; copy two features share moves to `common`. `models/` never imports keys and never calls `t()`.
5. **Reuse before adding.** Search `common/en.json` for the string first (`Cancel`, `Save`, `Retry`). Do not add `features/orders/…/cancel`.
6. **Prototype copy is verbatim.** When a prototype page is bound, its visible text becomes the `en.json` values unchanged — headings, labels, placeholders, empty/error messages, button text — unless the spec changes it.
7. **Interpolate, don't concatenate**: `t(key, { name })`. Plurals use `count` plus `_one`/`_other` in the JSON, never `count === 1 ? … : …`.
8. **Copy with embedded markup or a link** is one key rendered with `<Trans i18nKey={usersKeys.termsNotice}>` — never split the sentence around JSX.
9. **Validation messages are keys.** `z.string().min(1, usersKeys.form.errors.nameRequired)`. The re-homed `FormMessage` in `shared/ui/form/` passes the error through `translateMessage` (`shared/lib/i18n/translate-message.ts`), so a key becomes copy and a server field error (already human text, not a key) renders unchanged:

   ```ts
   import i18next, { type ParseKeys } from 'i18next';

   const isTranslationKey = (value: string): value is ParseKeys => i18next.exists(value);

   export const translateMessage = (message: string): string => {
     if (!isTranslationKey(message)) {
       return message;
     }

     return i18next.t(message);
   };
   ```

   The guard narrows without a cast. Confirm `ParseKeys` against the installed i18next version; with namespaced resources the key must carry its namespace.
10. **Toasts are translated at the call site**: `notify.success(t(usersKeys.create.success))`.
11. **Dates, numbers, currency** use the formatters in `shared/lib/i18n/format.ts` (`useCurrencyFormatter` and the rest). Currency code comes from the money value, not the locale. Do not call `toFixed`, `toLocaleString`, or construct `Intl.*` inside a component.
12. **Direction-safe styling**: logical Tailwind utilities (`ms-`/`me-`, `ps-`/`pe-`, `text-start`, `start-`) instead of `ml-`/`mr-`/`left-`/`right-`, in `styles.ts`.
13. **Register the namespace** on `CustomTypeOptions.resources` in `shared/lib/i18n/config.ts` in the same change as a new namespace.

## Checklist

- [ ] No hardcoded user-facing string — JSX text, `aria-label`/`alt`/`title`/`placeholder`, `sr-only`, toasts, zod messages, fallbacks
- [ ] No object, constant, or `constants.ts` holding English copy; unions map to keys
- [ ] Strings live in `shared/lib/i18n/locales/common/` or the owning slice's `locales/` — not `src/locales/`, not `shared/config`
- [ ] UI calls `t(usersKeys....)` / `commonKeys`, not a raw key string
- [ ] New key added to `en.json` and `keys.ts` in this change; existing `common` keys reused
- [ ] Prototype copy matches `en.json` verbatim
- [ ] Plurals use `count` + `_one`/`_other`, not a manual branch
- [ ] Embedded markup/links use `<Trans>`, not concatenated fragments
- [ ] Dates/numbers/currency use `shared/lib/i18n/format.ts`
- [ ] `models/` does not import translation keys
- [ ] Layout uses logical (`ms-`/`ps-`/`text-start`) utilities, not physical `ml-`/`left-`

See [examples.md](examples.md) for Bad/Good pairs covering keys, string maps, `<Trans>`, pluralization, and formatters.
