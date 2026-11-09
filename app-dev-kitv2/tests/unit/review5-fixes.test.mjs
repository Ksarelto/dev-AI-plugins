// Regression tests for the second independent review (review 5): references that lock the project (N1), resume of a
// halted stage (N2), task scope with `vitest related` (N3), note kinds (N4), human GATE-A rejections (N5), a patch
// that grows (N6), the amend loop (N7), references of several features (N8), forked skills (N9), the mockup CLARIFY
// (N10), `factory budget raise` and the docs that changed behaviour (N11), and the minor items.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ENGINE, FIXTURE_PACK, TESTS, YAML, cli, conductor, envelope, init, loopSetup, makeFeature, makeProject, putArtifact, putIntake, state } from "./helpers.mjs";

const lib = (name) => import(`${ENGINE}/scripts/lib/${name}.mjs`);
const refs = await lib("references");
const { intake, normaliseText } = await lib("intake");
const { classifyNote } = await lib("notes");
const { decide } = await lib("warden");
const { FRESH } = await lib("tasks");
const { sizeFromSpec, SIZE_LIMITS } = await lib("sizing");
const { gateContext, runGate } = await lib("gatekeeper");
const { recordBaseRef } = await lib("baseref");
const { testScope, vitestScriptFlags } = await lib("testrun");
const { buildArgv } = await lib("stackexec");
const guard = await import(`${ENGINE}/hooks/guard.mjs`);

const ROOT = join(TESTS, "..", "..");
const V2 = (p) => join(ROOT, "app-dev-kitv2", p);
const MOCKUP = join(TESTS, "fixtures", "mockup-app");
const fstate = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const saveState = (dir, s) => writeFileSync(join(dir, "state.json"), JSON.stringify(s));
const put = (base, rel, text) => {
  mkdirSync(dirname(join(base, rel)), { recursive: true });
  writeFileSync(join(base, rel), text);
};
const events = (dir) => readFileSync(join(dir, ".factory", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

// ---- N1: a reference never locks the project ----

/** A project folder `app/` inside a parent folder that holds `mock.html` (the brief says "../mock.html"). */
function nestedProject() {
  const parent = mkdtempSync(join(tmpdir(), "factory-n1-"));
  const dir = join(parent, "app");
  mkdirSync(join(dir, "src"), { recursive: true });
  init(dir, { mode: "change-request" });
  writeFileSync(join(dir, ".factory", "factory.config.yaml"), YAML.stringify({ version: 1, project: { name: "t" }, roles: { frontend: { enabled: true, owns_paths: ["src/**"] } } }));
  writeFileSync(join(parent, "mock.html"), "<!doctype html><title>mock</title>\n");
  return { parent, dir };
}
const builderWrites = (dir, file) =>
  guard.decideWrite({ agent_type: "fe-builder", tool_name: "Write", tool_input: { file_path: join(dir, file) } }, dir, [{ id: "FEAT-001-TASK-001-build", subagent_type: "factory-role-frontend:fe-builder", agent: "fe-builder", write_allow: ["src/**"], write_deny: [] }], { policy: {} });

test("n1: a mockup named as ../mock.html is that file, not the project's parent folder; the builders can still write src/", () => {
  const { parent, dir } = nestedProject();
  const found = refs.detectReferences("Use the mockup at ../mock.html as the design", dir);
  assert.deepEqual(found.map((r) => r.path), [join(parent, "mock.html")], "the file itself");
  refs.registerReferences(dir, found.map((r) => ({ ...r, feature: "FEAT-001" })), "brief.md");
  refs.resolveProposed(dir, "FEAT-001");
  assert.deepEqual(refs.referenceRoots(dir), [join(parent, "mock.html")]);
  assert.equal(refs.isUnderReference(dir, join(dir, "src", "a.ts")), false);
  assert.equal(builderWrites(dir, "src/a.ts"), null, "the confirmed reference does not deny src/**");
  assert.match(String(guard.decideWrite({ agent_type: "fe-builder", tool_name: "Write", tool_input: { file_path: join(parent, "mock.html") } }, dir, [{ id: "x", agent: "fe-builder", subagent_type: "factory-role-frontend:fe-builder", write_allow: ["src/**"] }], {})), /declared reference/, "the mockup file itself stays read-only");
});

test("n1: `reference add mock.html` at the project root registers the file, never '.'", () => {
  const dir = makeProject();
  writeFileSync(join(dir, "mock.html"), "<title>m</title>\n");
  const out = refs.addReference(dir, "mock.html", { feature: "FEAT-001" });
  assert.deepEqual(out.added.map((r) => r.path), ["mock.html"]);
  assert.equal(refs.isUnderReference(dir, join(dir, "src", "a.ts")), false);
  assert.equal(builderWrites(dir, "src/entities/order/model/total.ts"), null);
});

test("n1: a reference may not be the project folder, one of its parents, or a role's source folder (unless --allow-inside); an in-project mockup folder works", () => {
  const { parent, dir } = nestedProject();
  for (const target of [".", dir, "..", parent]) assert.throws(() => refs.addReference(dir, target), /project folder or one of its parents/, `${target}`);
  assert.throws(() => refs.addReference(dir, "src"), /source folders/);
  mkdirSync(join(dir, "src", "widgets"), { recursive: true });
  writeFileSync(join(dir, "src", "widgets", "index.html"), "<title>w</title>");
  assert.throws(() => refs.addReference(dir, "src/widgets"), /--allow-inside/);
  assert.deepEqual(refs.addReference(dir, "src/widgets", { allowInside: true }).added.map((r) => r.path), ["src/widgets"], "an explicit flag allows an in-project mockup under src");
  assert.throws(() => refs.addReference(dir, "..", { allowInside: true }), /parents/, "the flag never allows the root or an ancestor");
  mkdirSync(join(dir, "mockup"), { recursive: true });
  writeFileSync(join(dir, "mockup", "index.html"), "<title>m</title>");
  assert.deepEqual(refs.addReference(dir, "./mockup").added.map((r) => r.path), ["mockup"], "an in-project folder outside the source folders needs no flag");
  const cliOut = cli(dir, ["reference", "add", ".."]);
  assert.equal(cliOut.code, 2);
  assert.match(JSON.stringify(cliOut.json), /parents/);
});

// ---- N2: resume of a halted stage ----

test("n2: resume after an agent returned blocked runs the stage again (it used to dispatch nothing, forever)", async () => {
  const dir = makeProject("context: { digest: engine }");
  const fd = makeFeature(dir);
  putIntake(dir);
  const s = conductor.step(dir);
  const r = await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id, { status: "blocked", summary: "the API docs are missing" }) });
  assert.equal(r.action, "halt");
  assert.equal(fstate(fd).stages.requirements.status, "blocked");
  assert.equal(cli(dir, ["resume"]).json.status, "active");
  const st = fstate(fd).stages.requirements;
  assert.deepEqual([st.status, st.done_agents], ["pending", []]);
  assert.equal(st.attempts, 1, "attempts are kept");
  const next = conductor.step(dir);
  assert.equal(next.action, "dispatch");
  assert.ok(next.dispatches.length > 0, "the stage's agent is dispatched again");
  assert.equal(next.dispatches[0].stage, "requirements");
});

test("n2: resume after the ladder was exhausted (rung 5) runs the stage again at the same rung", async () => {
  const dir = makeProject("context: { digest: engine }");
  const fd = makeFeature(dir);
  putIntake(dir);
  let last;
  for (let i = 0; i < 8; i++) {
    const s = conductor.step(dir);
    if (s.action !== "dispatch") break;
    last = await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) }); // writes nothing: the gate fails
    if (last.action === "halt") break;
  }
  assert.equal(last.action, "halt", JSON.stringify(last).slice(0, 200));
  assert.equal(fstate(fd).stages.requirements.rung, 5);
  assert.equal(cli(dir, ["resume"]).json.status, "active");
  assert.equal(fstate(fd).stages.requirements.rung, 5, "the rung is kept");
  const next = conductor.step(dir);
  assert.equal(next.action, "dispatch");
  assert.ok(next.dispatches.length > 0);
});

// ---- N3: task tests are scoped to the files the task changed ----

test("n3: a task gate runs `test_related` on the files changed since its base ref — not the files of earlier tasks", () => {
  const env = loopSetup("", { git: true });
  const w = (file, text) => put(env.dir, file, text);
  w("src/entities/order/model/earlier.ts", "export const earlier = 1;\n"); // an earlier task's work, uncommitted
  w("src/entities/order/model/earlier.test.ts", "// earlier\n");
  const base = recordBaseRef(env.dir);
  w("src/entities/order/model/total.ts", "export const total = 2 + 2 + 2;\n"); // this task (a different size from the committed file)
  w("src/entities/order/model/total.test.ts", "// this\n");
  w("README.md", "not a source file\n");
  const s = fstate(env.featureDir);
  s.tasks = { ...s.tasks, "TASK-002": { status: "green", base_ref: base } };
  saveState(env.featureDir, s);
  put(env.dir, "package.json", JSON.stringify({ scripts: { "test:run": "vitest run --config config/vitest/vitest.config.ts --coverage" } }));
  const c = conductor.load(env.dir);
  const ctxFor = (config) => {
    const task = { id: "TASK-002" };
    return { projectDir: env.dir, config, task, state: fstate(env.featureDir) };
  };
  const stack = (extraCommands = {}) => ({ role: "frontend", cwd: env.dir, stack: { test_scoped_args: ["--changed"], commands: { test: { script: "test:run" }, test_related: { exec: "vitest", args: ["related", "{files}", "--run"] }, ...extraCommands } } });
  const scope = testScope(ctxFor(c.config), stack());
  assert.equal(scope.command, "test_related");
  assert.deepEqual([...scope.files].sort(), ["src/entities/order/model/total.test.ts", "src/entities/order/model/total.ts"], "only this task's source and test files");
  assert.deepEqual(scope.extra, ["--config", "config/vitest/vitest.config.ts"], "the config of the project's own test script is kept");
  assert.deepEqual(buildArgv({ package_manager: "pnpm", commands: stack().stack.commands }, "test_related", { files: scope.files }).slice(0, 4), ["pnpm", "exec", "vitest", "related"]);
  assert.deepEqual(vitestScriptFlags({ cwd: env.dir, stack: { commands: { test: { script: "test:run" } } } }), ["--config", "config/vitest/vitest.config.ts"]);
  put(env.dir, "package.json", JSON.stringify({ scripts: { "test:run": "vitest run --project unit --project=extra && echo done", other: "jest" } }));
  assert.deepEqual(vitestScriptFlags({ cwd: env.dir, stack: { commands: { test: { script: "test:run" } } } }), ["--project", "unit", "--project", "extra"]);
  assert.equal(vitestScriptFlags({ cwd: env.dir, stack: { commands: { test: { script: "other" } } } }), null, "not vitest: no related run");
  put(env.dir, "package.json", JSON.stringify({ scripts: { a: "cross-env TZ=UTC vitest run --config x.ts", b: "tsc && vitest run --config x.ts", c: "vitest run --workspace w.ts" } }));
  assert.equal(vitestScriptFlags({ cwd: env.dir, stack: { commands: { test: { script: "a" } } } }), null, "env prefix: fall back");
  assert.equal(vitestScriptFlags({ cwd: env.dir, stack: { commands: { test: { script: "b" } } } }), null, "earlier chained step: fall back");
  assert.deepEqual(vitestScriptFlags({ cwd: env.dir, stack: { commands: { test: { script: "c" } } } }), ["--workspace", "w.ts"]);
  assert.deepEqual(vitestScriptFlags({ cwd: env.dir, stack: { commands: { test: { exec: "vitest", args: ["run", "--config", "x", "--reporter", "json"] } } } }), ["--config", "x"], "exec-form test command keeps its config flags");
  // Without a test_related command it is the old behaviour (--changed <base ref>); outside a base ref, plain --changed.
  const old = testScope(ctxFor(c.config), { ...stack(), stack: { test_scoped_args: ["--changed"], commands: { test: { script: "test:run" } } } });
  assert.deepEqual([old.command, old.files, old.extra], ["test", [], ["--changed", base]]);
  const none = testScope({ ...ctxFor(c.config), state: { tasks: {} } }, stack());
  assert.deepEqual([none.command, none.extra], ["test", ["--changed"]]);
  assert.equal(testScope(ctxFor({ ...c.config, quality: { task_tests: "full" } }), stack()).extra.length, 0, "task_tests: full runs everything");
  // The shipped stacks define the command.
  for (const kit of ["frontend-dev-kit", "node-backend-dev-kit", "node-agent-dev-kit"]) {
    const y = YAML.parse(read(kit, "stack.yaml"));
    assert.equal(y.commands.test_related.exec, "vitest", kit);
    assert.ok(y.commands.test_related.args.includes("{files}"), kit);
  }
});

// ---- N4: note kinds ----

test("n4: product notes that share words with the factory's controls stay product notes", () => {
  for (const text of [
    "Bump the attempts limit of the login form to 5",
    "Don't ask for confirmation when deleting a draft",
    "Stop asking for the password on every login",
    "Raise the token limit for the chat completion to 4096",
    "Never prompt the user twice for the shipping address",
    "Stop prompting for 2FA on trusted devices",
    "Increase the budget field limit to 10 digits",
    "Extend the dispatches table to show the driver name",
  ]) assert.equal(classifyNote(text), "product", text);
  for (const text of ["raise the factory budget", "more dispatches", "increase wall clock", "Raise the budget to 120 dispatches", "stop asking questions", "don't ask", "keep going", "Raise the budgets and keep going"]) {
    assert.equal(classifyNote(text), "process", text);
  }
});

test("n4: a note given at a gate is a product note unless --kind process; approve and reject echo the kind", async () => {
  const dir = makeProject("context: { digest: engine }");
  const fd = makeFeature(dir);
  putIntake(dir);
  const s = conductor.step(dir);
  putArtifact(fd, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(conductor.step(dir).gate, "GATE-A");
  const rejected = cli(dir, ["reject", "--reason", "Don't ask for confirmation when deleting a draft coupon"]);
  assert.equal(rejected.json.note_kind, "product", JSON.stringify(rejected.json));
  const notes = () => YAML.parse(readFileSync(join(fd, "human-notes.yaml"), "utf8"));
  assert.equal(notes()[0].kind, "product");
  assert.equal(notes()[0].status, "open", "it is planned and mapped like any product note");
  const again = conductor.step(dir);
  putArtifact(fd, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (t) => `${t}\n# addresses HD-1\n`);
  await conductor.record(dir, { dispatchId: again.dispatches[0].id, envelopeText: envelope(again.dispatches[0].id) });
  assert.equal(conductor.step(dir).gate, "GATE-A");
  const approved = cli(dir, ["approve", "--notes", "Don't ask for confirmation when deleting a draft coupon"]);
  assert.equal(approved.json.note_kind, "product", JSON.stringify(approved.json));
  const forced = (() => {
    const d2 = makeProject("context: { digest: engine }");
    const f2 = makeFeature(d2);
    putIntake(d2);
    return { d2, f2 };
  })();
  const s2 = conductor.step(forced.d2);
  putArtifact(forced.f2, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await conductor.record(forced.d2, { dispatchId: s2.dispatches[0].id, envelopeText: envelope(s2.dispatches[0].id) });
  assert.equal(conductor.step(forced.d2).gate, "GATE-A");
  const process = cli(forced.d2, ["approve", "--notes", "Keep going", "--kind", "process"]);
  assert.equal(process.json.note_kind, "process", JSON.stringify(process.json));
  assert.equal(cli(forced.d2, ["approve", "--kind", "banana"]).code, 2);
});

// ---- N5: human rejections of the reopened GATE-A ----

test("n5: a human can reject GATE-A as often as they like; it never spends the backward-edge budget", async () => {
  const dir = makeProject("budgets: { backward_edges: { stories_to_requirements: 1 } }\ncontext: { digest: engine }");
  const fd = makeFeature(dir);
  putIntake(dir);
  for (let round = 1; round <= 3; round++) {
    let s = conductor.step(dir);
    assert.equal(s.action, "dispatch", `round ${round}: ${JSON.stringify(s).slice(0, 200)}`);
    // Every open note must be mentioned by ID in the outputs (the gate checks it).
    putArtifact(fd, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (t) => `${t}\n# carries ${(existsSync(join(fd, "human-notes.yaml")) ? YAML.parse(readFileSync(join(fd, "human-notes.yaml"), "utf8")) : []).map((n) => n.id).join(" ")}\n`);
    await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
    s = conductor.step(dir);
    assert.equal(s.gate, "GATE-A", `round ${round}`);
    conductor.reject(dir, { reason: `round ${round}: REQ-0002 is wrong` });
    const st = fstate(fd);
    assert.equal(st.status, "active", `round ${round}: ${st.halts.at(-1)?.reason ?? ""}`);
    assert.equal(st.stage, "requirements");
    assert.equal(st.budgets.edges?.stories_to_requirements ?? 0, 0, "the edge budget is for failing gates, not for people");
    assert.equal(st.budgets.human_rejections, round);
  }
});

// ---- N6: a patch that grows ----

test("n6: a patch that grows to small runs requirements (completeness, gate-spec, GATE-A) before stories", async () => {
  const dir = makeProject([
    `packs: { factory-analysis: "${V2("factory-analysis")}" }`,
    "roles: { frontend: { enabled: false } }",
    "pipeline: { profiles: { patch: [requirements-lite, stories], small: [requirements, stories], standard: [requirements, stories], test: [requirements-lite, stories] }, tier_profiles: { patch: patch, small: small }, size_limits: { patch: { reqs: 1, acs: 1 } } }",
    "context: { digest: engine }",
  ].join("\n"));
  const fd = makeFeature(dir, { stages: ["requirements-lite", "stories"] });
  const s0 = fstate(fd);
  Object.assign(s0, { profile: "patch", tier: "patch", tier_auto: true });
  saveState(fd, s0);
  putIntake(dir);
  const s = conductor.step(dir);
  putArtifact(fd, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const first = await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  const planner = first.next.dispatches[0];
  putArtifact(fd, "tasks.yaml", "04-plan/tasks.yaml");
  putArtifact(fd, "test-plan.yaml", "04-plan/test-plan.yaml");
  const r = await conductor.record(dir, { dispatchId: planner.id, envelopeText: envelope(planner.id) });
  const st = fstate(fd);
  assert.notEqual(st.tier, "patch");
  assert.equal(st.stage, "requirements", "the stories stage is not reached before the requirements analysis");
  assert.equal(r.next.dispatches?.[0]?.stage, "requirements", JSON.stringify(r.next).slice(0, 200));
  assert.match(st.stages.requirements.feedback, /completeness/);
  // The analyst runs; the requirements gate and GATE-A follow, as for any small feature.
  putArtifact(fd, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(fd, "completeness.yaml", "01-requirements/completeness.yaml");
  const again = await conductor.record(dir, { dispatchId: r.next.dispatches[0].id, envelopeText: envelope(r.next.dispatches[0].id) });
  assert.equal(again.action, "ask_human", JSON.stringify(again).slice(0, 300));
  assert.equal(conductor.step(dir).gate, "GATE-A", "the human approves the grown spec");
});

// ---- N7: one amendment per task ----

test("n7: after one amendment, a second ladder exhaustion goes to a human (rung 5) instead of amending forever", () => {
  const run = (amendCount) => {
    let unit = { ...FRESH, attempts: 0, rung: 0, amend_count: amendCount };
    const seq = [];
    for (let i = 0; i < 40; i++) {
      unit.attempts += 1;
      const v = decide(unit, { pass: false, progress_signal: 5, fingerprint: `fp${i}` }, { isTask: true, attemptsMax: 3, stateHash: `h${i}` });
      unit = v.unit;
      seq.push(v.verdict);
      if (v.verdict === "block") return { seq, reason: v.reason, rung: v.rung };
      if (v.verdict === "amend") unit = { ...unit, ...FRESH, rung: 0 };
    }
    return { seq };
  };
  assert.ok(run(0).seq.includes("amend"), "the first exhaustion amends");
  const second = run(1);
  assert.equal(second.seq.at(-1), "block", second.seq.join(" "));
  assert.ok(!second.seq.includes("amend"));
  assert.equal(second.rung, 5);
  assert.match(second.reason, /already amended once/);
});

test("n7: finishing an amendment counts it on the task", async () => {
  const env = loopSetup();
  for (const [f, t] of [["stories.yaml", "02-stories/stories.yaml"], ["component-map.md", "03-architecture/component-map.md"], ["api-contract.yaml", "03-architecture/api-contract.yaml"]]) putArtifact(env.featureDir, f, t);
  const s = fstate(env.featureDir);
  s.tasks = { ...s.tasks, "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { ...s.tasks["TASK-003"], status: "red", amend_pending: true } };
  saveState(env.featureDir, s);
  const amend = conductor.step(env.dir).dispatches[0];
  assert.equal(amend.phase, "amend");
  await conductor.record(env.dir, { dispatchId: amend.id, envelopeText: envelope(amend.id) });
  const after = fstate(env.featureDir).tasks["TASK-003"];
  assert.equal(after.amend_count, 1, JSON.stringify(after).slice(0, 300));
  assert.equal(after.rung, 0);
});

// ---- N8: references of more than one feature ----

test("n8: a second feature that names the same mockup gets its own reference (dedupe by feature and path)", () => {
  const dir = makeProject("context: { digest: engine }");
  put(join(dir, ".factory", "inbox"), "brief.md", `# Overview\n\nThe clickable prototype is in ${MOCKUP} (mockup).\n`);
  intake(dir, { title: "Overview" });
  conductor.step(dir);
  conductor.approve(dir, { notes: "yes" });
  put(join(dir, ".factory", "inbox"), "brief2.md", `# Details page\n\nFollow the mockup in ${MOCKUP} for the details page.\n`);
  const r = intake(dir, { newFeature: true, title: "Details" });
  assert.equal(r.feature, "FEAT-002");
  assert.deepEqual(r.references.map((x) => [x.feature, x.status]), [["FEAT-002", "proposed"]]);
  assert.equal(refs.readReferences(dir, { feature: "FEAT-001" }).length, 1);
  assert.equal(refs.readReferences(dir, { status: "proposed", feature: "FEAT-002" }).length, 1, "FEAT-002 is asked about it");
});

test("n8: a mockup found while every open feature is past requirements waits for the next feature; it binds no open one", () => {
  const dir = makeProject("context: { digest: engine }");
  put(join(dir, ".factory", "inbox"), "brief.md", "# Coupons\n\nUsers apply a coupon at checkout.\n");
  intake(dir, { title: "Coupons" });
  const f1 = state.loadAppState(dir).features["FEAT-001"].dir;
  const s1 = fstate(join(dir, ".factory", f1));
  s1.stages.requirements = { status: "passed" };
  s1.stage = "planning";
  saveState(join(dir, ".factory", f1), s1);
  put(join(dir, ".factory", "inbox"), "brief2.md", `# Overview page\n\nThe clickable prototype is in ${MOCKUP} (mockup).\n`);
  const r = intake(dir, {});
  assert.equal(r.references[0].unassigned, true);
  assert.equal(r.references[0].feature, undefined);
  assert.deepEqual(refs.readReferences(dir, { status: "all", feature: "FEAT-001" }), [], "FEAT-001 is not bound (or asked) about it");
  assert.equal(conductor.step(dir).gate === "CLARIFY", false, "no CLARIFY about another feature's mockup");
  put(join(dir, ".factory", "inbox"), "brief3.md", "# Details\n\nA details page.\n");
  const next = intake(dir, { newFeature: true, title: "Details" });
  assert.equal(refs.readReferences(dir, { status: "proposed", feature: next.feature }).length, 1, "the next feature takes it");
  assert.equal(refs.readReferences(dir, { status: "all" })[0].unassigned, undefined);
});

// ---- N10: the CLARIFY about a proposed mockup ----

async function proposedMockup(extra = "") {
  const dir = makeProject("context: { digest: engine }");
  put(join(dir, ".factory", "inbox"), "brief.md", `# Brief\n\nThe clickable prototype is in ${MOCKUP} (mockup).${extra}\n`);
  intake(dir, { title: "x" });
  assert.equal(conductor.step(dir).gate, "CLARIFY");
  return dir;
}

test("n10: only an explicit affirmative confirms a proposed mockup; a negation or a rejection declines it for good", async () => {
  for (const answer of ["nope", "Don't use it, it is outdated", "skip it", "no, ignore it", "this is not our mockup"]) {
    const dir = await proposedMockup();
    conductor.approve(dir, { notes: answer });
    assert.equal(refs.readReferences(dir).length, 0, answer);
    assert.equal(refs.readReferences(dir, { status: "all" })[0].status, "rejected", answer);
  }
  for (const answer of ["yes", "yes, follow it", "confirm", "use it", "approve"]) {
    const dir = await proposedMockup();
    conductor.approve(dir, { notes: answer });
    assert.equal(refs.readReferences(dir).length, 1, answer);
  }
  const dir = await proposedMockup();
  conductor.reject(dir, { reason: "this is not our mockup" });
  assert.equal(refs.readReferences(dir, { status: "proposed" }).length, 0, "reject declines it");
  assert.notEqual(conductor.step(dir).gate, "CLARIFY", "the same question is not asked again");
});

test("n10: an unclear answer is asked once more with explicit options, then it does not bind", async () => {
  const dir = await proposedMockup();
  const first = conductor.approve(dir, { notes: "hmm, maybe, let me think" });
  assert.equal(first.action, "ask_human");
  assert.equal(refs.readReferences(dir).length, 0);
  const again = conductor.step(dir);
  assert.equal(again.gate, "CLARIFY");
  assert.match(again.questions.join("\n"), /1 yes.*1 no/);
  conductor.approve(dir, { notes: "still not sure" });
  assert.equal(refs.readReferences(dir).length, 0, "a second unclear answer never makes it binding");
  assert.notEqual(conductor.step(dir).gate, "CLARIFY");
});

test("n10: several proposed mockups are answered per item in one CLARIFY", async () => {
  const dir = makeProject("context: { digest: engine }");
  put(join(dir, ".factory", "inbox"), "brief.md", `# Brief\n\nThe clickable prototype is in ${MOCKUP} (mockup).\nThe Figma design is at https://www.figma.com/file/abc/Deps\n`);
  intake(dir, { title: "x" });
  const ask = conductor.step(dir);
  assert.equal(ask.questions.length, 2);
  conductor.approve(dir, { notes: "1 yes, 2 no" });
  assert.deepEqual(refs.readReferences(dir).map((r) => r.path ?? r.url), [MOCKUP]);
  assert.deepEqual(refs.readReferences(dir, { status: "all" }).map((r) => r.status), ["confirmed", "rejected"]);
});

// ---- N11: budget raise ----

test("n11: `factory budget raise` raises a spent budget for the feature, and resume then runs on", async () => {
  const dir = makeProject("budgets: { feature: { dispatches: 1 } }\ncontext: { digest: engine }");
  const fd = makeFeature(dir);
  putIntake(dir);
  const s = conductor.step(dir);
  putArtifact(fd, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  conductor.approve(dir, {});
  assert.match(conductor.step(dir).reason, /budget exhausted: dispatches 1\/1/);
  // A process note does not raise anything (it only steers the run).
  assert.equal(cli(dir, ["note", "raise the dispatch budget to 120 and keep going"]).json.kind, "process");
  cli(dir, ["resume"]);
  assert.match(conductor.step(dir).reason ?? "", /budget exhausted/);
  assert.equal(cli(dir, ["budget", "raise", "feature.dispatches", "1"]).code, 2, "only a higher value");
  assert.equal(cli(dir, ["budget", "raise", "feature.nope", "5"]).code, 2);
  const raised = cli(dir, ["budget", "raise", "feature.dispatches", "120"]);
  assert.deepEqual([raised.json.from, raised.json.to], [1, 120], JSON.stringify(raised.json));
  assert.equal(YAML.parse(readFileSync(join(fd, "overrides.yaml"), "utf8")).budgets.feature.dispatches, 120);
  assert.ok(events(dir).some((e) => e.type === "budget" && e.source === "human"));
  cli(dir, ["resume"]);
  assert.equal(conductor.step(dir).action, "dispatch");
});

// ---- N12 and the minor items ----

test("n12: a fix round may not add a task whose files lie inside an existing task's write_scope, label or no label", async () => {
  const env = loopSetup();
  const sf = join(env.featureDir, "state.json");
  const s = JSON.parse(readFileSync(sf, "utf8"));
  s.tasks = { "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { status: "done" } };
  s.fix_pending = { source: "verification", items: [{ check: "review", message: "x" }], attempts: 0 };
  writeFileSync(sf, JSON.stringify(s));
  const tf = join(env.featureDir, "04-plan", "tasks.yaml");
  const tp = join(env.featureDir, "04-plan", "test-plan.yaml");
  const base = YAML.parse(readFileSync(tf, "utf8"));
  const plan = YAML.parse(readFileSync(tp, "utf8"));
  const mk = (id, extra) => ({ id, role: "frontend", type: "feature-ui", title: `fix ${id}`, depends_on: ["TASK-003"], satisfies: ["AC-0001"], files_expected: [`src/features/apply-coupon/ui/fix-${id}.tsx`, `src/features/apply-coupon/ui/fix-${id}.test.tsx`], tdd: { mode: "required", red_tests: [`src/features/apply-coupon/ui/fix-${id}.test.tsx`], stubs: ["x"] }, reuse: { considered: [], reuse_rejected: null }, definition_of_done: ["fix"], size: { files: 2, est_loc: 20 }, ...extra });
  for (const [label, extra] of [["no slice", {}], ["another slice name", { slice: "apply-coupon-fix" }]]) {
    writeFileSync(tf, YAML.stringify({ ...base, tasks: [...base.tasks, mk("TASK-009", extra)] }));
    writeFileSync(tp, YAML.stringify({ ...plan, cases: [...plan.cases, { id: "TEST-0090", task: "TASK-009", level: "component", ac: "AC-0001", title: "fix" }] }));
    const c = conductor.load(env.dir);
    const r = await runGate("plan", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
    assert.ok(r.failures.some((f) => !f.warn && f.rule === "new-task-in-owned-scope"), `${label}: ${JSON.stringify(r.failures.map((f) => f.rule))}`);
  }
});

test("minor: dispatches_max_by_stage.implementation is enforced in the task loop with a clear halt", () => {
  const env = loopSetup("budgets: { stage: { dispatches_max_by_stage: { implementation: 2 } } }");
  const s = fstate(env.featureDir);
  s.stages = { ...s.stages, implementation: { ...(s.stages.implementation ?? {}), status: "running", dispatches: 2 } };
  saveState(env.featureDir, s);
  const r = conductor.step(env.dir);
  assert.equal(r.action, "halt", JSON.stringify(r).slice(0, 200));
  assert.match(r.reason, /used its 2 dispatches.*factory budget raise stage\.dispatches_max_by_stage\.implementation/);
  assert.equal(cli(env.dir, ["budget", "raise", "stage.dispatches_max_by_stage.implementation", "30"]).code, 0);
  cli(env.dir, ["resume"]);
  assert.equal(conductor.step(env.dir).action, "dispatch");
});

test("minor: a gate a human rejected is not auto-approved by autopilot when it comes back revised", async () => {
  const dir = makeProject("automation: { autopilot: true }\ncontext: { digest: engine }");
  const fd = makeFeature(dir);
  putIntake(dir);
  let s = conductor.step(dir);
  putArtifact(fd, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const first = await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.notEqual(first.next?.gate, "GATE-A", "autopilot approves a gate nobody rejected");
  // Now a human rejects a gate (here: set up by hand) and the revision comes back.
  const st = fstate(fd);
  Object.assign(st, { status: "awaiting_human", pending: [], awaiting_human: { gate: "GATE-A", stage: "requirements", since: "x" }, gates: { ...st.gates, "GATE-A": { result: "rejected", by: "human", at: "x", notes: [] } } });
  saveState(fd, st);
  s = conductor.step(dir);
  assert.equal(s.action, "ask_human", "autopilot leaves the revised gate to the human who rejected it");
  assert.equal(s.gate, "GATE-A");
});

test("minor: size limits come from config (defaults.yaml equals the code fallback); stories is not a limit", () => {
  const defaults = YAML.parse(read("app-dev-kitv2", "factory", "defaults.yaml"));
  assert.deepEqual(defaults.pipeline.size_limits, SIZE_LIMITS);
  assert.equal(defaults.pipeline.size_limits.small.stories, undefined);
  assert.equal(sizeFromSpec({ reqs: 3, acs: 3 }, { patch: { reqs: 3, acs: 3 } }, { from: "patch" }).tier, "patch");
  assert.equal(sizeFromSpec({ reqs: 3, acs: 3 }, { patch: { reqs: 2, acs: 6 } }, { from: "patch" }).tier, "small");
});

test("minor: model_tiers has no unused `mechanical` entry", () => {
  const defaults = YAML.parse(read("app-dev-kitv2", "factory", "defaults.yaml"));
  assert.deepEqual(Object.keys(defaults.model_tiers).sort(), ["execution", "reasoning"]);
});

test("minor: quality.tdd.pipeline_red is accepted as deprecated; doctor warns", async () => {
  const { doctor } = await lib("doctor");
  const dir = makeProject("roles: { frontend: { enabled: false } }\nquality: { tdd: { pipeline_red: true } }");
  const out = doctor(dir);
  assert.deepEqual(out.errors, []);
  assert.ok(out.warnings.some((w) => /pipeline_red is deprecated/.test(w)), JSON.stringify(out.warnings));
});

test("minor: factory --help lists resume, budget raise and reference add --allow-inside", () => {
  const help = spawnSync(process.execPath, [join(ENGINE, "scripts", "factory.mjs"), "--help"], { encoding: "utf8" });
  const text = `${help.stdout}${help.stderr}`;
  assert.match(text, /\n {2}resume /);
  assert.match(text, /budget raise <key> <value>/);
  assert.match(text, /--allow-inside/);
});

test("minor: the conductor's relock halt names a command that exists", () => {
  const src = read("app-dev-kitv2", "factory", "scripts", "lib", "conductor.mjs");
  assert.doesNotMatch(src, /run \/factory:acceptance waive/);
});

// ---- N9: no agent or skill tells a dispatched agent to load a forked skill ----

test("n9: the plugin family names no `context: fork` skill for a dispatched agent to load; the check catches one that does", async () => {
  const { findForkedLoads, allSkills } = await import(join(ROOT, "scripts", "forked-skills.mjs"));
  assert.ok(allSkills(ROOT).some((s) => s.plugin === "frontend-dev-kit" && s.skill === "architecture-audit" && s.fork), "architecture-audit of the frontend kit is forked");
  assert.deepEqual(findForkedLoads(ROOT), []);
  // A miniature tree with the old wording: the check names the file and line.
  const tmp = mkdtempSync(join(tmpdir(), "factory-n9-"));
  put(tmp, "kit/skills/risky/SKILL.md", "---\nname: risky\ncontext: fork\n---\nbody\n");
  put(tmp, "kit/skills/plain/SKILL.md", "---\nname: plain\n---\nbody\n");
  put(tmp, "app-dev-kitv2/pack/agents/a.md", "Load `kit:risky` as reference.\nLoad `kit:plain` too.\nkit:risky is context: fork, so it is not loaded.\n");
  put(tmp, "app-dev-kitv2/pack/skills/s/SKILL.md", "Use the `risky` skill.\n");
  assert.deepEqual(findForkedLoads(tmp).map((h) => `${h.file}:${h.line}:${h.skill}`).sort(), ["app-dev-kitv2/pack/agents/a.md:1:kit:risky", "app-dev-kitv2/pack/skills/s/SKILL.md:1:kit:risky"]);
  // The shipped prompts name the non-forked skill.
  for (const f of ["factory-analysis/agents/planner.md", "factory-analysis/agents/solution-architect.md", "factory-analysis/skills/architecture-design/SKILL.md", "factory-analysis/skills/task-decomposition/SKILL.md", "factory-quality/skills/seven-lens-review/references/fq-lens-frontend.md"]) {
    assert.doesNotMatch(read("app-dev-kitv2", f), /frontend-dev-kit:architecture-audit/, f);
  }
  assert.match(read("app-dev-kitv2", "factory-analysis/agents/planner.md"), /frontend-dev-kit:react-feature/);
});

// ---- N11: docs that changed behaviour ----

test("n11: resume documents `factory budget raise`; a process note is not said to raise a budget", () => {
  const skill = read("app-dev-kitv2", "factory/skills/resume/SKILL.md");
  assert.match(skill, /budget raise feature\.dispatches/);
  assert.match(skill, /only records that you asked and raises nothing/);
});

test("n11: rung 4 amends everywhere; a split only through a human /factory:split", () => {
  for (const f of ["factory-analysis/skills/task-decomposition/SKILL.md", "factory-analysis/skills/task-decomposition/references/fa-build-order.md", "factory/skills/failure-analysis/SKILL.md", "../Suggestions/09-quality-gates-and-loop-control.md"]) {
    const text = read("app-dev-kitv2", f);
    assert.match(text, /\/factory:split/, f);
    assert.doesNotMatch(text, /Split only when the diagnosis says|propose a split only for|unless the diagnosis says it is genuinely two/, f);
  }
  assert.doesNotMatch(read("app-dev-kitv2", "factory/scripts/lib/tasks.mjs"), /unless the diagnosis says it is genuinely two unrelated behaviours/, "the amend mission does not invite a split");
});

test("n11: the test authors' descriptions say a dispute goes back to the builder in the default one-dispatch mode", () => {
  for (const [dir, agent, builder] of [["factory-role-frontend", "fe-test-author", "fe-builder"], ["factory-role-backend", "be-test-author", "be-builder"], ["factory-role-ai-agent", "ai-test-author", "ai-builder"]]) {
    const description = /^description:\s*(.+)$/m.exec(read("app-dev-kitv2", dir, "agents", `${agent}.md`))[1];
    assert.match(description, new RegExp(`dispute goes back to ${builder}`), agent);
    assert.doesNotMatch(description, /settles a builder's test dispute/, agent);
  }
});

// ---- minor items: text that must match the behaviour ----

test("minor: no doc says a task gate builds; verification does (quality.impl_build)", () => {
  const readme = read("app-dev-kitv2", "README.md");
  assert.doesNotMatch(readme, /Task gates run typecheck, lint, the architecture check, the build,/);
  assert.match(readme, /A task gate does not build/);
  assert.doesNotMatch(readme, /test author \(red\), builder \(green\)/);
  assert.doesNotMatch(read("Suggestions", "03-sdlc-pipeline.md"), /unit tests, build for touched scope/);
  for (const f of ["factory-role-backend/skills/be-implement-task/SKILL.md", "factory-role-frontend/skills/fe-implement-task/SKILL.md", "factory-role-ai-agent/skills/ai-implement-task/SKILL.md"]) {
    assert.doesNotMatch(read("app-dev-kitv2", f), /architecture check and the build are clean|the architecture check or the build failing|typecheck, lint, build clean|lint \(ESLint \+ dependency-cruiser\), build;/, f);
  }
});

test("minor: B2 — the frontend role's red/green wording follows builder_two_phase", () => {
  assert.doesNotMatch(read("CLAUDE.md"), /red tests and stubs first, builder makes them green/);
  assert.match(read("CLAUDE.md"), /quality\.tdd\.author: builder_two_phase/);
  assert.doesNotMatch(read("Suggestions", "06-artifacts-and-contracts.md"), /written by fe-test-author, read-only for fe-builder/);
  assert.doesNotMatch(read("Suggestions", "12-observability-and-evals.md"), /pipelining not working/);
});

test("minor: Suggestions 07 describes token ceilings as opt-in, matching defaults.yaml", () => {
  const defaults = YAML.parse(read("app-dev-kitv2", "factory", "defaults.yaml"));
  assert.equal(defaults.context.budgets, undefined, "no per-dispatch token budget by default");
  assert.equal(defaults.budgets.feature.tokens, undefined, "no feature token halt by default");
  assert.equal(defaults.flow.iterations.token_budget, undefined);
  const s07 = read("Suggestions", "07-context-engineering.md");
  assert.match(s07, /no token ceiling by default/);
  assert.match(s07, /context\.budgets\.<role>/);
  assert.match(s07, /read_allowlist_max: \{ analysis_roles: 30, execution_roles: 20, review_roles: 20, mechanical_roles: 10 \}/);
  assert.doesNotMatch(read("Suggestions", "10-configuration-and-extensibility.md"), /execution_roles: 45000/);
});

test("minor: GATE-A is asked at requirements — said in the README", () => {
  assert.match(read("app-dev-kitv2", "README.md"), /GATE-A is asked at requirements/);
  assert.match(read("app-dev-kitv2", "factory/defaults.yaml"), /a gate a human REJECTED earlier/);
});

test("minor: B4 — the agents that fill `scope_files` and `app_route` name them", () => {
  for (const f of ["factory-role-frontend/agents/fe-builder.md", "factory-role-backend/agents/be-builder.md", "factory-role-ai-agent/agents/ai-builder.md", "factory-role-ai-agent/agents/ai-rag-builder.md", "factory-role-backend/agents/migration-author.md"]) {
    assert.match(read("app-dev-kitv2", f), /`scope_files`/, f);
  }
});

test("minor: B5 — allowlist nits", () => {
  const allow = read("app-dev-kitv2", "consistency-allowlist.yaml");
  assert.doesNotMatch(allow, /prototype stage|GATE-P|factory proto/);
  assert.match(allow, /max\(240, 30 × tasks \+ 120\)/);
});

test("minor: F3 — the RAG builder, like the other builders, never bends production code to fit a test", () => {
  for (const f of ["factory-role-ai-agent/agents/ai-rag-builder.md", "factory-role-ai-agent/skills/rag-implementation/SKILL.md"]) {
    assert.match(read("app-dev-kitv2", f), /Bend production code to fit a fixture or a red test/, f);
  }
});

test("minor: B3 — a real Prettier round trip passes the convention check (skipped when prettier is not installed)", async (t) => {
  const { createRequire } = await import("node:module");
  let prettier;
  for (const base of [join(TESTS, "fixtures", "fsd-app", "package.json"), join(ROOT, "package.json")]) {
    try {
      prettier = createRequire(base)("prettier");
      break;
    } catch {
      // not installed there
    }
  }
  if (!prettier) return t.skip("prettier is not installed in tests/fixtures/fsd-app or the repo root (npm i -D prettier there to run the round trip)");
  const messy = "export const wide = (list: number[], extra: number) => { return list.map((item) => item + extra + extra + extra + extra + extra + extra + extra + extra + extra) }\nexport const pick = (flag: boolean) => flag ? someVeryLongConditionResultNumberOne : someVeryLongConditionResultNumberTwoXX\n";
  const formatted = await prettier.format(messy, { parser: "typescript", semi: false, singleQuote: true });
  const dir = mkdtempSync(join(tmpdir(), "factory-b3-"));
  put(dir, "src/features/x/ui/c/c.tsx", formatted);
  put(dir, "src/features/x/ui/c/tests/c.test.tsx", "it('x', () => {})\n");
  const run = spawnSync(process.execPath, [join(ROOT, "app-dev-kitv2", "factory-role-frontend", "scripts", "fe-conventions.mjs"), "--project", dir, "--task-type", "component", "--notes", "-", "--files", "src/features/x/ui/c/c.tsx"], { encoding: "utf8", cwd: dir });
  assert.doesNotMatch(run.stdout, /arrow-body|wrapped-expr/, run.stdout);
});

test("minor: E1 — the forced skill loads count toward a pack's estimated tokens", async () => {
  const { buildPack } = await lib("broker");
  const env = loopSetup();
  const c = conductor.load(env.dir);
  const skill = join(ROOT, "frontend-dev-kit", "skills", "react-feature", "SKILL.md");
  const base = { id: "FEAT-001/implementation.TASK-003.build/a1", feature: "FEAT-001", stageId: "implementation", stage: { outputs: [], inputs: [] }, agent: "fe-builder", subagent_type: "x:fe-builder", model: "sonnet", attempt: 1, rung: 0, slim: true, mission: "m", knowledge: { skills: [], rules: [], golden: [] } };
  const without = buildPack(env.dir, c.feature, c.config, base).front.estimated_tokens;
  const withSkill = buildPack(env.dir, c.feature, c.config, { ...base, knowledge: { skills: ["frontend-dev-kit:react-feature"], skill_files: [skill], rules: [], golden: [] } }).front.estimated_tokens;
  assert.ok(withSkill - without >= Math.floor(readFileSync(skill).length / 4), `${withSkill} vs ${without}`);
});

// ---- Pipeline consistency: prototype detection, mockup stages, digest, procedure skills, discovery index ----

function jump(featureDir, stage) {
  const file = join(featureDir, "state.json");
  const s = JSON.parse(readFileSync(file, "utf8"));
  s.stage = stage;
  s.status = "active";
  s.pending = [];
  s.awaiting_human = null;
  s.stages[stage] = { status: "pending", attempts: 0, rung: 0 };
  writeFileSync(file, JSON.stringify(s));
}

const packOf = (dir, step) => readFileSync(join(dir, step.dispatches[0].pack), "utf8");

/** A copy of the fixture pack plus stage ids the shared fixture must not ship (they would shadow the real packs). */
function packWith(ids) {
  const dir = join(mkdtempSync(join(tmpdir(), "factory-pack-")), "fixture-stages");
  cpSync(FIXTURE_PACK, dir, { recursive: true });
  for (const id of ids) {
    const stageDir = join(dir, "stages", id);
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(stageDir + "/stage.yaml", `id: ${id}\ntitle: ${id}\nkind: agents\nagents: [spec-writer]\noutputs: [coverage]\ngate: null\nrequires: { factory: "^0.1" }\n`);
  }
  return dir;
}

test("in-repo prototype.json is proposed; src/widgets is not; an owned prototype is not", () => {
  const parent = mkdtempSync(join(tmpdir(), "factory-proto-"));
  const dir = join(parent, "app");
  mkdirSync(join(dir, "src", "widgets"), { recursive: true });
  writeFileSync(join(dir, "src", "widgets", "index.html"), "<html></html>\n");
  init(dir);
  put(dir, "prototype/prototype.json", "{}\n");
  put(dir, "prototype/index.html", "<html></html>\n");
  const found = refs.detectReferences("keep the design of src/widgets", dir);
  assert.deepEqual(found.map((r) => r.path), ["prototype"]);
  assert.equal(found[0].status, "proposed");
  assert.equal(found[0].entry, "index.html");
  assert.equal(found[0].pages, undefined, "no features.yaml leaves pages unset");

  put(dir, "prototype/features.yaml", "features:\n  - slug: only\n    pages: [home]\n    states: [empty]\n    intent: One screen.\n");
  const one = refs.detectReferences("", dir);
  assert.deepEqual(one[0].pages, ["home"]);
  assert.deepEqual(one[0].states, ["empty"]);
  assert.equal(one[0].intent, "One screen.");

  put(dir, "prototype/features.yaml", "features:\n  - slug: a\n    pages: [a]\n  - slug: b\n    pages: [b]\n");
  assert.equal(refs.detectReferences("", dir)[0].pages, undefined, "several entries wait for the feature title");

  const blocked = makeProject("roles:\n  frontend:\n    owns_paths: ['prototype/**', 'src/**']\n");
  put(blocked, "prototype/prototype.json", "{}\n");
  put(blocked, "prototype/index.html", "<html></html>\n");
  assert.deepEqual(refs.detectReferences("keep the design of src/widgets", blocked), []);
});

test("intake attaches the matching features.yaml entry; a bad map warns and does not fail", () => {
  const dir = makeProject();
  put(dir, "prototype/prototype.json", "{}\n");
  put(dir, "prototype/index.html", "<html></html>\n");
  put(dir, "prototype/features.yaml", "features:\n  - slug: other\n    pages: [nope]\n  - slug: coupons-at-checkout\n    pages: [coupon-list, coupon-form]\n    states: [empty]\n    intent: Staff list coupons.\n");
  put(join(dir, ".factory", "inbox"), "brief.md", "# Coupons at checkout\n\nStaff list coupons.\n");
  const r = intake(dir, {});
  assert.equal(r.warnings, undefined);
  const proto = refs.readReferences(dir, { status: "all" }).find((x) => x.path === "prototype");
  assert.deepEqual(proto.pages, ["coupon-list", "coupon-form"]);
  assert.deepEqual(proto.states, ["empty"]);
  assert.equal(proto.intent, "Staff list coupons.");

  const bare = makeProject();
  put(bare, "prototype/prototype.json", "{}\n");
  put(bare, "prototype/index.html", "<html></html>\n");
  put(join(bare, ".factory", "inbox"), "brief.md", "# Coupons\n\nList them.\n");
  intake(bare, {});
  assert.equal(refs.readReferences(bare, { status: "all" }).find((x) => x.path === "prototype").pages, undefined);

  const bad = makeProject();
  put(bad, "prototype/prototype.json", "{}\n");
  put(bad, "prototype/index.html", "<html></html>\n");
  put(bad, "prototype/features.yaml", "features: [\n");
  put(join(bad, ".factory", "inbox"), "brief.md", "# Coupons\n\nList them.\n");
  const warned = intake(bad, {});
  assert.match(warned.warnings[0], /not valid YAML/);
  assert.equal(refs.readReferences(bad, { status: "all" }).find((x) => x.path === "prototype").pages, undefined);
});

test("yes confirms the in-repo prototype; no keeps it declined", () => {
  for (const [answer, n] of [["yes", 1], ["no", 0]]) {
    const dir = makeProject();
    put(dir, "prototype/prototype.json", "{}\n");
    put(dir, "prototype/index.html", "<html></html>\n");
    put(join(dir, ".factory", "inbox"), "brief.md", "# Coupons\n\nList them.\n");
    intake(dir, {});
    const s = conductor.step(dir);
    assert.equal(s.gate, "CLARIFY", s.reason ?? s.action);
    conductor.approve(dir, { notes: answer });
    assert.equal(refs.readReferences(dir).length, n);
  }
});

test("a confirmed prototype is in the requirements and patch packs, and absent for intake and delivery", () => {
  const stages = ["intake", "requirements", "requirements-lite", "verification-lite", "delivery", "planning"];
  const dir = makeProject(`packs:\n  fixture-stages: "${packWith(["intake", "requirements-lite", "verification-lite", "delivery"])}"\npipeline:\n  profiles:\n    test: [${stages.join(", ")}]\n`);
  const featureDir = makeFeature(dir, { stages });
  put(dir, "prototype/prototype.json", "{}\n");
  put(dir, "prototype/index.html", "<html></html>\n");
  put(dir, "prototype/features.yaml", "features:\n  - slug: coupons-at-checkout\n    pages: [coupon-list]\n    intent: Staff list coupons.\n");
  const added = refs.addReference(dir, "./prototype");
  assert.deepEqual(added.added[0].pages, ["coupon-list"]);
  const see = (stage) => {
    jump(featureDir, stage);
    const s = conductor.step(dir);
    assert.equal(s.action, "dispatch", `${stage}: ${s.reason ?? s.action}`);
    return packOf(dir, s);
  };
  for (const stage of ["requirements", "requirements-lite", "verification-lite"]) {
    const text = see(stage);
    assert.match(text, /Customer mockup/, stage);
    assert.match(text, /coupon-list \(pages\/coupon-list\.html\)/, stage);
    assert.match(text, /the brief wins on conflict/, stage);
  }
  for (const stage of ["intake", "delivery", "planning"]) {
    assert.doesNotMatch(see(stage), /Customer mockup|No prototype is registered/, stage);
  }
});

test("a mockup stage with no confirmed prototype gets one label and the others get none", () => {
  const stages = ["intake", "requirements", "delivery", "planning"];
  const dir = makeProject(`packs:\n  fixture-stages: "${packWith(["intake", "delivery"])}"\npipeline:\n  profiles:\n    test: [${stages.join(", ")}]\n`);
  const featureDir = makeFeature(dir, { stages });
  const see = (stage) => {
    jump(featureDir, stage);
    const s = conductor.step(dir);
    assert.equal(s.action, "dispatch", `${stage}: ${s.reason ?? s.action}`);
    return packOf(dir, s);
  };
  assert.match(see("requirements"), /No prototype is registered/);
  for (const stage of ["intake", "delivery", "planning"]) assert.doesNotMatch(see(stage), /No prototype is registered|Customer mockup/, stage);
});

test("digest Next is the following profile stage while the feature still waits on the one that passed", async () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  const c = conductor.load(dir);
  c.feature.state.stage = "requirements";
  c.feature.dir = featureDir;
  const { engineDigest } = await lib("digest");
  const text = engineDigest(c, "requirements");
  assert.match(text, /Stage passed: requirements · Next: stories/);
});

test("an agent's skills: frontmatter is skills_required on the pack", async () => {
  const { procedureKnowledge } = await lib("knowledge");
  const { buildPack } = await lib("broker");
  const k = procedureKnowledge({ name: "factory-analysis", root: V2("factory-analysis") }, "story-writer");
  assert.deepEqual(k.skills, ["factory-analysis:story-writing"]);
  assert.match(k.skill_files[0], /story-writing\/SKILL\.md$/);
  const dir = makeProject(`packs:\n  factory-analysis: "${V2("factory-analysis")}"\npipeline:\n  stages:\n    stories:\n      agents: ["factory-analysis:story-writer"]\n`);
  makeFeature(dir, { stages: ["stories"] });
  const s = conductor.step(dir);
  assert.equal(s.action, "dispatch", s.reason ?? s.action);
  const text = packOf(dir, s);
  assert.match(text, /skills_required:\n  - factory-analysis:story-writing/);
  assert.match(text, /inline:factory-analysis:story-writing@/);
  const built = buildPack(dir, conductor.load(dir).feature, conductor.load(dir).config, {
    id: "FEAT-001/stories/story-writer/a1", stageId: "stories", stage: { outputs: [], inputs: [], context_role: "analysis_roles" },
    agent: "story-writer", subagent_type: "factory-analysis:story-writer", model: "sonnet", attempt: 1, procedure: k,
  });
  assert.deepEqual(built.front.skills_required, ["factory-analysis:story-writing"]);
});

test("requirements and planning force the procedure skill the stage uses", async () => {
  const { procedureKnowledge } = await lib("knowledge");
  const pack = { name: "factory-analysis", root: V2("factory-analysis") };
  assert.deepEqual(procedureKnowledge(pack, "requirements-analyst", { stageId: "requirements", mode: "greenfield" }).skills, ["factory-analysis:prd-authoring"]);
  assert.deepEqual(procedureKnowledge(pack, "requirements-analyst", { stageId: "requirements", mode: "change-request" }).skills, ["factory-analysis:delta-spec"]);
  assert.deepEqual(procedureKnowledge(pack, "requirements-analyst", { stageId: "requirements-lite", mode: "greenfield" }).skills, ["factory-analysis:delta-spec"]);
  assert.deepEqual(procedureKnowledge(pack, "planner", { stageId: "planning", mode: "change-request" }).skills, ["factory-analysis:task-decomposition"]);
  assert.deepEqual(procedureKnowledge(pack, "planner", { stageId: "requirements-lite", mode: "change-request" }).skills, ["factory-analysis:task-decomposition", "factory-analysis:test-planning"]);
  assert.deepEqual(procedureKnowledge(pack, "intake-normaliser", { stageId: "intake", mode: "greenfield" }).skills, ["factory-analysis:normalise-intake", "factory-analysis:guided-interview"]);

  const green = makeProject(`packs:\n  factory-analysis: "${V2("factory-analysis")}"\npipeline:\n  stages:\n    requirements:\n      agents: ["factory-analysis:requirements-analyst"]\n`);
  makeFeature(green, { mode: "greenfield", stages: ["requirements"] });
  const greenStep = conductor.step(green);
  assert.equal(greenStep.action, "dispatch", greenStep.reason ?? greenStep.action);
  const greenPack = packOf(green, greenStep);
  assert.match(greenPack, /skills_required:\n  - factory-analysis:prd-authoring\n(?!  -)/);

  const lite = makeProject(`packs:\n  factory-analysis: "${V2("factory-analysis")}"\npipeline:\n  profiles:\n    test: [requirements-lite]\n  stages:\n    requirements-lite:\n      pack: factory-analysis\n      agents: ["factory-analysis:requirements-analyst"]\n`);
  makeFeature(lite, { mode: "change-request", stages: ["requirements-lite"] });
  const liteStep = conductor.step(lite);
  assert.equal(liteStep.action, "dispatch", liteStep.reason ?? liteStep.action);
  const analyst = readFileSync(join(lite, liteStep.dispatches[0].pack), "utf8");
  assert.match(analyst, /skills_required:\n  - factory-analysis:delta-spec\n(?!  -)/);

  const patch = makeProject(`packs:\n  factory-analysis: "${V2("factory-analysis")}"\npipeline:\n  profiles:\n    test: [requirements-lite]\n  stages:\n    requirements-lite:\n      pack: factory-analysis\n      agents: ["factory-analysis:planner"]\n`);
  makeFeature(patch, { mode: "change-request", stages: ["requirements-lite"] });
  const patchStep = conductor.step(patch);
  assert.equal(patchStep.action, "dispatch", patchStep.reason ?? patchStep.action);
  const planner = readFileSync(join(patch, patchStep.dispatches[0].pack), "utf8");
  assert.match(planner, /skills_required:\n  - factory-analysis:task-decomposition\n  - factory-analysis:test-planning\n(?!  -)/);
});

test("skipping discovery because the baseline exists rebuilds the component inventory", () => {
  const dir = makeProject(`packs:\n  factory-analysis: "${V2("factory-analysis")}"\npipeline:\n  profiles:\n    test: [discovery, requirements]\n`);
  makeFeature(dir, { stages: ["discovery", "requirements"] });
  put(dir, ".factory/app-profile.yaml", "name: app\n");
  put(dir, ".factory/_index/capability-map.yaml", "features: []\n");
  const s = conductor.step(dir);
  assert.equal(s.action, "dispatch", s.reason ?? s.action);
  assert.equal(s.dispatches[0].stage, "requirements");
  assert.equal(existsSync(join(dir, ".factory", "_index", "component-inventory.yaml")), true);
});

test("a requirements template hint and an authority line are not tagged; a bullet is", () => {
  const counters = {};
  const out = normaliseText(["# Requirements", "", "## Users", "", "> Who uses this.", "", "- Staff", "", "authority: none", ""].join("\n"), counters, "brief.md");
  assert.match(out.text, /> Who uses this\./);
  assert.match(out.text, /^authority: none$/m);
  assert.match(out.text, /\[SRC-001\] - Staff/);
  assert.deepEqual(out.ids, ["SRC-001"]);
});

const restTopics = { scope: { status: "gap", note: "none" }, data: { status: "gap", note: "none" }, rules: { status: "gap", note: "none" }, nfr: { status: "gap", note: "none" }, acceptance: { status: "gap", note: "none" } };

async function intakeRules(dir) {
  const c = conductor.load(dir);
  const r = await runGate("intake", gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
  return r.failures.map((f) => f.rule);
}

function cover(dir, normalised, ids, topics) {
  put(dir, ".factory/context/normalised/brief.md", normalised);
  const index = YAML.parse(readFileSync(join(dir, ".factory/context/index.yaml"), "utf8"));
  index.sources[0].ids = ids;
  writeFileSync(join(dir, ".factory/context/index.yaml"), YAML.stringify(index));
  writeFileSync(join(dir, ".factory/context/coverage.yaml"), YAML.stringify({ topics }));
}

test("an empty Users heading cannot be marked covered", async () => {
  const dir = makeProject();
  makeFeature(dir);
  putIntake(dir);
  cover(dir, ["# brief.md", "", "## Users", "", "> Who uses this.", "", "## Goals", "", "[SRC-001] Staff save time.", ""].join("\n"), ["SRC-001"], {
    users: { status: "covered", sources: ["SRC-001"] },
    goals: { status: "covered", sources: ["SRC-001"] },
    ...restTopics,
  });
  const rules = await intakeRules(dir);
  assert.ok(rules.includes("heading-empty"), rules.join());
  assert.ok(rules.includes("heading-source"), rules.join());
});

test("a bullet under Users is a valid coverage source", async () => {
  const dir = makeProject();
  makeFeature(dir);
  putIntake(dir);
  cover(dir, ["# brief.md", "", "## Users", "", "[SRC-001] - Staff", "", "## Goals", "", "[SRC-002] Staff save time.", ""].join("\n"), ["SRC-001", "SRC-002"], {
    users: { status: "covered", sources: ["SRC-001"] },
    goals: { status: "covered", sources: ["SRC-002"] },
    ...restTopics,
  });
  const rules = await intakeRules(dir);
  assert.ok(!rules.includes("heading-empty") && !rules.includes("heading-source"), rules.join());

  const plain = makeProject();
  makeFeature(plain);
  putIntake(plain);
  const plainRules = await intakeRules(plain);
  assert.ok(!plainRules.includes("heading-empty") && !plainRules.includes("heading-source"), plainRules.join());
});

test("an interview with an empty inbox writes a placeholder normalised source", () => {
  const dir = makeProject();
  intake(dir, { interview: true, title: "Ordering portal" });
  const file = join(dir, ".factory", "context", "normalised", "interview.md");
  assert.equal(existsSync(file), true);
  assert.match(readFileSync(file, "utf8"), /<!-- interview:/);
  const index = YAML.parse(readFileSync(join(dir, ".factory", "context", "index.yaml"), "utf8"));
  const src = index.sources.find((s) => s.file === "interview");
  assert.equal(src.kind, "other");
  assert.equal(src.normalised_sha, undefined);
});
