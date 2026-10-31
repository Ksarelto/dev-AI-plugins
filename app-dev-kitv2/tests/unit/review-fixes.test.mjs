// Regression tests for the phase-1 review findings (numbers refer to the review table).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CLI, ENGINE, FIXTURE_PACK, conductor, envelope, hook, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const { step, record, approve } = conductor;
const { exhaustedBudgets } = await import(`${ENGINE}/scripts/lib/warden.mjs`);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const saveState = (dir, s) => writeFileSync(join(dir, "state.json"), JSON.stringify(s));

function setup(extra) {
  const dir = makeProject(extra);
  const featureDir = makeFeature(dir);
  putIntake(dir);
  return { dir, featureDir };
}

function cliAsync(dir, args, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args, "--project", dir], { env: process.env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, json: JSON.parse(out) }));
    child.stdin.end(input);
  });
}

test("#1 two records at once (separate processes) both land — the lock covers the async gate", async () => {
  const env = setup("pipeline: { stages: { requirements: { agents: [spec-writer, story-writer-fx], parallel: true, human_gate: null } } }");
  const { dispatches } = step(env.dir);
  assert.equal(dispatches.length, 2);
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const results = await Promise.all(dispatches.map((d) => cliAsync(env.dir, ["record", "--dispatch", d.id], envelope(d.id))));
  assert.deepEqual(results.map((r) => r.code), [0, 0]);
  const s = featureState(env.featureDir);
  assert.equal(s.pending.length, 0);
  assert.equal(s.stages.requirements.status, "passed");
  assert.equal(s.stages.requirements.attempts, 1, "gated once, after both agents");
});

test("#2 abort, replay and diagnose clear pending dispatches and their hook scopes", () => {
  for (const cmd of ["abort", "replay", "diagnose"]) {
    const env = setup();
    step(env.dir);
    assert.equal(readdirSync(join(env.dir, ".factory", ".active")).length, 1);
    if (cmd === "abort") conductor.abort(env.dir, { reason: "cancelled" });
    if (cmd === "replay") conductor.replay(env.dir, { stage: "requirements", feedback: "redo" });
    if (cmd === "diagnose") conductor.diagnose(env.dir, { stage: "requirements" });
    assert.deepEqual(readdirSync(join(env.dir, ".factory", ".active")), [], cmd);
    assert.equal(featureState(env.featureDir).pending.length, 0, cmd);
  }
});

test("#2 the same agent type active for two features: a write allowed by either pack passes", () => {
  const dir = makeProject();
  const activeDir = join(dir, ".factory", ".active");
  mkdirSync(activeDir, { recursive: true });
  writeFileSync(join(activeDir, "FEAT-001.digest.curator.a1.json"), JSON.stringify({ id: "FEAT-001/d/curator/a1", agent: "curator", subagent_type: "factory:curator", write_allow: [".factory/features/FEAT-001-a/digest.md"] }));
  writeFileSync(join(activeDir, "FEAT-002.digest.curator.a1.json"), JSON.stringify({ id: "FEAT-002/d/curator/a1", agent: "curator", subagent_type: "factory:curator", write_allow: [".factory/features/FEAT-002-b/digest.md"] }));
  const write = (p) => hook(dir, "pre-write", { tool_name: "Write", agent_type: "curator", tool_input: { file_path: join(dir, p) } });
  assert.equal(write(".factory/features/FEAT-002-b/digest.md"), null);
  assert.equal(write("src/x.ts")?.hookSpecificOutput.permissionDecision, "deny");
});

test("#3 a transient failure retries in place even when on_fail sends gate failures back", async () => {
  const env = setup("pipeline: { stages: { stories: { on_fail: 'goto:requirements' } } }");
  const s = featureState(env.featureDir);
  s.stage = "stories";
  s.stages.requirements.status = "passed";
  saveState(env.featureDir, s);
  const d = step(env.dir).dispatches[0];
  const r = await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "failed", error: { type: "transient" } }) });
  assert.equal(r.verdict, "retry");
  const after = featureState(env.featureDir);
  assert.equal(after.stage, "stories");
  assert.equal(after.budgets.regressions, 0);
});

test("#4 time waiting for a human does not count against the wall-clock budget", async () => {
  const hour = 3600_000;
  const started = new Date(Date.now() - 5 * hour).toISOString();
  const config = { budgets: { feature: { wall_clock_min: 240 } } };
  assert.equal(exhaustedBudgets({ budgets: { started_at: started, paused_ms: 0 } }, config).length, 1);
  assert.deepEqual(exhaustedBudgets({ budgets: { started_at: started, paused_ms: 4 * hour } }, config), []);
  assert.deepEqual(exhaustedBudgets({ budgets: { started_at: started, paused_since: new Date(Date.now() - 4 * hour).toISOString() } }, config), []);
  const env = setup();
  const d = step(env.dir).dispatches[0];
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "needs_clarification" }) });
  assert.ok(featureState(env.featureDir).budgets.paused_since, "clock paused at the question");
  approve(env.dir, { notes: "answer" });
  const b = featureState(env.featureDir).budgets;
  assert.equal(b.paused_since, null);
  assert.ok(b.paused_ms >= 0);
});

test("#5/#22 the curator can run its exit check; the rung-3 instruction names the real file", () => {
  assert.match(readFileSync(join(ENGINE, "agents", "curator.md"), "utf8"), /^tools: .*Bash/m);
  const env = setup();
  conductor.diagnose(env.dir, { stage: "requirements" });
  assert.match(featureState(env.featureDir).stages.requirements.instruction, /diagnosis file listed in T1/);
});

test("#6 on_fail: block stops the feature at the first gate failure", async () => {
  const env = setup("pipeline: { stages: { requirements: { on_fail: block } } }");
  const d = step(env.dir).dispatches[0];
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (s) => s.replace("sources: [SRC-001]", "sources: [SRC-999]"));
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(featureState(env.featureDir).status, "blocked");
});

test("#7 a reply without an envelope is a redispatch, not a CLI error", async () => {
  const env = setup();
  const d = step(env.dir).dispatches[0];
  const r = await record(env.dir, { dispatchId: d.id, envelopeText: "I am done." });
  assert.equal(r.action, "redispatch");
  assert.match(r.reason, /no JSON envelope/);
  const broken = await record(env.dir, { dispatchId: d.id, envelopeText: "```json\n{ not json\n```" });
  assert.equal(broken.action, "redispatch");
});

test("#9 replay restarts the stage with a clean escalation history", async () => {
  const env = setup();
  let d = step(env.dir).dispatches[0];
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (s) => s.replace("sources: [SRC-001]", "sources: [SRC-999]"));
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  step(env.dir);
  conductor.replay(env.dir, { stage: "requirements", feedback: "use the new brief" });
  const st = featureState(env.featureDir).stages.requirements;
  assert.deepEqual([st.attempts, st.rung, st.fingerprints.length, st.status], [0, 0, 0, "pending"]);
  d = step(env.dir).dispatches[0];
  assert.match(readFileSync(join(env.dir, d.pack), "utf8"), /Replay requested by a human: use the new brief/);
});

test("#10 a stage missing from the profile blocks the feature instead of finishing it", async () => {
  const env = setup();
  const d = step(env.dir).dispatches[0];
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  const curator = step(env.dir).dispatches[0];
  writeFileSync(join(env.featureDir, "digest.md"), "REQ-0001 REQ-0002 AC-0001 AC-0002 AC-0003\n");
  await record(env.dir, { dispatchId: curator.id, envelopeText: envelope(curator.id) });
  const configFile = join(env.dir, ".factory", "factory.config.yaml");
  writeFileSync(configFile, readFileSync(configFile, "utf8").replace("      - requirements\n", ""));
  approve(env.dir, {}); // the feature waited at GATE-A of a stage the new config no longer has
  const s = featureState(env.featureDir);
  assert.equal(s.status, "blocked");
  assert.match(s.halts.at(-1).reason, /not in profile/);
});

test("#12 a finished feature stops being the default target", () => {
  const env = setup();
  conductor.abort(env.dir, { reason: "x" });
  assert.equal(JSON.parse(readFileSync(join(env.dir, ".factory", "state.json"), "utf8")).active_feature, null);
  assert.equal(step(env.dir).action, "done", "step on the last, finished feature reports done");
});

test("#13 an agent with a non-alias model halts the stage cleanly", () => {
  const env = setup('pipeline: { stages: { requirements: { agents: ["fixture-stages:bad-model"] } } }');
  const s = step(env.dir);
  assert.equal(s.action, "halt");
  assert.match(s.reason, /model "inherit"/);
  const active = join(env.dir, ".factory", ".active");
  assert.ok(!existsSync(active) || readdirSync(active).length === 0, "no hook scope for a dispatch that was never issued");
});

test("#14 a failed curator retries the digest instead of dropping it", async () => {
  const env = setup();
  let d = step(env.dir).dispatches[0];
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  d = step(env.dir).dispatches[0];
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { status: "failed" }) });
  assert.equal(featureState(env.featureDir).digest.pending, true);
  assert.equal(step(env.dir).dispatches[0].agent, "curator");
});

test("#16 installs with flags before the package name are denied", () => {
  const env = setup();
  step(env.dir);
  const bash = (command) => hook(env.dir, "pre-bash", { tool_name: "Bash", agent_type: "spec-writer", tool_input: { command } })?.hookSpecificOutput.permissionDecision ?? null;
  assert.equal(bash("npm install -D lodash"), "deny");
  assert.equal(bash("pnpm add --save-dev zod"), "deny");
  assert.equal(bash("npm install"), null, "a plain install of the lockfile is allowed");
});

test("#21 backward-edge and per-stage dispatch budgets are enforced", async () => {
  const env = setup("pipeline: { stages: { stories: { on_fail: 'goto:requirements' } } }\nbudgets: { backward_edges: { stories_to_requirements: 0 } }");
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const s = featureState(env.featureDir);
  s.stage = "stories";
  s.stages.requirements.status = "passed";
  saveState(env.featureDir, s);
  const d = step(env.dir).dispatches[0];
  putArtifact(env.featureDir, "stories.yaml", "02-stories/stories.yaml", (t) => t.replace("id: AC-0003", "id: AC-0099"));
  await record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(featureState(env.featureDir).status, "blocked");
  assert.match(readFileSync(join(env.featureDir, "blockers.md"), "utf8"), /stories_to_requirements/);

  const env2 = setup("budgets: { stage: { dispatches_max: 1 } }");
  const first = step(env2.dir).dispatches[0];
  putArtifact(env2.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (t) => t.replace("sources: [SRC-001]", "sources: [SRC-999]"));
  await record(env2.dir, { dispatchId: first.id, envelopeText: envelope(first.id) });
  assert.equal(step(env2.dir).action, "halt");
  assert.ok(existsSync(join(env2.featureDir, "blockers.md")));
});
