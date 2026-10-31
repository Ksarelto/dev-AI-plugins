// gate-proto (S2.5): the prototype report is schema-valid, every screen file exists in the sandbox,
// and every screen belongs to a story of the feature.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validate } from "../lib/schemas.mjs";

export const inputs = ["prototype-report", "prototype-sandbox", "stories"];

export function run(ctx) {
  const report = ctx.load("prototype-report");
  if (!report) return [{ check: "prototype", message: "02b-prototype/prototype-report.yaml is missing" }];
  const failures = validate("prototype-report", report.data).map((e) => ({ check: "schema", rule: "prototype-report", file: report.rel, message: e }));
  if (failures.length) return failures;
  const stories = new Set((ctx.load("stories")?.data.stories ?? []).map((s) => s.id));
  for (const screen of report.data.screens) {
    if (!screen.file.startsWith("sandbox/")) failures.push({ check: "prototype", rule: "outside-sandbox", file: report.rel, message: `${screen.name}: ${screen.file} is not under sandbox/` });
    else if (!existsSync(join(ctx.feature.dir, "02b-prototype", screen.file))) failures.push({ check: "prototype", rule: "missing-screen", file: report.rel, message: `${screen.name}: ${screen.file} does not exist` });
    for (const s of screen.stories) if (!stories.has(s)) failures.push({ check: "trace", rule: "unknown-story", file: report.rel, message: `${screen.name} cites ${s}, which is not in stories.yaml` });
  }
  return failures;
}
