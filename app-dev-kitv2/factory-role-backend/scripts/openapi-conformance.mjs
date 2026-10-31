#!/usr/bin/env node
// OpenAPI conformance for the backend auditor:
//   node openapi-conformance.mjs --contract <api-contract.yaml> --document <src/openapi/document.ts>
// Compares the contract's operations (paths → methods) with the document's registry.registerPath
// calls and prints [{ rule, method, path }]: missing-in-document, not-in-contract (only under the
// contract's path prefixes). Reads the YAML by indentation, so it needs no packages.
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
for (const op of contract) if (!documented.has(op)) hits.push({ rule: "missing-in-document", method: op.split(" ")[0], path: op.split(" ")[1] });
for (const op of documented) {
  const p = op.split(" ")[1];
  if (!contract.has(op) && prefixes.some((x) => p === x || p.startsWith(`${x}/`))) hits.push({ rule: "not-in-contract", method: op.split(" ")[0], path: p });
}
process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
