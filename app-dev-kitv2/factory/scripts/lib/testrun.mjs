// Runs a role's test command once with a fresh JSON report; shared by the gates that need results.
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { toPosix } from "./core.mjs";
import { freshReport, isAcceptanceTest, readVitestReport } from "./vitest-report.mjs";
import { incrementalTscArgs, runStackCommandAsync } from "./stackexec.mjs";
import { baseRefValid, changedSinceBase } from "./baseref.mjs";

export async function runTests(ctx, stack, label, { extra = [], scope } = {}) {
  const reportFile = freshReport(join(ctx.paths.logs, `${label}-report.json`));
  const run = await runStackCommandAsync(stack, scope?.command ?? "test", { vars: { report: reportFile, files: scope?.files ?? [], extra: scope ? scope.extra : extra }, logName: `${label}-test` });
  return { run, report: readVitestReport(reportFile, ctx.projectDir) };
}

/**
 * Typecheck for task gates: errors located only in acceptance tests (written against the finished
 * feature's API) do not count until verification, which type-checks everything.
 */
export async function typecheckForTask(stack, label, { incremental = true } = {}) {
  const run = await runStackCommandAsync(stack, "typecheck", { logName: label, vars: { extra: incremental ? incrementalTscArgs(stack) : [] } });
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

/** The base ref of the task a gate runs for (recorded when its first dispatch began; see baseref.mjs), if it still exists. */
function taskBase(ctx) {
  const ref = ctx.task ? ctx.state?.tasks?.[ctx.task.id]?.base_ref : null;
  return ref && baseRefValid(ctx.projectDir, ref) ? ref : null;
}

/**
 * Extra test arguments that limit a task gate's run to the tests touched by the task's own change
 * (the stack's test_scoped_args, e.g. `--changed`, which includes new files). Plain `--changed` is relative to the
 * last COMMIT, and nothing is committed before delivery, so it grows into every change of the feature; and
 * `--changed <base ref>` does not narrow it either (Vitest diffs `<ref>...HEAD` plus the uncommitted files, so
 * the whole uncommitted tree still counts). A task gate therefore runs the stack's `test_related` command on the
 * files the task changed since its base ref when there is one (see testScope); scopeArgs is the fallback.
 * Empty — the whole suite — when asked for, when the stack has none, when quality.task_tests is "full", or outside git.
 */
export function scopeArgs(ctx, stack, { full = false } = {}) {
  const scoped = stack?.stack?.test_scoped_args;
  if (full || !scoped?.length || ctx.config.quality?.task_tests === "full") return [];
  const git = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: stack.cwd, encoding: "utf8" });
  if (git.status !== 0) return [];
  const base = taskBase(ctx);
  if (!base) return scoped;
  const args = scoped.flatMap((a) => (a === "{base}" ? [base] : [a]));
  return !scoped.includes("{base}") && args.at(-1) === "--changed" ? [...args, base] : args;
}

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
/** The vitest flags that say WHICH tests and config a run uses; a related run must keep them (the others are the command's own). */
const KEEP_FLAGS = new Set(["--config", "-c", "--project", "--workspace", "--root", "-r", "--dir", "--environment"]);

/**
 * The flags of the project's own test script (`"test:run": "vitest run --config config/vitest/vitest.config.ts"` →
 * `["--config", "config/vitest/vitest.config.ts"]`), so `vitest related …` runs with the same config and projects as
 * `test`. null when the test command is not a package script that runs vitest (then there is no related run).
 */
export function vitestScriptFlags(stack) {
  const test = stack?.stack?.commands?.test;
  const script = test?.script;
  // An exec-form test command ({ exec, args }): keep the which-tests flags from its own args.
  if (!script) return keepFlags((test?.args ?? []).map(String));
  let text;
  try {
    text = JSON.parse(readFileSync(join(stack.cwd, "package.json"), "utf8")).scripts?.[script];
  } catch {
    return null;
  }
  const run = /^\s*vitest\s+run\b([^&|;]*)/.exec(text ?? "");
  // Only a script that starts with `vitest run …`: an env prefix (cross-env, dotenv --) or an earlier chained step would be lost.
  if (!run) return null;
  return keepFlags(run[1].trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/^(['"])(.*)\1$/, "$2")));
}

function keepFlags(tokens) {
  const flags = [];
  for (let i = 0; i < tokens.length; i++) {
    const [name, inline] = tokens[i].split(/=(.*)/s);
    if (!KEEP_FLAGS.has(name)) continue;
    if (inline !== undefined) flags.push(name, inline);
    else if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) flags.push(name, tokens[++i]);
  }
  return flags;
}

/**
 * What a task gate runs its tests with: { command, files, extra }. With a base ref and a stack `test_related`
 * command (e.g. `vitest related {files} --run`), the files the task changed since its base ref (computed from the
 * working tree against that ref, so the work of earlier tasks, uncommitted or not, is not in it) are passed to the
 * `test_related` command, with the flags (config, projects) of the project's own test script. Without them (no base
 * ref, no such command, a test script that is not `vitest run`, nothing changed, not git) it is the plain
 * `test` command with scopeArgs.
 */
export function testScope(ctx, stack, { full = false } = {}) {
  const extra = scopeArgs(ctx, stack, { full });
  const fallback = { command: "test", files: [], extra };
  if (!extra.length || !stack?.stack?.commands?.test_related) return fallback;
  const inherited = vitestScriptFlags(stack);
  if (!inherited) return fallback; // the project's test script is not a plain `vitest run …`: its flags are unknown
  const base = taskBase(ctx);
  const changed = base ? changedSinceBase(ctx.projectDir, base) : null;
  if (!changed) return fallback;
  const files = changed
    .filter((f) => SOURCE_FILE.test(f) && existsSync(join(ctx.projectDir, f)))
    .map((f) => toPosix(relative(stack.cwd, join(ctx.projectDir, f))))
    .filter((f) => !f.startsWith(".."));
  return files.length ? { command: "test_related", files, extra: inherited } : fallback;
}

/**
 * The files to lint for a task: what changed since its base ref, existing and lintable, relative to
 * the role's folder. null = lint everything (no base ref, the stack has no lint_files command,
 * quality.task_lint is "full", the role's last task, or not a git repository).
 */
export function lintScope(ctx, stack, { full = false } = {}) {
  if (full || !stack?.stack?.commands?.lint_files || ctx.config.quality?.task_lint === "full") return null;
  const base = taskBase(ctx);
  const changed = base ? changedSinceBase(ctx.projectDir, base) : null;
  if (!changed) return null;
  return changed
    .filter((f) => /\.[cm]?[jt]sx?$/.test(f) && existsSync(join(ctx.projectDir, f)))
    .map((f) => toPosix(relative(stack.cwd, join(ctx.projectDir, f))))
    .filter((f) => !f.startsWith(".."));
}

/** The last open task of its role runs the whole suite, so a track never ends on a partial run. */
export function lastOfRole(ctx, task) {
  const open = (ctx.load("tasks")?.data.tasks ?? []).filter(
    (t) => t.role === task.role && t.id !== task.id && !["done", "replaced", "parked"].includes(ctx.state?.tasks?.[t.id]?.status),
  );
  return open.length === 0;
}

const CLOSED_TASK = ["done", "parked", "replaced"];

/**
 * Test files that belong to OTHER tasks which are not closed yet (their red tests may be written and
 * still failing, or stale after a split): a gate for this task must not call them "broken existing tests".
 */
export function otherOpenRedTests(ctx) {
  const plan = ctx.load?.("tasks")?.data?.tasks ?? [];
  const mine = ctx.task?.id;
  const files = new Set();
  for (const t of plan) {
    if (t.id === mine || CLOSED_TASK.includes(ctx.state?.tasks?.[t.id]?.status)) continue;
    for (const f of t.tdd?.red_tests ?? []) files.add(f);
  }
  return files;
}

/**
 * Red tests of this task that extend a test file which already existed: tracked by git, owned by a done
 * task, or reopened by a fix round (state.tasks.<id>.extends). Their passing tests are not a bad red.
 */
export function extendedTestFiles(ctx) {
  const task = ctx.task;
  const out = new Set(ctx.state?.tasks?.[task.id]?.extends ?? []);
  const plan = ctx.load?.("tasks")?.data?.tasks ?? [];
  for (const f of task.tdd?.red_tests ?? []) {
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", f], { cwd: ctx.projectDir, stdio: "ignore" }).status === 0;
    const ownedByDone = plan.some((t) => t.id !== task.id && ctx.state?.tasks?.[t.id]?.status === "done" && [...(t.tdd?.red_tests ?? []), ...t.files_expected].includes(f));
    if (tracked || ownedByDone) out.add(f);
  }
  return out;
}
