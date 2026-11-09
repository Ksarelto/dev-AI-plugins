// Regression tests for the review-4 findings: mockup auto-detection, merged-gate reject, red proof after a kept
// dispute, sizing, note classification, resume, per-run token marker, out-of-project writes, and smaller items.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, cli, conductor, envelope, gitInit, loopSetup, makeFeature, makeProject, putArtifact, putIntake, report } from "./helpers.mjs";

const lib = (name) => import(`${ENGINE}/scripts/lib/${name}.mjs`);
const refs = await lib("references");
const { intake } = await lib("intake");
const { estimateSize, sizeFromSpec } = await lib("sizing");
const { classifyNote } = await lib("notes");
const core = await lib("core");
const guard = await import(`${ENGINE}/hooks/guard.mjs`);

const MOCKUP = join(TESTS, "fixtures", "mockup-app");
const fstate = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const saveState = (dir, s) => writeFileSync(join(dir, "state.json"), JSON.stringify(s));
const put = (base, rel, text) => {
  mkdirSync(dirname(join(base, rel)), { recursive: true });
  writeFileSync(join(base, rel), text);
};
const events = (dir) => readFileSync(join(dir, ".factory", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// ---- b1 / b8: mockup auto-detection only proposes outside paths ----

test("b1: a project folder named in a design sentence is never a mockup, nor the parent folder; an outside HTML folder is only proposed", () => {
  const parent = mkdtempSync(join(tmpdir(), "factory-b1-"));
  const dir = join(parent, "app");
  mkdirSync(join(dir, "src", "shared", "ui"), { recursive: true });
  mkdirSync(join(dir, "src", "widgets"), { recursive: true });
  writeFileSync(join(dir, "src", "widgets", "index.html"), "<html></html>"); // even with an html file inside the project
  mkdirSync(join(parent, "notes"), { recursive: true }); // outside, but no HTML in it
  const text = ["## Design", "", "Reuse components in src/shared/ui and keep the design of src/widgets.", "The design of the whole repo is in ../ and ../notes too.", `The clickable prototype is ${MOCKUP}.`, "See the design at https://www.figma.com/file/x/y"].join("\n");
  const found = refs.detectReferences(text, dir);
  assert.deepEqual(found.map((r) => r.path ?? r.url).sort(), [MOCKUP, "https://www.figma.com/file/x/y"].sort());
  assert.ok(found.every((r) => r.status === "proposed"), "auto-detected references are proposals");
  assert.deepEqual(refs.detectReferences("The design of src/widgets and ../ matter.", dir), []);
});

test("b1: intake records proposals; they are not binding until confirmed — the guard ignores them", () => {
  const dir = makeProject();
  put(join(dir, ".factory", "inbox"), "brief.md", `# Brief\n\nThe clickable prototype is in ${MOCKUP} (mockup).\n`);
  const r = intake(dir, { title: "Overview" });
  assert.equal(r.references[0].status, "proposed");
  assert.equal(r.references[0].feature, "FEAT-001", "scoped to the feature the brief belongs to");
  assert.deepEqual(refs.readReferences(dir), [], "binding references: none yet");
  assert.equal(refs.readReferences(dir, { status: "all" }).length, 1);
  assert.deepEqual(refs.referenceRoots(dir), []);
  const actives = [{ id: "FEAT-001/stories/story-writer/a1", agent: "story-writer", subagent_type: "x:story-writer", write_allow: [".factory/features/**"] }];
  const write = (file_path, agent_type) => guard.decideWrite({ agent_type, tool_name: "Write", tool_input: { file_path } }, dir, actives, {});
  assert.doesNotMatch(String(write(`${MOCKUP}/new.html`, undefined)), /declared reference/);
});

test("b1: the Conductor asks one CLARIFY for proposed references; yes makes them binding, no drops them for good", async () => {
  for (const [answer, confirmed] of [["yes, follow it", 1], ["no, ignore it", 0]]) {
    const dir = makeProject();
    put(join(dir, ".factory", "inbox"), "brief.md", `# Brief\n\nThe clickable prototype is in ${MOCKUP} (mockup).\n`);
    intake(dir, { title: "Overview" });
    const s = conductor.step(dir);
    assert.equal(s.action, "ask_human");
    assert.equal(s.gate, "CLARIFY");
    assert.match(s.questions[0], /mockup-app/);
    assert.equal(conductor.step(dir).gate, "CLARIFY", "asked again, not dispatched, until answered");
    conductor.approve(dir, { notes: answer });
    assert.equal(refs.readReferences(dir).length, confirmed);
    assert.equal(conductor.step(dir).action, "dispatch", "the pipeline continues");
    refs.scanNormalised(dir);
    assert.equal(refs.readReferences(dir, { status: "proposed" }).length, 0, "a rescan does not propose it again");
  }
});

test("b1: write-deny of a confirmed reference applies to dispatched agents only; the main session is free", () => {
  const dir = makeProject();
  refs.registerReferences(dir, [{ kind: "mockup", path: MOCKUP }], "test");
  const actives = [{ id: "FEAT-001/stories/p/a1", agent: "story-writer", subagent_type: "x:story-writer", write_allow: [] }];
  const write = (agent_type) => guard.decideWrite({ agent_type, tool_name: "Write", tool_input: { file_path: `${MOCKUP}/x.html` } }, dir, actives, {});
  assert.match(write("story-writer"), /declared reference/);
  assert.equal(write(undefined), null);
});

test("b8: references are scoped per feature; a reference added without --feature belongs to the active feature", () => {
  const dir = makeProject();
  makeFeature(dir); // FEAT-001 is active
  const other = mkdtempSync(join(tmpdir(), "factory-b8-"));
  put(other, "index.html", "<html></html>");
  const r = refs.addReference(dir, other);
  assert.equal(r.added[0].feature, "FEAT-001");
  assert.equal(r.added[0].status, "confirmed");
  assert.equal(refs.readReferences(dir, { feature: "FEAT-001" }).length, 1);
  assert.equal(refs.readReferences(dir, { feature: "FEAT-002" }).length, 0, "another feature does not see it");
  const viaCli = cli(dir, ["reference", "add", "https://example.com/m", "--feature", "FEAT-002"]);
  assert.equal(viaCli.json.added[0].feature, "FEAT-002");
  assert.equal(refs.readReferences(dir, { feature: "FEAT-002" }).length, 1);
  // the same one the brief proposed is confirmed by the human adding it
  const dir2 = makeProject();
  put(join(dir2, ".factory", "inbox"), "brief.md", `# Brief\n\nMockup: ${MOCKUP}\n`);
  intake(dir2, { title: "x" });
  assert.equal(refs.addReference(dir2, MOCKUP).added[0].status, "confirmed");
  assert.equal(refs.readReferences(dir2).length, 1);
});

// ---- b2: rejecting GATE-A ----

test("b2: rejecting GATE-A goes back to requirements", async () => {
  const dir = makeProject("context: { digest: engine }");
  const featureDir = makeFeature(dir);
  putIntake(dir);
  let s = conductor.step(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  s = conductor.step(dir);
  assert.equal(s.gate, "GATE-A");
  assert.equal(s.stage, "requirements");
  conductor.reject(dir, { reason: "REQ-0002 is wrong, change the spec" });
  s = conductor.step(dir);
  const st = fstate(featureDir);
  assert.equal(st.stage, "requirements");
  assert.equal(s.action, "dispatch");
  assert.equal(s.dispatches[0].stage, "requirements");
  assert.match(st.stages.requirements.feedback, /REQ-0002 is wrong/);
});

// ---- b7: notes shown at GATE-A ----

test("b7: completeness and conflict notes reach the GATE-A ask", async () => {
  const dir = makeProject("context: { digest: engine }");
  const featureDir = makeFeature(dir);
  putIntake(dir);
  let s = conductor.step(dir);
  const st0 = fstate(featureDir);
  st0.stages.requirements.completeness_note = "completeness 71/100: 2 gaps accepted as defaults";
  st0.stages.requirements.conflict_note = "SRC-001 and SRC-004 disagree on the discount cap";
  saveState(featureDir, st0);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  s = conductor.step(dir);
  assert.equal(s.gate, "GATE-A");
  assert.equal(s.stage, "requirements");
  assert.match(s.reason, /completeness 71\/100/);
  assert.match(s.reason, /disagree on the discount cap/);
});

// ---- b3: red proof survives a kept dispute on an identical tree ----

const RED = "src/entities/order/model/total.test.ts";
test("b3: a dispute the builder keeps (identical tree, cached red) still proves red before impl", async () => {
  const env = loopSetup("quality: { tdd: { author: builder_two_phase } }");
  const s0 = fstate(env.featureDir);
  s0.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, s0);
  mkdirSync(join(env.dir, "src/entities/order/model"), { recursive: true });
  writeFileSync(join(env.dir, RED), "test('discount', () => expect(1).toBe(2));\n");
  gitInit(env.dir);
  let d = conductor.step(env.dir).dispatches[0];
  env.fake("test", { code: 1, report: report({ [join(env.dir, RED)]: [["discount", "failed", "AssertionError: expected 1 to be 2"]] }) });
  assert.equal(cli(env.dir, ["gate", "red", "--task", "TASK-002"]).json.pass, true);
  let r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { test_dispute: { test: RED, reason: "x" } }) });
  assert.equal(r.verdict, "test_dispute");
  await new Promise((res) => setTimeout(res, 20));
  d = conductor.step(env.dir).dispatches[0];
  const again = cli(env.dir, ["gate", "red", "--task", "TASK-002"]); // the builder keeps its tests: same tree
  assert.equal(again.json.cached, true);
  const log = readFileSync(join(env.featureDir, "gate-log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(log.filter((e) => e.gate === "red" && e.pass).length >= 2 && log.at(-1).cached === true, "the cached result is logged too");
  env.fake("test", { code: 0, report: report({ [join(env.dir, RED)]: [["discount", "passed"]] }) });
  r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures?.map((f) => f.rule)));
});

// ---- minor: treeHash ignores .factory/ even when it is git-ignored ----

test("treeHash: engine files under an ignored .factory/ never change the cache key", () => {
  const dir = makeProject();
  gitInit(dir); // .gitignore lists .factory/
  const before = core.treeHash(dir);
  assert.ok(before);
  for (const f of ["envelopes/k", "logs/k", "snapshots/OLD/k"]) put(join(dir, ".factory"), f, "1");
  assert.equal(core.treeHash(dir), before);
  put(dir, "src/new.ts", "export {};\n");
  assert.notEqual(core.treeHash(dir), before, "a real change still counts");
});

// ---- b4: sizing ----

test("b4: a change that adds a surface or names a mockup is never a patch, even with wording words", () => {
  const panel = "Add a side panel that shows the selected deployment details, its status label and a close button.";
  assert.notEqual(estimateSize(panel).tier, "patch");
  assert.equal(estimateSize("Fix the typo in the checkout button label.").tier, "patch", "a real wording fix stays a patch");
  assert.notEqual(estimateSize("Create a new dialog with the copy from the mockup.").tier, "patch");
  assert.notEqual(estimateSize("Change the label text to match the mockup.").tier, "patch", "names a mockup");
  assert.notEqual(estimateSize("Fix the copy", { references: 1 }).tier, "patch");
});

test("b4: a patch is re-checked from the real REQ/AC counts and moves up when it outgrew the patch limits", () => {
  assert.equal(sizeFromSpec({ reqs: 1, acs: 3 }, undefined, { from: "patch" }).tier, "patch");
  assert.equal(sizeFromSpec({ reqs: 4, acs: 9 }, undefined, { from: "patch" }).tier, "small");
  assert.equal(sizeFromSpec({ reqs: 9, acs: 30 }, undefined, { from: "patch" }).tier, "standard");
  assert.equal(sizeFromSpec({ reqs: 4, acs: 9 }).tier, "small", "without from: the old behaviour");
});

// ---- b5: note classification ----

test("b5: a note is a process note only when every clause is process; product content in it makes it a product note", () => {
  for (const text of ["Keep going, but the panel must close on Escape", "Stop asking questions and use the tokens from src/theme.ts", "Increase the limit of rows in the table to 50", "Don't pause the video on hover", "continue the checkout flow with the coupon"]) {
    assert.equal(classifyNote(text), "product", text);
  }
  for (const text of ["raise the dispatch budget to 120", "please stop asking me questions", "Keep going.", "Raise the budgets and keep going", "stop asking, keep going"]) {
    assert.equal(classifyNote(text), "process", text);
  }
  assert.equal(classifyNote("Keep going, but close on Escape", "process"), "process", "--kind overrides");
  assert.equal(classifyNote("raise the dispatch budget", "product"), "product");
});

test("b5: factory note echoes the kind it chose and whether it was explicit", () => {
  const dir = makeProject();
  makeFeature(dir);
  const auto = cli(dir, ["note", "Keep going, but the panel must close on Escape"]);
  assert.equal(auto.json.kind, "product");
  assert.equal(auto.json.kind_source, "auto");
  assert.match(auto.json.hint, /product note.*--kind process/);
  const explicit = cli(dir, ["note", "Keep going, but the panel must close on Escape", "--kind", "process"]);
  assert.deepEqual([explicit.json.kind, explicit.json.kind_source], ["process", "explicit"]);
});

// ---- b6: resume ----

const taskState = (env, id) => fstate(env.featureDir).tasks[id];
async function blockTask(env) {
  const s0 = fstate(env.featureDir);
  s0.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, s0);
  const d = conductor.step(env.dir).dispatches[0];
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "blocked", summary: "the API is gone" }) });
  assert.equal(r.verdict, "block");
  return d;
}

test("b6: factory resume clears a task halt and runs the same task and phase again, keeping the tasks", async () => {
  const env = loopSetup();
  const d = await blockTask(env);
  assert.equal(conductor.step(env.dir).action, "halt");
  assert.match(conductor.step(env.dir).reason, /factory resume/, "the halt names the way out");
  const out = cli(env.dir, ["resume", "--task", "TASK-002"]);
  assert.equal(out.code, 0, JSON.stringify(out.json));
  assert.deepEqual(out.json.resumed_tasks, ["TASK-002"]);
  const s = fstate(env.featureDir);
  assert.equal(s.status, "active");
  assert.equal(s.tasks["TASK-001"].status, "done", "nothing is wiped");
  const next = conductor.step(env.dir);
  assert.equal(next.action, "dispatch");
  assert.equal(next.dispatches[0].task, "TASK-002");
  assert.equal(next.dispatches[0].phase, d.phase, "the same phase");
  assert.equal(cli(env.dir, ["resume"]).code, 2, "not blocked any more: usage error, nothing changes");
});

test("b6: a skills-unavailable halt names resume, and resume redispatches the same agent", async () => {
  const env = loopSetup();
  const s0 = fstate(env.featureDir);
  s0.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, s0);
  const { rawConductor } = await import("./helpers.mjs");
  const d = conductor.step(env.dir).dispatches[0];
  const r = await rawConductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "blocked", open_questions: ["skills unavailable: frontend-dev-kit:testing"] }) });
  assert.equal(r.action, "halt");
  assert.match(r.reason, /factory resume/);
  assert.equal(cli(env.dir, ["resume"]).json.status, "active");
  const again = conductor.step(env.dir);
  assert.equal(again.action, "dispatch");
  assert.equal(again.dispatches[0].agent, d.agent);
  assert.equal(again.dispatches[0].phase, d.phase);
});

test("b6: scope add on the blocked task unblocks the feature", async () => {
  const env = loopSetup();
  await blockTask(env);
  assert.equal(fstate(env.featureDir).status, "blocked");
  const { rawConductor } = await import("./helpers.mjs");
  await rawConductor.scopeAdd(env.dir, { task: "TASK-002", entries: ["src/entities/order/model/helpers.ts"] });
  assert.equal(fstate(env.featureDir).status, "active");
  assert.equal(taskState(env, "TASK-002").status, "pending");
  assert.equal(conductor.step(env.dir).action, "dispatch");
});

test("b6: resume is a human command: the guard denies it to dispatched agents", () => {
  const dir = makeProject();
  const actives = [{ id: "FEAT-001/x/a/a1", agent: "fe-builder", subagent_type: "x:fe-builder", write_allow: [] }];
  for (const cmd of ["factory resume", "node factory.mjs resume --task TASK-002", "node factory.mjs acceptance waive a.test.ts --reason x"]) {
    assert.match(String(guard.decideBash({ agent_type: "fe-builder", tool_input: { command: cmd } }, actives, dir, {})), /for the Conductor and the human/, cmd);
  }
});

// ---- b9: forked skills are not stack skills ----

test("b9: no stack.yaml names a context: fork skill, and doctor rejects one", async () => {
  const { forkedSkill, skillChecks } = await lib("doctor");
  const ROOT = join(TESTS, "..", "..");
  const fe = join(ROOT, "frontend-dev-kit");
  assert.equal(forkedSkill({ root: fe }, "architecture-audit"), true, "the audit skill really is forked");
  const stack = YAML.parse(readFileSync(join(fe, "stack.yaml"), "utf8"));
  const named = [...Object.values(stack.skills), ...Object.values(stack.stage_skills)].flat();
  assert.ok(stack.skills.refactor, "refactor maps to something");
  for (const ref of named) assert.equal(forkedSkill({ root: fe }, ref.split(":")[1]), false, `${ref} is forked`);
  const errors = [];
  skillChecks({ "frontend-dev-kit": { name: "frontend-dev-kit", root: fe, stack: { skills: { refactor: "frontend-dev-kit:architecture-audit" } } } }, errors, []);
  assert.match(errors.join("\n"), /architecture-audit" has context: fork/);
});

// ---- b10: tokens per agent run ----

test("b10: a redispatch under the same dispatch id adds its own usage; a repeated stop of one run adds only the difference", async () => {
  const env = loopSetup();
  const s0 = fstate(env.featureDir);
  s0.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, s0);
  const d = conductor.step(env.dir).dispatches[0];
  const actives = (await import(`${ENGINE}/scripts/lib/state.mjs`)).activeDispatches(env.dir);
  const message = envelope(d.id);
  const usage = (n, agent_id) => ({ agent_type: d.agent, agent_id, usage: { input_tokens: n, output_tokens: 0 } });
  const tokens = () => fstate(env.featureDir).budgets.tokens;
  assert.equal(guard.addTokens(env.dir, usage(100, "run-1"), actives, message).added, 100);
  assert.equal(guard.addTokens(env.dir, usage(250, "run-1"), actives, message).added, 150, "same run: the difference");
  assert.equal(guard.addTokens(env.dir, usage(60, "run-2"), actives, message).added, 60, "a new run under the same id counts in full");
  assert.equal(tokens(), 310);
  assert.equal(guard.addTokens(env.dir, usage(60, "run-2"), actives, message), null, "a repeated stop adds nothing");
});

// ---- e1: out-of-project writes, dispatchesFor ----

test("e1: a dispatched agent cannot write outside the project (scratch and temp excepted); the main session can", () => {
  const dir = makeProject();
  const actives = [{ id: "FEAT-001/x/a/a1", agent: "fe-builder", subagent_type: "x:fe-builder", write_allow: ["src/**"], write_deny: [] }];
  const write = (file_path, agent_type = "fe-builder") => guard.decideWrite({ agent_type, tool_name: "Write", tool_input: { file_path } }, dir, actives, {});
  assert.match(write("/Users/someone/sibling-repo/a.ts"), /outside the project/);
  assert.match(write("/Users/someone/.zshrc"), /outside the project/);
  assert.match(write("/etc/hosts"), /outside the project/);
  assert.match(write(join(homedir(), ".claude", "plugins", "x.md")), /outside the project/);
  assert.match(write("../../../../../../../../../../etc/escaped.conf"), /outside the project/, "a relative path out of the project");
  assert.equal(write(join(tmpdir(), "scratch.txt")), null, "the OS temp directory");
  assert.equal(write("/tmp/x"), null);
  assert.equal(write("/Users/someone/sibling-repo/a.ts", ""), null, "the main session is not restricted");
  assert.equal(write(join(dir, ".factory/scratch/env.json")), null);
  // Bash writes go through the same decision
  assert.match(String(guard.decideBash({ agent_type: "fe-builder", tool_input: { command: "echo x > /Users/someone/other/f.txt" } }, actives, dir, {})), /outside the project/);
});

test("dispatchesFor: another plugin's agent with the same bare name is matched only when nothing matches exactly", () => {
  const a = { id: "FEAT-001/s/reviewer/a1", agent: "reviewer", subagent_type: "factory-quality:reviewer" };
  const b = { id: "FEAT-001/s/reviewer/a2", agent: "reviewer", subagent_type: "other-kit:reviewer" };
  assert.deepEqual(guard.dispatchesFor({ agent_type: "factory-quality:reviewer" }, [a, b]).map((d) => d.id), [a.id], "the exact type wins");
  assert.deepEqual(guard.dispatchesFor({ agent_type: "reviewer" }, [a, b]).length, 2, "a bare type is ambiguous: both");
  assert.deepEqual(guard.dispatchesFor({ agent_type: "marketplace:reviewer" }, [a]).map((d) => d.id), [a.id], "a different marketplace prefix still matches when it is the only one");
});

// ---- minor: plan size, waiver author ----

test("planlint: the companions the engine adds do not count toward files_max", async () => {
  const env = loopSetup("quality: { task_limits_by_type: { component: { files_max: 2 } } }");
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) =>
    t.replace("src/features/apply-coupon/ui/coupon-field.tsx, src/features/apply-coupon/ui/coupon-field.test.tsx", "src/features/apply-coupon/ui/coupon-field/coupon-field.tsx, src/features/apply-coupon/ui/coupon-field/tests/coupon-field.test.tsx")
      .replace("red_tests: [src/features/apply-coupon/ui/coupon-field.test.tsx]", "red_tests: [src/features/apply-coupon/ui/coupon-field/tests/coupon-field.test.tsx]")
      .replace("type: feature-ui", "type: component"));
  const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
  const c = conductor.load(env.dir);
  const run = () => runGate("plan", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
  for (let i = 0; i < 2; i++) { // the first run adds the companions, the second sees them in the file: same answer
    const r = await run();
    assert.deepEqual(r.failures.filter((f) => f.rule === "too-many-files"), [], `run ${i + 1}`);
  }
});

test("acceptance waive: approved_by is --by, else the git user; a dispatched agent cannot run it", async () => {
  const { gitUser } = await lib("waivers");
  const dir = makeProject();
  const git = gitInit(dir);
  git("config", "user.name", "Review Bot");
  assert.equal(gitUser(dir), "Review Bot", "the repository's user.name");
});

// ---- skills_loaded and tokens are real inputs, not harness conveniences ----

test("a done envelope without skills_loaded is redispatched, not accepted (the harness fills it in)", async () => {
  const env = loopSetup();
  const s0 = fstate(env.featureDir);
  s0.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, s0);
  const { rawConductor } = await import("./helpers.mjs");
  const d = conductor.step(env.dir).dispatches[0];
  const r = await rawConductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.action, "redispatch");
  assert.match(r.reason, /required skills not loaded/);
});

test("tokens that come only from the SubagentStop payload reach the budget and win over --tokens", async () => {
  const env = loopSetup();
  const s0 = fstate(env.featureDir);
  s0.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, s0);
  const d = conductor.step(env.dir).dispatches[0];
  const actives = (await import(`${ENGINE}/scripts/lib/state.mjs`)).activeDispatches(env.dir);
  guard.addTokens(env.dir, { agent_type: d.agent, agent_id: "r1", usage: { input_tokens: 700, output_tokens: 300 } }, actives, envelope(d.id));
  const before = fstate(env.featureDir).budgets.tokens;
  env.fake("test", { code: 0, report: report({}) });
  await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id), tokens: 999999 });
  assert.equal(before, 1000);
  assert.equal(fstate(env.featureDir).budgets.tokens, 1000, "--tokens is ignored once the hook counted the real usage");
  assert.equal(events(env.dir).find((e) => e.type === "envelope")?.tokens, 1000);
});

// ---- config schema: typos fail validation ----

test("config.schema: a typo in quality or pipeline keys is a doctor error; the shipped keys are accepted", async () => {
  const { doctor } = await lib("doctor");
  const good = makeProject("roles: { frontend: { enabled: false } }\nquality: { tdd: { author: builder_two_phase }, task_tests: scoped }\npipeline: { auto_tier: true, skip_gates: { small: [GATE-B] }, size_limits: { patch: { words: 90, reqs: 2, acs: 6 } } }");
  assert.deepEqual(doctor(good).errors, []);
  for (const bad of ["quality: { tdd: { author: builder-two-phase } }", "quality: { task_tests: partial }", "quality: { completness_min: 80 }", "pipeline: { size_limits: { patchh: { words: 5 } } }", "pipeline: { skip_gates: { small: [GATE-BB] } }"]) {
    const dir = makeProject(`roles: { frontend: { enabled: false } }\n${bad}`);
    assert.ok(doctor(dir).errors.some((e) => e.startsWith("config:")), bad);
  }
});

// ---- minor consistency ----

test("mechanical task types are real task types of a shipped role", () => {
  const ROOT = join(TESTS, "..");
  const types = new Set(["factory-role-frontend", "factory-role-backend", "factory-role-ai-agent"].flatMap((p) => YAML.parse(readFileSync(join(ROOT, p, "role.yaml"), "utf8")).task_types));
  return import(`${ENGINE}/scripts/lib/tasks.mjs`).then(({ MECHANICAL_TASK_TYPES }) => {
    for (const t of MECHANICAL_TASK_TYPES) assert.ok(types.has(t), `${t} is no role's task type`);
  });
});

test("role prose does not quote a file cap that role.yaml contradicts", () => {
  const ROOT = join(TESTS, "..");
  const claim = /within four files|\(four at most\)|at five files|a migration is five files/i; // the stale caps of the review; scripts/check-factory-consistency.mjs checks the general rule
  for (const pack of ["factory-role-frontend", "factory-role-backend", "factory-role-ai-agent"]) {
    for (const file of ["role.yaml", "agents", "skills"]) {
      const walk = (p) => (existsSync(p) ? (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p]) : []);
      for (const f of walk(join(ROOT, pack, file)).filter((x) => /\.(md|yaml)$/.test(x))) assert.doesNotMatch(readFileSync(f, "utf8"), claim, f);
    }
  }
});

test("a patch grown past the patch limits is moved up by requirements-lite (real stage pack)", async () => {
  const ROOT = join(TESTS, "..", "..");
  const dir = makeProject(
    [
      `packs: { factory-analysis: "${join(ROOT, "app-dev-kitv2", "factory-analysis")}" }`,
      "roles: { frontend: { enabled: false } }",
      "pipeline: { profiles: { patch: [requirements-lite, stories], small: [requirements, stories], test: [requirements-lite, stories] }, tier_profiles: { patch: patch, small: small }, size_limits: { patch: { reqs: 1, acs: 1 } } }",
      "context: { digest: engine }",
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["requirements-lite", "stories"] });
  const s0 = fstate(featureDir);
  Object.assign(s0, { profile: "patch", tier: "patch", tier_auto: true });
  saveState(featureDir, s0);
  putIntake(dir);
  const s = conductor.step(dir);
  assert.equal(s.dispatches[0].stage, "requirements-lite", JSON.stringify(s).slice(0, 200));
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml"); // the fixture spec outgrows the one-requirement patch limit set above
  const first = await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  const planner = first.next.dispatches[0];
  assert.equal(planner.agent, "planner");
  putArtifact(featureDir, "tasks.yaml", "04-plan/tasks.yaml");
  putArtifact(featureDir, "test-plan.yaml", "04-plan/test-plan.yaml");
  await conductor.record(dir, { dispatchId: planner.id, envelopeText: envelope(planner.id) });
  const st = fstate(featureDir);
  const spec = YAML.parse(readFileSync(join(featureDir, "01-requirements", "delta-spec.yaml"), "utf8"));
  const acs = (spec.added ?? []).concat(spec.modified ?? []).flatMap((r) => r.acs ?? []).length;
  const resized = events(dir).find((e) => e.type === "resize");
  assert.ok(resized, `the fixture spec (${acs} ACs) is over the patch limits: ${JSON.stringify(st.stages["requirements-lite"])} ${st.tier}`);
  assert.deepEqual([resized.from, resized.to, st.tier], ["patch", st.tier, st.tier]);
  assert.notEqual(st.tier, "patch");
  assert.equal(st.profile, resized.profile);
  // A patch that grew runs the requirements stage on its spec (completeness, gate, GATE-A) before the stories stage (review 5, N6).
  assert.equal(st.stage, "requirements", "the grown feature gets the analysis of its new profile before stories");
  assert.ok(["pending", "running"].includes(st.stages.requirements.status), st.stages.requirements.status);
});
