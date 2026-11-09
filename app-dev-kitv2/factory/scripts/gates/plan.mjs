// gate-plan (S4): the task DAG is acyclic, every AC is satisfied by a task and covered by a planned
// test, tasks stay within size limits and their role's owns_paths, test-first is declared, and
// every human note is mapped or declined before GATE-B.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { matchesAny } from "../lib/core.mjs";
import { validate } from "../lib/schemas.mjs";
import { conventionFiles, lintPlan, isGlob, insideOwnsPaths } from "../lib/planlint.mjs";

export const inputs = ["tasks", "test-plan", "prd", "delta-spec", "api-contract", "human-notes", "config"];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

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

  // Plan lint: files a convention implies (role.yaml component_files) are added to files_expected here,
  // once, and reported as a warning — a scope gap never costs a builder dispatch and a planner round.
  const lint = lintPlan(ctx, tasks.file, tasks.data);
  for (const { task, files } of lint) failures.push({ check: "plan-lint", rule: "convention-files-added", file: tasks.rel, warn: true, message: `${task}: added ${files.join(", ")} to files_expected (role convention: a new component brings its styles, index and test)` });

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
  const tasksMax = ctx.config.quality?.tasks_max ?? 10;
  if (tasksMax && byId.size > tasksMax) fail("size", "too-many-tasks", `the plan has ${byId.size} tasks (max ${tasksMax})`);
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
    // Size counts files_expected. write_scope globs (a slice folder) cost nothing extra: they stand for
    // the files already listed there, so the limit is on what the task names, not on the folder.
    const lim = limitsFor(t);
    // The companions a role convention implies for a new component (styles, index, test) are the engine's to add:
    // they do not count toward the planner's files_max.
    const conventional = conventionFiles(ctx.packs?.[ctx.config.roles?.[t.role]?.pack]?.role?.component_files, t, ctx.projectDir, { all: true }).filter((f) => t.files_expected.includes(f)).length;
    const named = t.files_expected.length - conventional;
    if (lim.files_max && named > lim.files_max) {
      fail("size", "too-many-files", `${t.id} touches ${named} files${conventional ? ` (+${conventional} convention companions the engine adds)` : ""} (max ${lim.files_max} for ${t.type})`);
    }
    if (!t.size?.est_loc) fail("size", "no-estimate", `${t.id} gives no size.est_loc — the size limits need an estimate`);
    if (lim.loc_max && (t.size?.est_loc ?? 0) > lim.loc_max) {
      fail("size", "too-large", `${t.id} estimates ${t.size.est_loc} LOC (max ${lim.loc_max})`);
    }
    const role = ctx.config.roles?.[t.role];
    const types = ctx.packs?.[role?.pack]?.role?.task_types;
    if (types && !types.includes(t.type)) fail("roles", "unknown-task-type", `${t.id} has type "${t.type}"; role ${t.role} handles ${types.join(", ")}`);
    if (!role) fail("roles", "unknown-role", `${t.id} has role "${t.role}", which is not configured`);
    else if (role.enabled) {
      for (const f of t.files_expected) if (!matchesAny(f, role.owns_paths)) fail("roles", "outside-owns-paths", `${t.id}: ${f} is outside ${t.role} owns_paths`);
      for (const g of t.write_scope ?? []) if (!insideOwnsPaths(g, role.owns_paths)) fail("roles", "outside-owns-paths", `${t.id}: write_scope ${g} is outside ${t.role} owns_paths`);
    }
    for (const g of t.write_scope ?? []) if (!isGlob(g) && !g.endsWith("/")) fail("size", "write-scope-not-a-glob", `${t.id}: write_scope entry ${g} is a single file — list it in files_expected; write_scope holds folder globs like src/features/x/ui/overview-header/**`);
    if (tdd.mode === "required") {
      const exempt = (tdd.exempt_types ?? []).includes(t.type);
      if (!t.tdd) fail("tdd", "missing", `${t.id} declares no tdd block`);
      else if (t.tdd.mode === "exempt" && (!exempt || !t.tdd.reason)) {
        fail("tdd", "bad-exemption", `${t.id} is exempt but type "${t.type}" is not whitelisted or no reason is given`);
      } else if (t.tdd.mode === "exempt" && t.satisfies.length && !(tdd.exempt_may_satisfy ?? ["migration", "eval"]).includes(t.type)) {
        // A refactor or config task that "satisfies" behaviour would ship that behaviour untested.
        fail("tdd", "exempt-satisfies", `${t.id} is a test-exempt ${t.type} but satisfies ${t.satisfies.join(", ")} — behaviour needs a test-first task`);
      } else if (t.tdd.mode === "required") {
        if (!t.tdd.red_tests?.length) fail("tdd", "no-red-tests", `${t.id} requires TDD but lists no red_tests`);
        for (const f of t.tdd.red_tests ?? []) if (!t.files_expected.includes(f)) fail("tdd", "red-test-not-expected", `${t.id}: red test ${f} is not in files_expected`);
        const globs = ctx.packs?.[role?.stack]?.stack?.test_globs ?? [];
        for (const f of t.tdd.red_tests ?? []) if (!TEST_FILE.test(f) && !matchesAny(f, globs)) fail("tdd", "red-test-not-a-test", `${t.id}: red test ${f} is not a test file`);
        // A red test is normally a new file: an existing file's passing tests can never be a valid red. A task may
        // extend an existing test file only when it is the task's own: inside its write_scope, or a file of
        // its slice (another task with the same `slice` lists it). A test file of an unrelated slice is not.
        const started = ctx.state?.tasks?.[t.id] && ctx.state.tasks[t.id].status !== "pending";
        for (const f of started ? [] : (t.tdd.red_tests ?? [])) {
          if (!existsSync(join(ctx.projectDir, f))) continue;
          const own = matchesAny(f, t.write_scope ?? []) || (t.slice && tasks.data.tasks.some((o) => o.id !== t.id && o.slice === t.slice && [...(o.tdd?.red_tests ?? []), ...o.files_expected].includes(f)));
          if (!own) fail("tdd", "red-test-exists", `${t.id}: red test ${f} already exists and is outside this task's write_scope/slice — put the new tests in a new file, or declare write_scope (the slice folder) to extend it`);
        }
      }
    }
  }
  for (const ac of specAcs) if (!satisfied.has(ac)) fail("trace", "unsatisfied-ac", `${ac} is not satisfied by any task`);
  // A fix round amends the task that owns the slice; it adds a task only when no task owns the work.
  if (ctx.state?.fix_pending) {
    const owned = new Map();
    for (const t of byId.values()) if (t.slice && ctx.state.tasks?.[t.id]) owned.set(t.slice, t.id);
    for (const t of byId.values()) {
      if (ctx.state.tasks?.[t.id] || !t.slice || !owned.has(t.slice)) continue;
      fail("fix-plan", "new-task-in-owned-slice", `${t.id} adds a task to slice "${t.slice}", which ${owned.get(t.slice)} owns — amend ${owned.get(t.slice)} (extend definition_of_done / files_expected) instead`);
    }
    // The label is the planner's to choose ("apply-coupon-fix" or none at all): what owns the work is the folder. A new task
    // whose files fall inside an existing task's write_scope is a task in an owned slice, whatever it is called.
    for (const t of byId.values()) {
      if (ctx.state.tasks?.[t.id] || (t.slice && owned.has(t.slice))) continue;
      for (const o of byId.values()) {
        if (o === t || !ctx.state.tasks?.[o.id] || !o.write_scope?.length) continue;
        const inside = [...(t.files_expected ?? []), ...(t.write_scope ?? [])].filter((f) => matchesAny(f, o.write_scope));
        if (inside.length) {
          fail("fix-plan", "new-task-in-owned-scope", `${t.id} is a new task whose files (${inside.slice(0, 3).join(", ")}) lie inside the write_scope of ${o.id} — amend ${o.id} (extend definition_of_done / files_expected) instead`);
          break;
        }
      }
    }
  }
  // A removed requirement is work too: some task must take the behaviour out (tasks[].removes).
  const removing = new Set(tasks.data.tasks.flatMap((t) => t.removes ?? []));
  for (const id of ctx.spec()?.removed ?? []) if (!removing.has(id)) fail("trace", "removal-without-task", `${id} is removed in the delta-spec but no task removes it`);

  const tested = new Set();
  for (const c of plan.data.cases) {
    if (c.ac && !specAcs.has(c.ac)) fail("trace", "unknown-ac", `${c.id} tests ${c.ac}, which is not in the spec`, plan.rel);
    if (c.task && !byId.has(c.task)) fail("trace", "unknown-task", `${c.id} names ${c.task}, which is not in tasks.yaml`, plan.rel);
    const owner = byId.get(c.task);
    if (c.ac && owner && !owner.characterisation && !owner.satisfies.includes(c.ac)) fail("trace", "case-task-mismatch", `${c.id} tests ${c.ac} in ${c.task}, which does not satisfy it`, plan.rel);
    if (c.ac) tested.add(c.ac);
  }
  // A test-first task is planned with at least one of its own tests below acceptance level.
  for (const t of byId.values()) {
    if (t.tdd?.mode !== "required") continue;
    if (!plan.data.cases.some((c) => c.task === t.id && !["acceptance", "eval", "e2e"].includes(c.level))) {
      fail("trace", "task-without-case", `${t.id} is test-first but no unit, component or integration case in the test plan names it`, plan.rel);
    }
  }
  for (const ac of specAcs) if (!tested.has(ac)) fail("trace", "untested-ac", `${ac} has no planned test`, plan.rel);

  if (spec?.kind === "delta-spec" && spec.data.modified?.length && ![...byId.values()].some((t) => t.characterisation)) {
    fail("change-request", "no-characterisation", "the delta-spec modifies behaviour but no task writes characterisation tests");
  }
  // Behaviour is pinned before it changes: a task touching a modified file comes after characterisation.
  const before = (id, seen = new Set()) => {
    for (const d of byId.get(id)?.depends_on ?? []) if (!seen.has(d)) (seen.add(d), before(d, seen));
    return seen;
  };
  const affected = new Set((spec?.kind === "delta-spec" ? spec.data.modified ?? [] : []).flatMap((m) => m.affected ?? []));
  for (const t of byId.values()) {
    if (t.characterisation || !t.files_expected.some((f) => affected.has(f))) continue;
    if (![...before(t.id)].some((d) => byId.get(d)?.characterisation)) fail("change-request", "change-before-characterisation", `${t.id} changes ${t.files_expected.filter((f) => affected.has(f)).join(", ")} without depending on a characterisation task`);
  }
  // Every new API operation owned by an enabled role is built by a task of that role (contract_ops);
  // a consumer listing it does not count, and an operation marked x-factory.status: existing needs none.
  const claimedBy = (opId, role) => [...byId.values()].some((t) => t.role === role && (t.contract_ops ?? []).includes(opId));
  for (const [path, ops] of Object.entries(ctx.load("api-contract")?.data?.paths ?? {})) {
    for (const [method, op] of Object.entries(ops ?? {})) {
      const owner = op?.["x-factory"]?.owner_role;
      if (!op?.operationId || !owner || !ctx.config.roles?.[owner]?.enabled || op["x-factory"]?.status === "existing") continue;
      if (!claimedBy(op.operationId, owner)) fail("trace", "contract-op-without-task", `${method.toUpperCase()} ${path} (${op.operationId}) belongs to ${owner}, but no ${owner} task lists it in contract_ops`);
    }
  }

  // Human notes made so far must be mapped to something in the plan, or declined.
  const known = new Set([...specAcs, ...byId.keys(), ...(spec?.reqs.map((r) => r.id) ?? [])]);
  for (const note of (ctx.load("human-notes")?.data ?? []).filter((n) => ["open", "mapped"].includes(n.status) && n.kind !== "process")) {
    if (note.status === "open") fail("notes", "unmapped", `${note.id} ("${note.text.slice(0, 50)}") is not mapped to a REQ, AC or task`, "human-notes.yaml");
    for (const id of note.mapped_to) {
      if (/^(REQ|AC|TASK)-/.test(id) && !known.has(id)) fail("notes", "dangling", `${note.id} is mapped to ${id}, which does not exist`, "human-notes.yaml");
    }
  }
  return failures;
}
