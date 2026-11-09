// Human reading copy of the spec. The YAML (prd front matter or delta-spec.yaml) stays the contract;
// this file is regenerated from it when the requirements gate passes.
import { join } from "node:path";
import { writeAtomic } from "./core.mjs";
import { gateContext } from "./gatekeeper.mjs";

const sentence = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function acLines(acs = []) {
  return (acs ?? []).map((a) => `- ${a.id}${a.kind ? ` (${a.kind})` : ""}: ${sentence(a.text)}`).join("\n");
}

function requirement(r, modified) {
  const head = modified
    ? `### ${r.id}\n\nBefore: ${sentence(r.before)}\n\nAfter: ${sentence(r.after)}`
    : `### ${r.id}${r.priority ? ` (${r.priority})` : ""}\n\n${sentence(r.text)}`;
  const affected = r.affected?.length ? `\n\nAffected: ${r.affected.join(", ")}` : "";
  return `${head}${affected}\n\n${acLines(r.acs)}`;
}

function section(title, items, render, empty = "None.") {
  const body = items?.length ? items.map(render).join("\n\n") : empty;
  return `## ${title}\n\n${body}`;
}

/** Markdown a person can read at GATE-A. `spec` is gateContext().spec(). */
export function renderSpecView(spec) {
  const d = spec.data;
  const questions = section("Open questions", d.open_questions, (q) => {
    const tail = q.answer ? ` Answer: ${sentence(q.answer)}` : q.default ? ` Default: ${sentence(q.default)}` : "";
    return `- ${q.id} (${q.severity}, ${q.status ?? "open"}): ${sentence(q.text)}${tail}`;
  });
  const body = spec.kind === "prd"
    ? [
        section("Requirements", d.requirements, (r) => requirement(r, false)),
        section("Non-functional", d.non_functional, (n) => `- ${n.id} (${n.category}): ${sentence(n.text)}`),
        section("Out of scope", d.out_of_scope, (x) => `- ${x}`),
        section("Backlog", d.backlog, (b) => `- ${b.title}: ${(b.requirements ?? []).join(", ")}`),
        questions,
      ]
    : [
        section("Added", d.added, (r) => requirement(r, false)),
        section("Modified", d.modified, (r) => requirement(r, true)),
        section("Removed", d.removed, (r) => `- ${r.id}: ${sentence(r.reason)}${r.affected?.length ? ` (${r.affected.join(", ")})` : ""}`),
        section("Must not change", d.unchanged_guarantees, (g) => `- ${sentence(g)}`),
        questions,
      ];
  return `# ${sentence(d.summary)}\n\n${body.join("\n\n")}\n`;
}

/** Writes 01-requirements/spec.md from the feature's PRD or delta-spec. Null when neither exists. */
export function writeSpecView(c) {
  const spec = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }).spec();
  if (!spec) return null;
  const file = join(c.feature.dir, "01-requirements", "spec.md");
  writeAtomic(file, renderSpecView(spec));
  return file;
}
