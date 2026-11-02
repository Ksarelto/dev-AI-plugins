#!/usr/bin/env node
// OpenAPI conformance, an engine audit (role.yaml gates.audits):
//   node openapi-conformance.mjs --contract <api-contract.yaml> --document <src/openapi/document.ts>
// Compares the contract's operations (paths → methods) with the document's registry.registerPath
// calls and prints review findings [{ file, rule, severity, claim }]: missing-in-document (P1),
// not-in-contract (P2, only under the contract's path prefixes). Reads the YAML by indentation, so it
// needs no packages.
import { readFileSync } from "node:fs";

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const METHODS = ["get", "put", "post", "patch", "delete", "head", "options"];

const contract = new Set();
let inPaths = false;
let path = null;
for (const line of readFileSync(arg("--contract"), "utf8").split("\n")) {
  if (/^paths:\s*$/.test(line)) inPaths = true;
  else if (/^\S/.test(line)) inPaths = false;
  if (!inPaths) continue;
  const p = /^ {2}(['"]?)(\/[^'":]*)\1:\s*$/.exec(line);
  if (p) path = p[2];
  const m = /^ {4}(\w+):/.exec(line);
  if (path && m && METHODS.includes(m[1])) contract.add(`${m[1]} ${path}`);
}

const documented = new Set();
const source = readFileSync(arg("--document"), "utf8");
for (const call of source.matchAll(/registerPath\(\{([\s\S]*?)\}\)/g)) {
  const method = /method:\s*['"](\w+)['"]/.exec(call[1])?.[1];
  const p = /path:\s*['"]([^'"]+)['"]/.exec(call[1])?.[1];
  if (method && p) documented.add(`${method} ${p.replace(/\{(\w+)\}/g, "{$1}")}`);
}

const prefixes = [...new Set([...contract].map((op) => op.split(" ")[1].split("/").slice(0, 4).join("/")))];
const hits = [];
const file = arg("--document");
for (const op of contract) if (!documented.has(op)) hits.push({ file, rule: "missing-in-document", severity: "P1", method: op.split(" ")[0], path: op.split(" ")[1], claim: `the contract's ${op.split(" ")[0].toUpperCase()} ${op.split(" ")[1]} is not registered in the OpenAPI document` });
for (const op of documented) {
  const p = op.split(" ")[1];
  if (!contract.has(op) && prefixes.some((x) => p === x || p.startsWith(`${x}/`))) hits.push({ file, rule: "not-in-contract", severity: "P2", method: op.split(" ")[0], path: p, claim: `${op.split(" ")[0].toUpperCase()} ${p} is documented but not in the agreed contract` });
}
process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
