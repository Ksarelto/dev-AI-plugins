// Phase 3: stack executor, Vitest report reading, gate-red / gate-impl rules, and the task loop
// (phases, red lock, disputes, splits, parked roles) — against a fake stack, in milliseconds.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, envelope, loopSetup, makeFeature, makeProject, putArtifact, report } from "./helpers.mjs";

const { buildArgv, nodeBinFor } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
const { goodRedFailure } = await import(`${ENGINE}/scripts/lib/vitest-report.mjs`);
const ROOT = join(TESTS, "..", "..");
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));

test("buildArgv: npm needs -- before script args; pnpm and yarn do not; exec and placeholders", () => {
  const stack = (pm) => ({ package_manager: pm, commands: { test: { script: "test:run", args: ["--reporter=json", "--outputFile={report}", "{files}"] }, arch: { exec: "depcruise", args: ["src"] }, raw: ["node", "x.mjs", "{report}"] } });
  assert.deepEqual(buildArgv(stack("npm"), "test", { report: "r.json", files: ["a.test.ts"] }), ["npm", "run", "test:run", "--", "--reporter=json", "--outputFile=r.json", "a.test.ts"]);
  assert.deepEqual(buildArgv(stack("pnpm"), "test", { report: "r.json", files: [] }), ["pnpm", "run", "test:run", "--reporter=json", "--outputFile=r.json"]);
  assert.deepEqual(buildArgv(stack("npm"), "arch"), ["npx", "--no-install", "depcruise", "src"]);
  assert.deepEqual(buildArgv(stack("pnpm"), "arch"), ["pnpm", "exec", "depcruise", "src"]);
  assert.deepEqual(buildArgv(stack("yarn"), "raw", { report: "r.json" }), ["node", "x.mjs", "r.json"]);
  assert.equal(buildArgv(stack("npm"), "build"), null);
  assert.equal(nodeBinFor(`>=${process.versions.node}`), null, "the current node satisfies its own version");
});

test("good red failures are assertions or 'not implemented', never load errors", () => {
  assert.ok(goodRedFailure("AssertionError: expected 105 to be 95"));
  assert.ok(goodRedFailure("Error: not implemented\n at CouponField"));
  assert.ok(!goodRedFailure("TypeError: calculateTotal is not a function"));
  assert.ok(!goodRedFailure("Error: Cannot find module './coupon-field'"));
});

test("the loop runs TASK-001 as characterisation by the test author, gated by impl", async () => {
  const env = loopSetup();
  env.fake("test", { code: 0, report: report({ [join(env.dir, "src/entities/order/model/total.characterisation.test.ts")]: [["pins the total", "passed"]] }) });
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.agent, "fe-test-author");
  assert.equal(d.phase, "char");
  assert.equal(d.task, "TASK-001");
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures));
  assert.equal(featureState(env.featureDir).tasks["TASK-001"].status, "done");
});

test("gate-red rules: load error, already passing, wrong failure, broken existing test, not collected", async () => {
  const env = loopSetup();
  const s = featureState(env.featureDir);
  s.tasks = { "TASK-001": { status: "done", attempts: 1, rung: 0 } };
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  const red = join(env.dir, "src/entities/order/model/total.test.ts");
  env.fake("test", { code: 1, report: report({ [red]: [["discount", "passed"], ["clamp", "failed", "TypeError: calculateTotal is not a function"]], [join(env.dir, "src/shared/x.test.ts")]: [["old", "failed", "AssertionError: boom"]] }) });
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.phase, "red");
  let r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.deepEqual(r.gate.failures.map((f) => f.rule).sort(), ["existing-test-broken", "passes-before-implementation", "wrong-failure"]);
  env.fake("test", { code: 1, report: report({ [red]: "load-error" }) });
  const d2 = conductor.step(env.dir).dispatches[0];
  r = await conductor.record(env.dir, { dispatchId: d2.id, envelopeText: envelope(d2.id) });
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["does-not-load"]);
  env.fake("test", { code: 1, report: report({}) });
  env.fake("typecheck", { code: 2, output: "src/x.ts(1,1): error TS2554" });
  const d3 = conductor.step(env.dir).dispatches[0];
  r = await conductor.record(env.dir, { dispatchId: d3.id, envelopeText: envelope(d3.id) });
  assert.deepEqual(r.gate.failures.map((f) => f.rule).sort(), ["not-collected", "tests-do-not-compile"]);
});

test("red → green: the red lock is recorded, the builder may not write red tests, and changing one fails gate-impl", async () => {
  const env = loopSetup();
  const s = featureState(env.featureDir);
  s.tasks = { "TASK-001": { status: "done", attempts: 1, rung: 0 } };
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  const redFile = join(env.dir, "src/entities/order/model/total.test.ts");
  mkdirSync(join(env.dir, "src/entities/order/model"), { recursive: true });
  writeFileSync(redFile, "test('discount', () => expect(1).toBe(2));\n");
  env.fake("test", { code: 1, report: report({ [redFile]: [["discount", "failed", "AssertionError: expected 1 to be 2"]] }) });
  let d = conductor.step(env.dir).dispatches[0];
  let r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance");
  const unit = featureState(env.featureDir).tasks["TASK-002"];
  assert.equal(unit.phase, "green");
  assert.ok(unit.red_lock["src/entities/order/model/total.test.ts"]);

  d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.agent, "fe-builder");
  const active = JSON.parse(readFileSync(join(env.dir, ".factory", ".active", `${d.id.replaceAll("/", ".")}.json`), "utf8"));
  assert.deepEqual(active.write_deny, ["src/entities/order/model/total.test.ts"]);
  assert.ok(!active.write_allow.includes("src/entities/order/model/total.test.ts"));

  writeFileSync(redFile, "test('discount', () => expect(1).toBe(1));\n"); // tampered
  env.fake("test", { code: 0, report: report({ [redFile]: [["discount", "passed"]] }) });
  r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["red-test-changed"]);
});

test("a builder's test dispute goes back to the test author once; a second one asks the human", async () => {
  const env = loopSetup();
  const s = featureState(env.featureDir);
  s.tasks = { "TASK-001": { status: "done", attempts: 1, rung: 0 }, "TASK-002": { status: "green", phase: "green", attempts: 0, rung: 0, red_lock: {} } };
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  const dispute = { test_dispute: { test: "src/entities/order/model/total.test.ts", reason: "AC-0003 says 95.00, the test expects 96" } };
  let d = conductor.step(env.dir).dispatches[0];
  let r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, dispute) });
  assert.equal(r.verdict, "test_dispute");
  d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.agent, "fe-test-author");
  assert.match(readFileSync(join(env.dir, d.pack), "utf8"), /The builder disputes/);
  const st = featureState(env.featureDir);
  st.tasks["TASK-002"] = { ...st.tasks["TASK-002"], phase: "green", status: "green" };
  st.pending = [];
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(st));
  d = conductor.step(env.dir).dispatches[0];
  r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, dispute) });
  assert.equal(r.verdict, "ask_human");
  const ask = conductor.step(env.dir);
  assert.equal(ask.gate, "CLARIFY");
  conductor.approve(env.dir, { notes: "The test is right: 95.00" });
  assert.match(featureState(env.featureDir).tasks["TASK-002"].feedback, /Human answer \(HD-1\): The test is right/);
});

test("split: the planner replaces the task, gate-plan re-checks the plan, the old task is replaced", async () => {
  const env = loopSetup();
  const s = featureState(env.featureDir);
  s.tasks = { "TASK-001": { status: "done", attempts: 1, rung: 0 }, "TASK-002": { status: "pending", attempts: 0, rung: 0 } };
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  conductor.split(env.dir, { task: "TASK-002" });
  const stepped = conductor.step(env.dir);
  assert.equal(stepped.action, "dispatch", JSON.stringify(stepped));
  const d = stepped.dispatches[0];
  assert.equal(d.subagent_type, "factory-analysis:planner");
  assert.equal(d.phase, "split");
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replaceAll("TASK-002", "TASK-004").replace("depends_on: [TASK-004]", "depends_on: [TASK-004]"));
  putArtifact(env.featureDir, "test-plan.yaml", "04-plan/test-plan.yaml", (t) => t.replace("task: TASK-002", "task: TASK-004"));
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "split", JSON.stringify(r));
  const tasks = featureState(env.featureDir).tasks;
  assert.equal(tasks["TASK-002"].status, "replaced");
  assert.equal(r.next.dispatches[0].task, "TASK-004", "record hands back the next step: the new task's red phase");
  assert.equal(tasks["TASK-004"].status, "red");
});

test("tasks of a disabled role are parked; the stage ends when only parked tasks remain", () => {
  const env = loopSetup();
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replaceAll("role: frontend", "role: backend"));
  const r = conductor.step(env.dir);
  assert.equal(r.action, "done");
  assert.deepEqual(Object.values(featureState(env.featureDir).tasks).map((u) => u.status), ["parked", "parked", "parked"]);
});

test("prototype: triggered by a new surface, skipped when no enabled role has a prototyper", () => {
  const dir = makeProject(`packs: { factory-analysis: "${join(ROOT, "app-dev-kitv2", "factory-analysis")}", factory-role-frontend: "${join(ROOT, "app-dev-kitv2", "factory-role-frontend")}" }\nroles: { frontend: { enabled: true, pack: factory-role-frontend } }\npipeline: { profiles: { test: [prototype, requirements] } }`);
  const featureDir = makeFeature(dir, { stages: ["prototype", "requirements"] });
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  assert.equal(conductor.step(dir).dispatches[0].agent, "prototyper", "CheckoutSummary is not in any index yet");
  const dir2 = makeProject(`packs: { factory-analysis: "${join(ROOT, "app-dev-kitv2", "factory-analysis")}" }\nroles: { frontend: { enabled: false } }\npipeline: { profiles: { test: [prototype, requirements] } }`);
  const f2 = makeFeature(dir2, { stages: ["prototype", "requirements"] });
  putArtifact(f2, "stories.yaml", "02-stories/stories.yaml");
  conductor.setOverride(dir2, { stage: "prototype", value: "force" });
  assert.equal(conductor.step(dir2).dispatches[0].stage, "requirements", "forced, but no role provides a prototyper");
  assert.equal(featureState(f2).stages.prototype.status, "skipped");
});

test("Cartographer indexes FSD slices with exports and usage", async () => {
  const { buildIndex } = await import(`${ENGINE}/scripts/lib/cartographer.mjs`);
  const dir = makeProject();
  const fixture = join(TESTS, "fixtures", "fsd-app");
  for (const f of ["src/pages/checkout/index.ts", "src/pages/checkout/ui/checkout-page.tsx", "src/entities/order/index.ts", "src/entities/order/model/total.ts", "src/shared/ui/input/index.ts"]) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), readFileSync(join(fixture, f)));
  }
  const r = buildIndex(dir, { roles: { frontend: { enabled: true, stack: "frontend-dev-kit" } } }, { "frontend-dev-kit": { stack: { index_adapter: "fsd" } } });
  assert.deepEqual(r.adapters, ["fsd"]);
  const inv = YAML.parse(readFileSync(join(dir, ".factory/_index/component-inventory.yaml"), "utf8"));
  const order = inv.components.find((c) => c.name === "order");
  assert.deepEqual([order.layer, order.exports, order.used_by], ["entities", ["calculateTotal"], 1]);
});
