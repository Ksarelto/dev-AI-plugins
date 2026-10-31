// gate-discovery (A0 Discovery): the baseline of an existing app is complete — an app profile marked
// as discovered, a capability map whose paths exist, and a feature ledger.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles, matchesAny } from "../lib/core.mjs";
import { validate } from "../lib/schemas.mjs";

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
  const files = listFiles(ctx.projectDir).filter((f) => !f.startsWith(".factory/"));
  for (const f of map.data.features) {
    for (const p of f.paths) {
      const exists = /[*?]/.test(p) ? files.some((x) => matchesAny(x, [p])) : existsSync(join(ctx.projectDir, p));
      if (!exists) failures.push({ check: "capability-index", rule: "phantom-path", file: map.rel, message: `${f.name}: ${p} matches no file` });
    }
  }
  return failures;
}
