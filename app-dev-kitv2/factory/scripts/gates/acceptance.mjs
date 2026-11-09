// gate-acceptance (before S5): acceptance tests exist for every acceptance criterion — named after it —
// and none passes yet. They are written from the spec alone; verification later requires them to pass.
// A file that fails to import (the feature's modules do not exist yet) is a valid red: its declared
// test names count, as failing.
import { firstLine } from "../lib/vitest-report.mjs";
import { declaredTests, enabledStacks, featureAcceptance, runTests, testScope } from "../lib/testrun.mjs";
import { resolveStack } from "../lib/stackexec.mjs";

export const inputs = ["acceptance-tests", "prd", "delta-spec"];
export const cacheable = false;

export async function run(ctx) {
  const { acs, files, source } = featureAcceptance(ctx);
  if (!files.length) return [{ check: "acceptance", rule: "none", message: `no acceptance test (*.acceptance.test.*) names ${acs.join(", ") || "an acceptance criterion"}` }];
  const stacks = enabledStacks(ctx, resolveStack);
  if (!stacks.length) return [{ check: "acceptance", rule: "no-stack", message: "no enabled role has an installed stack to run the tests with" }];
  const failures = [];
  // Each role's stack runs in its own folder: coverage is judged over every stack's report together.
  const mine = [];
  // New acceptance files are uncommitted changes, so a scoped run (vitest --changed) includes them.
  const runs = await Promise.all(stacks.map((stack) => runTests(ctx, stack, `${ctx.state.feature}-acceptance-${stack.role}`, { scope: testScope(ctx, stack) })));
  for (const [i, stack] of stacks.entries()) {
    const { run, report } = runs[i];
    if (!report) failures.push({ check: "acceptance", rule: "no-report", message: `${stack.role}: the test command wrote no report (exit ${run.code}):\n${run.tail}` });
    else mine.push(...report.files.filter((f) => files.includes(f.file)));
  }
  if (failures.length) return failures; // a missing report makes "not run" and coverage meaningless
  for (const file of files) if (!mine.some((f) => f.file === file)) failures.push({ check: "acceptance", rule: "not-run", file, message: `${file} did not run` });
  const names = [];
  for (const f of mine) {
    if (!f.collected && /SyntaxError|Unexpected token/.test(f.error ?? "")) {
      failures.push({ check: "acceptance", rule: "syntax-error", file: f.file, message: firstLine(f.error) });
      continue;
    }
    names.push(...(f.collected ? f.tests.map((t) => t.name) : declaredTests(source(f.file))));
    for (const t of f.tests.filter((x) => x.status === "passed")) {
      failures.push({ check: "acceptance", rule: "passes-before-implementation", file: f.file, message: `"${t.name}" already passes — it cannot prove the feature` });
    }
  }
  for (const ac of acs) if (!names.some((n) => new RegExp(`\\b${ac}\\b`).test(n))) failures.push({ check: "acceptance", rule: "ac-without-test", message: `no acceptance test names ${ac}` });
  return failures;
}
