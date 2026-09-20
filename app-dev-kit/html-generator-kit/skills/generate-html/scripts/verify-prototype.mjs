#!/usr/bin/env node
// Render + functionality verification for a generated HTML prototype.
//
// Usage:
//   node verify-prototype.mjs <PROTOTYPE_DIR> [--port 4599]
//
// What it does:
//   1. Serves PROTOTYPE_DIR over http (never file://).
//   2. Static checks on every .html: no Tailwind CDN, no inline <style>/<script>,
//      CSS/JS assets resolve, no leftover ALL_CAPS placeholders.
//   3. If Playwright is importable: launches headless Chromium, opens index.html and
//      each page, waits for Alpine (x-cloak removed), then asserts the prototype is
//      actually STYLED:
//        - no page-fatal console errors
//        - body root font-size >= 14px  (guards the old 62.5%/tiny-elements bug)
//        - sidebar OR topnav rendered at a sane size  (guards unstyled layout)
//        - primary button has a non-default background  (guards missing components.css)
//      ...and actually FUNCTIONAL, via smart generic heuristics (no per-screen manifest):
//        - navigation: every a[href$=".html"] target file exists (no dead links)
//        - modal: click [data-modal-open] → .modal[role=dialog] shows → close → it hides
//        - form: submit with empty required fields is BLOCKED (.form-error/:invalid/was-validated),
//                then filling required fields + submit succeeds (no visible .form-error)
//        - dev-panel: cycles loading/empty/error/success and each state root becomes visible
//      Each interaction is recorded in report.flows[] with pass/fail.
//   4. Accessibility: if axe-core is available, runs it per page; critical-impact violations
//      are criticals, serious ones are warnings.
//   5. Screenshots per screen: desktop, mobile (390px), and dark-mode, under _verify/screenshots/.
//   6. Writes <PROTOTYPE_DIR>/_verify/report.json and prints a summary.
//
// Exit code: 0 = pass, 1 = critical issues, 2 = usage/setup error.
//
// Optional env: PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.js
//               AXE_MODULE=/abs/path/to/axe-core/axe.min.js  (else tries ./node_modules)

import http from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const port = Number((args.find((a) => a.startsWith('--port')) || '').split('=')[1] || args[args.indexOf('--port') + 1] || 4599);
if (!dir || !existsSync(dir)) {
  console.error('verify-prototype: PROTOTYPE_DIR not found. Usage: node verify-prototype.mjs <dir> [--port N]');
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
  const ph = html.match(/\b(PAGE_TITLE|APP_TITLE|ENTITY_DATA_FN|ENTITY_PLURAL|SUCCESS_CONTENT_BLOCK|NAV_ITEMS_BLOCK|PAGE_CARDS_BLOCK|PRIMARY_[A-Z_]+)\b/g);
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
  // A CJS module imported via ESM exposes named exports on the namespace OR on .default,
  // depending on how it was resolved — check both.
  const pick = (m) => (m && (m.chromium || (m.default && m.default.chromium))) || null;
  // Explicit escape hatch for isolated installs: PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.js
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
  try { const c = pick(await import('playwright')); if (c) return c; } catch {}
  try { const c = pick(await import('playwright-core')); if (c) return c; } catch {}
  return null;
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

const flows = [];               // per-interaction results across all pages
const pushFlow = (page, name, status, detail) => { flows.push({ page, name, status, detail }); };

async function main() {
  await new Promise((r) => server.listen(port, r));
  const base = `http://localhost:${port}`;
  const chromium = await loadPlaywright();
  const axeSource = loadAxeSource();
  const report = { dir, port, pages: pages.length, browser: !!chromium, axe: !!axeSource, checks: [], flows, critical, warnings };

  if (!chromium) {
    pushW('Playwright not installed — browser render + functionality check skipped (static checks only). Install with: npx playwright install chromium && npm i -D playwright');
  } else {
    if (!axeSource) pushW('axe-core not found — accessibility audit skipped. Install with: npm i -D axe-core (or set AXE_MODULE).');
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const rel = (f) => relative(dir, f).replaceAll('\\', '/');
    for (const f of pages) {
      const url = `${base}/${rel(f)}`;
      const r = rel(f);
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      const entry = { page: r };
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
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
        if (errors.length) pushW(`${r}: ${errors.length} console error(s): ${errors[0]}`);

        // ── FLOW: navigation link integrity (no dead links) ───────────
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

        // ── FLOW: modal open → close ──────────────────────────────────
        const modalTrigger = await page.$('[data-modal-open]');
        if (modalTrigger) {
          await modalTrigger.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(200);
          const opened = await page.evaluate(() => {
            const m = document.querySelector('.modal[role="dialog"], .modal-overlay');
            return !!(m && m.offsetParent !== null);
          });
          if (!opened) { pushC(`${r}: [data-modal-open] did not reveal a .modal[role=dialog]`); pushFlow(r, 'modal', 'fail', 'did not open'); }
          else {
            const cancel = await page.$('.modal [data-modal-close]');
            if (cancel) await cancel.click().catch(() => {});
            else await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            const closed = await page.evaluate(() => {
              const m = document.querySelector('.modal[role="dialog"]');
              return !m || m.offsetParent === null;
            });
            if (!closed) { pushC(`${r}: modal did not close via [data-modal-close]/Escape`); pushFlow(r, 'modal', 'fail', 'did not close'); }
            else pushFlow(r, 'modal', 'pass', 'open+close ok');
          }
        }

        // ── FLOW: form validation (empty blocked → filled succeeds) ───
        const form = await page.$('form');
        const requiredCount = form ? (await page.$$('form [required]')).length : 0;
        if (form && requiredCount > 0) {
          const submitBtn = await page.$('form [type="submit"], form button[type="submit"]');
          if (!submitBtn) { pushW(`${r}: form has required fields but no type="submit" control`); pushFlow(r, 'form', 'skip', 'no submit button'); }
          else {
            // 1) empty submit must be blocked
            await page.evaluate(() => document.querySelectorAll('form [required]').forEach((el) => { el.value = ''; }));
            await submitBtn.click({ timeout: 4000 }).catch(() => {});
            await page.waitForTimeout(200);
            const blocked = await page.evaluate(() => {
              const errShown = [...document.querySelectorAll('.form-error')].some((e) => e.offsetParent !== null);
              const invalid = !!document.querySelector('form [required]:invalid');
              const validated = !!document.querySelector('form.was-validated');
              return errShown || invalid || validated;
            });
            if (!blocked) { pushC(`${r}: empty required form submitted without validation`); pushFlow(r, 'form', 'fail', 'empty submit not blocked'); }
            else {
              // 2) fill required fields, submit again → should succeed
              await page.evaluate(() => {
                document.querySelectorAll('form [required]').forEach((el) => {
                  if (el.tagName === 'SELECT') { const opt = [...el.options].find((o) => o.value); if (opt) el.value = opt.value; }
                  else el.value = 'Test value';
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                });
              });
              await submitBtn.click({ timeout: 4000 }).catch(() => {});
              await page.waitForTimeout(250);
              const stillErroring = await page.evaluate(() =>
                [...document.querySelectorAll('.form-error')].some((e) => e.offsetParent !== null)
                || !!document.querySelector('form [required]:invalid'));
              if (stillErroring) { pushW(`${r}: valid form submit still shows errors — success path may be unwired`); pushFlow(r, 'form', 'fail', 'valid submit rejected'); }
              else pushFlow(r, 'form', 'pass', 'validate + accept ok');
            }
          }
        }

        // ── FLOW: dev-panel cycles all four states ────────────────────
        if (await page.$('.dev-panel')) {
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
        }

        // ── accessibility (axe-core) ──────────────────────────────────
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

        // ── screenshots: desktop + mobile + dark ──────────────────────
        const shotBase = r.replace(/[\/]/g, '__').replace(/\.html$/, '');
        const shot = join(shotsDir, `${shotBase}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        entry.screenshot = relative(dir, shot);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(120);
        const shotM = join(shotsDir, `${shotBase}__mobile.png`);
        await page.screenshot({ path: shotM, fullPage: true });
        entry.screenshotMobile = relative(dir, shotM);
        await page.setViewportSize({ width: 1280, height: 900 });

        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.waitForTimeout(120);
        const shotD = join(shotsDir, `${shotBase}__dark.png`);
        await page.screenshot({ path: shotD, fullPage: true });
        entry.screenshotDark = relative(dir, shotD);
        await page.evaluate(() => document.documentElement.classList.remove('dark'));
      } catch (e) {
        pushC(`${r}: navigation/render failed — ${String(e).split('\n')[0]}`);
      }
      report.checks.push(entry);
      await page.close();
    }
    await browser.close();
  }

  report.critical = critical;
  report.warnings = warnings;
  report.flows = flows;
  report.passed = critical.length === 0;
  writeFileSync(join(verifyDir, 'report.json'), JSON.stringify(report, null, 2));

  server.close();
  const flowCount = (s) => flows.filter((x) => x.status === s).length;
  console.log(`\n── Prototype verification ──`);
  console.log(`dir:      ${dir}`);
  console.log(`pages:    ${pages.length}   browser: ${chromium ? 'chromium' : 'SKIPPED (no playwright)'}   axe: ${axeSource ? 'on' : 'off'}`);
  console.log(`screenshots: ${report.checks.filter((c) => c.screenshot).length} screens ×3 (desktop/mobile/dark) → ${relative(process.cwd(), shotsDir)}`);
  if (flows.length) {
    console.log(`\nFLOWS: ${flowCount('pass')} pass · ${flowCount('fail')} fail · ${flowCount('skip')} skip`);
    flows.filter((x) => x.status !== 'pass').forEach((x) => console.log(`  ${x.status === 'fail' ? '✗' : '·'} ${x.page} [${x.name}] ${x.detail}`));
  }
  if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach((w) => console.log('  • ' + w)); }
  if (critical.length) { console.log(`\nCRITICAL (${critical.length}):`); critical.forEach((c) => console.log('  ✗ ' + c)); }
  console.log(`\nRESULT: ${report.passed ? 'PASS ✅' : 'FAIL ❌'}   (report: ${relative(process.cwd(), join(verifyDir, 'report.json'))})`);
  process.exit(report.passed ? 0 : 1);
}

main().catch((e) => { console.error(e); server.close(); process.exit(2); });
