// gate-digest: the curator's digest stays within its size budget and drops no tracked ID that is
// still open anywhere in the feature's artifacts.
import { TRACKED_KINDS, extractIds } from "../lib/ids.mjs";
import { ARTIFACT_TYPES } from "../lib/schemas.mjs";
import { openIds } from "../lib/gatekeeper.mjs";

/** Every feature-scoped artifact feeds the digest, so all of them invalidate the cached result. */
export const inputs = Object.keys(ARTIFACT_TYPES).filter((t) => ARTIFACT_TYPES[t].scope === "feature");

export function run(ctx) {
  const digest = ctx.load("digest");
  if (!digest) return [{ check: "digest", message: "digest.md is missing" }];
  const failures = [];
  const max = ctx.config.context?.digest_max_words ?? 600;
  const words = digest.data.split(/\s+/).filter(Boolean).length;
  if (words > max) failures.push({ check: "digest", rule: "too-long", file: digest.rel, message: `${words} words (max ${max})` });

  const present = new Set(extractIds(digest.data, TRACKED_KINDS));
  const sources = Object.keys(ARTIFACT_TYPES).filter((t) => ARTIFACT_TYPES[t].scope === "feature" && t !== "digest");
  for (const type of sources) {
    for (const item of ctx.all(type)) {
      for (const id of openIds(type, item.data, TRACKED_KINDS.filter((k) => k !== "SRC"))) {
        if (!present.has(id)) {
          present.add(id); // report once
          failures.push({ check: "id-coverage", rule: "digest-dropped-id", file: digest.rel, message: `${id} (open in ${item.rel}) is missing from the digest` });
        }
      }
    }
  }
  return failures;
}
