---
name: add-text-content
description: Add translated copy with react-i18next — slice keys in <slice>/locales/en.json + keys.ts, app-wide keys in shared/lib/i18n/locales/common. Use whenever a slice needs a new user-facing string, label, placeholder, aria-label, toast, validation message, or enum label — no hardcoded UI strings and no string maps.
argument-hint: <slice> <key> "<English value>"
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Grep]
---

# Add Text Content

Copy is **frontend-dev-kit:i18n** (`react-i18next`). Load it; this skill is the FSD placement.

## Steps

1. **List every user-visible string** the slice renders that does not come from the server: headings, body text, labels, placeholders, button text, `aria-label` / `alt` / `title`, toasts, empty / error / success copy, zod messages, nav and breadcrumb labels, enum labels. With a prototype, take the English value verbatim from `prototype-inventory.md` (Prototype text column).
2. **Reuse first.** `Grep` `shared/lib/i18n/locales/common/en.json` and the slice's `locales/en.json`. Save, Cancel, Retry, Close, generic errors, and loading copy are `common` keys — never duplicated per slice.
3. **Place the key:**
   | Copy | File |
   |------|------|
   | Used by one slice | `src/<layer>/<slice>/locales/en.json` + `keys.ts` (typed key paths) |
   | Used across slices / app chrome | `src/shared/lib/i18n/locales/common/en.json` + `keys.ts` |
   Register a new slice namespace the way `frontend-dev-kit:i18n` shows. `shared/config` holds no text.
4. **Enums:** the enum stays in the slice `model/`. Add one key per value and an enum → key map (`LISTING_STATUS_KEY`), rendered with `t(LISTING_STATUS_KEY[status])`. Never `{ FREE: 'In cupboard' }`.
5. **Validation:** a zod message is the key (`z.string().min(1, keys.errors.nameRequired)`); `FormMessage` translates it.
6. **Render** with `t(keys.…)` in the component. No literal JSX text, no literal copy attribute, no fallback English string.

## What this skill does NOT do

- Does not write components.
- Does not remove existing keys.
- Does not translate server data.
