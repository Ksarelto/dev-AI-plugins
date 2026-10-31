#!/usr/bin/env node
// Migration check for the backend role (gate-impl for every backend task, and the auditor):
//   node check-migrations.mjs --project <role folder> [--task-type <type>] --files <changed files…>
// Every changed <dir>/drizzle/<tag>.sql needs a journal entry (<dir>/drizzle/meta/_journal.json) and a
// non-empty rollback (<dir>/drizzle/rollback/<tag>.down.sql); destructive statements need
// "-- factory: approved HD-<n>" on the line above. A migration task must change a migration. Prints one
// problem per line and exits 1 when there is any.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const project = opt("--project") ?? ".";
const taskType = opt("--task-type");
const files = args.includes("--files") ? args.slice(args.indexOf("--files") + 1) : [];
const DESTRUCTIVE =
  /\b(DROP\s+(TABLE|COLUMN|TYPE|SCHEMA|VIEW)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE|RENAME\s+(COLUMN|TO))\b/i;

const migrations = files.map((f) => f.replaceAll("\\", "/")).filter((f) => /(^|\/)drizzle\/[^/]+\.sql$/.test(f));
const problems = [];
if (taskType === "migration" && !migrations.length) problems.push("a migration task changes no drizzle/<tag>.sql file");
for (const file of migrations) {
  const tag = basename(file, ".sql");
  const dir = join(project, dirname(file));
  const path = join(project, file);
  if (!existsSync(path)) {
    problems.push(`${file}: listed but not written`);
    continue;
  }
  const journal = join(dir, "meta", "_journal.json");
  const tags = existsSync(journal) ? JSON.parse(readFileSync(journal, "utf8")).entries.map((e) => e.tag) : [];
  if (!tags.includes(tag)) problems.push(`${file}: no entry with tag "${tag}" in ${dirname(file)}/meta/_journal.json`);
  const down = join(dir, "rollback", `${tag}.down.sql`);
  if (!existsSync(down) || !readFileSync(down, "utf8").replace(/--.*$/gm, "").trim()) problems.push(`${file}: rollback ${dirname(file)}/rollback/${tag}.down.sql is missing or empty`);
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!DESTRUCTIVE.test(line) || /^\s*--/.test(line)) return;
    if (!/^\s*--\s*factory:\s*approved\s+HD-\d+/.test(lines[i - 1] ?? "")) problems.push(`${file}:${i + 1}: destructive statement without "-- factory: approved HD-<n>" — ${line.trim().slice(0, 80)}`);
  });
}
process.stdout.write(problems.length ? `${problems.join("\n")}\n` : `ok: ${migrations.length} migration(s) checked\n`);
process.exit(problems.length ? 1 : 0);
