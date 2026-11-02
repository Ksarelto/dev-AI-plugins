#!/usr/bin/env node
// Engine audit (role.yaml gates.audits): accessibility of the built app, with axe-core in a real browser.
//   node audit-axe.mjs --dist <build folder> [--routes '["/","/checkout"]'] [--critical-max <n>]
// Serves the static build itself (SPA fallback to index.html) on a free localhost port, opens each route
// with the project's Playwright (playwright or @playwright/test) and runs the project's axe-core.
// It installs nothing: without Playwright, axe-core or a build it reports one P3 "skipped" finding.
// Critical violations beyond --critical-max (quality.axe_critical_max) are P1 (blocking), serious P2,
// the rest P3.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dist = opt("--dist", "dist");
const routes = JSON.parse(opt("--routes", '["/"]') || '["/"]');
const criticalMax = Number(opt("--critical-max", "0"));
const out = (hits) => process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
const skip = (why) => out([{ rule: "axe-skipped", severity: "P3", claim: `axe audit skipped: ${why}` }]);

const req = createRequire(join(process.cwd(), "package.json"));
const load = (names) => {
  for (const n of names) {
    try {
      return { mod: req(n), name: n };
    } catch {}
  }
  return null;
};
const pw = load(["playwright", "@playwright/test"]);
let axeSource = null;
try {
  axeSource = readFileSync(req.resolve("axe-core/axe.min.js"), "utf8");
} catch {}
if (!existsSync(join(dist, "index.html"))) skip(`no ${dist}/index.html (the verification build did not produce a static app)`);
else if (!pw) skip("Playwright is not installed in the project (playwright or @playwright/test)");
else if (!axeSource) skip("axe-core is not installed in the project");
else await run();

async function run() {
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };
  const server = createServer((rq, rs) => {
    const path = normalize(decodeURIComponent(rq.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    let file = join(dist, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
    rs.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(rs);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const chromium = pw.mod.chromium ?? pw.mod.default?.chromium;
  let browser;
  const hits = [];
  try {
    browser = await chromium.launch();
  } catch (error) {
    server.close();
    return skip(`the Playwright browser could not start (${String(error.message).split("\n")[0]}) — run: npx playwright install chromium`);
  }
  let critical = 0;
  try {
    const page = await browser.newPage();
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(async () => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }));
      for (const v of result.violations) {
        if (v.impact === "critical") critical++;
        const severity = v.impact === "critical" ? (critical > criticalMax ? "P1" : "P2") : v.impact === "serious" ? "P2" : "P3";
        hits.push({ rule: `axe-${v.id}`, severity, claim: `${route}: ${v.help} (${v.impact}, ${v.nodes.length} element(s))`, evidence: v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ") });
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  out(hits);
}
