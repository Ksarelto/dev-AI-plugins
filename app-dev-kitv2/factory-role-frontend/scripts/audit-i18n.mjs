#!/usr/bin/env node
// Engine audit (role.yaml gates.audits): prints review findings [{ file, line, rule, severity, claim, evidence }]
// for user-visible text written directly in JSX — P2 when the project uses i18next, else P3.
import { existsSync, readFileSync } from "node:fs";

const usesI18n = existsSync("package.json") && /"(react-)?i18next"/.test(readFileSync("package.json", "utf8"));
const TEXT = />\s*([A-Za-z][^<>{}]*[A-Za-z.!?])\s*</;
const hits = [];
for (const file of process.argv.slice(2).filter((f) => f.endsWith(".tsx"))) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const m = TEXT.exec(line);
    if (m) hits.push({ file, line: i + 1, rule: "untranslated-text", severity: usesI18n ? "P2" : "P3", claim: "user-visible text outside i18n", evidence: m[1].slice(0, 80) });
  });
}
process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
