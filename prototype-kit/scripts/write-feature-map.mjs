#!/usr/bin/env node
// Writes prototype/features.yaml from prototype.json so the factory can attach page ids.
// Missing file: one entry (slug and intent from the title, pages from assembly_pages).
// One entry: refresh pages. Leave slug, states, intent, and any other fields.
// Several entries: print the page ids and do not write.
// Usage: node write-feature-map.mjs <OUTPUT_DIR>
// Exit 0 ok, 1 the prototype or the map could not be used, 2 usage error.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const out = process.argv[2];
if (!out || process.argv.length > 3) {
  console.error("usage: write-feature-map.mjs <OUTPUT_DIR>");
  process.exit(2);
}

const protoPath = join(out, "prototype.json");
if (!existsSync(protoPath)) {
  console.error("prototype.json is missing");
  process.exit(1);
}
let proto;
try {
  proto = JSON.parse(readFileSync(protoPath, "utf8"));
} catch (error) {
  console.error(`prototype.json is not valid JSON (${error.message.split("\n")[0]})`);
  process.exit(1);
}

const pages = [];
const seen = new Set();
for (const page of proto.assembly_pages ?? []) {
  const id = page?.id;
  if (typeof id !== "string" || !id || /[\\/]/.test(id) || seen.has(id)) continue;
  seen.add(id);
  pages.push(id);
}
const label = `${basename(out)}/features.yaml`;
if (!pages.length) {
  console.log(`no assembly_pages; ${label} unchanged`);
  process.exit(0);
}

const title = typeof proto.title === "string" && proto.title.trim() ? proto.title.trim() : "app";
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "app";
const file = join(out, "features.yaml");

const quote = (value) => {
  const s = String(value);
  if (s === "" || /[:#{}[\],&*!|>'"%@`]|^\s|\s$/.test(s) || /^(?:true|false|null|yes|no|~)$/i.test(s) || /^[-?:]|^\d/.test(s)) return JSON.stringify(s);
  return s;
};

const unquote = (value) => {
  const s = value.trim();
  if (s.startsWith('"') && s.endsWith('"')) return JSON.parse(s);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
};

const parseInlineList = (value) => {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!inner.trim()) return [];
  return inner.split(",").map((part) => unquote(part)).filter(Boolean);
};

/** The features list this script writes, plus a one-entry file a person wrote in the same shape. */
function parseFeatures(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^features:\s*$/.test(line.trim()));
  if (start === -1) throw new Error(`${label} must have a features list`);
  const entries = [];
  let current = null;
  let listKey = null;
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^  - slug:\s*\S/.test(line)) {
      current = { slug: unquote(line.replace(/^  - slug:\s*/, "").trim()) };
      entries.push(current);
      listKey = null;
      continue;
    }
    if (!current) throw new Error(`${label} entries need a slug and a pages list of ids`);
    const nested = /^      - (.+)$/.exec(line);
    if (nested && listKey) {
      current[listKey].push(unquote(nested[1].trim()));
      continue;
    }
    const field = /^    ([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!field) throw new Error(`${label} entries need a slug and a pages list of ids`);
    const [, name, rest] = field;
    if (rest.trim() === "") {
      current[name] = [];
      listKey = name;
      continue;
    }
    listKey = null;
    current[name] = rest.trim().startsWith("[") ? parseInlineList(rest.trim()) : unquote(rest.trim());
  }
  for (const entry of entries) {
    if (typeof entry.slug !== "string" || !entry.slug) throw new Error(`${label} entries need a slug and a pages list of ids`);
    if (!Array.isArray(entry.pages) || entry.pages.length === 0 || entry.pages.some((id) => typeof id !== "string" || !id || /[\\/]/.test(id))) {
      throw new Error(`${label} entries need a slug and a pages list of ids`);
    }
    if (entry.states !== undefined && (!Array.isArray(entry.states) || entry.states.some((id) => typeof id !== "string" || !id))) {
      throw new Error(`${label} entry "${entry.slug}" has an invalid states list`);
    }
    if (entry.intent !== undefined && typeof entry.intent !== "string") throw new Error(`${label} entry "${entry.slug}" has an invalid intent`);
  }
  return entries;
}

function formatEntry(entry) {
  const lines = [`  - slug: ${quote(entry.slug)}`, `    pages: [${entry.pages.map(quote).join(", ")}]`];
  for (const [name, value] of Object.entries(entry)) {
    if (name === "slug" || name === "pages") continue;
    if (Array.isArray(value)) lines.push(`    ${name}: [${value.map(quote).join(", ")}]`);
    else if (typeof value === "string") lines.push(`    ${name}: ${quote(value)}`);
  }
  return lines.join("\n");
}

if (!existsSync(file)) {
  const entry = { slug, pages, intent: title };
  writeFileSync(file, `features:\n${formatEntry(entry)}\n`);
  console.log(`wrote ${label}\nslug: ${entry.slug}\npages: ${pages.join(", ")}`);
  process.exit(0);
}

let raw;
try {
  raw = readFileSync(file, "utf8");
} catch (error) {
  console.error(`${label} could not be read (${error.message.split("\n")[0]})`);
  process.exit(1);
}
let entries;
try {
  entries = parseFeatures(raw);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (!entries.length) {
  console.error(`${label} must have a features list`);
  process.exit(1);
}
if (entries.length > 1) {
  console.log(`unchanged ${label} (${entries.length} entries)`);
  for (const entry of entries) console.log(`- ${entry.slug}: ${entry.pages.join(", ")}`);
  process.exit(0);
}

const entry = { ...entries[0], pages };
writeFileSync(file, `features:\n${formatEntry(entry)}\n`);
console.log(`refreshed pages in ${label}: ${pages.join(", ")}`);
