// Regression tests for the phase-3 review findings (task loop, red/green gates, stack executor).
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, conductor, envelope, loopSetup, makeFeature, makeProject, putArtifact, report } from "./helpers.mjs";

const { goodRedFailure } = await import(`${ENGINE}/scripts/lib/vitest-report.mjs`);
const { resolveStack, buildArgv } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
const ROOT = join(TESTS, "..", "..");
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const setTasks = (env, tasks) => {
  const s = featureState(env.featureDir);
  s.tasks = tasks;
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
};
const RED = "src/entities/order/model/total.test.ts";
const SRC = "src/entities/order/model/total.ts";
const write = (env, file, text) => {
  mkdirSync(join(env.dir, file, ".."), { recursive: true });
  writeFileSync(join(env.dir, file), text);
};
const record = (env, d, extra) => conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, extra) });

test("skip/todo tests are never a red, and a skipped task test fails gate-impl", async () => {
  const env = loopSetup();
  setTasks(env, { "TASK-001": { status: "done" } });
  env.fake("test", { code: 0, report: report({ [join(env.dir, RED)]: [["discount", "skipped"], ["clamp", "todo"]] }) });
  const d = conductor.step(env.dir).dispatches[0];
  const r = await record(env, d);
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["skipped-red-test", "skipped-red-test"]);
});

test("a stale report is never reused: the gate deletes it before running", async () => {
  const env = loopSetup();
  setTasks(env, { "TASK-001": { status: "done" } });
  mkdirSync(join(env.dir, ".factory", "logs"), { recursive: true });
  writeFileSync(join(env.dir, ".factory", "logs", "TASK-002-red-report.json"), JSON.stringify(report({ [join(env.dir, RED)]: [["discount", "failed", "AssertionError: x"]] })));
  env.fake("test", { code: 1, output: "vitest crashed" }); // writes no report
  const d = conductor.step(env.dir).dispatches[0];
  const r = await record(env, d);
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["no-report"]);
  assert.match(r.gate.failures[0].message, /vitest crashed/);
});

test("characterisation may write only its test files, and must leave tests that ran", async () => {
  const env = loopSetup();
  const d = conductor.step(env.dir).dispatches[0];
  const active = JSON.parse(readFileSync(join(env.dir, ".factory", ".active", `${d.id.replaceAll("/", ".")}.json`), "utf8"));
  assert.deepEqual(active.write_allow, ["src/entities/order/model/total.characterisation.test.ts"]);
  env.fake("test", { code: 0, report: report({}) }); // the author wrote nothing
  const r = await record(env, d);
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["task-test-missing"]);
});

test("a dispute restores the sources at red, clears escalation, and gets a fresh dispatch id", async () => {
  const env = loopSetup();
  setTasks(env, { "TASK-001": { status: "done" } });
  write(env, RED, "test('d', () => expect(1).toBe(2));\n");
  write(env, SRC, "export const stub = 1;\n");
  env.fake("test", { code: 1, report: report({ [join(env.dir, RED)]: [["d", "failed", "AssertionError: expected 1 to be 2"]] }) });
  let d = conductor.step(env.dir).dispatches[0];
  await record(env, d); // red passes → snapshot of SRC taken
  d = conductor.step(env.dir).dispatches[0];
  write(env, SRC, "export const implemented = 2;\n"); // the builder implemented, then disputes
  const s = featureState(env.featureDir);
  Object.assign(s.tasks["TASK-002"], { instruction: "Fix ONLY…", model: "opus" });
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  await record(env, d, { test_dispute: { test: RED, reason: "wrong number" } });
  assert.equal(readFileSync(join(env.dir, SRC), "utf8"), "export const stub = 1;\n", "source back to its red state");
  const unit = featureState(env.featureDir).tasks["TASK-002"];
  assert.deepEqual([unit.phase, unit.instruction, unit.model, unit.round], ["red", null, null, 2]);
  assert.match(conductor.step(env.dir).dispatches[0].id, /implementation\.TASK-002\.red2\/fe-test-author\/a1$/);
});

test("a human reject on a disputed task sends it back to red", async () => {
  const env = loopSetup();
  setTasks(env, { "TASK-001": { status: "done" }, "TASK-002": { status: "green", phase: "green", disputed: true, red_lock: {}, round: 2 } });
  const d = conductor.step(env.dir).dispatches[0];
  await record(env, d, { test_dispute: { test: RED, reason: "still wrong" } });
  assert.equal(conductor.step(env.dir).gate, "CLARIFY");
  conductor.reject(env.dir, { reason: "The builder is right: the AC says 95.00" });
  const unit = featureState(env.featureDir).tasks["TASK-002"];
  assert.equal(unit.phase, "red");
  assert.match(unit.feedback, /sent TASK-002 back to red \(HD-1\)/);
});

test("split: the pack's exit check names no task, and the planner may update the test plan", () => {
  const env = loopSetup();
  setTasks(env, { "TASK-001": { status: "done" }, "TASK-002": { status: "pending" } });
  conductor.split(env.dir, { task: "TASK-002" });
  const d = conductor.step(env.dir).dispatches[0];
  const pack = readFileSync(join(env.dir, d.pack), "utf8");
  assert.match(pack, /gate plan --project/);
  assert.doesNotMatch(pack, /--task TASK-002/);
  assert.match(pack, /04-plan\/test-plan\.yaml/);
  assert.match(pack, /Point every task that depended on TASK-002/);
});

test("replay of planning resets the task loop", () => {
  const env = loopSetup();
  setTasks(env, { "TASK-001": { status: "done" }, "TASK-002": { status: "done" } });
  const s = featureState(env.featureDir);
  s.stages.planning = { status: "passed" };
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  conductor.replay(env.dir, { stage: "implementation", feedback: "rebuild with the new tokens" });
  assert.deepEqual(featureState(env.featureDir).tasks, {});
});

test("dependents of a parked task are parked too, so the stage can end", () => {
  const env = loopSetup();
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replace("role: frontend\n    type: entity-model", "role: backend\n    type: entity-model"));
  setTasks(env, { "TASK-001": { status: "done" } });
  assert.equal(conductor.step(env.dir).action, "done");
  const tasks = featureState(env.featureDir).tasks;
  assert.equal(tasks["TASK-003"].status, "parked");
  assert.match(tasks["TASK-003"].reason, /depends on parked TASK-002/);
});

test("gate-plan: unknown task types and existing red-test files are rejected", async () => {
  const env = loopSetup();
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replace("type: feature-ui", "type: wizardry"));
  write(env, RED, "test('old', () => {});\n");
  const s = featureState(env.featureDir);
  s.stage = "planning";
  s.stages.planning = { status: "pending" };
  s.tasks = {};
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
  const c = conductor.load(env.dir);
  const r = await runGate("plan", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
  const rules = r.failures.map((f) => f.rule);
  assert.ok(rules.includes("unknown-task-type"), rules.join(","));
  assert.ok(rules.includes("red-test-exists"), rules.join(","));
});

test("the task loop marks its stage as running and entered", () => {
  const env = loopSetup();
  conductor.step(env.dir);
  const st = featureState(env.featureDir).stages.implementation;
  assert.deepEqual([st.status, st.entered], ["running", true]);
});

test("an enabled role whose pack is missing halts a role-slot stage instead of skipping it", () => {
  const dir = makeProject(`packs: { factory-analysis: "${join(ROOT, "app-dev-kitv2", "factory-analysis")}" }\nroles: { frontend: { enabled: true, pack: not-installed } }\npipeline: { profiles: { test: [architecture] }, stages: { architecture: { agents: ["role:builder"] } } }`);
  makeFeature(dir, { stages: ["architecture"] });
  const r = conductor.step(dir);
  assert.equal(r.action, "halt");
  assert.match(r.reason, /pack "not-installed" is not installed/);
});

test("a command override replaces the whole command; 'Unexpected' is not an assertion", () => {
  const c = {
    projectDir: "/p",
    config: { roles: { frontend: { stack: "s", stack_overrides: { commands: { test: { exec: "jest", args: ["--json"] } } } } } },
    packs: { s: { stack: { package_manager: "pnpm", commands: { test: { script: "test:run", args: ["--reporter=json"] } } } } },
  };
  assert.deepEqual(buildArgv(resolveStack(c, "frontend").stack, "test"), ["pnpm", "exec", "jest", "--json"]);
  assert.ok(!goodRedFailure("SyntaxError: Unexpected token '<'"));
  assert.ok(!goodRedFailure("Error: Unexpected end of input"));
});
