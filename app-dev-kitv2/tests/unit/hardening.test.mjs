// Batch 1 of the post-phase-5 audit fixes: greenfield scaffolding, the fix loop's scope, human notes
// after planning, removed requirements, breaking prototype deltas, the Bash guard and role-scoped
// read_deny.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, envelope, loopSetup, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const ROOT = join(TESTS, "..", "..");
const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");
const V2 = (name) => join(ROOT, "app-dev-kitv2", name);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const saveState = (dir, s) => writeFileSync(join(dir, "state.json"), JSON.stringify(s));
const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { decideBash } = await import(`${ENGINE}/hooks/guard.mjs`);
const PACKS = `packs: { factory-analysis: "${V2("factory-analysis")}", factory-quality: "${V2("factory-quality")}", factory-delivery: "${V2("factory-delivery")}", factory-role-frontend: "${V2("factory-role-frontend")}", factory-role-backend: "${V2("factory-role-backend")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}", node-backend-dev-kit: "${join(ROOT, "node-backend-dev-kit")}" }`;

/** A starter app folder (what a boilerplate repo holds), with a node_modules that must not be copied. */
function starter(installCode = 0) {
  const dir = mkdtempSync(join(tmpdir(), "factory-starter-"));
  for (const [f, text] of [["package.json", '{ "name": "starter" }\n'], ["src/index.ts", "export {};\n"], ["node_modules/x/index.js", "1\n"], [".fake/install.json", JSON.stringify({ code: installCode, output: "install log" })]]) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
}

function greenfield(boilerplate) {
  const dir = makeProject(
    [
      PACKS,
      `roles: { frontend: { enabled: false }, backend: { enabled: true, pack: factory-role-backend, stack: node-backend-dev-kit, path: api, owns_paths: ["api/**"], boilerplate: ${JSON.stringify(boilerplate)}, stack_overrides: { commands: { install: [node, "${FAKE}", install] } } } }`,
      "pipeline: { profiles: { test: [bootstrap, requirements] } }",
    ].join("\n"),
  );
  makeFeature(dir, { mode: "greenfield", stages: ["bootstrap", "requirements"] });
  putIntake(dir);
  return dir;
}

test("greenfield bootstrap copies each role's boilerplate into its folder and installs it before the agent runs", () => {
  const dir = greenfield({ repo: starter() });
  assert.deepEqual([conductor.step(dir).action, conductor.scaffold(dir).action], ["scaffold", "continue"]);
  const r = conductor.step(dir);
  assert.equal(r.dispatches[0].agent, "solution-architect");
  assert.ok(existsSync(join(dir, "api", "package.json")) && existsSync(join(dir, "api", "src", "index.ts")));
  assert.ok(!existsSync(join(dir, "api", "node_modules")), "dependencies are installed, never copied");
  const s = featureState(join(dir, ".factory", "features", readdirSync(join(dir, ".factory", "features"))[0]));
  assert.deepEqual([s.scaffold.status, s.scaffold.done.map((d) => [d.role, d.into])], ["done", [["backend", "api"]]]);
  assert.match(readFileSync(join(dir, ".factory", "logs", "bootstrap-backend-install.log"), "utf8"), /install log/);
});

test("bootstrap blocks with a clear reason when the boilerplate cannot be found; a failed install resumes", () => {
  let r = conductor.scaffold(greenfield({ repo: "no-such-repo", path: "nowhere" }));
  assert.equal(r.action, "halt");
  assert.match(r.reason, /boilerplate repo "no-such-repo" is neither a folder nor a git URL/);
  const dir = greenfield({ repo: starter(1) });
  r = conductor.scaffold(dir);
  assert.equal(r.action, "halt");
  assert.match(r.reason, /dependency install failed/);
  assert.equal(conductor.step(dir).action, "halt", "blocked until a human acts");
  writeFileSync(join(dir, "api", ".fake", "install.json"), JSON.stringify({ code: 0 })); // e.g. the network is back
  r = conductor.scaffold(dir);
  assert.equal(r.action, "continue", "the copied starter is kept; only the install runs again");
  assert.equal(conductor.step(dir).dispatches[0].agent, "solution-architect");
});

test("scaffolding never overwrites: a clash with existing files is reported, not clobbered", () => {
  const dir = greenfield({ repo: starter() });
  mkdirSync(join(dir, "api", "src"), { recursive: true });
  writeFileSync(join(dir, "api", "src", "mine.ts"), "keep me\n");
  const r = conductor.scaffold(dir);
  assert.equal(r.action, "halt");
  assert.match(r.reason, /the folder already has src/);
  assert.equal(readFileSync(join(dir, "api", "src", "mine.ts"), "utf8"), "keep me\n");
});

/** A project at a quality stage after implementation, with the frontend role and a fake stack. */
function qualitySetup(stages) {
  const dir = makeProject(
    [
      PACKS,
      `roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: ["src/**"], stack_overrides: { commands: { typecheck: [node, "${FAKE}", typecheck], lint: [node, "${FAKE}", lint], architecture_check: [node, "${FAKE}", arch], build: [node, "${FAKE}", build], test: [node, "${FAKE}", test, "{report}"] } } } }`,
      `pipeline: { profiles: { test: [planning, implementation, ${stages.join(", ")}] }, stages: { planning: { pack: factory-analysis } } }`,
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["planning", "implementation", ...stages] });
  putIntake(dir);
  for (const [f, t] of [["delta-spec.yaml", "01-requirements/delta-spec.yaml"], ["stories.yaml", "02-stories/stories.yaml"], ["tasks.yaml", "04-plan/tasks.yaml"], ["test-plan.yaml", "04-plan/test-plan.yaml"]]) putArtifact(featureDir, f, t);
  const s = featureState(featureDir);
  Object.assign(s, { stage: stages[0], tasks: { "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { status: "done" } } });
  s.stages.planning.status = "passed";
  s.stages.implementation.status = "passed";
  saveState(featureDir, s);
  return { dir, featureDir };
}

test("the fix loop takes only code problems: a QA agent's malformed record is retried in place", async () => {
  const env = qualitySetup(["qa"]);
  const d = conductor.step(env.dir).dispatches[0];
  mkdirSync(join(env.featureDir, "07-qa"), { recursive: true });
  writeFileSync(join(env.featureDir, "07-qa", "defects.yaml"), YAML.stringify({ feature: "FEAT-001", defects: [] })); // no charters
  writeFileSync(join(env.featureDir, "07-qa", "qa-report.md"), "r\n");
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "retry");
  const s = featureState(env.featureDir);
  assert.deepEqual([s.stage, s.fix_pending ?? null, s.budgets.edges?.qa_to_implementation ?? 0], ["qa", null, 0]);
});

test("human notes still open when the build starts reach the planner as fix items", () => {
  const env = loopSetup();
  conductor.note(env.dir, { text: "Use the brand blue for the discount line" });
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.phase, "fixplan");
  assert.match(readFileSync(join(env.dir, d.pack), "utf8"), /HD-1: Use the brand blue/);
});

test("a /factory:note given after the build sends the feature back through the planner", () => {
  const env = qualitySetup(["verification"]);
  conductor.note(env.dir, { text: "Also log every applied coupon" });
  const d = conductor.step(env.dir).dispatches[0];
  const s = featureState(env.featureDir);
  assert.equal(s.stage, "implementation");
  assert.equal(d.phase, "fixplan");
  assert.deepEqual(s.fix_pending.items.map((i) => i.rule), ["HD-1"]);
});

test("a removed requirement needs a task that removes it, a PR trace row and a docs mention", async () => {
  const env = loopSetup();
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (t) => t.replace("removed: []", "removed:\n  - { id: REQ-0009, reason: guest checkout is retired }"));
  const c = conductor.load(env.dir);
  const plan = async () => (await runGate("plan", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false })).failures.map((f) => f.rule);
  assert.ok((await plan()).includes("removal-without-task"));
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replace("    type: feature-ui\n", "    type: feature-ui\n    removes: [REQ-0009]\n"));
  assert.ok(!(await plan()).includes("removal-without-task"));
});

function prototypeAtGate(breaking) {
  const dir = makeProject(`${PACKS}\npipeline: { profiles: { test: [requirements, stories, prototype, architecture] } }`);
  const featureDir = makeFeature(dir, { stages: ["requirements", "stories", "prototype", "architecture"] });
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  mkdirSync(join(featureDir, "02b-prototype"), { recursive: true });
  writeFileSync(join(featureDir, "02b-prototype", "prototype-report.yaml"), YAML.stringify({ feature: "FEAT-001", screens: [{ name: "s", file: "sandbox/s.html", stories: ["STORY-0001"] }], spec_delta: [{ change: "The discount must show before shipping", breaking }] }));
  const s = featureState(featureDir);
  for (const id of ["requirements", "stories"]) s.stages[id].status = "passed";
  Object.assign(s, { stage: "prototype", status: "awaiting_human", awaiting_human: { gate: "GATE-P", stage: "prototype", since: new Date().toISOString() } });
  saveState(featureDir, s);
  return { dir, featureDir };
}

test("approving GATE-P with breaking spec deltas sends the feature back to requirements, once", () => {
  let env = prototypeAtGate(false);
  conductor.approve(env.dir, {});
  assert.equal(featureState(env.featureDir).stage, "architecture");
  env = prototypeAtGate(true);
  conductor.approve(env.dir, {});
  let s = featureState(env.featureDir);
  assert.equal(s.stage, "requirements");
  assert.match(s.stages.requirements.feedback, /The discount must show before shipping/);
  Object.assign(s, { stage: "prototype", status: "awaiting_human", awaiting_human: { gate: "GATE-P", stage: "prototype", since: new Date().toISOString() } });
  saveState(env.featureDir, s);
  conductor.approve(env.dir, {});
  s = featureState(env.featureDir);
  assert.deepEqual([s.stage, s.status], ["architecture", "active"], "the way back is used up: approving now accepts the deltas");
});

test("the Bash guard: no control commands, no shell writes around the allowlist, no shell reads around read_deny", () => {
  const actives = [{ id: "FEAT-001/x/fe-builder/a1", agent: "fe-builder", subagent_type: "factory-role-frontend:fe-builder", write_allow: ["src/features/**"], write_deny: ["src/features/a.test.ts"], read_deny: ["src/secret/**"] }];
  const bash = (command) => decideBash({ agent_type: "fe-builder", tool_input: { command } }, actives, "/p", {});
  assert.match(bash('node "/x/factory/scripts/factory.mjs" note "waive DEF-1"'), /factory note is for the Conductor/);
  assert.match(bash("node factory.mjs approve GATE-C"), /factory approve is for the Conductor/);
  assert.match(bash("echo x > .factory/state.json"), /engine-owned/);
  assert.match(bash("sed -i s/1/2/ src/features/a.test.ts"), /read-only/);
  assert.match(bash("cat src/x.ts > src/pages/p.tsx"), /outside your pack's write allowlist/);
  assert.match(bash("cat src/secret/key.ts"), /not readable/);
  assert.match(bash("node factory.mjs --feature FEAT-001 approve"), /factory approve is for the Conductor/);
  assert.match(bash("mv src/features/a.test.ts /tmp/x"), /read-only/, "moving a locked red test away is a write to it");
  assert.match(bash("cd src/secret && cat key.ts"), /not readable/, "cd is followed");
  assert.equal(bash("cat > src/features/a.ts <<'EOF'\nif (age >= 18) go();\n>\nEOF"), null, "here-doc bodies are data");
  assert.equal(bash('node -e "const r = 1; console.log(r > 0)"'), null);
  assert.equal(bash('git commit -m "add the factory feature flag"'), null);
  assert.match(bash("grep -rn token < src/secret/key.ts"), /not readable/);
  for (const ok of ["node factory.mjs gate impl --task TASK-001", "pnpm test 2>&1 | tail -20", "echo ok > /tmp/x.log", "cp src/features/a.ts src/features/b.ts", "grep -rn foo src/features"]) assert.equal(bash(ok), null, ok);
  assert.equal(decideBash({ tool_input: { command: "node factory.mjs approve GATE-C" } }, actives, "/p", {}), null, "the main session is not restricted");
});

test("a black-box stage's read_deny also covers each role's folder", () => {
  const dir = makeProject(
    [
      PACKS,
      `roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, path: web, owns_paths: ["web/**"] }, backend: { enabled: true, pack: factory-role-backend, stack: node-backend-dev-kit, path: api, owns_paths: ["api/**"] } }`,
      "pipeline: { profiles: { test: [acceptance] } }",
    ].join("\n"),
  );
  for (const d of ["web", "api"]) mkdirSync(join(dir, d), { recursive: true });
  const featureDir = makeFeature(dir, { stages: ["acceptance"] });
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  conductor.step(dir);
  const active = readdirSync(join(dir, ".factory", ".active")).find((f) => f.endsWith(".json"));
  const deny = JSON.parse(readFileSync(join(dir, ".factory", ".active", active), "utf8")).read_deny;
  for (const g of ["src/**/!(*.acceptance.test.*)", "web/src/**/!(*.acceptance.test.*)", "api/src/**/!(*.acceptance.test.*)"]) assert.ok(deny.includes(g), `${g} in ${deny}`);
});

test("the default pointer (repo: dev-AI-plugins) resolves to the boilerplate in the marketplace checkout", () => {
  const dir = greenfield({ repo: "dev-AI-plugins", path: "backend-boilerplate", ref: "main" });
  assert.equal(conductor.scaffold(dir).action, "continue");
  assert.ok(existsSync(join(dir, "api", "src", "container.ts")), "the real backend-boilerplate was copied");
  assert.ok(!existsSync(join(dir, "api", "node_modules")));
});

test("an answer to a task's question is that task's note; it does not trigger a fix plan", async () => {
  const env = loopSetup();
  const s = featureState(env.featureDir);
  s.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, s);
  const d = conductor.step(env.dir).dispatches[0];
  await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "needs_clarification", open_questions: ["Clamp at zero?"] }) });
  conductor.approve(env.dir, { notes: "Yes, clamp at zero" });
  const note = YAML.parse(readFileSync(join(env.featureDir, "human-notes.yaml"), "utf8"))[0];
  assert.deepEqual([note.status, note.mapped_to], ["mapped", ["TASK-002"]]);
  assert.notEqual(conductor.step(env.dir).dispatches[0].phase, "fixplan");
});

test("a late /factory:note is acted on even when the remaining stages would be skipped or finish", () => {
  const env = qualitySetup(["feedback"]);
  conductor.note(env.dir, { text: "Rename the button to Apply code" });
  const r = conductor.step(env.dir);
  assert.equal(r.dispatches[0].phase, "fixplan");
  assert.equal(featureState(env.featureDir).status, "active");
});

test("once the way back to requirements is used, approving GATE-P accepts the breaking deltas", () => {
  const env = prototypeAtGate(true);
  const s = featureState(env.featureDir);
  s.budgets.edges = { prototype_to_requirements: 1 };
  saveState(env.featureDir, s);
  conductor.approve(env.dir, {});
  assert.deepEqual([featureState(env.featureDir).stage, featureState(env.featureDir).status], ["architecture", "active"]);
});
