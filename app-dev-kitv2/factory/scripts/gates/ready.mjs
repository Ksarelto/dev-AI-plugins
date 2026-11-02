// gate-ready-for-pr (S8): the commit plan covers every done task with conventional messages and task
// trailers, each task commit holds only that task's files, nothing in the working tree is left out of
// the plan, the PR body has every section and a trace row per acceptance criterion that names a task
// which really satisfies it, and no human note is still open.
import { readText } from "../lib/core.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validate } from "../lib/schemas.mjs";
import { featureAcceptance } from "../lib/testrun.mjs";
import { featureChanges } from "../lib/delivery.mjs";

export const inputs = ["commit-plan", "pr-body", "tasks", "test-plan", "human-notes", "prd", "delta-spec", "acceptance-tests"];
export const cacheable = false; // it reads the working tree
const SECTIONS = ["## Summary", "## Spec trace", "## Docs", "## Provenance"];
const CONVENTIONAL = /^(feat|fix|refactor|test|docs|chore|perf|style|build|ci)(\([^)]+\))?!?: .+/;

export function run(ctx) {
  const failures = [];
  const plan = ctx.load("commit-plan");
  if (!plan) failures.push({ check: "commits", message: "08-delivery/commits.yaml is missing" });
  else {
    for (const e of validate("commit-plan", plan.data)) failures.push({ check: "schema", rule: "commit-plan", file: plan.rel, message: e });
    const done = Object.entries(ctx.state.tasks ?? {}).filter(([, u]) => u.status === "done").map(([id]) => id);
    for (const id of done) if (!plan.data.commits?.some((c) => c.task === id)) failures.push({ check: "commits", rule: "task-without-commit", message: `${id} has no commit` });
    const tasks = Object.values(ctx.state.tasks ?? {}).length ? (ctx.load("tasks")?.data.tasks ?? []) : [];
    // What changed since the feature started; a greenfield scaffold's files are planned work too.
    const tree = featureChanges(ctx.projectDir, ctx.state.baseline ?? {});
    const scaffold = (ctx.state.scaffold?.done ?? []).flatMap((d) => d.files ?? []);
    const planned = new Set([...tasks.flatMap((t) => t.files_expected), ...scaffold]);
    // A planned file that was moved: its old path goes in the same commit (git records the move).
    for (const [from, to] of Object.entries(tree?.renames ?? {})) if (planned.has(to)) planned.add(from);
    const committed = new Set((plan.data.commits ?? []).flatMap((c) => c.files ?? []));
    const changedNow = new Set(tree?.changed ?? []);
    const mustShip = [
      ...tasks.filter((t) => done.includes(t.id)).flatMap((t) => t.files_expected).filter((f) => existsSync(join(ctx.projectDir, f)) || changedNow.has(f)),
      ...featureAcceptance(ctx).files,
      ...scaffold,
      ...Object.keys(tree?.renames ?? {}).filter((from) => planned.has(from)),
    ];
    for (const f of new Set(mustShip)) if (!committed.has(f)) failures.push({ check: "commits", rule: "uncommitted-file", message: `${f} belongs to the feature but is in no commit` });
    const docs = /^(docs\/|CHANGELOG\.md$|README\.md$)|\.acceptance\.test\./;
    for (const c of plan.data.commits ?? []) {
      for (const f of c.files ?? []) if (!planned.has(f) && !docs.test(f)) failures.push({ check: "commits", rule: "unplanned-file", message: `${f} is in a commit but in no task's files_expected` });
      const subject = c.message.split("\n")[0];
      if (!CONVENTIONAL.test(subject)) failures.push({ check: "commits", rule: "not-conventional", message: `"${subject}" is not a conventional commit` });
      if (c.task && !c.message.includes(`Factory-Task: ${c.task}`)) failures.push({ check: "commits", rule: "no-trailer", message: `commit for ${c.task} lacks "Factory-Task: ${c.task}"` });
      const own = tasks.find((t) => t.id === c.task);
      const renamedFrom = Object.fromEntries(Object.entries(tree?.renames ?? {}));
      for (const f of own ? (c.files ?? []).filter((x) => !own.files_expected.includes(x) && !own.files_expected.includes(renamedFrom[x])) : []) {
        failures.push({ check: "commits", rule: "mislabelled-file", message: `${f} is in the commit for ${c.task}, but ${c.task} does not plan it` });
      }
    }
    // What ships is what the plan lists: a file the feature changed outside it would be left behind.
    for (const f of (tree?.changed ?? []).filter((x) => !committed.has(x)).slice(0, 20)) {
      failures.push({ check: "commits", rule: "uncommitted-change", message: `${f} changed but is in no commit of the plan` });
    }
  }
  const pr = ctx.load("pr-body");
  if (!pr) failures.push({ check: "pr", message: "08-delivery/pr.md is missing" });
  else {
    const text = readText(pr.file);
    for (const s of SECTIONS) if (!text.includes(s)) failures.push({ check: "pr", rule: "missing-section", file: pr.rel, message: `PR body lacks "${s}"` });
    // The trace rows are checked against the plan: each AC's row names a task that satisfies it (a
    // removed REQ's row, a task that removes it), and every TEST id it lists is in the test plan.
    const trace = (/## Spec trace\n([\s\S]*?)(?=\n## |$)/.exec(text)?.[1] ?? "").split("\n");
    const allTasks = ctx.load("tasks")?.data.tasks ?? [];
    const testIds = new Set((ctx.load("test-plan")?.data.cases ?? []).map((c) => c.id));
    const doers = (id) => allTasks.filter((t) => (t.satisfies ?? []).includes(id) || (t.removes ?? []).includes(id)).map((t) => t.id);
    for (const id of [...(ctx.spec()?.reqs.flatMap((r) => r.acs.map((a) => a.id)) ?? []), ...(ctx.spec()?.removed ?? [])]) {
      const rows = trace.filter((l) => new RegExp(`\\b${id}\\b`).test(l));
      if (!rows.length) {
        failures.push({ check: "pr", rule: "trace-missing", file: pr.rel, message: `the spec trace has no row for ${id}` });
        continue;
      }
      const named = rows.flatMap((l) => l.match(/TASK-\d{3}/g) ?? []);
      if (!named.some((t) => doers(id).includes(t))) failures.push({ check: "pr", rule: "trace-wrong-task", file: pr.rel, message: `the row for ${id} names ${named.join(", ") || "no task"}; tasks that do it: ${doers(id).join(", ") || "none"}` });
      for (const t of rows.flatMap((l) => l.match(/TEST-\d{4}/g) ?? [])) if (!testIds.has(t)) failures.push({ check: "pr", rule: "trace-unknown-test", file: pr.rel, message: `the row for ${id} names ${t}, which is not in the test plan` });
    }
  }
  for (const n of ctx.load("human-notes")?.data ?? []) {
    if (n.status === "open") failures.push({ check: "notes", rule: "open-note", message: `${n.id} ("${n.text.slice(0, 50)}") is still open` });
  }
  return failures;
}
