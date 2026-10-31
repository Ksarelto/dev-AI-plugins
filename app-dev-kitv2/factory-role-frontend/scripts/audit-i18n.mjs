#!/usr/bin/env node
// Prints [{ file, line, rule, text }] for user-visible text written directly in JSX. Reports whether
// the project uses i18next (then such text is a stronger finding).
import { existsSync, readFileSync } from "node:fs";

const usesI18n = existsSync("package.json") && /"(react-)?i18next"/.test(readFileSync("package.json", "utf8"));
const TEXT = />\s*([A-Za-z][^<>{}]*[A-Za-z.!?])\s*</;
const hits = [];
for (const file of process.argv.slice(2).filter((f) => f.endsWith(".tsx"))) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const m = TEXT.exec(line);
    if (m) hits.push({ file, line: i + 1, rule: "untranslated-text", text: m[1].slice(0, 80), uses_i18next: usesI18n });
  });
}
process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
