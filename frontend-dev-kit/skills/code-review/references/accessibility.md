# Accessibility — review checklist

Distilled from the `accessibility` skill. Applies to any changed interactive `.tsx`: buttons,
forms, dialogs, menus, tables, tabs, and anything rendering loading/error/empty states.

Triage order — highest blocking impact first:

| Priority | Failure |
|---|---|
| Blocks the task | `onClick` on a `<div>`/non-interactive element; focus lost after a dialog closes; unnamed icon-only control; input with no `<label>` |
| Makes it hostile | Focus ring removed; dialog with no accessible title; state signalled by color alone; async content with no live region |
| Degrades it | Low contrast; decorative icon not `aria-hidden`; tab order fighting visual order; missing `alt` |

Specific checks:
- Every interactive element is a real `<button>` or `<a href>`, not a styled `<div>`/`<span>` with a click handler.
- Every input has a `<label>` (visible or `aria-label`), and every landmark (`<nav>`, `<main>`) is a real element, not a bolted-on role.
- Icon-only controls, a `DialogTitle`, a standalone `SelectTrigger`, or a `Tooltip`-as-name have an accessible name — these are the most common review-time misses when wrapping a shadcn primitive.
- Tab order matches visual order; focus ring is visible; `Enter`/`Space` activate custom controls; a dialog traps focus while open and restores it on close.
- Loading / error / empty / loaded states are each announced through one `aria-live` region that exists before the content changes — not four separately-conditioned regions.

## Severity

Anything in the "Blocks the task" row is **Must fix**. "Makes it hostile" is **Must fix** if it's a
pattern repeated 3+ times, otherwise **Should fix**. "Degrades it" is **Should fix**.
