// gate-qa (S7): the QA record is complete and no S1/S2 defect is open unless a human waived it.
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
  for (const d of record.data.defects) {
    if (d.type !== "defect" || !blocking.includes(d.severity)) continue;
    if (d.waived_by && waived(d)) continue;
    failures.push({ check: "qa", rule: `open-${d.severity}`, file: record.rel, message: `${d.id} (${d.severity}): ${d.title} — expected ${d.expected}, got ${d.actual}` });
  }
  if (!ctx.load("qa-report")) failures.push({ check: "qa", rule: "no-report", message: "07-qa/qa-report.md is missing" });
  return failures;
}
