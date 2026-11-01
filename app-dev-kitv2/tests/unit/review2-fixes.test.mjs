// Regression tests for the phase-2 review findings.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TEMPLATES, YAML, conductor, envelope, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const { gateContext, idCoverage, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { intake } = await import(`${ENGINE}/scripts/lib/intake.mjs`);
const { readFrontMatter } = await import(`${ENGINE}/scripts/lib/core.mjs`);
const ANALYSIS = join(TEMPLATES, "..");
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const ctxOf = (dir, stage) => {
  const c = conductor.load(dir);
  return gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config, stage });
};

test("coverage: IDs a spec merely cites (sources: [HD-1]) need not be repeated downstream", () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (s) => s.replace("sources: [SRC-001]", "sources: [SRC-001, HD-1]"));
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  const failures = idCoverage(ctxOf(dir), { inputs: ["delta-spec"], outputs: ["stories"], kinds: ["REQ", "AC", "HD"] });
  assert.deepEqual(failures, []);
});

test("coverage: a mapped note is carried by its targets, including the ACs of a mapped requirement", () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "tasks.yaml", "04-plan/tasks.yaml");
  writeFileSync(join(featureDir, "human-notes.yaml"), YAML.stringify([
    { id: "HD-1", at: "GATE-A", by: "t", text: "mapped to a REQ", status: "mapped", mapped_to: ["REQ-0001"] },
    { id: "HD-2", at: "GATE-A", by: "t", text: "still open", status: "open", mapped_to: [] },
  ]));
  const failures = idCoverage(ctxOf(dir), { inputs: ["human-notes"], outputs: ["tasks"], kinds: ["AC", "HD"] });
  assert.deepEqual(failures.map((f) => f.rule), ["note-not-carried"], "HD-1 is carried by AC-0001/AC-0002 in tasks; HD-2 is not");
  assert.match(failures[0].message, /HD-2/);
});

test("the backlog split moves note mappings with their requirements (no dangling IDs)", async () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir, { mode: "greenfield" });
  putIntake(dir);
  conductor.note(dir, { text: "Coupons and reorder both matter" });
  const d = conductor.step(dir).dispatches[0];
  putArtifact(featureDir, "prd.md", "01-requirements/prd.md");
  await conductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id, { notes_mapped: [{ id: "HD-1", to: ["REQ-0001", "REQ-0002"] }] }) });
  const cur = conductor.step(dir).dispatches[0];
  writeFileSync(join(featureDir, "digest.md"), "REQ-0001 REQ-0002 AC-0001 AC-0002 AC-0003 HD-1\n");
  await conductor.record(dir, { dispatchId: cur.id, envelopeText: envelope(cur.id) });
  conductor.approve(dir, {});
  const parentNotes = YAML.parse(readFileSync(join(featureDir, "human-notes.yaml"), "utf8"));
  assert.deepEqual(parentNotes[0].mapped_to, ["REQ-0001"]);
  const childDir = join(dir, ".factory", "features", readdirSync(join(dir, ".factory", "features")).find((n) => n.startsWith("FEAT-002")));
  const childNotes = YAML.parse(readFileSync(join(childDir, "human-notes.yaml"), "utf8"));
  assert.deepEqual(childNotes[0].mapped_to, ["REQ-0002"]);
  assert.equal(featureState(featureDir).digest.pending, true, "the pre-split digest is regenerated");
  assert.equal(featureState(childDir).digest.pending, true, "the child gets its own digest");
});

test("gate-spec checks the PRD backlog", async () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir, { mode: "greenfield" });
  putIntake(dir);
  putArtifact(featureDir, "prd.md", "01-requirements/prd.md", (s) =>
    s.replace("{ title: Reorder from order history, requirements: [REQ-0001] }", "{ title: Reorder from order history, requirements: [REQ-0001, REQ-0099] }")
      .replace("{ title: Coupons at checkout, requirements: [REQ-0002], depends_on: [Reorder from order history] }", "{ title: Coupons at checkout, requirements: [], depends_on: [Nope] }"),
  );
  const rules = (await runGate("spec", ctxOf(dir), { useCache: false })).failures.map((f) => f.rule);
  for (const r of ["unknown-req", "unplaced", "empty-entry", "unknown-dependency"]) assert.ok(rules.includes(r), `${r} in ${rules}`);
});

test("packs show the next free IDs after what agents wrote, and the stack with its architecture", async () => {
  const dir = makeProject(`packs: { factory-analysis: "${ANALYSIS}", frontend-dev-kit: "${join(ENGINE, "..", "..", "frontend-dev-kit")}" }`);
  const featureDir = makeFeature(dir);
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const s = featureState(featureDir);
  s.stage = "stories";
  s.stages.requirements.status = "passed";
  writeFileSync(join(featureDir, "state.json"), JSON.stringify(s));
  const pack = readFileSync(join(dir, conductor.step(dir).dispatches[0].pack), "utf8");
  assert.match(pack, /Next free IDs .*SRC-003.*REQ-0003.*AC-0004/);
  assert.match(pack, /Stack · frontend: frontend-dev-kit — Feature-Sliced Design/);
});

test("stage owners: an agent cannot write a sibling's output, and its exit check warns about it", () => {
  const dir = makeProject(`packs: { factory-analysis: "${ANALYSIS}" }\npipeline: { profiles: { test: [requirements, stories, architecture] } }`);
  const featureDir = makeFeature(dir, { stages: ["architecture"] });
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  const d = conductor.step(dir).dispatches[0];
  assert.equal(d.agent, "solution-architect");
  const { data, body } = readFrontMatter(join(dir, d.pack));
  assert.ok(!data.write_allow.some((w) => w.endsWith("api-contract.yaml")), "api-contract belongs to the contract-steward");
  assert.ok(data.write_allow.some((w) => w.endsWith("component-map.md")));
  assert.match(body, /Agents after you write api-contract \(contract-steward\)/);
});

test("intake: an edited inbox file becomes a new revision; --new --mode works without new files", () => {
  const dir = makeProject();
  mkdirSync(join(dir, ".factory", "inbox"), { recursive: true });
  writeFileSync(join(dir, ".factory", "inbox", "brief.md"), "First version.\n");
  intake(dir, { mode: "change-request" });
  writeFileSync(join(dir, ".factory", "inbox", "brief.md"), "Second version.\n");
  intake(dir, {});
  const index = YAML.parse(readFileSync(join(dir, ".factory", "context", "index.yaml"), "utf8"));
  assert.deepEqual(index.sources.map((s) => s.normalised), ["context/normalised/brief.md.md", "context/normalised/brief.md.r2.md"]);
  conductor.abort(dir, { reason: "wrong mode" });
  assert.equal(intake(dir, { newFeature: true, mode: "brownfield-extend" }).created, true);
});

test("gate-intake accepts interview answers recorded in another feature", async () => {
  const dir = makeProject();
  makeFeature(dir);
  putIntake(dir);
  conductor.note(dir, { text: "users are B2B buyers" });
  conductor.abort(dir, { reason: "restart" });
  intake(dir, { newFeature: true, mode: "change-request" });
  writeFileSync(join(dir, ".factory", "context", "coverage.yaml"), readFileSync(join(TEMPLATES, "fa-coverage.yaml"), "utf8").replace("users: { status: covered, sources: [SRC-001] }", "users: { status: covered, sources: [HD-1] }"));
  const r = await runGate("intake", ctxOf(dir), { useCache: false });
  assert.ok(!r.failures.some((f) => f.rule === "unknown-source"), JSON.stringify(r.failures));
});

test("a feature whose dependency was aborted halts; with several open features the oldest is picked", async () => {
  const dir = makeProject();
  makeFeature(dir);
  makeFeature(dir);
  const app = JSON.parse(readFileSync(join(dir, ".factory", "state.json"), "utf8"));
  assert.equal(conductor.load(dir).fid, "FEAT-002", "the active feature wins");
  writeFileSync(join(dir, ".factory", "state.json"), JSON.stringify({ ...app, active_feature: null }));
  assert.equal(conductor.load(dir).fid, "FEAT-001", "without an active feature, the oldest open one is picked");
  const second = join(dir, ".factory", app.features["FEAT-002"].dir);
  const s = featureState(second);
  s.depends_on = ["FEAT-001"];
  writeFileSync(join(second, "state.json"), JSON.stringify(s));
  assert.equal(conductor.step(dir, { feature: "FEAT-002" }).action, "wait");
  conductor.abort(dir, { feature: "FEAT-001", reason: "dropped" });
  const r = conductor.step(dir, { feature: "FEAT-002" });
  assert.equal(r.action, "halt");
  assert.match(r.reason, /aborted/);
});

test("a stage with a gate list runs every gate (patch tier: spec + plan)", async () => {
  const dir = makeProject(`packs: { factory-analysis: "${ANALYSIS}" }\npipeline: { profiles: { test: [requirements-lite] } }`);
  const featureDir = makeFeature(dir, { stages: ["requirements-lite"] });
  putIntake(dir);
  const agents = [];
  const models = [];
  const outputs = [
    [["delta-spec.yaml", "01-requirements/delta-spec.yaml", (t) => t.replace("sources: [SRC-001]", "sources: [SRC-999]")]],
    [["tasks.yaml", "04-plan/tasks.yaml"], ["test-plan.yaml", "04-plan/test-plan.yaml"]], // one planner writes both
  ];
  for (const files of outputs) {
    const d = conductor.step(dir).dispatches[0];
    agents.push(d.agent);
    models.push(d.model);
    for (const file of files) putArtifact(featureDir, file[0], file[1], file[2]);
    var r = await conductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  }
  assert.deepEqual(agents, ["requirements-analyst", "planner"]);
  assert.deepEqual(models, ["sonnet", "sonnet"], "a patch plans on sonnet (stage.models)");
  assert.equal(r.verdict, "retry");
  assert.equal(r.gate.gate, "spec+plan");
  assert.ok(r.gate.failures.some((f) => f.rule === "unknown-source"), "the patch tier's delta-spec is spec-gated");
});
