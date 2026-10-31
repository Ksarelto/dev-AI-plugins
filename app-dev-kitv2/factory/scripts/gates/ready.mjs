// gate-ready-for-pr (S8): the commit plan covers every done task with conventional messages and task
// trailers, the PR body has every section and a trace row per acceptance criterion, and no human note
// is still open.
import { readText } from "../lib/core.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validate } from "../lib/schemas.mjs";
import { featureAcceptance } from "../lib/testrun.mjs";

export const inputs = ["commit-plan", "pr-body", "tasks", "human-notes", "prd", "delta-spec", "acceptance-tests"];
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
    const planned = new Set(tasks.flatMap((t) => t.files_expected));
    const committed = new Set((plan.data.commits ?? []).flatMap((c) => c.files ?? []));
    const mustShip = [
      ...tasks.filter((t) => done.includes(t.id)).flatMap((t) => t.files_expected).filter((f) => existsSync(join(ctx.projectDir, f))),
      ...featureAcceptance(ctx).files,
    ];
    for (const f of new Set(mustShip)) if (!committed.has(f)) failures.push({ check: "commits", rule: "uncommitted-file", message: `${f} belongs to the feature but is in no commit` });
    const docs = /^(docs\/|CHANGELOG\.md$|README\.md$)|\.acceptance\.test\./;
    for (const c of plan.data.commits ?? []) {
      for (const f of c.files ?? []) if (!planned.has(f) && !docs.test(f)) failures.push({ check: "commits", rule: "unplanned-file", message: `${f} is in a commit but in no task's files_expected` });
      const subject = c.message.split("\n")[0];
      if (!CONVENTIONAL.test(subject)) failures.push({ check: "commits", rule: "not-conventional", message: `"${subject}" is not a conventional commit` });
      if (c.task && !c.message.includes(`Factory-Task: ${c.task}`)) failures.push({ check: "commits", rule: "no-trailer", message: `commit for ${c.task} lacks "Factory-Task: ${c.task}"` });
    }
  }
  const pr = ctx.load("pr-body");
  if (!pr) failures.push({ check: "pr", message: "08-delivery/pr.md is missing" });
  else {
    const text = readText(pr.file);
    for (const s of SECTIONS) if (!text.includes(s)) failures.push({ check: "pr", rule: "missing-section", file: pr.rel, message: `PR body lacks "${s}"` });
    for (const id of [...(ctx.spec()?.reqs.flatMap((r) => r.acs.map((a) => a.id)) ?? []), ...(ctx.spec()?.removed ?? [])]) {
      if (!text.includes(id)) failures.push({ check: "pr", rule: "trace-missing", file: pr.rel, message: `the spec trace has no row for ${id}` });
    }
  }
  for (const n of ctx.load("human-notes")?.data ?? []) {
    if (n.status === "open") failures.push({ check: "notes", rule: "open-note", message: `${n.id} ("${n.text.slice(0, 50)}") is still open` });
  }
  return failures;
}
