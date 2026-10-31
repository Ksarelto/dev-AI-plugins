// gate-impl (S5, green and characterisation phases): the red tests are unchanged since gate-red, the
// task's own tests ran and every one of them passed (none skipped), the whole suite passes, and
// typecheck, lint, the architecture check and the build are clean, and the role's own checks
// (role.yaml gates.checks: an eval run, a migration check, …) pass for this task type.
import { join, relative } from "node:path";
import { fileHash, toPosix } from "../lib/core.mjs";
import { firstLine, freshReport, isAcceptanceTest, readVitestReport } from "../lib/vitest-report.mjs";
import { runStackCommand } from "../lib/stackexec.mjs";
import { taskTestFiles } from "../lib/tasks.mjs";
import { typecheckForTask } from "../lib/testrun.mjs";

export const inputs = ["tasks"];
export const cacheable = false;

export function run(ctx) {
  const { task, stack } = ctx;
  if (!task) return [{ check: "impl", message: "gate-impl needs --task" }];
  if (stack?.error) return [{ check: "stack", message: stack.error }];
  const failures = [];
  const lock = ctx.state?.tasks?.[task.id]?.red_lock ?? {};
  for (const [file, hash] of Object.entries(lock)) {
    if (fileHash(join(ctx.projectDir, file)) !== hash) {
      failures.push({ check: "red-lock", rule: "red-test-changed", file, message: `${file} changed after gate-red; red tests are read-only in the green phase (dispute it instead)` });
    }
  }
  const reportFile = freshReport(join(ctx.paths.logs, `${task.id}-impl-report.json`));
  const run = runStackCommand(stack, "test", { vars: { report: reportFile, files: [] }, logName: `${task.id}-impl-test` });
  const report = readVitestReport(reportFile, ctx.projectDir);
  if (!report) failures.push({ check: "test", rule: "no-report", message: `the test command wrote no JSON report (exit ${run.code}):\n${run.tail}` });
  for (const f of (report?.files ?? []).filter((x) => !isAcceptanceTest(x.file))) {
    if (!f.collected) failures.push({ check: "test", rule: "does-not-load", file: f.file, message: firstLine(f.error) });
    for (const t of f.tests.filter((x) => x.status === "failed")) failures.push({ check: "test", rule: "failing", file: f.file, message: `"${t.name}": ${firstLine(t.message)}` });
  }
  // The task's own tests (red tests, or the characterisation tests it writes) must exist, run and all pass.
  for (const file of taskTestFiles(task, stack?.stack)) {
    const result = report?.files.find((f) => f.file === file);
    if (report && !result) failures.push({ check: "test", rule: "task-test-missing", file, message: `${file} did not run` });
    else if (result && !result.tests.length) failures.push({ check: "test", rule: "no-tests", file, message: `${file} contains no tests` });
    for (const t of result?.tests.filter((x) => !["passed", "failed"].includes(x.status)) ?? []) {
      failures.push({ check: "test", rule: "skipped-test", file, message: `"${t.name}" is ${t.status}; the task's tests must run` });
    }
  }
  const steps = ["typecheck", "lint", "architecture_check", ...(ctx.config.quality?.impl_build === false ? [] : ["build"])];
  for (const name of steps) {
    const r = name === "typecheck" ? typecheckForTask(stack, `${task.id}-impl-typecheck`) : runStackCommand(stack, name, { logName: `${task.id}-impl-${name}` });
    if (!r.ok && !r.skipped) failures.push({ check: name, rule: `${name}-failed`, message: r.tail || `${name} exited with ${r.code}` });
  }
  failures.push(...roleChecks(ctx));
  return failures;
}

/** role.yaml gates.checks for this task type: a stack command or a node script from the role pack. */
function roleChecks(ctx) {
  const { task, stack } = ctx;
  const pack = ctx.packs?.[ctx.config.roles?.[task.role]?.pack];
  const failures = [];
  for (const check of pack?.role?.gates?.checks ?? []) {
    if (check.task_types && !check.task_types.includes(task.type)) continue;
    const label = `${task.id}-impl-${check.name}`;
    const reportFile = check.report ? freshReport(join(ctx.paths.logs, `${label}-report.json`)) : null;
    const resolved = check.node
      ? // The script runs in the role's folder and gets the task's files relative to it.
        { ...stack, stack: { ...stack.stack, commands: { [check.name]: [process.execPath, join(pack.root, check.node), "--project", stack.cwd, "--task-type", task.type, "--files", ...task.files_expected.map((f) => toPosix(relative(stack.cwd, join(ctx.projectDir, f))))] } } }
      : stack;
    const command = check.node ? check.name : check.command;
    if (!resolved.stack.commands?.[command]) {
      failures.push({ check: check.name, rule: "check-missing", message: `the stack defines no "${command}" command for ${pack.name}'s ${check.name} check` });
      continue;
    }
    const r = runStackCommand(resolved, command, { vars: { report: reportFile ?? "", files: [] }, logName: label });
    const report = reportFile ? readVitestReport(reportFile, ctx.projectDir) : null;
    const allowSkipped = check.allow_skipped || ctx.config.quality?.allow_skipped_checks === true;
    if (reportFile && !report) failures.push({ check: check.name, rule: "no-report", message: `${check.name} wrote no report (exit ${r.code}):\n${r.tail}` });
    for (const f of report?.files ?? []) {
      for (const t of f.tests.filter((x) => x.status === "failed")) failures.push({ check: check.name, rule: `${check.name}-failing`, file: f.file, message: `"${t.name}": ${firstLine(t.message)}` });
    }
    const ran = (report?.files ?? []).flatMap((f) => f.tests).filter((t) => ["passed", "failed"].includes(t.status)).length;
    if (report && !ran && !allowSkipped) failures.push({ check: check.name, rule: `${check.name}-skipped`, message: `${check.name} ran no test (all skipped or none found) — an AI task needs a real eval run; set quality.allow_skipped_checks only where evals cannot run` });
    if (!r.ok && !(report && failures.some((f) => f.check === check.name))) failures.push({ check: check.name, rule: `${check.name}-failed`, message: r.tail || `${check.name} exited with ${r.code}` });
  }
  return failures;
}
