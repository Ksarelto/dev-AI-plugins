#!/usr/bin/env node
// Prints [{ file, line, rule, text }] for hex, rgb() and hsl() colours written directly in source files.
import { readFileSync } from "node:fs";

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;
const hits = [];
for (const file of process.argv.slice(2)) {
  readFileSync(file, "utf8").split("\n").forEach((text, i) => {
    if (COLOUR.test(text) && !/^\s*(\/\/|\*)/.test(text)) hits.push({ file, line: i + 1, rule: "raw-colour", text: text.trim().slice(0, 120) });
  });
}
process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
