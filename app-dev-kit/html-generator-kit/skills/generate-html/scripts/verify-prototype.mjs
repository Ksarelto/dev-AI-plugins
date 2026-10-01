#!/usr/bin/env node
// Render + functionality verification for a generated HTML prototype.
//
// Usage:
//   node verify-prototype.mjs <PROTOTYPE_DIR> [--port 4599] [--model spec-model.json] [--brief design-brief.md]
//
// What it does:
//   1. Serves PROTOTYPE_DIR over http (never file://).
//   2. Static checks on every .html: no Tailwind CDN, no inline <style>/<script>,
//      CSS/JS assets resolve, no leftover ALL_CAPS placeholders.
//   3. If Playwright is importable: launches headless Chromium, opens index.html and each page,
//      waits for Alpine (x-cloak removed), then checks the page CLEAN (first-load, un-mutated)
//      before anything mutates it:
//        - console/error capture: pageerror + console.error are CRITICAL; a console.warn matching
//          /alpine/i (an Alpine expression error) is CRITICAL too; a same-origin (local asset)
//          request that 404s/fails is CRITICAL, a cross-origin one (e.g. a Google Fonts @import)
//          is a WARNING.
//        - render metrics: root font-size >= 14px, a present .sidebar/.topnav is sized, a present
//          .btn-primary has a real background.
//        - screenshots: desktop, mobile (390px), dark — THEN axe (light pass, then a second pass
//          with `.dark` toggled on `<html>`, restored after).
//        - mobile overflow: document scrollWidth > clientWidth at 390px is CRITICAL; any
//          overflow:hidden element whose content is clipped is a WARNING (capped at 3/page).
//        - locked-token check (only with --brief): the design brief's `## Binding reference` table
//          rows are compared against the ACTUAL getComputedStyle(:root) value in the browser.
//        - spec-conformance (only with --model): data-spec-screen/data-component/data-interaction/
//          data-field presence per spec-model.json's matching pages[] entry (match by id).
//        - dead-button detection: a visible <button> that is not a modal trigger, not a
//          type="submit" inside a form, and not inside .dev-panel is clicked and its href/toast-
//          state/body-length are compared before/after — no observable change → WARNING (this is a
//          heuristic: a button may legitimately do something invisible to this proxy, e.g. a focus
//          change — so it is never critical).
//      ...then runs the interactions that DO mutate state, each on its own fresh page
//      (`ctx.newPage()` + an init-script `sessionStorage.clear()`, applied before the page's own
//      scripts run — no extra reload needed) so one flow's leftover state never bleeds into
//      another's. Each flow's fresh page is only opened when the main pass already found something
//      for it to do (a [data-modal-open], a <form> with a required field, a .dev-panel) — the
//      minimal number of page loads, not one per possible flow regardless of relevance:
//        - modal: every [data-modal-open] on the page (capped at 10 — a list page can spawn one
//          confirm-delete modal per row) open → close.
//        - form: every <form> with >=1 [required] field (not just the first). Empty submit must be
//          BLOCKED (.form-error visible OR form.was-validated — NOT bare :invalid, which is always
//          true for an empty required field and proves nothing) AND produce NO success signal
//          (no .toast-container .alert-success, no URL change). A valid, type-aware fill (email/
//          number/date/datetime-local/select/text) must succeed with a success signal — missing
//          success is now CRITICAL (Phase 3's shared entityForm factory makes this a fixable bug
//          class, not noise).
//        - dev-panel: cycles loading/empty/error/success.
//        - navigation: every a[href$=".html"] target file exists (dead link, no browser needed),
//          PLUS (browser) an actual click from a fresh load of the source page onto every unique
//          internal link, asserting the destination's shell renders and no NEW console error
//          appears.
//        - spec-interaction targets (only with --model): for an interaction with a `target`, click
//          its [data-interaction] element from a fresh load and confirm it lands on
//          pages/{target}.html.
//   4. Writes <PROTOTYPE_DIR>/_verify/report.json:
//        { dir, port, pages, browser, browserChannel, axe, checks[], flows[], conformance[],
//          critical[], warnings[], passed }
//      `conformance[]` (only populated with --model) is one entry per matched page:
//        { page, missing_components: [], missing_interactions: [], wrong_targets: [{interaction,
//          expected, actual}], missing_fields: [], ignored_enum: boolean, missing_role_gate: boolean }
//   5. Prints a summary.
//
// Exit code: 0 = pass, 1 = critical issues, 2 = usage/setup error.
//
// Optional env: PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.js
//               AXE_MODULE=/abs/path/to/axe-core/axe.min.js  (else tries ./node_modules)
//               VERIFY_SKIP_BROWSER=1  (force the static-only path even if Playwright is installed)

import http from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, extname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { kebab } from './lib/spec-model.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const port = Number((args.find((a) => a.startsWith('--port')) || '').split('=')[1] || args[args.indexOf('--port') + 1] || 4599);
function flagValue(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return '';
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : '';
}
const modelPath = flagValue('model');
const briefPath = flagValue('brief');

if (!dir || !existsSync(dir)) {
  console.error('verify-prototype: PROTOTYPE_DIR not found. Usage: node verify-prototype.mjs <dir> [--port N] [--model spec-model.json] [--brief design-brief.md]');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const critical = [];
const warnings = [];
const pushC = (m) => { critical.push(m); };
const pushW = (m) => { warnings.push(m); };

// ── 1. collect html files ──────────────────────────────────────────────
function htmlFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '_verify') walk(p); }
      else if (extname(e.name) === '.html') out.push(p);
    }
  };
  walk(dir);
  return out;
}
const pages = htmlFiles();
if (pages.length === 0) pushC('No .html files found in prototype dir');

// ── 2. static checks ────────────────────────────────────────────────────
for (const f of pages) {
  const html = readFileSync(f, 'utf8');
  const rel = relative(dir, f);
  if (/cdn\.tailwindcss\.com/.test(html)) pushC(`${rel}: Tailwind CDN present (must be CDN-free)`);
  if (/<style[\s>]/i.test(html)) pushC(`${rel}: inline <style> block present`);
  // inline <script> (script tag without src=)
  const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
  for (const s of scriptTags) if (!/\bsrc=/.test(s)) pushC(`${rel}: inline <script> without src`);
  // leftover placeholders
  const ph = html.match(/\b(PAGE_TITLE|APP_TITLE|ENTITY_DATA_CALL|ENTITY_DATA_FN|ENTITY_PLURAL|SUCCESS_CONTENT_BLOCK|NAV_ITEMS_BLOCK|PAGE_CARDS_BLOCK|PRIMARY_[A-Z_]+)\b/g);
  if (ph) pushC(`${rel}: leftover placeholder(s): ${[...new Set(ph)].join(', ')}`);
  // asset references resolve
  const refs = [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js))"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  for (const r of refs) {
    const abs = join(f, '..', r);
    if (!existsSync(abs)) pushC(`${rel}: missing asset ${r}`);
  }
  if (!/lang="en"/.test(html)) pushW(`${rel}: <html> missing lang="en"`);
  if (!/name="viewport"/.test(html)) pushW(`${rel}: missing viewport meta`);
}

// ── 3. serve ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const abs = join(dir, p);
  try {
    if (statSync(abs).isDirectory()) { res.writeHead(403); return res.end(); }
    const body = readFileSync(abs);
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});

const verifyDir = join(dir, '_verify');
const shotsDir = join(verifyDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

async function loadPlaywright() {
  // Explicit opt-out for a fast, deterministic static-only run (CI pipelines that only want the
  // static gate, or tests that need the "no browser" path regardless of what's installed locally).
  if (process.env.VERIFY_SKIP_BROWSER) return null;

  // A CJS module imported via ESM exposes named exports on the namespace OR on .default,
  // depending on how it was resolved — check both.
  const pick = (m) => (m && (m.chromium || (m.default && m.default.chromium))) || null;

  // 1. Explicit escape hatch for isolated installs: PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.js
  // (ESM dynamic import() does not honour NODE_PATH, so a bare specifier only resolves a
  //  project-local install — this env var lets CI point at a separate copy.)
  const explicit = process.env.PLAYWRIGHT_MODULE;
  if (explicit) {
    try {
      const url = explicit.startsWith('file:') ? explicit : pathToFileURL(explicit).href;
      const c = pick(await import(url));
      if (c) return c;
    } catch (e) { console.error('PLAYWRIGHT_MODULE import failed:', e.message); }
  }

  // 2. The kit's own node_modules (this script's location, NOT process.cwd() — a bare
  //    `import('playwright')` below resolves relative to the SCRIPT, which is the plugin
  //    directory when installed as a plugin, so this covers `npm install` run in the kit).
  for (const name of ['playwright', 'playwright-core']) {
    try {
      const req = createRequire(join(scriptDir, 'noop.cjs'));
      const resolved = req.resolve(name);
      const c = pick(await import(pathToFileURL(resolved).href));
      if (c) return c;
    } catch {}
  }

  // 3. The consumer repo (process.cwd()) — covers `npm i -D playwright` run there, which is how
  //    verification-protocol.md historically told the human to install it.
  try {
    const req = createRequire(join(process.cwd(), 'noop.cjs'));
    for (const name of ['playwright', 'playwright-core']) {
      try {
        const resolved = req.resolve(name);
        const c = pick(await import(pathToFileURL(resolved).href));
        if (c) return c;
      } catch {}
    }
  } catch {}

  // 4. Last resort: a bare specifier import, in case Node's default resolution (relative to this
  //    script) finds something steps 1-3 missed (e.g. a symlinked global install).
  try { const c = pick(await import('playwright')); if (c) return c; } catch {}
  try { const c = pick(await import('playwright-core')); if (c) return c; } catch {}
  return null;
}

// A resolved chromium export may still fail to launch if no browser binary was downloaded
// (`npx playwright install chromium`). Try the bundled browser first, then an installed system
// Chrome/Chromium via the `chrome` channel — this lets verification run without a Playwright-
// managed browser download in environments where one is already present.
//
// `launch()` does NOT fail fast when the executable is simply missing — it can take close to its
// full internal timeout (~30s) before rejecting. Check `executablePath()` on disk first (near-
// instant) and always pass an explicit short `timeout` as a safety net against any other hang.
const LAUNCH_TIMEOUT_MS = 5000;
async function launchChromium(chromium) {
  let bundledExists = false;
  try { bundledExists = existsSync(chromium.executablePath()); } catch {}

  if (bundledExists) {
    try {
      return { browser: await chromium.launch({ timeout: LAUNCH_TIMEOUT_MS }), channel: 'chromium' };
    } catch { /* fall through to the system-Chrome channel below */ }
  }
  return { browser: await chromium.launch({ channel: 'chrome', timeout: LAUNCH_TIMEOUT_MS }), channel: 'chrome' };
}

function loadAxeSource() {
  const candidates = [
    process.env.AXE_MODULE,
    join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'),
    join(dir, 'node_modules', 'axe-core', 'axe.min.js'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (existsSync(c)) return readFileSync(c, 'utf8'); } catch {}
  }
  return null;
}

// ── design-brief.md "## Binding reference" table → { '--token': 'value' } ──────────────────
// Only the `Applied as` column is used (the exact CSS the kit emitted, e.g. "`--primary: #0A3D62`").
// No `## Binding reference` section (no reference was provided), or no --brief flag at all → null,
// which the caller treats as "skip silently" (this is the normal, expected case for most builds).
function parseBindingReference(path) {
  if (!path || !existsSync(path)) return null;
  const md = readFileSync(path, 'utf8');
  const section = md.match(/##\s*Binding reference\b([\s\S]*?)(?:\n##\s|$)/);
  if (!section) return null;
  const tokens = {};
  const rows = section[1].match(/^\|.*\|\s*$/gm) || [];
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue; // header separator row
    if (/^attribute$/i.test(cells[0])) continue; // header row
    const applied = cells[3].replace(/`/g, '');
    const m = applied.match(/--([a-zA-Z0-9-]+)\s*:\s*(.+)/);
    if (m) tokens[`--${m[1]}`] = m[2].trim().replace(/;$/, '');
  }
  return Object.keys(tokens).length ? tokens : null;
}

// Compare a locked token's brief value against the browser's computed value. Both are normalized
// (trim + lowercase + collapsed whitespace); a hex value is also converted to rgb() so it can match
// a browser-computed rgb() string. Anything else (oklch/hsl vs hex, etc.) falls back to the raw
// string comparison above — a real limitation, noted here rather than silently "fixed".
function hexToRgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
function normalizeColorish(v) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function tokenValuesMatch(actual, expected) {
  const a = normalizeColorish(actual);
  const e = normalizeColorish(expected);
  if (a === e) return true;
  const aRgb = a.startsWith('#') ? hexToRgb(a) : a;
  const eRgb = e.startsWith('#') ? hexToRgb(e) : e;
  if (aRgb && eRgb && normalizeColorish(aRgb) === normalizeColorish(eRgb)) return true;
  return false;
}

// Attribute-value lookup on the raw HTML source, not the live DOM. Deliberately NOT a DOM query:
// a spec component is very often a modal's content or another conditionally-rendered block, which
// lives inside an Alpine `<template x-if>`/`x-show` wrapper — real markup until the condition is
// true, but invisible to `document.querySelectorAll` while it's closed (a `<template>`'s content is
// an inert DocumentFragment, not part of the live tree). Grepping the HTML the generator actually
// wrote is what "was this component built" means here, regardless of whether it's open right now.
function htmlHasAttrValue(rawHtml, attr, value) {
  const re = new RegExp(`${attr}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
  return re.test(rawHtml);
}

// Styled-shell assertion, reused by the main per-page check and the nav click-through flow.
async function styledShellCheck(page) {
  const m = await page.evaluate(() => {
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 0;
    const aside = document.querySelector('.sidebar');
    const topnav = document.querySelector('.topnav');
    const sidebarW = aside ? aside.getBoundingClientRect().width : 0;
    const topnavH = topnav ? topnav.getBoundingClientRect().height : 0;
    return { rootFont, hasSidebar: !!aside, hasTopnav: !!topnav, sidebarW, topnavH, hasMain: !!document.querySelector('main') };
  });
  if (!m.hasMain) return { ok: false, reason: 'no <main> element' };
  if (m.rootFont < 14) return { ok: false, reason: `root font-size ${m.rootFont}px (<14)` };
  if (m.hasSidebar && m.sidebarW < 200) return { ok: false, reason: `.sidebar ${Math.round(m.sidebarW)}px wide (<200)` };
  if (m.hasTopnav && m.topnavH < 40) return { ok: false, reason: `.topnav ${Math.round(m.topnavH)}px tall (<40)` };
  return { ok: true };
}

async function waitSettled(page) {
  await page.waitForFunction(() => !document.body.hasAttribute('x-cloak'), { timeout: 5000 }).catch(() => {});
}

function pageIdFromRel(r) {
  return r.split('/').pop().replace(/\.html$/, '');
}

const flows = [];               // per-interaction results across all pages
const conformance = [];         // per-page spec-conformance results (only populated with --model)
const pushFlow = (page, name, status, detail) => { flows.push({ page, name, status, detail }); };

// ── dead-button detection (heuristic — never critical) ─────────────────────────────────────
// Finds visible <button>s that are not a modal trigger, not a form submit, and not inside the
// dev-panel, clicks each (capped at 15 to bound runtime on a button-heavy page), and compares three
// cheap signals before/after. No change in ANY signal doesn't PROVE nothing happened (e.g. a focus
// change is invisible to this proxy) — so this is reported as a warning, never a critical.
async function checkDeadButtons(page, r) {
  const candidates = await page.evaluate(() => {
    const all = [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .filter((b) => !b.closest('.dev-panel'))
      .filter((b) => !b.hasAttribute('data-modal-open'))
      .filter((b) => !(b.getAttribute('type') === 'submit' && b.closest('form')));
    const capped = all.slice(0, 15);
    capped.forEach((b, i) => b.setAttribute('data-dead-check-idx', String(i)));
    return capped.map((b, i) => ({ idx: i, name: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 60) || `button #${i + 1}` }));
  });
  const signature = () => page.evaluate(() => ({
    href: location.href,
    bodyLen: document.body.innerHTML.length,
    toastHash: [...document.querySelectorAll('.toast-container .alert, .modal[role="dialog"]')]
      .map((e) => e.className + '|' + e.textContent).join(';'),
  }));
  for (const c of candidates) {
    const before = await signature();
    const el = await page.$(`[data-dead-check-idx="${c.idx}"]`);
    if (!el) continue;
    await el.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150);
    const after = await signature();
    const changed = before.href !== after.href || before.bodyLen !== after.bodyLen || before.toastHash !== after.toastHash;
    if (!changed) pushW(`${r}: button '${c.name}' has no observable effect — dead button?`);
  }
}

// ── spec-conformance (static part — no navigation) ──────────────────────────────────────────
async function checkConformanceStatic(page, modelPage, r, rawHtml) {
  const result = { page: r, missing_components: [], missing_interactions: [], wrong_targets: [], missing_fields: [], ignored_enum: false, missing_role_gate: false };

  const hasScreenAttr = htmlHasAttrValue(rawHtml, 'data-spec-screen', modelPage.spec_id);
  if (!hasScreenAttr) pushC(`${r}: spec-conformance — <main> missing data-spec-screen="${modelPage.spec_id}"`);

  for (const comp of modelPage.components || []) {
    const ok = htmlHasAttrValue(rawHtml, 'data-component', comp);
    if (!ok) { result.missing_components.push(comp); pushC(`${r}: spec-conformance — missing data-component="${comp}" (named component never built)`); }
  }

  for (const interaction of modelPage.interactions || []) {
    const ok = htmlHasAttrValue(rawHtml, 'data-interaction', interaction.id);
    if (!ok) { result.missing_interactions.push(interaction.id); pushC(`${r}: spec-conformance — missing data-interaction="${interaction.id}"`); }
  }

  for (const field of modelPage.entity_fields || []) {
    if (field.derived) continue;
    const ok = htmlHasAttrValue(rawHtml, 'data-field', field.name);
    if (!ok) { result.missing_fields.push(field.name); pushW(`${r}: spec-conformance — no data-field="${field.name}" anywhere on the page`); }
  }

  if ((modelPage.entity_statuses || []).length) {
    const bodyText = (await page.evaluate(() => document.body.innerText || '')).toLowerCase();
    const htmlLower = rawHtml.toLowerCase();
    const present = modelPage.entity_statuses.some((s) => {
      const needle = String(s).toLowerCase();
      return bodyText.includes(needle) || htmlLower.includes(`badge-${kebab(s)}`);
    });
    if (!present) { result.ignored_enum = true; pushW(`${r}: spec-conformance — entity_statuses (${modelPage.entity_statuses.join(', ')}) never appear in rendered output`); }
  }

  if ((modelPage.roles || []).length) {
    if (!rawHtml.includes('$store.session.role')) {
      result.missing_role_gate = true;
      pushW(`${r}: spec-conformance — page.roles (${modelPage.roles.join(', ')}) set but no $store.session.role reference found`);
    }
  }

  return result;
}

// Interaction targets need an actual click + navigation, so each gets its own fresh page.
async function checkInteractionTargets(ctx, base, r, modelPage, result) {
  for (const interaction of modelPage.interactions || []) {
    if (!interaction.target) continue;
    const p = await ctx.newPage();
    try {
      await p.goto(`${base}/${r}`, { waitUntil: 'load', timeout: 15000 });
      await waitSettled(p);
      const handle = await p.evaluateHandle((id) => [...document.querySelectorAll('[data-interaction]')].find((e) => e.getAttribute('data-interaction') === id) || null, interaction.id);
      const el = handle.asElement();
      if (!el) continue; // already reported as missing above
      await el.click({ timeout: 4000 }).catch(() => {});
      await p.waitForTimeout(300);
      const landed = await p.evaluate(() => location.pathname);
      const expectedSuffix = `/pages/${interaction.target}.html`;
      const ok = landed.endsWith(expectedSuffix) || (interaction.target === 'index' && (landed === '/' || landed.endsWith('/index.html')));
      if (!ok) {
        result.wrong_targets.push({ interaction: interaction.id, expected: interaction.target, actual: landed });
        pushC(`${r}: spec-conformance — interaction ${interaction.id} should land on pages/${interaction.target}.html but landed on ${landed}`);
      }
    } catch (e) { pushW(`${r}: interaction-target check for ${interaction.id} failed — ${String(e).split('\n')[0]}`); }
    finally { await p.close(); }
  }
}

// ── navigation click-through: actually follow every unique internal link once ──────────────
async function checkNavClickThrough(ctx, base, r, hrefs) {
  const unique = [...new Set(hrefs)].filter((h) => !/^https?:/i.test(h)).slice(0, 15);
  for (const h of unique) {
    const p = await ctx.newPage();
    const newErrors = [];
    p.on('console', (m) => { if (m.type() === 'error') newErrors.push(m.text()); });
    p.on('pageerror', (e) => newErrors.push(String(e)));
    try {
      await p.goto(`${base}/${r}`, { waitUntil: 'load', timeout: 15000 });
      await waitSettled(p);
      const handle = await p.evaluateHandle((href) => [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === href) || null, h);
      const el = handle.asElement();
      if (!el) continue;
      await el.click({ timeout: 4000 }).catch(() => {});
      await p.waitForTimeout(250);
      const styled = await styledShellCheck(p);
      const flowName = `nav→${h}`;
      if (!styled.ok) { pushC(`${r}: nav link "${h}" lands on an unstyled/broken page — ${styled.reason}`); pushFlow(r, flowName, 'fail', styled.reason); }
      else if (newErrors.length) { pushC(`${r}: nav link "${h}" click introduced new console error(s): ${newErrors[0]}`); pushFlow(r, flowName, 'fail', 'new console error'); }
      else pushFlow(r, flowName, 'pass', 'click + render ok');
    } catch (e) { pushW(`${r}: nav click-through for "${h}" failed — ${String(e).split('\n')[0]}`); }
    finally { await p.close(); }
  }
}

// ── modal flow: every [data-modal-open] on a fresh, session-cleared load ───────────────────
// `addInitScript` clears sessionStorage before the page's own scripts run, so one goto is enough —
// no extra goto+reload round trip just to get a clean session (half the navigations of a
// load-then-reload approach, which matters once a page group also runs the form/dev-panel flows).
async function runModalFlow(ctx, base, r) {
  const page = await ctx.newPage();
  try {
    await page.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
    await page.goto(`${base}/${r}`, { waitUntil: 'load', timeout: 15000 });
    await waitSettled(page);

    const count = Math.min(await page.evaluate(() => document.querySelectorAll('[data-modal-open]').length), 10); // cap: a list page can spawn one confirm-delete modal per row
    for (let i = 0; i < count; i++) {
      const name = count > 1 ? `modal#${i + 1}` : 'modal';
      const triggers = await page.$$('[data-modal-open]');
      const trigger = triggers[i];
      if (!trigger) continue;
      await trigger.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(200);
      const opened = await page.evaluate(() => { const m = document.querySelector('.modal[role="dialog"]'); return !!(m && m.offsetParent !== null); });
      if (!opened) { pushC(`${r}: ${name} [data-modal-open] did not reveal a .modal[role=dialog]`); pushFlow(r, name, 'fail', 'did not open'); continue; }
      const cancel = await page.$('.modal [data-modal-close]');
      if (cancel) await cancel.click().catch(() => {});
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const closed = await page.evaluate(() => { const m = document.querySelector('.modal[role="dialog"]'); return !m || m.offsetParent === null; });
      if (!closed) { pushC(`${r}: ${name} did not close via [data-modal-close]/Escape`); pushFlow(r, name, 'fail', 'did not close'); }
      else pushFlow(r, name, 'pass', 'open+close ok');
    }
  } catch (e) { pushW(`${r}: modal flow error — ${String(e).split('\n')[0]}`); }
  finally { await page.close(); }
}

// ── form flow: every <form> with a required field, on a fresh session-cleared load ─────────
async function runFormFlow(ctx, base, r) {
  const page = await ctx.newPage();
  try {
    await page.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
    await page.goto(`${base}/${r}`, { waitUntil: 'load', timeout: 15000 });
    await waitSettled(page);

    const formCount = await page.evaluate(() => document.querySelectorAll('form').length);
    let testedAny = false;
    for (let fi = 0; fi < formCount; fi++) {
      const forms = await page.$$('form');
      const form = forms[fi];
      const requiredCount = await form.$$eval('[required]', (els) => els.length).catch(() => 0);
      if (!requiredCount) continue;
      testedAny = true;
      const label = formCount > 1 ? `form#${fi + 1}` : 'form';
      const submitBtn = await form.$('[type="submit"], button[type="submit"]');
      if (!submitBtn) { pushW(`${r}: ${label} has required fields but no type="submit" control`); pushFlow(r, label, 'skip', 'no submit button'); continue; }

      const before = await page.evaluate(() => location.href);

      // 1) empty submit must be BLOCKED (.form-error visible or was-validated — never bare :invalid)
      //    AND must produce NO success signal (blocked-but-still-saved is a distinct bug).
      await form.evaluate((f) => f.querySelectorAll('[required]').forEach((el) => { el.value = ''; }));
      await submitBtn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(200);
      const blockState = await form.evaluate((formEl) => ({
        errShown: [...formEl.querySelectorAll('.form-error')].some((e) => e.offsetParent !== null),
        validated: formEl.classList.contains('was-validated'),
      }));
      const successNow = await page.evaluate(() => !!document.querySelector('.toast-container .alert-success'));
      const afterEmpty = await page.evaluate(() => location.href);
      const blocked = blockState.errShown || blockState.validated;

      if (!blocked) {
        pushC(`${r}: ${label} empty required submit not blocked (no .form-error / form.was-validated)`);
        pushFlow(r, label, 'fail', 'empty submit not blocked');
        continue;
      }
      if (successNow || afterEmpty !== before) {
        pushC(`${r}: ${label} empty submit was blocked but ALSO produced a success signal (blocked-but-still-saved)`);
        pushFlow(r, label, 'fail', 'blocked but success signal present');
        continue;
      }

      // 2) fill every required field by type, submit again → should succeed
      await form.evaluate((formEl) => {
        formEl.querySelectorAll('[required]').forEach((el) => {
          const type = (el.getAttribute('type') || '').toLowerCase();
          if (el.tagName === 'SELECT') {
            const opt = [...el.options].find((o) => o.value);
            if (opt) el.value = opt.value;
          } else if (type === 'email') el.value = 'qa@example.com';
          else if (type === 'number') el.value = '42';
          else if (type === 'date') el.value = '2026-01-15';
          else if (type === 'datetime-local') el.value = '2026-01-15T09:30';
          else el.value = 'Test value';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      await submitBtn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(250);
      const stillErroring = await form.evaluate((formEl) => [...formEl.querySelectorAll('.form-error')].some((e) => e.offsetParent !== null));
      const successAfter = await page.evaluate(() => !!document.querySelector('.toast-container .alert-success'));
      const afterValid = await page.evaluate(() => location.href);

      if (stillErroring) { pushW(`${r}: ${label} valid form submit still shows errors — success path may be unwired`); pushFlow(r, label, 'fail', 'valid submit rejected'); }
      else if (!successAfter && afterValid === before) {
        pushC(`${r}: ${label} valid submit produced no success signal (no .toast-container .alert-success, no URL change)`);
        pushFlow(r, label, 'fail', 'valid submit missing success signal');
      } else pushFlow(r, label, 'pass', 'validate + accept ok');
    }
    if (!testedAny && formCount > 0) pushFlow(r, 'form', 'skip', 'no form had a required field');
  } catch (e) { pushW(`${r}: form flow error — ${String(e).split('\n')[0]}`); }
  finally { await page.close(); }
}

// ── dev-panel flow: cycles all four states on a fresh session-cleared load ─────────────────
async function runDevPanelFlow(ctx, base, r) {
  const page = await ctx.newPage();
  try {
    await page.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
    await page.goto(`${base}/${r}`, { waitUntil: 'load', timeout: 15000 });
    await waitSettled(page);
    if (!(await page.$('.dev-panel'))) return;

    const stateCheck = async (label, sel) => {
      const b = await page.$(`.dev-panel button[aria-label="Preview ${label} state"]`);
      if (!b) return null;
      await b.click().catch(() => {});
      await page.waitForTimeout(120);
      return page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.offsetParent !== null); }, sel);
    };
    const results = {
      loading: await stateCheck('loading', '[role="status"]'),
      empty: await stateCheck('empty', '.empty-state'),
      error: await stateCheck('error', '.alert-destructive'),
    };
    const okBtn = await page.$('.dev-panel button[aria-label="Preview success state"]');
    if (okBtn) { await okBtn.click().catch(() => {}); await page.waitForTimeout(120); }
    const shown = Object.entries(results).filter(([, v]) => v === true).map(([k]) => k);
    const missing = Object.entries(results).filter(([, v]) => v === false).map(([k]) => k);
    if (missing.length) { pushW(`${r}: dev-panel states not revealed: ${missing.join(', ')}`); pushFlow(r, 'dev-panel', 'fail', `missing: ${missing.join(', ')}`); }
    else if (shown.length) pushFlow(r, 'dev-panel', 'pass', `states ok: ${shown.join(', ')}`);
  } catch (e) { pushW(`${r}: dev-panel flow error — ${String(e).split('\n')[0]}`); }
  finally { await page.close(); }
}

async function main() {
  await new Promise((r) => server.listen(port, r));
  const base = `http://localhost:${port}`;
  const chromium = await loadPlaywright();
  const axeSource = loadAxeSource();
  const lockedTokens = parseBindingReference(briefPath);
  let specModel = null;
  if (modelPath) {
    try { specModel = JSON.parse(readFileSync(modelPath, 'utf8')); }
    catch (e) { pushW(`--model ${modelPath} could not be read/parsed — spec-conformance skipped (${String(e).split('\n')[0]})`); }
  }
  let browser = null;
  let launchChannel = null;
  if (chromium) {
    try {
      const launched = await launchChromium(chromium);
      browser = launched.browser;
      launchChannel = launched.channel;
    } catch (e) {
      pushW(`Playwright module resolved but no browser could be launched (${String(e).split('\n')[0]}) — browser render + functionality check skipped (static checks only). Install a browser with: npx playwright install chromium`);
    }
  }
  const report = { dir, port, pages: pages.length, browser: !!browser, browserChannel: launchChannel, axe: !!axeSource, checks: [], flows, conformance, critical, warnings };

  if (!chromium) {
    pushW('Playwright not installed — browser render + functionality check skipped (static checks only). Install with: npx playwright install chromium && npm i -D playwright');
  } else if (!browser) {
    // launch() failed; the specific warning was already pushed above.
  } else {
    if (!axeSource) pushW('axe-core not found — accessibility audit skipped. Install with: npm i -D axe-core (or set AXE_MODULE).');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const rel = (f) => relative(dir, f).replaceAll('\\', '/');
    let tokensChecked = false;

    for (const f of pages) {
      const url = `${base}/${rel(f)}`;
      const r = rel(f);
      const rawHtml = readFileSync(f, 'utf8');
      const page = await ctx.newPage();

      // ── console / network error capture ────────────────────────────
      const errors = [];
      const localFailures = [];
      const crossOriginFailures = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
        else if (m.type() === 'warning' && /alpine/i.test(m.text())) errors.push(`[alpine warning] ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      // The browser's own opportunistic /favicon.ico probe isn't an asset the page referenced —
      // nothing in this kit emits a <link rel="icon">, so every page would otherwise fail this
      // check on a 404 nobody asked for. Exclude it; a REAL referenced asset (css/js/img) still counts.
      const isNoiseRequest = (u) => /\/favicon\.ico(\?|$)/.test(u);
      page.on('response', (res) => {
        if (res.status() >= 400) {
          const u = res.url();
          if (isNoiseRequest(u)) return;
          (u.startsWith(base) ? localFailures : crossOriginFailures).push(`${u} (${res.status()})`);
        }
      });
      page.on('requestfailed', (req) => {
        const u = req.url();
        if (isNoiseRequest(u)) return;
        (u.startsWith(base) ? localFailures : crossOriginFailures).push(`${u} (failed)`);
      });

      const entry = { page: r };
      let hasModal = false;
      let hasForm = false;
      let hasDevPanel = false;
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => !document.body.hasAttribute('x-cloak'), { timeout: 5000 }).catch(() => {
          pushC(`${r}: x-cloak never removed — Alpine did not initialise`);
        });

        // ── render metrics (styled?) ──────────────────────────────────
        const metrics = await page.evaluate(() => {
          const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 0;
          const aside = document.querySelector('.sidebar');
          const topnav = document.querySelector('.topnav');
          const sidebarW = aside ? aside.getBoundingClientRect().width : 0;
          const topnavH = topnav ? topnav.getBoundingClientRect().height : 0;
          const btn = document.querySelector('.btn-primary');
          const btnBg = btn ? getComputedStyle(btn).backgroundColor : '';
          const bodyBg = getComputedStyle(document.body).backgroundColor;
          return { rootFont, hasSidebar: !!aside, hasTopnav: !!topnav, sidebarW, topnavH, btnBg, bodyBg };
        });
        entry.metrics = metrics;
        if (metrics.rootFont < 14) pushC(`${r}: root font-size ${metrics.rootFont}px (<14) — tiny-elements regression`);
        // layout gate: only when the page HAS a shell (auth/centered pages legitimately have none).
        // If a .sidebar/.topnav element exists, it must be sized; otherwise skip (shell-less page).
        if (metrics.hasSidebar && metrics.sidebarW < 200)
          pushC(`${r}: .sidebar present but ${Math.round(metrics.sidebarW)}px wide (<200) — layout not styled`);
        if (metrics.hasTopnav && metrics.topnavH < 40)
          pushC(`${r}: .topnav present but ${Math.round(metrics.topnavH)}px tall (<40) — layout not styled`);
        const transparent = (c) => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
        if (metrics.btnBg && transparent(metrics.btnBg)) pushC(`${r}: .btn-primary has no background — components.css not applied`);

        // ── screenshots: desktop, then mobile (+ overflow check), then dark (+ dark axe) ──
        const shotBase = r.replace(/[\/]/g, '__').replace(/\.html$/, '');
        const shot = join(shotsDir, `${shotBase}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        entry.screenshot = relative(dir, shot);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(120);
        const shotM = join(shotsDir, `${shotBase}__mobile.png`);
        await page.screenshot({ path: shotM, fullPage: true });
        entry.screenshotMobile = relative(dir, shotM);

        // ── mobile overflow (G) — while still at the 390px viewport ───
        const overflow = await page.evaluate(() => {
          const html = document.documentElement;
          const hScroll = html.scrollWidth > html.clientWidth;
          const clipped = [];
          for (const el of document.querySelectorAll('*')) {
            if (clipped.length >= 3) break;
            const cs = getComputedStyle(el);
            if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') {
              if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
                const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : el.tagName.toLowerCase();
                clipped.push(cls);
              }
            }
          }
          return { hScroll, clipped };
        });
        if (overflow.hScroll) pushC(`${r}: horizontal overflow at 390px viewport (documentElement.scrollWidth > clientWidth)`);
        if (overflow.clipped.length) pushW(`${r}: ${overflow.clipped.length} clipped element(s) at 390px: ${overflow.clipped.join(', ')}`);

        await page.setViewportSize({ width: 1280, height: 900 });
        await page.waitForTimeout(80);

        // ── axe (light pass) ───────────────────────────────────────────
        if (axeSource) {
          try {
            await page.evaluate(axeSource);
            const res = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }));
            const sev = (res.violations || []).filter((v) => ['serious', 'critical'].includes(v.impact));
            entry.axe = sev.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
            for (const v of sev) {
              const msg = `${r}: a11y ${v.impact} — ${v.id} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`;
              if (v.impact === 'critical') pushC(msg); else pushW(msg);
            }
          } catch (e) { pushW(`${r}: axe run failed — ${String(e).split('\n')[0]}`); }
        }

        // ── dark mode: screenshot + axe (dark pass), then restore ──────
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.waitForTimeout(120);
        const shotD = join(shotsDir, `${shotBase}__dark.png`);
        await page.screenshot({ path: shotD, fullPage: true });
        entry.screenshotDark = relative(dir, shotD);
        if (axeSource) {
          try {
            const res = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }));
            const sev = (res.violations || []).filter((v) => ['serious', 'critical'].includes(v.impact));
            entry.axeDark = sev.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
            for (const v of sev) {
              const msg = `${r}: a11y ${v.impact} (dark) — ${v.id} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`;
              if (v.impact === 'critical') pushC(msg); else pushW(msg);
            }
          } catch (e) { pushW(`${r}: dark-mode axe run failed — ${String(e).split('\n')[0]}`); }
        }
        await page.evaluate(() => document.documentElement.classList.remove('dark'));

        // ── locked-token check (H) — tokens.css is global, so check it once ────
        if (lockedTokens && !tokensChecked) {
          tokensChecked = true;
          const computed = await page.evaluate((tokens) => {
            const cs = getComputedStyle(document.documentElement);
            const out = {};
            for (const t of Object.keys(tokens)) out[t] = cs.getPropertyValue(t).trim();
            return out;
          }, lockedTokens);
          for (const [token, expected] of Object.entries(lockedTokens)) {
            const actual = computed[token] || '';
            if (!tokenValuesMatch(actual, expected)) {
              pushC(`${r}: tokens.css locked ${token} computed as ${actual || '(empty)'}, brief says ${expected}`);
            }
          }
        }

        // ── console/network errors (B) — critical ──────────────────────
        if (errors.length) pushC(`${r}: ${errors.length} console error(s)/pageerror(s): ${errors[0]}`);
        if (localFailures.length) pushC(`${r}: ${localFailures.length} local asset request failure(s): ${localFailures[0]}`);
        if (crossOriginFailures.length) pushW(`${r}: ${crossOriginFailures.length} cross-origin request failure(s): ${crossOriginFailures[0]}`);

        // ── navigation link integrity (no dead links) ─────────────────
        const hrefs = await page.evaluate(() =>
          [...document.querySelectorAll('a[href$=".html"]')].map((a) => a.getAttribute('href')));
        let deadLinks = [];
        for (const h of [...new Set(hrefs)]) {
          if (/^https?:/i.test(h)) continue;
          const target = join(f, '..', h.split('#')[0].split('?')[0]);
          if (!existsSync(target)) deadLinks.push(h);
        }
        if (hrefs.length) {
          if (deadLinks.length) { pushC(`${r}: dead nav link(s): ${deadLinks.join(', ')}`); pushFlow(r, 'navigation', 'fail', `dead: ${deadLinks.join(', ')}`); }
          else pushFlow(r, 'navigation', 'pass', `${hrefs.length} link(s) resolve`);
        }

        // ── spec-conformance (I) — static part, on this same unmutated page ────
        let conformanceResult = null;
        if (specModel) {
          const modelPage = (specModel.pages || []).find((p) => p.id === pageIdFromRel(r));
          if (modelPage) {
            conformanceResult = await checkConformanceStatic(page, modelPage, r, rawHtml);
          }
        }

        // ── dead-button detection (F) — on the still-unmutated page ─────
        await checkDeadButtons(page, r);

        entry.overflow = overflow;
        report.checks.push(entry);

        // ── interaction-target navigation checks (I) — need a fresh page each ──
        if (specModel && conformanceResult) {
          const modelPage = (specModel.pages || []).find((p) => p.id === pageIdFromRel(r));
          await checkInteractionTargets(ctx, base, r, modelPage, conformanceResult);
          conformance.push(conformanceResult);
        }

        // ── navigation click-through (E) — fresh page per unique link ──
        if (hrefs.length) await checkNavClickThrough(ctx, base, r, hrefs);

        // ── presence probes for the mutating flows below — a fresh page per flow is only
        //    worth spinning up when the page actually has something for that flow to do
        //    ("minimal number of page loads needed", part A) ──────────────────────────
        hasModal = await page.evaluate(() => document.querySelectorAll('[data-modal-open]').length > 0);
        hasForm = await page.evaluate(() => [...document.querySelectorAll('form')].some((f) => f.querySelector('[required]')));
        hasDevPanel = await page.evaluate(() => !!document.querySelector('.dev-panel'));
      } catch (e) {
        pushC(`${r}: navigation/render failed — ${String(e).split('\n')[0]}`);
        report.checks.push(entry);
      } finally {
        await page.close();
      }

      // ── mutating flows, each on its own fresh / session-cleared page — only when relevant ──
      if (hasModal) await runModalFlow(ctx, base, r);
      if (hasForm) await runFormFlow(ctx, base, r);
      if (hasDevPanel) await runDevPanelFlow(ctx, base, r);
    }
    await browser.close();
  }

  report.critical = critical;
  report.warnings = warnings;
  report.flows = flows;
  report.conformance = conformance;
  report.passed = critical.length === 0;
  writeFileSync(join(verifyDir, 'report.json'), JSON.stringify(report, null, 2));

  server.close();
  const flowCount = (s) => flows.filter((x) => x.status === s).length;
  console.log(`\n── Prototype verification ──`);
  console.log(`dir:      ${dir}`);
  console.log(`pages:    ${pages.length}   browser: ${browser ? launchChannel : (chromium ? 'SKIPPED (no browser binary)' : 'SKIPPED (no playwright)')}   axe: ${axeSource ? 'on' : 'off'}`);
  console.log(`screenshots: ${report.checks.filter((c) => c.screenshot).length} screens ×3 (desktop/mobile/dark) → ${relative(process.cwd(), shotsDir)}`);
  if (flows.length) {
    console.log(`\nFLOWS: ${flowCount('pass')} pass · ${flowCount('fail')} fail · ${flowCount('skip')} skip`);
    flows.filter((x) => x.status !== 'pass').forEach((x) => console.log(`  ${x.status === 'fail' ? '✗' : '·'} ${x.page} [${x.name}] ${x.detail}`));
  }
  if (conformance.length) console.log(`\nCONFORMANCE: ${conformance.length} page(s) checked against --model`);
  if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach((w) => console.log('  • ' + w)); }
  if (critical.length) { console.log(`\nCRITICAL (${critical.length}):`); critical.forEach((c) => console.log('  ✗ ' + c)); }
  console.log(`\nRESULT: ${report.passed ? 'PASS ✅' : 'FAIL ❌'}   (report: ${relative(process.cwd(), join(verifyDir, 'report.json'))})`);
  process.exit(report.passed ? 0 : 1);
}

main().catch((e) => { console.error(e); server.close(); process.exit(2); });
