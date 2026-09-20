# Browser Debug — Few-shot Examples

## Example 1: Verify new form submission

**Request:** "Check that the create product form works"

**Steps:**
1. Confirm dev server is running; open the create product page in Chrome
2. `take_snapshot` — locate form fields and submit button
3. `fill_form` — enter test values (name, price, category)
4. `click` — submit button
5. `list_network_requests` — confirm POST to `/products` returns 201
6. `list_console_messages` — ensure no errors
7. Report success or fix mutation/API issues in code

---

## Example 2: Debug styling issue

**Request:** "The UserCard layout is broken on mobile"

**Steps:**
1. Navigate to the page showing UserCard
2. `take_screenshot` — capture current visual state
3. `take_snapshot` — inspect DOM structure and applied classes
4. Compare against Tailwind classes in `UserCard.tsx` and `cn()` compositions
5. Fix Tailwind classes or variant logic and re-verify

---

## Example 3: Diagnose blank page

**Request:** "Orders page shows empty after my changes"

**Steps:**
1. Navigate to `/orders`
2. `list_console_messages` — look for React errors or query failures
3. `list_network_requests` — check if orders API call failed (4xx/5xx)
4. `take_snapshot` — see if Empty/Spin/Error component is rendered
5. Trace issue to react-query hook, API response shape, or component conditional
