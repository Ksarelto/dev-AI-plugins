#!/usr/bin/env node
// Migration check for the backend role (gate-impl for every backend task, and the auditor):
//   node check-migrations.mjs --project <role folder> [--task-type <type>] [--notes HD-1:approved,HD-2:open,…] --files <changed files…>
// Every changed <dir>/drizzle/<tag>.sql needs a journal entry (<dir>/drizzle/meta/_journal.json) and a
// rollback (<dir>/drizzle/rollback/<tag>.down.sql) with at least one real statement. A destructive
// statement needs "-- factory: approved HD-<n>" right above it, naming a human note the engine passes as
// "approved" (mapped to this task or naming its migration; with --notes — without it the note is not checked). A migration task must change a
// migration. Prints one problem per line and exits 1 when there is any.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const project = opt("--project") ?? ".";
const taskType = opt("--task-type");
const notes = opt("--notes") ? new Map(opt("--notes").split(",").filter((x) => x.includes(":")).map((x) => x.split(":"))) : null;
const files = args.includes("--files") ? args.slice(args.indexOf("--files") + 1) : [];

// Statements that lose data or break running code. Any DELETE loses rows; an UPDATE without WHERE rewrites them all.
const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|VIEW|CONSTRAINT)\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i,
  /\bALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/i,
  /\bRENAME\s+(COLUMN|TO)\b/i,
  /^\s*DELETE\s+FROM\b/i,
  /^\s*UPDATE\s+\S+\s+SET\b(?![\s\S]*\bWHERE\b)/i,
];
const REAL_STATEMENT = /\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|RENAME|TRUNCATE)\b/i;
const stripComments = (sql) => sql.replace(/--.*$/gm, "");

/** Statements with the line they start on, split at ; and drizzle's statement breakpoints. */
function statements(sql) {
  const out = [];
  let start = 0;
  let text = "";
  sql.split("\n").forEach((line, i) => {
    if (!text.trim()) start = i;
    text += `${line}\n`;
    if (/;\s*(--.*)?$/.test(line) || /--> statement-breakpoint/.test(line)) {
      out.push({ text, line: start });
      text = "";
    }
  });
  if (text.trim()) out.push({ text, line: start });
  return out;
}

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
  if (!existsSync(down) || !REAL_STATEMENT.test(stripComments(readFileSync(down, "utf8")))) {
    problems.push(`${file}: rollback ${dirname(file)}/rollback/${tag}.down.sql is missing or does nothing (it needs the statements that undo the migration)`);
  }
  const lines = readFileSync(path, "utf8").split("\n");
  for (const st of statements(lines.join("\n"))) {
    const sql = stripComments(st.text);
    if (!DESTRUCTIVE.some((re) => re.test(sql))) continue;
    const firstCode = st.text.split("\n").findIndex((l) => l.trim() && !/^\s*--/.test(l));
    const at = st.line + Math.max(firstCode, 0);
    const approval = /^\s*--\s*factory:\s*approved\s+(HD-\d+)/.exec(lines.slice(st.line, at + 1).concat(lines[st.line - 1] ?? "").find((l) => /factory:\s*approved/.test(l)) ?? "");
    const snippet = sql.trim().split("\n")[0].slice(0, 80);
    if (!approval) problems.push(`${file}:${at + 1}: destructive statement without "-- factory: approved HD-<n>" — ${snippet}`);
    else if (notes && !notes.has(approval[1])) problems.push(`${file}:${at + 1}: ${approval[1]} approves "${snippet}", but there is no such human note`);
    else if (notes && notes.get(approval[1]) === "open") problems.push(`${file}:${at + 1}: ${approval[1]} is still open — the human has not settled it`);
    else if (notes && notes.get(approval[1]) !== "approved") problems.push(`${file}:${at + 1}: ${approval[1]} is not an approval of this migration — the note must be mapped to the task or name ${tag}`);
  }
}
process.stdout.write(problems.length ? `${problems.join("\n")}\n` : `ok: ${migrations.length} migration(s) checked\n`);
process.exit(problems.length ? 1 : 0);
