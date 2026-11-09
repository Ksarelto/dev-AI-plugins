# QA heuristics catalogue

A heuristic is a way of looking for trouble. Each charter names one or two. For every heuristic:
what to try, how to drive it (UI through the Playwright MCP browser; API through `curl` on
loopback), and what counts as a failure. Use the values the spec gives (limits, formats, roles)
before inventing your own.

## Boundaries

- Try: empty, one, the maximum, one over the maximum, one under the minimum; the first and the last
  page; zero and negative amounts; the exact limit an AC names (`max 50` → 50 and 51).
- UI: type the value with `browser_type`, submit, `browser_snapshot` for the message or the result.
- API: `curl -s -o /dev/stdout -w '%{http_code}' -X POST localhost:<port>/… -d '…'`.
- Failure: the limit is not enforced, the message is missing or wrong, a 500 instead of a 422.

## Input

- Try: long text (1,000+ characters), Unicode (emoji, accents, CJK, right-to-left), leading and
  trailing spaces, pasted values with line breaks, HTML or script-looking text (`<b>x</b>`,
  `"><img src=x>`), SQL-looking text (`' OR 1=1 --`), wrong formats (letters in a number, an
  invalid email), lowercase vs uppercase codes.
- Failure: text rendered as HTML, a crash, silent truncation the spec does not allow, a value
  accepted that the spec rejects, an injected string reaching an error message verbatim.

## Data volume

- Try: many rows (more than one page; ten times the page size if the API lets you create them),
  very long names in lists and tables, a list with exactly the page size, an empty list.
- Failure: no pagination or a broken next page, duplicates or gaps across pages, layout breaks,
  the page becomes unusably slow (note the time you waited), the empty state missing.

## Interruption

- Try: reload in the middle of a flow, browser back after submit, navigating away while a request
  runs, closing a dialog while saving, submitting and immediately navigating.
- Failure: lost input the spec says is kept, a half-saved record, an error page, a stuck spinner.

## Network (slow, offline, 5xx)

- Try: stop the backend process you started (offline / connection refused), then act in the UI;
  call an endpoint with a body that makes it fail; use a downstream the app depends on being down
  when you can stop it. Slow network cannot be throttled with the granted browser tools — note it as
  not covered unless the app has a documented delay switch.
- Check `browser_network_requests` for the status the UI received and `browser_console_messages`
  for errors.
- Failure: no error state, a raw error or stack trace shown, the retry missing when the spec has
  one, data shown as saved when the request failed.

## Concurrency

- Double submit: click the submit button twice quickly (two `browser_click` calls without a wait);
  press Enter and click. Expect one record, or a clear refusal.
- Two tabs: the tab tool is not granted, so play the second tab with `curl` — change or delete the
  record through the API, then act on the stale page in the browser.
- Two users: two tokens or sessions via `curl` racing for the same unique value.
- Failure: duplicates, a lost update without a message, a 500 on conflict instead of a 409.

## State

- Try: logged out, a guest, an expired session, a first-time user with no data, a user with stale
  data, a record deleted elsewhere, the feature flag off when the spec names one.
- Failure: a crash, a blank page, someone else's data, an action allowed that the state forbids.

## Permissions

- Try every role the stories name, plus "none": open each surface and call each operation as each
  role; try another user's record ID in the URL or the API path.
- Failure: a forbidden action works (S1 when it exposes or changes another user's data), a 404 vs
  403 that differs from the contract, a control shown that the role cannot use.

## Device and viewport

- `browser_resize` to 320×640, 768×1024, 1024×768 and 1440×900; take a snapshot and a screenshot at
  each width on the feature's main surface.
- Failure: horizontal scrolling at 320, controls overlapping or cut off, a menu that cannot be
  opened, a table without a small-screen pattern, text that does not wrap.

## Visual

- Layout: alignment and spacing consistent with the rest of the app; the four data states
  (loading, empty, error, success) all look intended.
- Overflow: long words, long translations and long numbers stay inside their container.
- Contrast: text on its background readable; state not signalled by colour alone (an error has
  text or an icon too). Judge from the screenshot; note the element and colours you saw.
- Compare with the UX notes for the same surface (expected flow and states, not a pixel match).

## Accessibility

- Keyboard: from the address bar, `browser_press_key` Tab through the surface; every interactive
  element is reachable in visual order, Enter/Space activate it, Escape closes dialogs, focus
  returns to the trigger after a dialog closes, nothing traps focus.
- Focus visible: a screenshot after each Tab shows where focus is.
- Screen-reader names: `browser_snapshot` is the accessibility tree — every button, link, input and
  icon-only control has a role and a name; inputs have labels; images have alt text or are hidden.
- Live regions: after an async result (saved, failed, loading), the snapshot shows a `status` or
  `alert` region carrying the message.
- Failure severity: a control unreachable by keyboard or without a name is S2 when an
  accessibility NFR or AC covers it, otherwise S3.

## i18n

- Switch to another locale the app ships (URL parameter, setting or browser language, whichever the
  app documents); every string of the feature changes; nothing shows a raw key (`checkout.coupon.label`)
  or English fallback; dates, numbers and currencies use the locale's format.
- Failure: a raw key (S3), untranslated text (S4), a broken layout from a longer translation (S3).

## Choosing heuristics for a charter

| Story or AC shape | Heuristics that fit |
|---|---|
| a form, an input with rules | input, boundaries, concurrency (double submit), accessibility |
| a list, a table, search | data volume, boundaries, device, visual |
| money, totals, calculations | boundaries, input, i18n (formats) |
| a role-specific action | permissions, state |
| anything that calls the network | network, interruption, concurrency |
| a new screen | device, visual, accessibility, i18n |
