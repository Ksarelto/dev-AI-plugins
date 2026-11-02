// gate-triage (S9): every PR comment fetched by the adapter is classified exactly once.
import { validate } from "../lib/schemas.mjs";

export const inputs = ["triage", "pr-comments"];

export function run(ctx) {
  const triage = ctx.load("triage");
  if (!triage) return [{ check: "triage", message: "08-delivery/triage.yaml is missing" }];
  const failures = validate("triage", triage.data).map((e) => ({ check: "schema", rule: "triage", file: triage.rel, message: e }));
  const classified = new Set(triage.data.comments?.map((c) => String(c.id)) ?? []);
  for (const comment of ctx.load("pr-comments")?.data ?? []) {
    if (!classified.has(String(comment.id))) failures.push({ check: "triage", rule: "unclassified", file: triage.rel, message: `comment ${comment.id} is not classified` });
  }
  return failures;
}
