// gate-docs (S8a): the app's feature doc lists every acceptance criterion, every ADR of the feature is
// promoted to docs/adr/, CHANGELOG.md names the feature, and the docs report exists.
import { readText } from "../lib/core.mjs";

export const inputs = ["feature-doc", "adr-doc", "changelog", "adr", "docs-report", "prd", "delta-spec"];
export const cacheable = false;

export function run(ctx) {
  const failures = [];
  const fid = ctx.state.feature;
  const doc = ctx.all("feature-doc").find((d) => readText(d.file).includes(fid));
  if (!doc) failures.push({ check: "docs", rule: "no-feature-doc", message: `no docs/features/*.md mentions ${fid}` });
  else {
    const text = readText(doc.file);
    for (const ac of [...(ctx.spec()?.reqs.flatMap((r) => r.acs.map((a) => a.id)) ?? []), ...(ctx.spec()?.removed ?? [])]) {
      if (!text.includes(ac)) failures.push({ check: "docs", rule: "ac-missing", file: doc.rel, message: `${ac} is not in the feature doc` });
    }
  }
  const promoted = ctx.all("adr-doc").map((d) => readText(d.file)).join("\n");
  for (const adr of ctx.all("adr")) {
    if (!promoted.includes(adr.data.id)) failures.push({ check: "docs", rule: "adr-not-promoted", file: adr.rel, message: `${adr.data.id} is not in docs/adr/` });
  }
  const changelog = ctx.load("changelog");
  if (!changelog || !readText(changelog.file).includes(fid)) failures.push({ check: "docs", rule: "no-changelog", message: `CHANGELOG.md has no entry for ${fid}` });
  if (!ctx.load("docs-report")) failures.push({ check: "docs", rule: "no-report", message: "08-delivery/docs-report.md is missing" });
  return failures;
}
