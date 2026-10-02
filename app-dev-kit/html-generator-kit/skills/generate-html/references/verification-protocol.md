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

The script resolves Playwright in this order, so it works whether the kit is used as an installed
plugin or checked out as a consumer-repo copy:

1. `PLAYWRIGHT_MODULE` (explicit override, see below)
2. **the kit's own `node_modules`** — `playwright-core` is a kit dependency (`package.json`); the
   `SessionStart` hook installs it automatically, so most installs need nothing further here
3. the consumer repo's `node_modules` (`process.cwd()`)
4. a bare-specifier import, as a last resort

Module resolution only gets you the Playwright **API** — the browser **binary** is a separate,
larger download that nothing installs automatically (not the hook, not the orchestrator: a
multi-hundred-MB download is not a side effect a subagent, or a `SessionStart` hook, may take
silently). If no browser binary is present, `launch()` fails fast (within ~5s, checked via
`executablePath()` before attempting it) rather than hanging, then falls back to an installed
system Chrome/Chromium via the `chrome` channel. If that also fails, the render check is `SKIPPED`.

The **orchestrator must not install** Playwright, axe-core, or a browser binary (a side effect a
subagent must not take). If the script reports "Playwright not installed" or no browser binary /
system Chrome was found:

- Static gate still runs — a broken prototype still fails on dead links, missing assets, Tailwind,
  inline scripts, etc.
- Render check is `SKIPPED`. This is **not** a silent warning: Station 6.5 returns an
  `ESCALATION_PACKET` with `options: ["install-browser", "proceed-unverified", "abort"]` so a human
  explicitly decides, rather than the prototype drifting to review unverified by default.
- On `install-browser`, the **generate-html skill** (not the orchestrator) runs the install below,
  then re-spawns `MODE: revise` with `CHANGE_REQUEST: re-run Station 6.5 only`.
- On `proceed-unverified`, the review packet is headed `⚠ UNVERIFIED` so the human reviewer knows
  no browser ever opened the pages.

Skill-owned install (only after the user agrees to `install-browser`):

```bash
npx --yes playwright install chromium   # browser binary only — playwright-core is already a kit dep
node {KIT_DIR}/skills/generate-html/scripts/verify-prototype.mjs "{OUTPUT_DIR}" --port 4599
```

The accessibility audit is optional — if `axe-core` is not importable (and `AXE_MODULE` is unset),
axe is skipped with a warning and the render + functionality gates still apply.

### Force a static-only run (`VERIFY_SKIP_BROWSER`)

Set `VERIFY_SKIP_BROWSER=1` to skip the browser entirely regardless of what's installed — useful
for a fast CI pass that only wants the static gate, or to reproduce the SKIPPED path deterministically.

### Isolated Playwright installs (`PLAYWRIGHT_MODULE`)

If the project's own Playwright install conflicts with existing peer deps (ERESOLVE), or you want to
point at a separate copy of Playwright entirely, set `PLAYWRIGHT_MODULE` to its module entry — ESM
`import()` ignores `NODE_PATH`, so a bare specifier alone cannot reach an arbitrary install location:

```bash
mkdir -p /tmp/pwlib && (cd /tmp/pwlib && npm i playwright)
npx --yes playwright install chromium
PLAYWRIGHT_MODULE=/tmp/pwlib/node_modules/playwright/index.js \
  node {KIT_DIR}/skills/generate-html/scripts/verify-prototype.mjs "{OUTPUT_DIR}" --port 4599
```

## Gate semantics

| Result | Meaning | Orchestrator action |
|--------|---------|---------------------|
| PASS (exit 0), `report.browser: true` | No critical issues, browser ran | Return `REVIEW_PACKET` with screenshots |
| PASS (exit 0), `report.browser: false` | Static gate passed, but no browser ever opened the pages | Return `ESCALATION_PACKET` with `options: ["install-browser", "proceed-unverified", "abort"]` — never fold into a plain `REVIEW_PACKET` |
| FAIL (exit 1) | ≥1 critical issue | Route each issue to the owning agent (screen-generator / design-system-author / assembly-wiring), re-run affected station, then re-verify (max 1 auto-fix cycle) before `ESCALATION_PACKET` |
| SETUP ERROR (exit 2) | Bad dir/port | Fix invocation and retry |

Per-task discipline: run this check after ANY station that rewrites files (design system, a page,
assembly), not only at the end — the same script works on a partial prototype.
