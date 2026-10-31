// gate-spec (S1): the PRD or delta-spec is schema-valid, IDs are unique and traceable to a source,
// acceptance criteria are measurable, no blocker question is unanswered, and a delta-spec accounts
// for removals and only touches files that exist.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validate } from "../lib/schemas.mjs";

export const inputs = ["prd", "delta-spec", "source-index", "human-notes"];

export function run(ctx) {
  const spec = ctx.spec();
  if (!spec) return [{ check: "spec", message: "neither 01-requirements/prd.md nor delta-spec.yaml exists" }];
  const failures = [];
  const fail = (check, rule, message) => failures.push({ check, rule, file: spec.rel, message });

  for (const e of validate(spec.kind, spec.data)) fail("schema", spec.kind, e);
  if (failures.length) return failures;
  if (spec.data.feature !== ctx.state.feature) fail("spec", "feature-id", `feature is ${spec.data.feature}, expected ${ctx.state.feature}`);

  const known = new Set((ctx.load("source-index")?.data.sources ?? []).flatMap((s) => s.ids ?? []));
  for (const note of ctx.load("human-notes")?.data ?? []) known.add(note.id);

  const seen = new Set();
  const unique = (id) => {
    if (seen.has(id)) fail("ids", "duplicate", `${id} is defined twice`);
    seen.add(id);
  };
  const vague = (ctx.config.quality?.vague_terms ?? []).map((t) => t.toLowerCase());
  for (const req of spec.reqs) {
    unique(req.id);
    if (!req.sources?.length) fail("trace", "no-source", `${req.id} cites no SRC or HD`);
    for (const src of req.sources ?? []) if (!known.has(src)) fail("trace", "unknown-source", `${req.id} cites ${src}, which does not exist`);
    for (const ac of req.acs) {
      unique(ac.id);
      const words = ac.text.toLowerCase().split(/[^a-z-]+/);
      const hit = vague.find((term) => words.includes(term));
      if (hit && !/\d|"[^"]+"/.test(ac.text)) fail("measurable", "vague-ac", `${ac.id} uses "${hit}" with no number or exact value`);
    }
  }
  for (const q of spec.data.open_questions ?? []) {
    unique(q.id);
    if (q.severity === "blocker" && !["answered", "defaulted"].includes(q.status)) {
      fail("questions", "blocker-open", `${q.id} is a blocker without an answer`);
    }
  }

  if (spec.kind === "delta-spec") {
    for (const m of spec.data.modified ?? []) {
      for (const path of m.affected ?? []) {
        if (!existsSync(join(ctx.projectDir, path))) fail("delta", "phantom-file", `${m.id} affects ${path}, which does not exist`);
      }
    }
    for (const r of spec.data.removed ?? []) unique(r.id);
  }
  return failures;
}
