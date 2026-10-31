// Runs a role's test command once with a fresh JSON report; shared by the gates that need results.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { freshReport, isAcceptanceTest, readVitestReport } from "./vitest-report.mjs";
import { runStackCommand } from "./stackexec.mjs";

export function runTests(ctx, stack, label) {
  const reportFile = freshReport(join(ctx.paths.logs, `${label}-report.json`));
  const run = runStackCommand(stack, "test", { vars: { report: reportFile, files: [] }, logName: `${label}-test` });
  return { run, report: readVitestReport(reportFile, ctx.projectDir) };
}

/**
 * Typecheck for task gates: errors located only in acceptance tests (written against the finished
 * feature's API) do not count until verification, which type-checks everything.
 */
export function typecheckForTask(stack, label) {
  const run = runStackCommand(stack, "typecheck", { logName: label });
  if (run.ok || run.skipped) return run;
  const lines = readFileSync(run.log, "utf8").split("\n");
  const errors = lines.filter((l) => /error TS\d+/.test(l));
  const relevant = errors.filter((l) => !isAcceptanceTest(l.split(/[(:]/)[0]));
  return errors.length && !relevant.length ? { ...run, ok: true, ignored: errors.length } : run;
}

/**
 * This feature's acceptance tests: the acceptance files that name one of its acceptance criteria.
 * Other features' acceptance tests are only run as part of the whole suite.
 */
export function featureAcceptance(ctx) {
  const acs = ctx.spec()?.reqs.flatMap((r) => r.acs.map((a) => a.id)) ?? [];
  const names = acs.map((ac) => new RegExp(`\\b${ac}\\b`));
  const files = ctx.all("acceptance-tests").filter((a) => {
    const text = readFileSync(a.file, "utf8");
    return names.some((re) => re.test(text));
  });
  return { acs, files: files.map((a) => a.rel), source: (rel) => readFileSync(files.find((a) => a.rel === rel).file, "utf8") };
}

/** Test names declared in a source file (`it("…")`, `test("…")`) — for files whose import fails. */
export function declaredTests(source) {
  return [...source.matchAll(/\b(?:it|test)(?:\.(?:only|each\([^)]*\)))?\s*\(\s*(['"`])(.+?)\1/g)].map((m) => m[2]);
}

/** Every enabled role whose stack is installed, resolved for running commands. */
export function enabledStacks(ctx, resolveStack) {
  return Object.entries(ctx.config.roles ?? {})
    .filter(([, r]) => r?.enabled)
    .map(([name]) => resolveStack({ config: ctx.config, packs: ctx.packs ?? {}, projectDir: ctx.projectDir }, name))
    .filter((s) => !s.error);
}
