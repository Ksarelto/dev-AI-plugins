// gate-red (S5, red phase): the task's new tests compile against the stubs and every one of them fails
// for the right reason — an assertion or an explicit "not implemented" — while every other test the
// change touches still passes. Skipped or todo tests are not a red.
import { join } from "node:path";
import { firstLine, freshReport, goodRedFailure, isAcceptanceTest, readVitestReport } from "../lib/vitest-report.mjs";
import { runStackCommandAsync } from "../lib/stackexec.mjs";
import { scopeArgs, typecheckForTask } from "../lib/testrun.mjs";

export const inputs = ["tasks"];
export const cacheable = "tree"; // a passing run is reused while the working tree is unchanged

export async function run(ctx) {
  const { task, stack } = ctx;
  if (!task) return [{ check: "red", message: "gate-red needs --task" }];
  if (stack?.error) return [{ check: "stack", message: stack.error }];
  const red = task.tdd?.red_tests ?? [];
  if (!red.length) return [{ check: "red", rule: "no-red-tests", message: `${task.id} declares no red_tests` }];
  const failures = [];
  const reportFile = freshReport(join(ctx.paths.logs, `${task.id}-red-report.json`));
  const [typecheck, run] = await Promise.all([
    typecheckForTask(stack, `${task.id}-red-typecheck`),
    runStackCommandAsync(stack, "test", { vars: { report: reportFile, files: [], extra: scopeArgs(ctx, stack) }, logName: `${task.id}-red-test` }),
  ]);
  if (!typecheck.ok) failures.push({ check: "typecheck", rule: "tests-do-not-compile", message: `tests or stubs do not type-check:\n${typecheck.tail}` });

  const report = readVitestReport(reportFile, ctx.projectDir);
  if (!report) return [...failures, { check: "test", rule: "no-report", message: `the test command wrote no JSON report (exit ${run.code}):\n${run.tail}` }];

  for (const file of red) {
    const result = report.files.find((f) => f.file === file);
    if (!result) {
      failures.push({ check: "red", rule: "not-collected", file, message: `${file} was not run — wrong path or not matched by the test config` });
      continue;
    }
    if (!result.collected) {
      failures.push({ check: "red", rule: "does-not-load", file, message: `fails to load, which is not a valid red: ${firstLine(result.error)}` });
      continue;
    }
    if (!result.tests.length) failures.push({ check: "red", rule: "no-tests", file, message: `${file} contains no tests` });
    for (const t of result.tests) {
      if (t.status === "passed") failures.push({ check: "red", rule: "passes-before-implementation", file, message: `"${t.name}" already passes — it does not test the new behaviour` });
      else if (t.status !== "failed") failures.push({ check: "red", rule: "skipped-red-test", file, message: `"${t.name}" is ${t.status} — a red test must run and fail` });
      else if (!goodRedFailure(t.message)) failures.push({ check: "red", rule: "wrong-failure", file, message: `"${t.name}" fails for the wrong reason: ${firstLine(t.message)}` });
    }
  }
  for (const f of report.files.filter((x) => !red.includes(x.file) && !isAcceptanceTest(x.file))) {
    if (!f.collected) failures.push({ check: "regression", rule: "existing-test-broken", file: f.file, message: `existing test file no longer loads: ${firstLine(f.error)}` });
    for (const t of f.tests.filter((x) => x.status === "failed")) {
      failures.push({ check: "regression", rule: "existing-test-broken", file: f.file, message: `existing test "${t.name}" now fails: ${firstLine(t.message)}` });
    }
  }
  return failures;
}
