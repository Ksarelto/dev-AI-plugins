// gate-proto (S2.5): the prototype report is schema-valid, every screen file exists in the sandbox,
// every screen belongs to a story of the feature, and every story with a UX surface has a screen.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validate } from "../lib/schemas.mjs";

export const inputs = ["prototype-report", "prototype-sandbox", "stories"];

export function run(ctx) {
  const report = ctx.load("prototype-report");
  if (!report) return [{ check: "prototype", message: "02b-prototype/prototype-report.yaml is missing" }];
  const failures = validate("prototype-report", report.data).map((e) => ({ check: "schema", rule: "prototype-report", file: report.rel, message: e }));
  if (failures.length) return failures;
  const all = ctx.load("stories")?.data.stories ?? [];
  const stories = new Set(all.map((s) => s.id));
  for (const screen of report.data.screens) {
    if (!screen.file.startsWith("sandbox/")) failures.push({ check: "prototype", rule: "outside-sandbox", file: report.rel, message: `${screen.name}: ${screen.file} is not under sandbox/` });
    else if (!existsSync(join(ctx.feature.dir, "02b-prototype", screen.file))) failures.push({ check: "prototype", rule: "missing-screen", file: report.rel, message: `${screen.name}: ${screen.file} does not exist` });
    for (const s of screen.stories) if (!stories.has(s)) failures.push({ check: "trace", rule: "unknown-story", file: report.rel, message: `${screen.name} cites ${s}, which is not in stories.yaml` });
    if (!screen.stories.length) failures.push({ check: "trace", rule: "screen-without-story", file: report.rel, message: `${screen.name} belongs to no story` });
  }
  const shown = new Set(report.data.screens.flatMap((s) => s.stories));
  for (const s of all.filter((x) => x.ux?.surfaces?.length)) {
    if (!shown.has(s.id)) failures.push({ check: "trace", rule: "story-without-screen", file: report.rel, message: `${s.id} has UX surfaces (${s.ux.surfaces.join(", ")}) but no screen in the prototype` });
  }
  return failures;
}
