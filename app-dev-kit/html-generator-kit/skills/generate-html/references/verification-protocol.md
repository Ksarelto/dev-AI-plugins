# Verification Protocol — html-generator-kit

Static QA (`qa-validator`) greps text and cannot see whether a page actually *renders*. This protocol
adds a real render + functionality check between QA (Station 6) and human review (Station 7), so a
blank or unstyled page can never pass silently. Owned by `html-orchestrator` (Station 6.5).

---

## Why this exists

The original pipeline had no render step. A prototype could pass every static check while showing
an unstyled, tiny, or blank page (missing `components.css`, a `62.5%` root, a broken asset path, or
an Alpine init failure). This protocol catches all of those by loading the pages in a real browser.

## Intermediate artifacts (always produced)

```
{OUTPUT_DIR}/_verify/
├── report.json            # machine-readable pass/fail + per-page metrics + flows[] + axe[]
└── screenshots/           # three PNGs per screen: desktop, mobile (390px), dark
    ├── index.png · index__mobile.png · index__dark.png
    └── pages__{id}.png · pages__{id}__mobile.png · pages__{id}__dark.png
```

These are review aids — include the screenshot paths in the human-review packet. `_verify/` is
excluded from the prototype's own asset scan.

## How the orchestrator runs it (Station 6.5)

```bash
node {KIT_DIR}/skills/generate-html/scripts/verify-prototype.mjs "{OUTPUT_DIR}" --port 4599
```

`KIT_DIR` is the plugin root. Never run `.spec/html-generator-kit/scripts/verify-prototype.mjs`
(that path does not exist even as a legacy copy — the script lives under `skills/generate-html/scripts/`).

The script self-serves `{OUTPUT_DIR}` over http (never `file://`) and:

1. **Static gate** (always): no Tailwind CDN, no inline `<style>`/`<script>`, every local `css`/`js`
   asset resolves, no leftover `ALL_CAPS` placeholders.
2. **Render gate** (when Playwright is available): headless Chromium loads `index.html` and every
   page, waits for Alpine to strip `x-cloak`, then asserts it is **styled**:
   - no page-fatal console errors,
   - root font-size ≥ 14px (guards the tiny-elements regression),
   - a present shell is styled — if the page has a `.sidebar` it is ≥ 200px wide, or a `.topnav` it is
     ≥ 40px tall (shell-less centered pages like login are exempt),
   - `.btn-primary` has a real background (guards missing `components.css`).
3. **Functionality gate** (smart generic heuristics — no per-screen manifest; conventions in
   `{KIT_DIR}/skills/generate-html/references/interaction-conventions.md`). Each is recorded in `report.flows[]`:
   - **navigation** — every `a[href$=".html"]` target file exists (dead link → critical),
   - **modal** — click `[data-modal-open]` → a `.modal[role="dialog"]` shows → `[data-modal-close]`
     / Escape hides it (fail → critical),
   - **form** — on pages with a `<form>` + `required` fields: empty submit must be blocked
     (`.form-error` / `:invalid` / `form.was-validated`); a filled submit must succeed
     (empty submit not blocked → critical; valid submit rejected → warning),
   - **dev-panel** — cycles loading/empty/error/success and each state's root becomes visible.
4. **Accessibility** (when `axe-core` is importable): runs axe per page; `critical`-impact
   violations are criticals, `serious` ones are warnings.
5. **Screenshots**: desktop + mobile (390px) + dark-mode per screen.

Exit code: `0` pass, `1` critical issues, `2` setup error.

## Enabling the browser check

The **orchestrator must not install** Playwright or axe-core (`npm i` in the consumer repo is a
side effect a subagent must not take). If the script reports "Playwright not installed":

- Static gate still runs.
- Render check is `SKIPPED` (warning on `REVIEW_PACKET`, not a hard fail).
- The **generate-html skill** may offer to install, then re-spawn `MODE: revise` with
  `CHANGE_REQUEST: re-run Station 6.5 only`.

Skill-owned install (only after the user agrees):

```bash
npm i -D playwright >/dev/null 2>&1 || true
npx --yes playwright install chromium
npm i -D axe-core >/dev/null 2>&1 || true   # optional: enables the accessibility audit
node {KIT_DIR}/skills/generate-html/scripts/verify-prototype.mjs "{OUTPUT_DIR}" --port 4599
```

The accessibility audit is optional — if `axe-core` is not importable (and `AXE_MODULE` is unset),
axe is skipped with a warning and the render + functionality gates still apply.

### Isolated Playwright installs (`PLAYWRIGHT_MODULE`)

If the project's own `npm i -D playwright` conflicts with existing peer deps (ERESOLVE), the **skill**
(not the orchestrator) may install Playwright in a throwaway dir and point the script at it — ESM
`import()` ignores `NODE_PATH`, so pass the module entry explicitly:

```bash
mkdir -p /tmp/pwlib && (cd /tmp/pwlib && npm i playwright)
npx --yes playwright install chromium
PLAYWRIGHT_MODULE=/tmp/pwlib/node_modules/playwright/index.js \
  node {KIT_DIR}/skills/generate-html/scripts/verify-prototype.mjs "{OUTPUT_DIR}" --port 4599
```

## Gate semantics

| Result | Meaning | Orchestrator action |
|--------|---------|---------------------|
| PASS (exit 0) | No critical issues | Return `REVIEW_PACKET` with screenshots |
| FAIL (exit 1) | ≥1 critical issue | Route each issue to the owning agent (screen-generator / design-system-author / assembly-wiring), re-run affected station, then re-verify (max 1 auto-fix cycle) before `ESCALATION_PACKET` |
| SETUP ERROR (exit 2) | Bad dir/port | Fix invocation and retry |

Per-task discipline: run this check after ANY station that rewrites files (design system, a page,
assembly), not only at the end — the same script works on a partial prototype.
