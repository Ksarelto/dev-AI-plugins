// gate-discovery (A0 Discovery): the baseline of an existing app is complete and checkable — an app
// profile marked as discovered whose conformance claim survives the stacks' architecture checks, a
// capability map whose paths exist and are specific, and a feature ledger.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles, matchesAny } from "../lib/core.mjs";
import { validate } from "../lib/schemas.mjs";
import { enabledStacks } from "../lib/testrun.mjs";
import { resolveStack, runStackCommand } from "../lib/stackexec.mjs";

export const cacheable = false;
export const inputs = ["app-profile", "capability-index", "feature-ledger"];

export function run(ctx) {
  const failures = [];
  const need = (type, label) => {
    const item = ctx.load(type);
    if (!item) failures.push({ check: type, message: `${label} is missing` });
    return item;
  };
  const profile = need("app-profile", ".factory/app-profile.yaml");
  const map = need("capability-index", ".factory/_index/capability-map.yaml");
  const ledger = need("feature-ledger", ".factory/ledger/feature-ledger.yaml");
  for (const [item, schema] of [[profile, "app-profile"], [map, "capability-map"], [ledger, "feature-ledger"]]) {
    if (item) for (const e of validate(schema, item.data)) failures.push({ check: "schema", rule: schema, file: item.rel, message: e });
  }
  if (failures.length) return failures;
  if (profile.data.origin !== "discovered") failures.push({ check: "app-profile", rule: "origin", file: profile.rel, message: 'origin must be "discovered" for an existing app' });
  if (!map.data.features.length) failures.push({ check: "capability-index", rule: "empty", file: map.rel, message: "no features mapped" });
  const files = listFiles(ctx.projectDir).filter((f) => !f.startsWith(".factory/") && !f.includes("node_modules/"));
  for (const f of map.data.features) {
    for (const p of f.paths) {
      const hits = /[*?]/.test(p) ? files.filter((x) => matchesAny(x, [p])).length : existsSync(join(ctx.projectDir, p)) ? 1 : 0;
      if (!hits) failures.push({ check: "capability-index", rule: "phantom-path", file: map.rel, message: `${f.name}: ${p} matches no file` });
      // A capability that is "the whole app" tells later stages nothing about where it lives.
      else if (map.data.features.length > 1 && files.length >= 20 && hits > files.length / 2) {
        failures.push({ check: "capability-index", rule: "too-broad", file: map.rel, message: `${f.name}: ${p} matches ${hits} of ${files.length} files — name the folders that hold it` });
      }
    }
  }
  // "conformant" is a claim the stacks can check: their architecture rules must pass on the app as it is.
  if (profile.data.conformance === "conformant") {
    for (const stack of enabledStacks(ctx, resolveStack)) {
      const r = runStackCommand(stack, "architecture_check", { logName: `discovery-${stack.role}-architecture` });
      // A stack whose architecture tool is not installed in this app cannot refute the claim.
      const missingTool = /could not determine executable|command not found|not found|ENOENT|npm error canceled/i.test(r.tail ?? "") && r.code !== 1;
      if (!r.ok && !r.skipped && !missingTool) failures.push({ check: "app-profile", rule: "not-conformant", file: profile.rel, message: `conformance is "conformant", but ${stack.role}'s architecture check fails — say partial and list the deviations in notes:\n${r.tail}` });
    }
  }
  return failures;
}
