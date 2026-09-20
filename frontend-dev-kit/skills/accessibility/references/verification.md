# Verifying Accessibility

Verification is three passes, cheapest first. None of them replaces the others.

### 1. Keyboard-only pass

Unplug the mouse. For the screen under review:

1. `Tab` from the top of the document to the bottom. Every interactive control must be reachable, and the **DOM order must match the visual order** — a control that reads left-to-right but tabs bottom-to-top is a bug in the markup, not something to patch with `tabIndex`.
2. Every focused element must have a **visible focus ring**. The `focus-visible:ring-*` utilities ship with the shadcn primitives; a wrapper that stripped them with `outline-none` and added no replacement is a failure.
3. `Enter` and `Space` activate buttons; `Enter` follows links. A control that responds to only one is probably not a real `<button>`.
4. Open a dialog: focus moves inside, `Tab` cycles within it (no escape to the page behind), `Escape` closes, focus returns to the trigger.
5. Positive `tabIndex` values are always wrong. Only `0` and `-1` are permitted.

### 2. Automated checks

In development, mount `@axe-core/react` in `src/main.tsx` behind `import.meta.env.DEV` so violations print to the console as you navigate. In CI, run `axe-playwright` against the built app as part of the e2e suite:

```ts
// e2e/a11y.spec.ts
import { injectAxe, checkA11y } from 'axe-playwright';

test('users page has no a11y violations', async ({ page }) => {
  await page.goto('/users');
  await injectAxe(page);
  await checkA11y(page, undefined, { detailedReport: true });
});
```

Component-level checks belong in Vitest + RTL with `jest-axe` for anything with non-trivial ARIA. Prefer RTL queries that mirror the accessibility tree — `getByRole('button', { name: 'Delete user' })` — so a broken accessible name fails an existing test rather than needing a new one.

Automated tools catch roughly a third of real issues. They will never tell you the focus order is illogical or that an `aria-label` says the wrong thing.

### 3. Driving verification through MCP

The kit already configures `playwright` and `chrome-devtools` MCP servers, so both passes above can be driven from an agent session without hand-writing a harness:

- **playwright MCP** — navigate the app, take accessibility-tree snapshots, and drive keyboard-only interaction (`Tab`, `Enter`, `Escape`) to reproduce the manual pass. The snapshot *is* the accessibility tree, so a missing accessible name shows up directly as an unnamed node.
- **chrome-devtools MCP** — inspect computed names and roles on a live page, check contrast against resolved token values, and confirm focus ring visibility in both themes.

Use them to confirm a fix, not to skip reading the markup.

## Common failures ranked by user impact

Ranked by how completely the failure blocks a task: items 1–4 make a feature unusable, 5–8 make it hostile, 9–12 make it worse.

| # | Failure | Who it blocks | Typical cause | Fix |
|---|---|---|---|---|
| 1 | `onClick` on a `<div>` / `<span>` | Keyboard and screen reader users — control is unreachable | Styling convenience | Use `<button>` / `<Button>` |
| 2 | Focus trapped or lost after a dialog closes | Keyboard users — stranded at document start | Custom dialog, or `onOpenChange` unmounting the trigger | Use shadcn `Dialog`; keep the trigger mounted |
| 3 | Icon-only button with no accessible name | Screen reader and voice-control users — control is unlabelled | Tooltip mistaken for a name | `aria-label` matching the tooltip text |
| 4 | Form input with no `<label>` | Screen reader users; also hurts everyone on small targets | Placeholder used as a label | `<FormItem>` + `<FormLabel>` |
| 5 | `outline-none` with no `focus-visible` replacement | Sighted keyboard users — no idea where they are | Design cleanup that removed the ring | Restore `focus-visible:ring-2 focus-visible:ring-ring` |
| 6 | Dialog without `DialogTitle` | Screen reader users — unnamed dialog | Title-less design | Visually hidden `DialogTitle` |
| 7 | State conveyed by color alone | Low-vision and colorblind users | Terse error display | Pair with icon and text |
| 8 | Async content swapped with no live region | Screen reader users — silent update | Loading state added late | One `aria-live` region per data surface |
| 9 | Insufficient contrast on muted text | Low-vision users | `text-muted-foreground` on a tinted surface | Check the resolved token pair, adjust the token |
| 10 | Decorative icon not `aria-hidden` | Screen reader users — noisy names | Copy-pasted icon markup | `aria-hidden` on the icon |
| 11 | Tab order not matching visual order | Keyboard users — disorienting | CSS reordering (`order`, `grid-area`) | Fix the DOM order |
| 12 | Missing `alt` on content images | Screen reader users | Oversight | Descriptive `alt`, or `alt=""` if decorative |
