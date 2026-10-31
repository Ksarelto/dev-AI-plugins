// gate-verify (S6): every acceptance test passes, the whole suite passes, and the review has no
// blocking finding (quality.review_blocking, P0/P1 by default) — reviewer lenses and role auditors.
import { firstLine } from "../lib/vitest-report.mjs";
import { enabledStacks, runTests } from "../lib/testrun.mjs";
import { resolveStack, runStackCommand } from "../lib/stackexec.mjs";

export const inputs = ["review", "acceptance-tests", "change-set"];
export const cacheable = false;

export function run(ctx) {
  const failures = [];
  const review = ctx.load("review");
  if (!review) failures.push({ check: "review", message: "06-verify/review.md was not written" });
  const blocking = ctx.config.quality?.review_blocking ?? ["P0", "P1"];
  for (const f of review?.data.findings ?? []) {
    if (blocking.includes(f.severity)) {
      failures.push({ check: "review", rule: `blocking-${f.severity}`, file: f.file, message: `${f.id ?? f.lens ?? "finding"}: ${f.claim}${f.fix_hint ? ` — ${f.fix_hint}` : ""}` });
    }
  }
  const acceptance = ctx.all("acceptance-tests").map((a) => a.rel);
  const stacks = enabledStacks(ctx, resolveStack);
  if (!stacks.length) failures.push({ check: "test", rule: "no-stack", message: "no enabled role has an installed stack to run the tests with" });
  for (const stack of stacks) {
    const { run, report } = runTests(ctx, stack, `${ctx.state.feature}-verify`);
    if (!report) {
      failures.push({ check: "test", rule: "no-report", message: `the test command wrote no report (exit ${run.code}):\n${run.tail}` });
      continue;
    }
    for (const f of report.files) {
      const kind = acceptance.includes(f.file) ? "acceptance" : "test";
      if (!f.collected) failures.push({ check: kind, rule: "does-not-load", file: f.file, message: firstLine(f.error) });
      for (const t of f.tests.filter((x) => x.status !== "passed")) {
        failures.push({ check: kind, rule: kind === "acceptance" ? "acceptance-failing" : "failing", file: f.file, message: `"${t.name}" is ${t.status}: ${firstLine(t.message)}` });
      }
    }
    for (const file of acceptance) if (!report.files.some((f) => f.file === file)) failures.push({ check: "acceptance", rule: "not-run", file, message: `${file} did not run` });
    const typecheck = runStackCommand(stack, "typecheck", { logName: `${ctx.state.feature}-verify-typecheck` });
    if (!typecheck.ok && !typecheck.skipped) failures.push({ check: "typecheck", rule: "typecheck-failed", message: typecheck.tail });
  }
  return failures;
}
