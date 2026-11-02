// Runs a role's test command once with a fresh JSON report; shared by the gates that need results.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { freshReport, isAcceptanceTest, readVitestReport } from "./vitest-report.mjs";
import { runStackCommandAsync } from "./stackexec.mjs";

export async function runTests(ctx, stack, label, { extra = [] } = {}) {
  const reportFile = freshReport(join(ctx.paths.logs, `${label}-report.json`));
  const run = await runStackCommandAsync(stack, "test", { vars: { report: reportFile, files: [], extra }, logName: `${label}-test` });
  return { run, report: readVitestReport(reportFile, ctx.projectDir) };
}

/**
 * Typecheck for task gates: errors located only in acceptance tests (written against the finished
 * feature's API) do not count until verification, which type-checks everything.
 */
export async function typecheckForTask(stack, label) {
  const run = await runStackCommandAsync(stack, "typecheck", { logName: label });
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

/**
 * Extra test arguments that limit a task gate's run to the tests touched by the uncommitted changes
 * (the stack's test_scoped_args, e.g. vitest --changed, which includes new files). Empty — the whole
 * suite — when asked for, when the stack has none, when quality.task_tests is "full", or outside git.
 */
export function scopeArgs(ctx, stack, { full = false } = {}) {
  const scoped = stack?.stack?.test_scoped_args;
  if (full || !scoped?.length || ctx.config.quality?.task_tests === "full") return [];
  const git = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: stack.cwd, encoding: "utf8" });
  return git.status === 0 ? scoped : [];
}

/** The last open task of its role runs the whole suite, so a track never ends on a partial run. */
export function lastOfRole(ctx, task) {
  const open = (ctx.load("tasks")?.data.tasks ?? []).filter(
    (t) => t.role === task.role && t.id !== task.id && !["done", "replaced", "parked"].includes(ctx.state?.tasks?.[t.id]?.status),
  );
  return open.length === 0;
}
