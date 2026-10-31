// gate-plan (S4): the task DAG is acyclic, every AC is satisfied by a task and covered by a planned
// test, tasks stay within size limits and their role's owns_paths, test-first is declared, and
// every human note is mapped or declined before GATE-B.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { matchesAny } from "../lib/core.mjs";
import { validate } from "../lib/schemas.mjs";

export const inputs = ["tasks", "test-plan", "prd", "delta-spec", "human-notes", "config"];

export function run(ctx) {
  const tasks = ctx.load("tasks");
  const plan = ctx.load("test-plan");
  if (!tasks) return [{ check: "tasks", message: "04-plan/tasks.yaml is missing" }];
  if (!plan) return [{ check: "test-plan", message: "04-plan/test-plan.yaml is missing" }];
  const failures = [];
  const fail = (check, rule, message, file = tasks.rel) => failures.push({ check, rule, file, message });
  for (const e of validate("tasks", tasks.data)) fail("schema", "tasks", e);
  for (const e of validate("test-plan", plan.data)) fail("schema", "test-plan", e, plan.rel);
  if (failures.length) return failures;

  const spec = ctx.spec();
  const specAcs = new Set(spec?.reqs.flatMap((r) => r.acs.map((a) => a.id)) ?? []);
  const byId = new Map();
  for (const t of tasks.data.tasks) {
    if (byId.has(t.id)) fail("ids", "duplicate", `${t.id} is defined twice`);
    byId.set(t.id, t);
  }

  // DAG: dependencies exist and there is no cycle.
  for (const t of byId.values()) for (const d of t.depends_on) if (!byId.has(d)) fail("dag", "unknown-dependency", `${t.id} depends on missing ${d}`);
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === "done" || !byId.has(id)) return;
    if (state.get(id) === "visiting") {
      fail("dag", "cycle", `cycle: ${[...path, id].join(" → ")}`);
      return;
    }
    state.set(id, "visiting");
    for (const d of byId.get(id).depends_on) visit(d, [...path, id]);
    state.set(id, "done");
  };
  for (const id of byId.keys()) visit(id, []);

  // Traceability: AC → task and AC → planned test.
  const satisfied = new Set();
  const limits = ctx.config.quality?.task_limits ?? {};
  const tdd = ctx.config.quality?.tdd ?? {};
  // A role may allow more files for task types that are several files by nature (a Drizzle migration:
  // schema, index, SQL, journal, rollback): role.yaml budgets.task_limits.<type>. The project's limit wins.
  const limitsFor = (t) => {
    const role = ctx.packs?.[ctx.config.roles?.[t.role]?.pack]?.role;
    return { ...limits, ...(role?.budgets?.task_limits?.[t.type] ?? {}), ...(ctx.config.quality?.task_limits_by_type?.[t.type] ?? {}) };
  };
  for (const t of byId.values()) {
    for (const ac of t.satisfies) {
      if (!specAcs.has(ac)) fail("trace", "unknown-ac", `${t.id} satisfies ${ac}, which is not in the spec`);
      satisfied.add(ac);
    }
    const lim = limitsFor(t);
    if (lim.files_max && t.files_expected.length > lim.files_max) {
      fail("size", "too-many-files", `${t.id} touches ${t.files_expected.length} files (max ${lim.files_max} for ${t.type})`);
    }
    if (lim.loc_max && (t.size?.est_loc ?? 0) > lim.loc_max) {
      fail("size", "too-large", `${t.id} estimates ${t.size.est_loc} LOC (max ${lim.loc_max})`);
    }
    const role = ctx.config.roles?.[t.role];
    const types = ctx.packs?.[role?.pack]?.role?.task_types;
    if (types && !types.includes(t.type)) fail("roles", "unknown-task-type", `${t.id} has type "${t.type}"; role ${t.role} handles ${types.join(", ")}`);
    if (!role) fail("roles", "unknown-role", `${t.id} has role "${t.role}", which is not configured`);
    else if (role.enabled) {
      for (const f of t.files_expected) if (!matchesAny(f, role.owns_paths)) fail("roles", "outside-owns-paths", `${t.id}: ${f} is outside ${t.role} owns_paths`);
    }
    if (tdd.mode === "required") {
      const exempt = (tdd.exempt_types ?? []).includes(t.type);
      if (!t.tdd) fail("tdd", "missing", `${t.id} declares no tdd block`);
      else if (t.tdd.mode === "exempt" && (!exempt || !t.tdd.reason)) {
        fail("tdd", "bad-exemption", `${t.id} is exempt but type "${t.type}" is not whitelisted or no reason is given`);
      } else if (t.tdd.mode === "required") {
        if (!t.tdd.red_tests?.length) fail("tdd", "no-red-tests", `${t.id} requires TDD but lists no red_tests`);
        for (const f of t.tdd.red_tests ?? []) if (!t.files_expected.includes(f)) fail("tdd", "red-test-not-expected", `${t.id}: red test ${f} is not in files_expected`);
        // A red test is a new file: an existing file's passing tests can never be a valid red.
        const started = ctx.state?.tasks?.[t.id] && ctx.state.tasks[t.id].status !== "pending";
        for (const f of started ? [] : (t.tdd.red_tests ?? [])) {
          if (existsSync(join(ctx.projectDir, f))) fail("tdd", "red-test-exists", `${t.id}: red test ${f} already exists — put the new tests in a new file`);
        }
      }
    }
  }
  for (const ac of specAcs) if (!satisfied.has(ac)) fail("trace", "unsatisfied-ac", `${ac} is not satisfied by any task`);

  const tested = new Set();
  for (const c of plan.data.cases) {
    if (!specAcs.has(c.ac)) fail("trace", "unknown-ac", `${c.id} tests ${c.ac}, which is not in the spec`, plan.rel);
    if (c.task && !byId.has(c.task)) fail("trace", "unknown-task", `${c.id} names ${c.task}, which is not in tasks.yaml`, plan.rel);
    tested.add(c.ac);
  }
  for (const ac of specAcs) if (!tested.has(ac)) fail("trace", "untested-ac", `${ac} has no planned test`, plan.rel);

  if (spec?.kind === "delta-spec" && spec.data.modified?.length && ![...byId.values()].some((t) => t.characterisation)) {
    fail("change-request", "no-characterisation", "the delta-spec modifies behaviour but no task writes characterisation tests");
  }

  // Human notes made so far must be mapped to something in the plan, or declined.
  const known = new Set([...specAcs, ...byId.keys(), ...(spec?.reqs.map((r) => r.id) ?? [])]);
  for (const note of (ctx.load("human-notes")?.data ?? []).filter((n) => ["open", "mapped"].includes(n.status))) {
    if (note.status === "open") fail("notes", "unmapped", `${note.id} ("${note.text.slice(0, 50)}") is not mapped to a REQ, AC or task`, "human-notes.yaml");
    for (const id of note.mapped_to) {
      if (/^(REQ|AC|TASK)-/.test(id) && !known.has(id)) fail("notes", "dangling", `${note.id} is mapped to ${id}, which does not exist`, "human-notes.yaml");
    }
  }
  return failures;
}
