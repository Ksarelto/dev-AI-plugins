import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, YAML, conductor, envelope, makeFeature, makeProject, putArtifact, putIntake, readYamlFile } from "./helpers.mjs";

const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);

const { step, record, approve, reject } = conductor;
const featureState = (featureDir) => JSON.parse(readFileSync(join(featureDir, "state.json"), "utf8"));

function setup(extraConfig) {
  const dir = makeProject(extraConfig);
  const featureDir = makeFeature(dir);
  putIntake(dir);
  return { dir, featureDir };
}

/** Plays one scripted agent: writes its files, then records its envelope. */
async function agentDoes(env, dispatch, files = {}, extra = {}) {
  for (const [target, [fixture, transform]] of Object.entries(files)) putArtifact(env.featureDir, fixture, target, transform);
  return record(env.dir, { dispatchId: dispatch.id, envelopeText: envelope(dispatch.id, extra), tokens: 1000 });
}

test("happy path: requirements → digest → GATE-A → stories → planning → digest → GATE-B → done", async () => {
  const env = setup();
  let s = step(env.dir);
  assert.equal(s.action, "dispatch");
  assert.equal(s.dispatches[0].subagent_type, "fixture-stages:spec-writer");
  assert.equal(s.dispatches[0].model, "sonnet");
  assert.match(s.dispatches[0].prompt, /context pack/);

  let r = await agentDoes(env, s.dispatches[0], { "01-requirements/delta-spec.yaml": ["delta-spec.yaml"] });
  assert.equal(r.verdict, "advance");

  s = step(env.dir);
  assert.equal(s.dispatches[0].subagent_type, "factory:curator", "digest after requirements comes first");
  assert.equal(s.dispatches[0].model, "haiku");
  writeFileSync(join(env.featureDir, "digest.md"), "REQ-0001 REQ-0002 AC-0001 AC-0002 AC-0003\n");
  await record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });

  s = step(env.dir);
  assert.equal(s.action, "ask_human");
  assert.equal(s.gate, "GATE-A");
  assert.deepEqual(s.review, [
    ".factory/features/FEAT-001-coupons-at-checkout/01-requirements/spec.md",
    ".factory/features/FEAT-001-coupons-at-checkout/01-requirements/delta-spec.yaml",
  ]);
  approve(env.dir, {});

  s = step(env.dir);
  assert.equal(s.dispatches[0].agent, "story-writer-fx");
  r = await agentDoes(env, s.dispatches[0], { "02-stories/stories.yaml": ["stories.yaml"], "02-stories/ux-notes.md": ["ux-notes.md"] });
  assert.equal(r.verdict, "advance");

  s = step(env.dir);
  assert.equal(s.dispatches[0].agent, "planner-fx");
  r = await agentDoes(env, s.dispatches[0], { "04-plan/tasks.yaml": ["tasks.yaml"], "04-plan/test-plan.yaml": ["test-plan.yaml"] });
  assert.equal(r.verdict, "advance");

  s = step(env.dir);
  assert.equal(s.dispatches[0].agent, "curator");
  await record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(step(env.dir).gate, "GATE-B");
  approve(env.dir, {});
  assert.equal(step(env.dir).action, "done");

  const st = featureState(env.featureDir);
  assert.equal(st.status, "done");
  assert.equal(st.budgets.tokens, 3000);
  assert.ok(st.budgets.dispatches >= 5);
});

test("automation.autopilot approves GATE-A and GATE-B itself: no ask_human, straight to done", async () => {
  const env = setup("automation: { autopilot: true }");
  let s = step(env.dir);
  assert.equal(s.action, "dispatch");
  let r = await agentDoes(env, s.dispatches[0], { "01-requirements/delta-spec.yaml": ["delta-spec.yaml"] });
  assert.equal(r.verdict, "advance");

  // The digest the requirements stage queues still runs; GATE-A is approved without ever asking.
  s = step(env.dir);
  assert.equal(s.dispatches[0].subagent_type, "factory:curator");
  writeFileSync(join(env.featureDir, "digest.md"), "REQ-0001 REQ-0002 AC-0001 AC-0002 AC-0003\n");
  await record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });

  s = step(env.dir);
  assert.equal(s.action, "dispatch");
  assert.equal(s.dispatches[0].agent, "story-writer-fx");
  r = await agentDoes(env, s.dispatches[0], { "02-stories/stories.yaml": ["stories.yaml"], "02-stories/ux-notes.md": ["ux-notes.md"] });
  assert.equal(r.verdict, "advance");

  s = step(env.dir);
  assert.equal(s.dispatches[0].agent, "planner-fx");
  r = await agentDoes(env, s.dispatches[0], { "04-plan/tasks.yaml": ["tasks.yaml"], "04-plan/test-plan.yaml": ["test-plan.yaml"] });
  assert.equal(r.verdict, "advance");

  s = step(env.dir);
  assert.equal(s.dispatches[0].agent, "curator");
  await record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });

  // GATE-B is approved the same way: the feature finishes without ever stopping for a human.
  assert.equal(step(env.dir).action, "done");

  const st = featureState(env.featureDir);
  assert.equal(st.status, "done");
  assert.equal(st.gates["GATE-A"].by, "autopilot");
  assert.equal(st.gates["GATE-B"].by, "autopilot");
});

test("automation.autopilot also approves a gate a feature was already waiting at", async () => {
  const env = setup();
  let s = step(env.dir);
  await agentDoes(env, s.dispatches[0], { "01-requirements/delta-spec.yaml": ["delta-spec.yaml"] });
  s = step(env.dir);
  writeFileSync(join(env.featureDir, "digest.md"), "REQ-0001 REQ-0002 AC-0001 AC-0002 AC-0003\n");
  await record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(step(env.dir).action, "ask_human", "autopilot is still off: GATE-A really waits");

  const config = readYamlFile(join(env.dir, ".factory", "factory.config.yaml"));
  config.automation = { autopilot: true };
  writeFileSync(join(env.dir, ".factory", "factory.config.yaml"), YAML.stringify(config));

  s = step(env.dir);
  assert.equal(s.action, "dispatch", "turning autopilot on resolves the pending GATE-A on its own");
  assert.equal(s.dispatches[0].agent, "story-writer-fx");
  assert.equal(featureState(env.featureDir).gates["GATE-A"].by, "autopilot");
});

test("automation.autopilot never answers a CLARIFY stop — there is no safe default to invent", async () => {
  const env = setup("automation: { autopilot: true }");
  const d = step(env.dir).dispatches[0];
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "needs_clarification", open_questions: ["Stackable with loyalty?"] }) });
  const ask = step(env.dir);
  assert.equal(ask.action, "ask_human", "autopilot still stops for a genuine question");
  assert.equal(ask.gate, "CLARIFY");
  assert.deepEqual(ask.questions, ["Stackable with loyalty?"]);
});

test("an invalid envelope is sent back without touching state", async () => {
  const env = setup();
  const d = step(env.dir).dispatches[0];
  const bad = await record(env.dir, { dispatchId: d.id, envelopeText: JSON.stringify({ pack_id: d.id, status: "done" }) });
  assert.equal(bad.action, "redispatch");
  assert.equal(featureState(env.featureDir).pending.length, 1);
  const wrongPack = await record(env.dir, { dispatchId: d.id, envelopeText: envelope("FEAT-001/other/x/a1") });
  assert.match(wrongPack.reason, /pack_id/);
  const longSummary = await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { summary: "word ".repeat(201) }) });
  assert.match(longSummary.reason, /201 words/);
});

test("envelopes are found in a ```json block of a longer reply", async () => {
  const env = setup();
  const d = step(env.dir).dispatches[0];
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const reply = `I wrote the delta-spec.\n\n\`\`\`json\n${envelope(d.id)}\n\`\`\``;
  assert.equal((await record(env.dir, { dispatchId: d.id, envelopeText: reply })).verdict, "advance");
});

test("resume: a pending dispatch is re-issued, not duplicated", () => {
  const env = setup();
  const first = step(env.dir);
  const again = step(env.dir);
  assert.equal(again.resumed, true);
  assert.equal(again.dispatches[0].id, first.dispatches[0].id);
  assert.equal(featureState(env.featureDir).budgets.dispatches, 1);
});

test("a failing gate retries with feedback in the pack, then a repeat escalates to the diagnostician", async () => {
  const env = setup();
  const broken = ["delta-spec.yaml", (s) => s.replace("sources: [SRC-001]", "sources: [SRC-999]")];
  let d = step(env.dir).dispatches[0];
  assert.equal((await agentDoes(env, d, { "01-requirements/delta-spec.yaml": broken })).verdict, "retry");
  d = step(env.dir).dispatches[0];
  const pack = readFileSync(join(env.dir, d.pack), "utf8");
  assert.match(pack, /## T3 — Attempt feedback/);
  assert.match(pack, /SRC-999/);
  assert.equal((await agentDoes(env, d, { "01-requirements/delta-spec.yaml": broken })).verdict, "diagnose");
  d = step(env.dir).dispatches[0];
  assert.equal(d.subagent_type, "factory:diagnostician");
  assert.equal(d.model, "opus");
});

test("an agent's question pauses the feature for a human answer, stored as an HD note", async () => {
  const env = setup();
  const d = step(env.dir).dispatches[0];
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "needs_clarification", open_questions: ["Stackable with loyalty?"] }) });
  const ask = step(env.dir);
  assert.equal(ask.gate, "CLARIFY");
  assert.deepEqual(ask.questions, ["Stackable with loyalty?"]);
  const res = approve(env.dir, { notes: "Not stackable" });
  assert.equal(res.note, "HD-1");
  const next = step(env.dir).dispatches[0];
  assert.match(readFileSync(join(env.dir, next.pack), "utf8"), /Human answer \(HD-1\): Not stackable/);
});

test("reject stores the reason as a note and re-runs the gated stage with it", async () => {
  const env = setup();
  const d = step(env.dir).dispatches[0];
  await agentDoes(env, d, { "01-requirements/delta-spec.yaml": ["delta-spec.yaml"] });
  const curator = step(env.dir).dispatches[0];
  writeFileSync(join(env.featureDir, "digest.md"), "REQ-0001 REQ-0002 AC-0001 AC-0002 AC-0003\n");
  await record(env.dir, { dispatchId: curator.id, envelopeText: envelope(curator.id) });
  assert.throws(() => reject(env.dir, {}), /reason/);
  reject(env.dir, { reason: "Coupons must also work for guests" });
  const redo = step(env.dir).dispatches[0];
  assert.equal(redo.stage, "requirements");
  assert.match(readFileSync(join(env.dir, redo.pack), "utf8"), /Rejected at GATE-A by a human \(HD-1\)/);
  assert.match(readFileSync(join(env.dir, redo.pack), "utf8"), /Open human notes: HD-1/);
});

test("notes_mapped in an envelope maps a note only to IDs that exist", async () => {
  const env = setup();
  conductor.note(env.dir, { text: "Coupon codes are case-insensitive" });
  const d = step(env.dir).dispatches[0];
  await agentDoes(env, d, { "01-requirements/delta-spec.yaml": ["delta-spec.yaml"] }, { notes_mapped: [{ id: "HD-1", to: ["AC-0001"] }] });
  let notes = readYamlFile(join(env.featureDir, "human-notes.yaml"));
  assert.equal(notes[0].status, "mapped");
  assert.deepEqual(notes[0].mapped_to, ["AC-0001"]);
  conductor.note(env.dir, { text: "Another" });
  const c = step(env.dir).dispatches[0]; // curator
  await record(env.dir, { dispatchId: c.id, envelopeText: envelope(c.id, { notes_mapped: [{ id: "HD-2", to: ["AC-0777"] }] }) });
  notes = readYamlFile(join(env.featureDir, "human-notes.yaml"));
  assert.equal(notes[1].status, "open", "digest dispatches do not map notes, and AC-0777 does not exist");
});

test("tracked-ID coverage: a stage that drops an upstream AC fails its gate", async () => {
  const env = setup();
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const st = featureState(env.featureDir);
  Object.assign(st, { stage: "stories" });
  st.stages.requirements.status = "passed";
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(st));
  const d = step(env.dir).dispatches[0];
  const r = await agentDoes(env, d, { "02-stories/stories.yaml": ["stories.yaml", (s) => s.slice(0, s.indexOf("  - id: STORY-0002"))] });
  assert.equal(r.verdict, "retry");
  assert.ok(r.gate.failures.some((f) => f.check === "id-coverage" && /REQ-0002/.test(f.message)));
});

test("a feature over its dispatch budget halts as blocked", () => {
  const env = setup("budgets: { feature: { dispatches: 1 } }");
  step(env.dir);
  const st = featureState(env.featureDir);
  st.pending = [];
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(st));
  const s = step(env.dir);
  assert.equal(s.action, "halt");
  assert.match(s.reason, /dispatches 1\/1/);
  assert.ok(existsSync(join(env.featureDir, "blockers.md")));
});

test("optional stages are skipped unless forced, and a missing stage halts with a doctor hint", () => {
  const env = setup("pipeline: { stages: { requirements: { when: never.true } } }");
  conductor.setOverride(env.dir, { stage: "requirements", value: undefined });
  const s = step(env.dir);
  assert.equal(s.dispatches[0].stage, "stories", "requirements skipped: its condition is false");
  const env2 = setup("pipeline: { profile: broken, profiles: { broken: [nope] } }");
  const st = featureState(env2.featureDir);
  st.stage = "nope";
  st.stages = { nope: { status: "pending" } };
  writeFileSync(join(env2.featureDir, "state.json"), JSON.stringify(st));
  assert.match(step(env2.dir).reason, /factory doctor/);
});

test("on_fail goto rewinds to an earlier stage and counts a regression", async () => {
  const env = setup("pipeline: { stages: { stories: { on_fail: 'goto:requirements' } } }");
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const st = featureState(env.featureDir);
  st.stage = "stories";
  st.stages.requirements.status = "passed";
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(st));
  const d = step(env.dir).dispatches[0];
  const r = await agentDoes(env, d, { "02-stories/stories.yaml": ["stories.yaml", (s) => s.replace("id: AC-0003", "id: AC-0099")] });
  assert.equal(r.verdict, "retry");
  const after = featureState(env.featureDir);
  assert.equal(after.stage, "requirements");
  assert.equal(after.budgets.regressions, 1);
  assert.match(after.stages.requirements.feedback, /Sent back from stories/);
});

test("every pack written validates against the pack schema and lists its write allowlist", async () => {
  const env = setup();
  const d = step(env.dir).dispatches[0];
  const { validate } = await import("../../factory/scripts/lib/schemas.mjs");
  const { readFrontMatter } = await import("../../factory/scripts/lib/core.mjs");
  const front = readFrontMatter(join(env.dir, d.pack)).data;
  assert.deepEqual(validate("pack", front), []);
  assert.ok(front.write_allow.some((w) => w.endsWith("01-requirements/delta-spec.yaml")));
  const active = readdirSync(join(env.dir, ".factory", ".active"));
  assert.deepEqual(active, ["FEAT-001.requirements.spec-writer.a1.json"]);
});

test("the engine writes the digest by default: every open ID, no curator dispatch, within the word limit", async () => {
  const dir = makeProject("context: { digest: engine, digest_max_words: 120 }");
  const featureDir = makeFeature(dir);
  putIntake(dir);
  const d = conductor.step(dir).dispatches[0];
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await conductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  conductor.approve(dir, { gate: "GATE-A", by: "t" });
  const next = conductor.step(dir);
  assert.ok(next.dispatches.every((x) => x.agent !== "curator"), next.dispatches.map((x) => x.agent).join());
  const digest = readFileSync(join(featureDir, "digest.md"), "utf8");
  for (const id of ["REQ-0001", "REQ-0002", "AC-0001", "AC-0002", "AC-0003"]) assert.match(digest, new RegExp(id));
  assert.ok(digest.split(/\s+/).filter(Boolean).length <= 120, digest);
  const c = conductor.load(dir);
  const ctx = gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config });
  assert.equal((await runGate("digest", ctx, { useCache: false })).pass, true, "the digest gate accepts it");
});
