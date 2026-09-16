---
name: accessibility
description: Audit or fix accessibility in React components — semantic HTML, keyboard navigation, focus management, ARIA, accessible names for shadcn/ui primitives (Dialog, Select, Combobox, Tooltip), live regions for loading and error states, and verification with axe, Playwright, or Chrome DevTools. Use when building interactive UI, fixing an a11y finding, or reviewing a component for accessibility.
---

# Accessibility

## When to use

- Building or reviewing anything interactive: buttons, forms, dialogs, menus, tables, tabs.
- A component renders loading / error / empty states from a query.
- Fixing an axe, Lighthouse, or manual-audit finding.
- Wrapping a shadcn primitive in a local component — that is where accessible names get lost.

The hard constraints live in the `accessibility` rule and apply whether or not this skill is
loaded. This skill is the reasoning, the shadcn specifics, and the verification procedure.

## Audit procedure

1. **Read the markup for semantics.** Every interactive element is a `<button>` or `<a href>`; every
   input has a `<label>`; landmarks (`<nav>`, `<main>`) are real elements, not roles.
2. **Check accessible names.** Icon-only controls, `DialogTitle`, standalone `SelectTrigger`,
   `Tooltip`-as-name — see [shadcn-names.md](references/shadcn-names.md). These are the failures
   that survive code review most often.
3. **Keyboard pass.** Tab order matches visual order, focus ring visible, `Enter`/`Space` work,
   dialogs trap and restore focus. Details in [verification.md](references/verification.md).
4. **Check the four data states.** Loading, error, empty, and loaded — each announced through one
   `aria-live` region that exists before the content changes. Pattern in
   [examples.md](examples.md).
5. **Run axe** in dev or CI, then confirm the fix. Automated tools catch about a third of real
   issues — they never tell you the focus order is illogical.

When a running app is available, drive steps 3–5 through the `playwright` MCP server (its snapshot
*is* the accessibility tree) or `chrome-devtools` MCP for computed names, roles, and contrast.

## Triage

Fix in this order when a component has several findings — highest blocking impact first:

| Priority | Failure |
|----------|---------|
| Blocks the task | `onClick` on a `<div>`; focus lost after a dialog closes; unnamed icon-only control; input with no label |
| Makes it hostile | Focus ring removed; dialog with no title; state signalled by color alone; async content with no live region |
| Degrades it | Low contrast; decorative icon not `aria-hidden`; tab order fighting visual order; missing `alt` |

Full table with causes and fixes in [verification.md](references/verification.md).

## References

- [examples.md](examples.md) — Bad/Good pairs for every constraint, plus the four-state live region
- [references/shadcn-names.md](references/shadcn-names.md) — Dialog, Select, Combobox, Tooltip, Tabs, Checkbox, Table, Progress, Toast
- [references/verification.md](references/verification.md) — keyboard pass, axe in dev and CI, MCP-driven checks, failures ranked by impact
