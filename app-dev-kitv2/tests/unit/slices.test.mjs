// Bigger tasks and one build dispatch per task: vertical-slice limits, write_scope, plan lint, `scope add`,
// fix rounds that amend instead of add, the red gate's ANSI and other-task rules, and builder_two_phase
// (red proven from the gate log before impl).
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, GUARD, YAML, cli, conductor, envelope, hook, loopSetup, putArtifact, rawConductor, report, state } from "./helpers.mjs";

const guard = await import(GUARD);

const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { goodRedFailure } = await import(`${ENGINE}/scripts/lib/vitest-report.mjs`);
const { conventionFiles } = await import(`${ENGINE}/scripts/lib/planlint.mjs`);
const { phasesFor, planHash, redBeforeImpl, scopeSuggestion, sliceFolders, syncTasks } = await import(`${ENGINE}/scripts/lib/tasks.mjs`);

const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const setState = (env, patch) => {
  const s = featureState(env.featureDir);
  Object.assign(s, patch(s) ?? s);
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
};
const readPlan = (env) => YAML.parse(readFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), "utf8"));
const planGate = async (env) => {
  const c = conductor.load(env.dir);
  return runGate("plan", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
};
const COMPONENT = "src/features/apply-coupon/ui/coupon-field";
/** The template plan with TASK-003 as a component folder (so the convention lint applies). */
const componentPlan = (t) =>
  t
    .replace("src/features/apply-coupon/ui/coupon-field.tsx, src/features/apply-coupon/ui/coupon-field.test.tsx", `${COMPONENT}/coupon-field.tsx, ${COMPONENT}/tests/coupon-field.test.tsx`)
    .replace("red_tests: [src/features/apply-coupon/ui/coupon-field.test.tsx]", `red_tests: [${COMPONENT}/tests/coupon-field.test.tsx]`)
    .replace("type: feature-ui", "type: component");

test("defaults: a vertical slice is up to 12 files and 600 LOC, and one builder dispatch per task is the default", async () => {
  const env = loopSetup();
  const c = conductor.load(env.dir);
  assert.deepEqual(c.config.quality.task_limits, { files_max: 12, loc_max: 600 });
  assert.deepEqual(phasesFor({ tdd: { mode: "required" } }, { quality: { tdd: { author: "builder_two_phase" } } }), ["build"]);
  assert.deepEqual(phasesFor({ tdd: { mode: "required" } }, { quality: { tdd: { author: "separate" } } }), ["red", "green"]);
  const files = Array.from({ length: 12 }, (_, i) => `src/entities/order/model/f${i}.ts`);
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replace("type: entity-model", "type: store").replace("files_expected: [src/entities/order/model/total.ts, src/entities/order/model/total.test.ts]", `files_expected: [src/entities/order/model/total.ts, src/entities/order/model/total.test.ts, ${files.join(", ")}]`).replace("est_loc: 60", "est_loc: 700"));
  const r = await planGate(env);
  assert.deepEqual(r.failures.filter((f) => f.check === "size").map((f) => f.rule).sort(), ["too-large", "too-many-files"], "14 files and 700 LOC are over the new limits");
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replace("type: entity-model", "type: store").replace("files_expected: [src/entities/order/model/total.ts, src/entities/order/model/total.test.ts]", `files_expected: [src/entities/order/model/total.ts, src/entities/order/model/total.test.ts, ${files.slice(0, 10).join(", ")}]`).replace("est_loc: 60", "est_loc: 600"));
  assert.deepEqual((await planGate(env)).failures.filter((f) => f.check === "size"), [], "12 files and 600 LOC pass");
});

test("write_scope: a folder glob passes gate-plan and the dispatch may write anywhere in it (and nowhere else)", async () => {
  const env = loopSetup();
  assert.deepEqual((await planGate(env)).failures.filter((f) => !f.warn), [], "the template plan (TASK-003 has write_scope) passes");
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-001": { status: "done" }, "TASK-002": { status: "done" } } }));
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.task, "TASK-003");
  const actives = state.activeDispatches(env.dir);
  const config = (await import(`${ENGINE}/scripts/lib/config.mjs`)).loadConfig(env.dir);
  for (const skill of YAML.parse(readFileSync(join(env.dir, d.pack), "utf8").split("---")[1]).skills_required ?? []) guard.logSkill({ agent_type: d.agent, tool_input: { skill } }, env.dir, actives);
  const write = (p) => guard.decideWrite({ tool_name: "Write", agent_type: d.agent, tool_input: { file_path: join(env.dir, p) } }, env.dir, actives, config);
  assert.equal(write("src/features/apply-coupon/ui/extra/styles.ts"), null, "inside write_scope");
  assert.equal(write("src/features/apply-coupon/hooks/use-coupon.ts"), null);
  assert.match(write("src/features/other/x.ts"), /outside your pack's write allowlist/, "outside the slice and files_expected");
  // write_scope entries must be folder globs inside the role's owns_paths
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replace('write_scope: ["src/features/apply-coupon/**"]', 'write_scope: ["lib/**", "src/features/apply-coupon/ui/coupon-field.tsx"]'));
  const rules = (await planGate(env)).failures.map((f) => f.rule);
  assert.ok(rules.includes("outside-owns-paths") && rules.includes("write-scope-not-a-glob"), rules.join(","));
});

test("plan lint: a new component's styles.ts, index.ts and test are added from role.yaml component_files and reported", async () => {
  assert.deepEqual(conventionFiles({ primary: "{name}/{name}.tsx", companions: ["{name}/styles.ts", "{name}/index.ts", "{name}/tests/{name}.test.tsx"] }, { type: "component", files_expected: ["/nonexistent/src/ui/panel/panel.tsx", "/nonexistent/src/ui/panel/tests/panel.test.tsx"] }, "/"), [
    "/nonexistent/src/ui/panel/styles.ts", "/nonexistent/src/ui/panel/index.ts",
  ], "only the missing companions; a file that is not <name>/<name>.tsx implies nothing");
  const env = loopSetup();
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", componentPlan);
  const r = await planGate(env);
  const lint = r.failures.filter((f) => f.check === "plan-lint");
  assert.equal(lint.length, 1);
  assert.equal(lint[0].warn, true, "reported, never blocking");
  assert.match(lint[0].message, /TASK-003: added .*styles\.ts, .*index\.ts/);
  const files = readPlan(env).tasks.find((t) => t.id === "TASK-003").files_expected;
  assert.deepEqual(files.slice(2).sort(), [`${COMPONENT}/index.ts`, `${COMPONENT}/styles.ts`]);
  assert.equal((await planGate(env)).failures.filter((f) => f.check === "plan-lint").length, 0, "idempotent: the second run adds nothing");
  assert.ok(r.pass, JSON.stringify(r.failures.filter((f) => !f.warn)));
});

test("scope add: a path goes to files_expected, a glob to write_scope; gate-plan guards it; the task continues without a planner", async () => {
  const env = loopSetup();
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-001": { status: "done" } } }));
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.task, "TASK-002");
  // The builder names a file inside its slice folder: the engine offers `scope add`, not a planner run.
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "needs_scope_change", scope_files: ["src/entities/order/model/helpers.ts", "lib/outside.ts"], open_questions: ["helpers.ts is required"] }) });
  assert.equal(r.verdict, "ask_human");
  const ask = conductor.step(env.dir);
  assert.match(ask.reason, /\/factory:scope TASK-002 add src\/entities\/order\/model\/helpers\.ts/);
  assert.match(ask.reason, /lib\/outside\.ts lie outside the slice/);
  assert.deepEqual(featureState(env.featureDir).tasks["TASK-002"].scope_suggestion, ["src/entities/order/model/helpers.ts"]);

  const out = await rawConductor.scopeAdd(env.dir, { task: "TASK-002" }); // no paths: the builder's suggestion
  assert.deepEqual(out.added, [{ key: "files_expected", entry: "src/entities/order/model/helpers.ts" }]);
  const out2 = await rawConductor.scopeAdd(env.dir, { task: "TASK-002", entries: ["src/entities/order/hooks/**", "src/entities/order/model/helpers.ts"] });
  assert.deepEqual(out2.added, [{ key: "write_scope", entry: "src/entities/order/hooks/**" }], "a duplicate is skipped");
  const t2 = readPlan(env).tasks.find((t) => t.id === "TASK-002");
  assert.ok(t2.files_expected.includes("src/entities/order/model/helpers.ts"));
  assert.ok(t2.write_scope.includes("src/entities/order/hooks/**"));
  const st = featureState(env.featureDir);
  assert.equal(st.status, "active");
  assert.equal(st.awaiting_human, null);
  const next = conductor.step(env.dir);
  assert.equal(next.dispatches[0].task, "TASK-002", "the same task is dispatched again, no planner");
  assert.equal(next.dispatches[0].agent, "fe-test-author");

  // A path outside the role's owns_paths is refused and tasks.yaml stays as it was.
  const before = readFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), "utf8");
  await assert.rejects(rawConductor.scopeAdd(env.dir, { task: "TASK-002", entries: ["lib/outside.ts"] }), /scope add refused.*outside-owns-paths|outside frontend owns_paths/s);
  assert.equal(readFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), "utf8"), before);
  assert.equal(cli(env.dir, ["scope", "add"]).code, 2, "usage error without a task");
  assert.equal(cli(env.dir, ["scope", "add", "TASK-002", "src/entities/order/model/more.ts"]).json.status, "scope widened");
});

test("scope suggestion: files inside the slice folder are mechanical, others are not", () => {
  const task = { files_expected: ["src/features/x/ui/panel/panel.tsx", "src/features/x/ui/panel/tests/panel.test.tsx"], write_scope: [] };
  assert.deepEqual(sliceFolders(task), ["src/features/x/ui/panel"]);
  assert.deepEqual(sliceFolders({ files_expected: ["a/b.ts"], write_scope: ["src/features/x/**"] }), ["src/features/x"]);
  const { inside, outside } = scopeSuggestion(task, { summary: "need src/features/x/ui/panel/styles.ts and src/shared/lib/a.ts", open_questions: [] });
  assert.deepEqual(inside, ["src/features/x/ui/panel/styles.ts"]);
  assert.deepEqual(outside, ["src/shared/lib/a.ts"]);
});

test("fix rounds amend: a new task in a slice an existing task owns is refused; an amended finished task is reopened", async () => {
  const env = loopSetup();
  setState(env, (s) => ({ fix_pending: { source: "verification", items: [{ check: "review", message: "three issues in the coupon field" }], attempts: 0 }, tasks: { ...s.tasks, "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { status: "done" } } }));
  const planYaml = readFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), "utf8");
  // Three fix tasks in the apply-coupon slice (what a per-item planner would write).
  const three = YAML.parse(planYaml);
  for (const n of [5, 6, 7]) three.tasks.push({ ...three.tasks[2], id: `TASK-00${n}`, title: `fix ${n}`, depends_on: ["TASK-003"], satisfies: [], files_expected: [`src/features/apply-coupon/ui/fix${n}.test.ts`], write_scope: undefined, tdd: { mode: "required", red_tests: [`src/features/apply-coupon/ui/fix${n}.test.ts`], stubs: ["x"] } });
  writeFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), YAML.stringify(three));
  const bad = (await planGate(env)).failures.filter((f) => f.rule === "new-task-in-owned-slice");
  assert.equal(bad.length, 3, "one finding per task added to the owned slice");
  assert.match(bad[0].message, /amend TASK-003/);

  // The amendment: the same task, a longer definition of done, one more file; zero new tasks.
  const amended = YAML.parse(planYaml);
  const t3 = amended.tasks.find((t) => t.id === "TASK-003");
  t3.definition_of_done.push("Fix 1", "Fix 2", "Fix 3");
  t3.files_expected.push("src/features/apply-coupon/ui/coupon-field.fixes.test.tsx");
  writeFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), YAML.stringify(amended));
  assert.deepEqual((await planGate(env)).failures.filter((f) => f.rule === "new-task-in-owned-slice"), []);
  assert.equal(readPlan(env).tasks.length, 3, "no new task");

  // The engine reopens the finished task whose entry changed; untouched finished tasks stay done.
  const s = featureState(env.featureDir);
  s.tasks["TASK-003"].task_hash = planHash(YAML.parse(planYaml).tasks.find((t) => t.id === "TASK-003"));
  s.tasks["TASK-002"].task_hash = planHash(YAML.parse(planYaml).tasks.find((t) => t.id === "TASK-002"));
  syncTasks(s, readPlan(env), { roles: { frontend: { enabled: true } } }, env.dir);
  assert.equal(s.tasks["TASK-002"].status, "done");
  assert.equal(s.tasks["TASK-003"].status, "pending", "reopened by the amendment");
  assert.equal(s.tasks["TASK-003"].reopened, true);
  assert.equal(s.tasks["TASK-003"].round, 2);
});

test("the fix plan mission tells the planner to amend the owning slice, batch per slice, and add only when no task owns it", () => {
  const env = loopSetup();
  setState(env, (s) => ({ fix_pending: { source: "qa", items: [{ check: "qa", message: "a" }, { check: "qa", message: "b" }], attempts: 0 }, tasks: { ...s.tasks, "TASK-001": { status: "done" } } }));
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.phase, "fixplan");
  const text = readFileSync(join(env.dir, d.pack), "utf8");
  assert.match(text, /AMEND that task/);
  assert.match(text, /ONE amendment/);
  assert.match(text, /only when no existing task owns the work/);
  assert.doesNotMatch(text, /one task per item/i);
});

test("rung 4 amends the same task in place (planner phase amend); the old ID stays", async () => {
  const env = loopSetup();
  setState(env, (s) => ({ tasks: { "TASK-001": { status: "done" }, "TASK-002": { status: "red", phase: "red", amend_pending: true, rung: 4, attempts: 4 } } }));
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.subagent_type, "factory-analysis:planner");
  assert.equal(d.phase, "amend");
  assert.match(readFileSync(join(env.dir, d.pack), "utf8"), /AMEND TASK-002 in place/);
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replace('definition_of_done: ["total = sum(lines) - discount + shipping; discount clamped >= 0"]', 'definition_of_done: ["total = sum(lines) - discount + shipping; discount clamped >= 0", "zero lines gives 0"]'));
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "amend", JSON.stringify(r));
  const u = featureState(env.featureDir).tasks["TASK-002"];
  assert.equal(u.amend_pending, false);
  assert.equal(u.rung, 0);
  assert.equal(u.round, 2);
  assert.notEqual(u.status, "replaced");
});

test("gate-red: ANSI colour codes in a failure message never make an assertion a wrong failure", async () => {
  assert.ok(goodRedFailure("\u001b[2mexpected\u001b[22m \u001b[32m'a'\u001b[39m to be \u001b[31m'b'\u001b[39m"));
  assert.ok(goodRedFailure("\u001b[31mAssertionError\u001b[39m: expected 1 to be 2"));
  assert.ok(!goodRedFailure("\u001b[31mTypeError: x is not a function\u001b[39m"), "stripping does not excuse a real wrong failure");
  const env = loopSetup();
  setState(env, (s) => ({ tasks: { "TASK-001": { status: "done" } } }));
  const red = join(env.dir, "src/entities/order/model/total.test.ts");
  env.fake("test", { code: 1, report: report({ [red]: [["discount", "failed", "\u001b[31mAssertionError\u001b[39m: expected \u001b[32m1\u001b[39m to be \u001b[31m2\u001b[39m"]] }) });
  const d = conductor.step(env.dir).dispatches[0];
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures));
});

test("gate-red: existing-test-broken ignores the red tests of other tasks that are not done; a failing unrelated test still counts", async () => {
  const env = loopSetup();
  setState(env, (s) => ({ tasks: { "TASK-001": { status: "done" } } }));
  const red = join(env.dir, "src/entities/order/model/total.test.ts");
  const other = join(env.dir, "src/features/apply-coupon/ui/coupon-field.test.tsx"); // TASK-003's red test, stale and failing
  env.fake("test", { code: 1, report: report({ [red]: [["discount", "failed", "AssertionError: expected 1 to be 2"]], [other]: [["stale", "failed", "AssertionError: boom"]] }) });
  const d = conductor.step(env.dir).dispatches[0];
  let r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures));

  const env2 = loopSetup();
  setState(env2, () => ({ tasks: { "TASK-001": { status: "done" } } }));
  env2.fake("test", { code: 1, report: report({ [join(env2.dir, "src/entities/order/model/total.test.ts")]: [["discount", "failed", "AssertionError: expected 1 to be 2"]], [join(env2.dir, "src/shared/x.test.ts")]: [["old", "failed", "AssertionError: boom"]] }) });
  const d2 = conductor.step(env2.dir).dispatches[0];
  r = await conductor.record(env2.dir, { dispatchId: d2.id, envelopeText: envelope(d2.id) });
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["existing-test-broken"]);
});

test("gate-red: a red file that extends an existing slice test file may keep its passing tests but needs one new failing one", async () => {
  const env = loopSetup();
  setState(env, (s) => ({ tasks: { "TASK-001": { status: "done" }, "TASK-002": { status: "done" } } }));
  const file = join(env.dir, "src/features/apply-coupon/ui/coupon-field.test.tsx");
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, "// existing\n");
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-003": { status: "pending", extends: ["src/features/apply-coupon/ui/coupon-field.test.tsx"] } } }));
  env.fake("test", { code: 1, report: report({ [file]: [["old passes", "passed"], ["new", "failed", "AssertionError: expected 1 to be 2"]] }) });
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.task, "TASK-003");
  let r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures));
});

// ---- builder_two_phase ----

const TWO = "quality: { tdd: { author: builder_two_phase } }";
const redFile = "src/entities/order/model/total.test.ts";

function twoPhaseTask002() {
  const env = loopSetup(TWO);
  setState(env, () => ({ tasks: { "TASK-001": { status: "done" } } }));
  const file = join(env.dir, redFile);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, "test('discount', () => expect(1).toBe(2));\n");
  return { env, file };
}

test("builder_two_phase: ONE builder dispatch per test-first task, exit check impl, the mission names the red command", () => {
  const { env } = twoPhaseTask002();
  const s = conductor.step(env.dir);
  assert.equal(s.dispatches.length, 1);
  const d = s.dispatches[0];
  assert.deepEqual([d.agent, d.phase, d.task], ["fe-builder", "build", "TASK-002"]);
  const pack = readFileSync(join(env.dir, d.pack), "utf8");
  assert.match(pack, /gate red --project .* --task TASK-002/);
  assert.match(pack, /Exit check \(run it before you return\): .*gate impl /);
  assert.doesNotMatch(pack.split("Exit check")[1].split("\n")[0], /red/);
  const front = YAML.parse(pack.split("---")[1]);
  assert.ok(front.skills_required.includes("frontend-dev-kit:testing"), "a build loads the test skill too");
  assert.ok(front.write_allow.includes(redFile), "the tests are writable until red passes");
});

test("builder_two_phase: no gate red before the code means impl is refused (A3); red then code is accepted", async () => {
  const { env, file } = twoPhaseTask002();
  env.fake("test", { code: 0, report: report({ [file]: [["discount", "passed"]] }) });
  let d = conductor.step(env.dir).dispatches[0];
  let r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "retry", "impl alone is not accepted");
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["red-not-run"]);
  assert.notEqual(featureState(env.featureDir).tasks["TASK-002"].status, "done");

  // Next attempt: the red tests fail for the right reason, the agent runs `gate red` (the CLI), then implements.
  d = conductor.step(env.dir).dispatches[0];
  env.fake("test", { code: 1, report: report({ [file]: [["discount", "failed", "AssertionError: expected 1 to be 2"]] }) });
  const red = cli(env.dir, ["gate", "red", "--task", "TASK-002"]);
  assert.equal(red.code, 0, JSON.stringify(red.json.failures));
  const unit = featureState(env.featureDir).tasks["TASK-002"];
  assert.ok(unit.red_lock[redFile], "the CLI locked the red tests");
  const active = JSON.parse(readFileSync(join(env.dir, ".factory", ".active", `${d.id.replaceAll("/", ".")}.json`), "utf8"));
  assert.ok(active.write_deny.includes(redFile), "and the guard now denies writing them");
  const denied = hook(env.dir, "pre-write", { tool_name: "Write", agent_type: d.agent, tool_input: { file_path: join(env.dir, redFile) } });
  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");

  env.fake("test", { code: 0, report: report({ [file]: [["discount", "passed"]] }) }); // the implementation makes it pass
  r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures));
  assert.equal(featureState(env.featureDir).tasks["TASK-002"].status, "done");
  const log = readFileSync(join(env.featureDir, "gate-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.task === "TASK-002");
  const order = log.map((e) => `${e.gate}:${e.pass}`);
  assert.ok(order.indexOf("red:true") >= 0 && order.indexOf("red:true") < order.indexOf("impl:true"), order.join(" "));
  assert.deepEqual(log.find((e) => e.gate === "red").red_lock && Object.keys(log.find((e) => e.gate === "red").red_lock), [redFile]);
});

test("builder_two_phase: a red test edited after red passed is refused; impl-before-red in the gate log is refused", async () => {
  const { env, file } = twoPhaseTask002();
  const d = conductor.step(env.dir).dispatches[0];
  env.fake("test", { code: 1, report: report({ [file]: [["discount", "failed", "AssertionError: expected 1 to be 2"]] }) });
  assert.equal(cli(env.dir, ["gate", "red", "--task", "TASK-002"]).code, 0);
  writeFileSync(file, "test('discount', () => expect(1).toBe(1));\n"); // weakened to pass
  env.fake("test", { code: 0, report: report({ [file]: [["discount", "passed"]] }) });
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "retry");
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["red-test-changed"]);

  // redBeforeImpl reads the log itself: an impl pass logged before the red pass is refused.
  const c = conductor.load(env.dir);
  const task = readPlan(env).tasks.find((t) => t.id === "TASK-002");
  const unit = { build_since: "2026-01-01T00:00:00.000Z", red_lock: { [redFile]: "x" } };
  const logFile = join(c.feature.dir, "gate-log.jsonl");
  writeFileSync(logFile, [{ ts: "2026-01-01T00:00:01.000Z", task: "TASK-002", gate: "impl", pass: true }, { ts: "2026-01-01T00:00:02.000Z", task: "TASK-002", gate: "red", pass: true }].map((e) => JSON.stringify(e)).join("\n") + "\n");
  assert.deepEqual(redBeforeImpl(c, task, unit).map((f) => f.rule), ["impl-before-red"]);
  appendFileSync(logFile, "");
});

test("builder_two_phase: a dispute after red goes back to the same builder once, with the stubs restored", async () => {
  const { env, file } = twoPhaseTask002();
  const d = conductor.step(env.dir).dispatches[0];
  env.fake("test", { code: 1, report: report({ [file]: [["discount", "failed", "AssertionError: expected 1 to be 2"]] }) });
  assert.equal(cli(env.dir, ["gate", "red", "--task", "TASK-002"]).code, 0);
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { test_dispute: { test: redFile, reason: "AC-0003 says 95.00" } }) });
  assert.equal(r.verdict, "test_dispute");
  const u = featureState(env.featureDir).tasks["TASK-002"];
  assert.deepEqual([u.phase, u.red_lock], ["build", null]);
  const again = conductor.step(env.dir).dispatches[0];
  assert.deepEqual([again.agent, again.phase], ["fe-builder", "build"], "the same builder revises its test and re-proves red");
  assert.match(readFileSync(join(env.dir, again.pack), "utf8"), /The builder disputes/);
});

test("builder_two_phase is the shipped default and separate still works", () => {
  const defaults = YAML.parse(readFileSync(join(ENGINE, "defaults.yaml"), "utf8"));
  assert.equal(defaults.quality.tdd.author, "builder_two_phase");
  assert.ok(existsSync(join(ENGINE, "skills", "scope", "SKILL.md")));
});
