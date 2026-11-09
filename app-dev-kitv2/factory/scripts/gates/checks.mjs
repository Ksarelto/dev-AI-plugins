// gate-checks (S6, the machine half of verification): for every enabled stack, the whole suite passes
// — acceptance tests included, none skipped in the feature's own files — and typecheck, lint, build,
// the integration tests and the role's verification checks (role.yaml gates.checks with at_verify:
// a full eval run) are clean. The engine runs it before the reviewers are dispatched, so a red build
// goes back to implementation without a review round; gate-verify reuses a passing result.
import { join } from "node:path";
import { fileHash } from "../lib/core.mjs";
import { firstLine, freshReport, readVitestReport } from "../lib/vitest-report.mjs";
import { enabledStacks, featureAcceptance, runTests } from "../lib/testrun.mjs";
import { inPool, resolveStack, runStackCommandAsync } from "../lib/stackexec.mjs";
import { isWaived, readWaivers } from "../lib/waivers.mjs";

export const inputs = ["acceptance-tests", "acceptance-waiver", "change-set"];
export const cacheable = "tree"; // a passing run is reused while the working tree is unchanged

export async function run(ctx) {
  const failures = [];
  const acceptance = ctx.all("acceptance-tests").map((a) => a.rel);
  for (const [file, hash] of Object.entries(ctx.state?.acceptance_lock ?? {})) {
    if (fileHash(join(ctx.projectDir, file)) !== hash) failures.push({ check: "acceptance-lock", rule: "acceptance-test-changed", file, message: `${file} changed after gate-acceptance and its locked copy is missing — a human decides (replay acceptance to re-lock)` });
  }
  // Skipped or todo tests count against the feature only in its own files; old skips elsewhere stay as they are.
  const own = new Set([...featureAcceptance(ctx).files, ...(ctx.load("change-set")?.data.tasks ?? []).flatMap((t) => t.files ?? [])]);
  const stacks = enabledStacks(ctx, resolveStack);
  if (!stacks.length) failures.push({ check: "test", rule: "no-stack", message: "no enabled role has an installed stack to run the tests with" });
  const label = (stack, what) => `${ctx.state.feature}-verify-${stack.role}${what ? `-${what}` : ""}`;
  const jobs = stacks.flatMap((stack) => [
    async () => testFailures(ctx, stack, await runTests(ctx, stack, label(stack)), { acceptance, own, waivers: ctx.feature?.dir ? readWaivers(ctx.feature.dir) : [] }),
    // Integration tests (real database, Testcontainers) run once here; no task gate runs them.
    async () => (stack.stack.commands?.test_integration && ctx.config.quality?.integration_tests !== "skip" ? integrationFailures(stack, await runStackCommandAsync(stack, "test_integration", { logName: label(stack, "integration"), timeoutMs: 20 * 60_000 })) : { failures: [] }),
    ...["typecheck", "lint", "build"].map((name) => async () => {
      const r = await runStackCommandAsync(stack, name, { logName: label(stack, name) });
      return { failures: !r.ok && !r.skipped ? [{ check: name, rule: `${name}-failed`, fix: true, message: `${stack.role}: ${r.tail || `${name} exited with ${r.code}`}` }] : [] };
    }),
    ...verifyChecks(ctx, stack).map((check) => () => roleSuite(ctx, stack, check, label(stack, check.name))),
  ]);
  const results = await inPool(jobs, ctx.config.quality?.gate_concurrency ?? 4);
  failures.push(...results.flatMap((r) => r.failures));
  const ran = results.flatMap((r) => r.ran ?? []); // each role's stack runs in its own folder: "did it run" is judged over all reports
  if (stacks.length && failures.every((f) => f.rule !== "no-report")) {
    for (const file of acceptance) if (!ran.includes(file)) failures.push({ check: "acceptance", rule: "not-run", fix: true, file, message: `${file} did not run` });
  }
  return failures;
}

/**
 * The ONLY way a failing acceptance test passes gate-checks: a human-approved entry in acceptance-waiver.yaml
 * (`factory acceptance waive`). The waived failure stays in the result as a warning, so the review and the digest list it.
 */
function testFailures(ctx, stack, { run, report }, { acceptance, own, waivers = [] }) {
  // A test run that crashed (bad config, broken global setup) is a code problem; no output at all is not.
  if (!report) return { failures: [{ check: "test", rule: "no-report", fix: run.code !== 0 && Boolean(run.tail), message: `${stack.role}: the test command wrote no report (exit ${run.code}):\n${run.tail}` }] };
  const failures = [];
  for (const f of report.files) {
    const kind = acceptance.includes(f.file) ? "acceptance" : "test";
    const waived = (name) => kind === "acceptance" && isWaived(waivers, f.file, name);
    if (!f.collected) {
      if (waived()) failures.push({ check: kind, rule: "acceptance-waived", warn: true, file: f.file, message: `${f.file} does not load (waived by a human): ${firstLine(f.error)}` });
      else failures.push({ check: kind, rule: "does-not-load", fix: true, file: f.file, message: firstLine(f.error) });
    }
    for (const t of f.tests.filter((x) => x.status === "failed" || (x.status !== "passed" && own.has(f.file)))) {
      if (waived(t.name)) failures.push({ check: kind, rule: "acceptance-waived", warn: true, file: f.file, message: `"${t.name}" is ${t.status} (waived by a human): ${firstLine(t.message)}` });
      else failures.push({ check: kind, rule: kind === "acceptance" ? "acceptance-failing" : "failing", fix: true, file: f.file, message: `"${t.name}" is ${t.status}: ${firstLine(t.message)}` });
    }
  }
  return { failures, ran: report.files.map((f) => f.file) };
}

function integrationFailures(stack, it) {
  if (it.ok) return { failures: [] };
  const noRuntime = /container runtime|docker (daemon|socket)|Cannot connect to the Docker|testcontainers/i.test(it.tail ?? "");
  if (noRuntime) return { failures: [{ check: "integration", rule: "integration-not-run", message: `${stack.role}: integration tests need a container runtime (start Docker), or set quality.integration_tests: skip where they cannot run:\n${it.tail}` }] };
  return { failures: [{ check: "integration", rule: "integration-failing", fix: true, message: `${stack.role}: integration tests fail:\n${it.tail}` }] };
}

/** The role's report-writing checks marked at_verify (the eval suite): run whole, once, here. */
function verifyChecks(ctx, stack) {
  const pack = ctx.packs?.[ctx.config.roles?.[stack.role]?.pack];
  return (pack?.role?.gates?.checks ?? []).filter((check) => check.at_verify && check.command && check.report);
}

async function roleSuite(ctx, stack, check, label) {
  const reportFile = freshReport(join(ctx.paths.logs, `${label}-report.json`));
  const r = await runStackCommandAsync(stack, check.command, { vars: { report: reportFile, files: [] }, logName: label });
  const report = readVitestReport(reportFile, ctx.projectDir);
  if (!report) return { failures: [{ check: check.name, rule: "no-report", message: `${stack.role}: ${check.name} wrote no report (exit ${r.code}):\n${r.tail}` }] };
  const failures = [];
  for (const f of report.files) {
    for (const t of f.tests.filter((x) => x.status === "failed")) failures.push({ check: check.name, rule: `${check.name}-failing`, fix: true, file: f.file, message: `"${t.name}": ${firstLine(t.message)}` });
  }
  const ran = report.files.flatMap((f) => f.tests).filter((t) => ["passed", "failed"].includes(t.status)).length;
  const allowSkipped = check.allow_skipped || ctx.config.quality?.allow_skipped_checks === true;
  if (!ran && !allowSkipped) failures.push({ check: check.name, rule: `${check.name}-skipped`, message: `${stack.role}: ${check.name} ran no test (all skipped or none found); set quality.allow_skipped_checks only where it cannot run` });
  return { failures };
}
