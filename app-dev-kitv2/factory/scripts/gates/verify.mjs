// gate-verify (S6): every acceptance test passes, the whole suite passes, and the review has no
// blocking finding (quality.review_blocking, P0/P1 by default) — reviewer lenses and role auditors.
import { join } from "node:path";
import { fileHash } from "../lib/core.mjs";
import { firstLine } from "../lib/vitest-report.mjs";
import { enabledStacks, featureAcceptance, runTests } from "../lib/testrun.mjs";
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
      failures.push({ check: "review", rule: `blocking-${f.severity}`, fix: true, file: f.file, message: `${f.id ?? f.lens ?? "finding"}: ${f.claim}${f.fix_hint ? ` — ${f.fix_hint}` : ""}` });
    }
  }
  const acceptance = ctx.all("acceptance-tests").map((a) => a.rel);
  for (const [file, hash] of Object.entries(ctx.state?.acceptance_lock ?? {})) {
    if (fileHash(join(ctx.projectDir, file)) !== hash) failures.push({ check: "acceptance-lock", rule: "acceptance-test-changed", file, message: `${file} changed after gate-acceptance and its locked copy is missing — a human decides (replay acceptance to re-lock)` });
  }
  // Skipped or todo tests count against the feature only in its own files; old skips elsewhere stay as they are.
  const own = new Set([...featureAcceptance(ctx).files, ...(ctx.load("change-set")?.data.tasks ?? []).flatMap((t) => t.files ?? [])]);
  const stacks = enabledStacks(ctx, resolveStack);
  if (!stacks.length) failures.push({ check: "test", rule: "no-stack", message: "no enabled role has an installed stack to run the tests with" });
  const ran = []; // each role's stack runs in its own folder: "did it run" is judged over all reports
  for (const stack of stacks) {
    const { run, report } = runTests(ctx, stack, `${ctx.state.feature}-verify-${stack.role}`);
    if (!report) {
      // A test run that crashed (bad config, broken global setup) is a code problem; no output at all is not.
      failures.push({ check: "test", rule: "no-report", fix: run.code !== 0 && Boolean(run.tail), message: `the test command wrote no report (exit ${run.code}):\n${run.tail}` });
      continue;
    }
    for (const f of report.files) {
      const kind = acceptance.includes(f.file) ? "acceptance" : "test";
      if (!f.collected) failures.push({ check: kind, rule: "does-not-load", fix: true, file: f.file, message: firstLine(f.error) });
      for (const t of f.tests.filter((x) => x.status === "failed" || (x.status !== "passed" && own.has(f.file)))) {
        failures.push({ check: kind, rule: kind === "acceptance" ? "acceptance-failing" : "failing", fix: true, file: f.file, message: `"${t.name}" is ${t.status}: ${firstLine(t.message)}` });
      }
    }
    ran.push(...report.files.map((f) => f.file));
    // Integration tests (real database, Testcontainers) run once here; no task gate runs them.
    if (stack.stack.commands?.test_integration && ctx.config.quality?.integration_tests !== "skip") {
      const it = runStackCommand(stack, "test_integration", { logName: `${ctx.state.feature}-verify-${stack.role}-integration`, timeoutMs: 20 * 60_000 });
      const noRuntime = /container runtime|docker (daemon|socket)|Cannot connect to the Docker|testcontainers/i.test(it.tail ?? "");
      if (!it.ok && noRuntime) failures.push({ check: "integration", rule: "integration-not-run", message: `${stack.role}: integration tests need a container runtime (start Docker), or set quality.integration_tests: skip where they cannot run:\n${it.tail}` });
      else if (!it.ok) failures.push({ check: "integration", rule: "integration-failing", fix: true, message: `${stack.role}: integration tests fail:\n${it.tail}` });
    }
    const typecheck = runStackCommand(stack, "typecheck", { logName: `${ctx.state.feature}-verify-${stack.role}-typecheck` });
    if (!typecheck.ok && !typecheck.skipped) failures.push({ check: "typecheck", rule: "typecheck-failed", fix: true, message: typecheck.tail });
  }
  if (stacks.length && failures.every((f) => f.rule !== "no-report")) {
    for (const file of acceptance) if (!ran.includes(file)) failures.push({ check: "acceptance", rule: "not-run", fix: true, file, message: `${file} did not run` });
  }
  return failures;
}
