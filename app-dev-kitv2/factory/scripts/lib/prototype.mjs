// The living app prototype (.factory/prototype/): one static, clickable HTML prototype of the whole app
// that every feature with a UI change updates in place. The engine snapshots it when a feature's
// prototype stage starts (so an abort or a revert restores it), computes which pages the feature
// added, changed or removed, and runs the static QA that gate-proto reports (ported from
// html-generator-kit qa-prototype.mjs, without the polish checks: this prototype is for understanding).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { YAML, fileHash, toPosix } from "./core.mjs";

export const prototypeDir = (projectDir) => join(projectDir, ".factory", "prototype");
const snapshotDir = (featureDir) => join(featureDir, "02b-prototype", "before");
const SHARED = ["index.html", "js/navigation.js", "js/app.js", "js/data.js", "css/tokens.css", "css/base.css", "css/components.css"];

function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name);
    return statSync(abs).isDirectory() ? walk(abs, base) : [toPosix(relative(base, abs))];
  });
}

/** Copies the prototype aside once per stage entry; records that there was none, too. */
export function snapshotPrototype(projectDir, featureDir) {
  const to = snapshotDir(featureDir);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  const from = prototypeDir(projectDir);
  if (existsSync(from)) cpSync(from, join(to, "prototype"), { recursive: true });
  return { existed: existsSync(from), at: new Date().toISOString() };
}

/** Puts the prototype back as it was when the stage started (abort, `factory proto --revert`). */
export function restorePrototype(projectDir, featureDir) {
  const snap = join(snapshotDir(featureDir), "prototype");
  if (!existsSync(snapshotDir(featureDir))) return { restored: false, reason: "no snapshot: the prototype stage never started" };
  rmSync(prototypeDir(projectDir), { recursive: true, force: true });
  if (existsSync(snap)) cpSync(snap, prototypeDir(projectDir), { recursive: true });
  return { restored: true, existed: existsSync(snap) };
}

/** Pages this feature added, changed or removed, by content against the snapshot. */
export function pageChanges(projectDir, featureDir) {
  const before = join(snapshotDir(featureDir), "prototype", "pages");
  const after = join(prototypeDir(projectDir), "pages");
  const ids = (dir) => new Set(walk(dir).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)));
  const was = ids(before);
  const now = ids(after);
  return {
    added: [...now].filter((id) => !was.has(id)).sort(),
    changed: [...now].filter((id) => was.has(id) && fileHash(join(before, `${id}.html`)) !== fileHash(join(after, `${id}.html`))).sort(),
    removed: [...was].filter((id) => !now.has(id)).sort(),
  };
}

export function readScreens(projectDir) {
  const file = join(prototypeDir(projectDir), "screens.yaml");
  return existsSync(file) ? YAML.parse(readFileSync(file, "utf8")) ?? { screens: [] } : null;
}

/** Screens a feature's fan-out builds: the ones the designer marked added or changed. */
export const screensToBuild = (screens) => (screens?.screens ?? []).filter((s) => ["added", "changed"].includes(s.status));

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Static QA of the prototype folder. Returns gate failures; warn: true ones never block.
 * `only` limits the per-page checks to one screen (a screen writer's own exit check).
 */
export function prototypeQa(projectDir, { screens, report, only } = {}) {
  const root = prototypeDir(projectDir);
  const out = [];
  const fail = (rule, file, message, warn = false) => out.push({ check: "prototype", rule, file: `.factory/prototype/${file}`, message, ...(warn ? { warn: true } : {}) });
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);
  const all = screens?.screens ?? [];
  const live = all.filter((s) => !["removed", "placeholder"].includes(s.status));

  if (!only) for (const rel of SHARED) if (read(rel) === null) fail("missing-shared", rel, `${rel} is missing (the prototype-designer writes it)`);
  for (const s of live.filter((x) => !only || x.id === only)) if (read(`pages/${s.id}.html`) === null) fail("missing-page", `pages/${s.id}.html`, `${s.id} is in screens.yaml but pages/${s.id}.html does not exist`);
  for (const s of all.filter((x) => x.status === "removed")) if (read(`pages/${s.id}.html`) !== null) fail("removed-page-left", `pages/${s.id}.html`, `${s.id} is marked removed but its page still exists`);

  const index = read("index.html") ?? "";
  const nav = read("js/navigation.js") ?? "";
  if (!only) {
    for (const s of live) {
      if (index && !index.includes(`pages/${s.id}.html`)) fail("not-linked", "index.html", `index.html does not link pages/${s.id}.html`);
      if (nav && !new RegExp(`['"]${escape(s.id)}['"]`).test(nav)) fail("not-in-nav", "js/navigation.js", `navigation.js does not list ${s.id}`);
    }
    // Every link to a page must resolve: placeholders are nav entries without an href to pages/.
    const pageFiles = new Set(walk(join(root, "pages")).map((f) => f.replace(/\.html$/, "")));
    const linkSources = [["index.html", index], ...[...pageFiles].map((id) => [`pages/${id}.html`, read(`pages/${id}.html`) ?? ""])];
    for (const [file, html] of linkSources) {
      for (const [, id] of html.matchAll(/href="(?:\.\.\/|\.\/)?(?:pages\/)?([a-z0-9-]+)\.html"/g)) {
        if (id !== "index" && !pageFiles.has(id)) fail("dead-link", file, `${file} links ${id}.html, which does not exist`);
      }
    }
    for (const rel of ["css/tokens.css", "css/base.css", "css/components.css"]) if ((read(rel) ?? "").includes("⟨")) fail("leftover-slot", rel, `${rel} has a leftover ⟨SLOT⟩ marker`);
    const components = read("css/components.css") ?? "";
    if (components && !components.includes(":focus-visible")) fail("no-focus-style", "css/components.css", "components.css defines no :focus-visible style", true);
    const tokens = read("css/tokens.css") ?? "";
    const deviated = new Set((report?.deviations ?? []).map((d) => d.token).filter(Boolean));
    for (const b of report?.binding ?? []) {
      if (deviated.has(b.token)) continue;
      if (!new RegExp(`${escape(b.token)}\\s*:\\s*${escape(b.value.trim())}\\s*;`, "i").test(tokens)) fail("binding-not-applied", "css/tokens.css", `${b.attribute}: the provided value ${b.token}: ${b.value} (${b.source}) is not in tokens.css — apply it or list a deviation with the reason`);
    }
  }

  for (const s of live.filter((x) => !only || x.id === only)) {
    const file = `pages/${s.id}.html`;
    const html = read(file);
    if (html === null) continue;
    const body = html.split(/<body/i)[1] ?? "";
    for (const state of s.states ?? []) if (!new RegExp(`data-state=["']${escape(state)}["']`).test(html)) fail("state-missing", file, `${s.id}: state "${state}" has no data-state="${state}" block`);
    if (!/class="[^"]*\bdev-panel\b/.test(html)) fail("no-dev-panel", file, `${s.id}: no dev-panel to switch states`);
    if (!/<main\b/i.test(html)) fail("no-main", file, `${s.id}: no <main> landmark`);
    if (/<style[\s>]/i.test(body)) fail("inline-style", file, `${s.id}: inline <style> — styles belong in css/*.css`);
    for (const [, attrs, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc=/.test(attrs) && content.trim().length > 20) fail("inline-script", file, `${s.id}: inline <script> — behaviour belongs in js/*.js`);
    }
    for (const m of html.matchAll(/<nav\b[^>]*>/gi)) if (!/\baria-label=/.test(m[0])) fail("nav-unlabelled", file, `${s.id}: <nav> without aria-label`, true);
    if (/class="[^"]*\bmodal\b/.test(html) && !/data-modal-close/.test(html)) fail("modal-no-close", file, `${s.id}: a modal without data-modal-close`, true);
    if (/<form\b/i.test(html) && !(/\brequired\b/.test(html) && /type="submit"/.test(html))) fail("form-unchecked", file, `${s.id}: a form without required fields or a submit button`, true);
    if (/chart\.js|\bd3(\.min)?\.js|apexcharts|echarts/i.test(html)) fail("chart-library", file, `${s.id}: references a chart library — the prototype adds no dependencies`, true);
    if (!/<title>/i.test(html)) fail("no-title", file, `${s.id}: no <title>`, true);
    if (/Lorem ipsum|\bTODO\b|PLACEHOLDER/.test(body)) fail("placeholder-text", file, `${s.id}: placeholder text — use the values from the acceptance criteria`, true);
  }
  return out;
}
