#!/usr/bin/env node
// Engine audit (role.yaml gates.audits): the built JavaScript stays within the bundle budget.
//   node audit-bundle.mjs --dist <build folder> --max-kb <gzip KB per chunk> [--total-kb <gzip KB for all JS>]
// Reads the build the verification precheck produced (it never builds). Prints review findings:
// P2 per chunk or total over budget, P3 when there is no build output to measure.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dist = opt("--dist", "dist");
const maxKb = Number(opt("--max-kb", "250"));
const totalKb = opt("--total-kb") ? Number(opt("--total-kb")) : null;

const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const hits = [];
if (!existsSync(dist)) {
  hits.push({ rule: "bundle-no-build", severity: "P3", claim: `no build output in ${dist}/ to measure the bundle budget (quality.bundle_kb_max)` });
} else {
  const chunks = walk(dist).filter((f) => /\.m?js$/.test(f)).map((f) => ({ file: relative(process.cwd(), f), kb: gzipSync(readFileSync(f)).length / 1024 }));
  for (const c of chunks.filter((x) => x.kb > maxKb)) {
    hits.push({ file: c.file, rule: "bundle-chunk", severity: "P2", claim: `chunk is ${c.kb.toFixed(1)} KB gzip, over the ${maxKb} KB budget — split it (lazy route) or drop a dependency`, evidence: c.file });
  }
  const sum = chunks.reduce((n, c) => n + c.kb, 0);
  if (totalKb && sum > totalKb) hits.push({ rule: "bundle-total", severity: "P2", claim: `all JavaScript is ${sum.toFixed(1)} KB gzip, over the ${totalKb} KB budget` });
}
process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
