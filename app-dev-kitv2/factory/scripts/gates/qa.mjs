// gate-qa (S7): the QA record is complete, at least one charter really ran, and no S1/S2 defect or
// spec gap is open unless a human waived it. Defects become fix items with their reproduction steps.
import { validate } from "../lib/schemas.mjs";

export const inputs = ["defects", "human-notes"];

export function run(ctx) {
  const record = ctx.load("defects");
  if (!record) return [{ check: "qa", message: "07-qa/defects.yaml is missing" }];
  const failures = validate("defects", record.data).map((e) => ({ check: "schema", rule: "defects", file: record.rel, message: e }));
  if (failures.length) return failures;
  const notes = ctx.load("human-notes")?.data ?? [];
  // A waiver is a human note that names the defect; the QA agent cannot waive by pointing at any note.
  const waived = (d) => notes.some((n) => n.id === d.waived_by && new RegExp(`\\b${d.id}\\b`).test(n.text ?? ""));
  const blocking = ctx.config.qa?.blocking ?? ["S1", "S2"];
  if (record.data.charters.every((c) => c.result === "blocked")) {
    failures.push({ check: "qa", rule: "no-charter-ran", file: record.rel, message: "every charter is blocked — start the app (see the QA skill) or ask the human what blocks it" });
  }
  for (const d of record.data.defects) {
    if (!blocking.includes(d.severity) || (d.waived_by && waived(d))) continue;
    const steps = (d.steps ?? []).map((x, i) => `${i + 1}) ${x}`).join(" ");
    if (d.type === "defect") failures.push({ check: "qa", rule: `open-${d.severity}`, fix: true, file: record.rel, message: `${d.id} (${d.severity}): ${d.title} — steps: ${steps} — expected ${d.expected}, got ${d.actual}` });
    // A spec gap is a question for the human, not a code fix: QA asks (needs_clarification) and records the waiver.
    else if (d.type === "spec_gap") failures.push({ check: "qa", rule: `open-spec-gap-${d.severity}`, file: record.rel, message: `${d.id} (${d.severity} spec gap): ${d.title} — return needs_clarification so a human decides, then set waived_by to that note` });
  }
  if (!ctx.load("qa-report")) failures.push({ check: "qa", rule: "no-report", message: "07-qa/qa-report.md is missing" });
  return failures;
}
