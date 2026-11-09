// Spec completeness (ported from spec-dev-kit): scoring, the gate-spec and gate-stories rules that came
// with it. A low score does not ask; the gaps are shown on GATE-A with the readable spec.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, YAML, conductor, envelope, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { scoreCompleteness, droppedNumbers } = await import(`${ENGINE}/scripts/lib/completeness.mjs`);
const featureState = (featureDir) => JSON.parse(readFileSync(join(featureDir, "state.json"), "utf8"));
const COMPLETENESS = "pipeline: { stages: { requirements: { outputs: [\"prd|delta-spec\", completeness] } } }";

function setup(extra = COMPLETENESS) {
  const dir = makeProject(extra);
  const featureDir = makeFeature(dir);
  putIntake(dir);
  return { dir, featureDir };
}
async function gate(name, env, stageId) {
  const c = conductor.load(env.dir);
  const stage = stageId ? conductor.resolveStage(c, stageId) : undefined;
  const ctx = gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, stage });
  return runGate(name, ctx, { useCache: false });
}
const rules = (r, warn = false) => r.failures.filter((f) => Boolean(f.warn) === warn).map((f) => f.rule);
const credits = (over = {}) => YAML.parse(readFileSync(join(ENGINE, "..", "factory-analysis", "templates", "fa-completeness.yaml"), "utf8")).categories && { feature: "FEAT-001", categories: { ...YAML.parse(readFileSync(join(ENGINE, "..", "factory-analysis", "templates", "fa-completeness.yaml"), "utf8")).categories, ...over } };

test("scoring: weights, n/a re-normalisation, OQ-only full credit is partial, n/a needs a reason", () => {
  const ids = new Set(["AC-0002", "AC-0003", "REQ-0002", "OQ-1"]);
  const r = scoreCompleteness(credits(), ids);
  // applicable: 15+15+12+8+8+7 = 65; awarded 15+7+12+8+0+7 = 49 → 75
  assert.equal(r.score, 75);
  assert.deepEqual(r.gaps.map((g) => g.category), ["permissions_roles", "undo_rollback"]);
  const all = scoreCompleteness(credits({ undo_rollback: { credit: "full", evidence: ["OQ-1"] }, notifications: { credit: "n/a" } }), ids);
  assert.equal(all.categories.undo_rollback.credit, "partial", "full credit backed only by a defaulted question is partial");
  assert.equal(all.categories.notifications.credit, "none", "n/a without a reason is none");
  assert.deepEqual(scoreCompleteness(credits({ edge_cases: { credit: "full", evidence: ["AC-9999"] } }), ids).unknown, ["edge_cases: AC-9999"]);
  const decided = scoreCompleteness(credits({ undo_rollback: { credit: "full", evidence: ["OQ-1"] } }), ids, new Set(["OQ-1"]));
  assert.equal(decided.categories.undo_rollback.credit, "full", "an answered question is a decision, not an assumption");
});

test("droppedNumbers: a stated number with a unit that the spec never repeats", () => {
  const out = droppedNumbers([["SRC-001", "Codes expire after 30 days and allow 3 attempts"]], "expire after 30 days");
  assert.deepEqual(out, ['SRC-001: "3 attempts"']);
});

test("gate-spec in the requirements stage: missing, low score, unknown evidence, no question; numbers are warnings", async () => {
  const env = setup();
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  assert.deepEqual(rules(await gate("spec", env, "requirements")), ["missing"]);
  assert.deepEqual(rules(await gate("spec", env)), [], "outside a stage that produces completeness.yaml nothing is scored");
  writeFileSync(join(env.featureDir, "01-requirements", "completeness.yaml"), YAML.stringify(credits({ undo_rollback: { credit: "none", gap: "x" }, edge_cases: { credit: "full", evidence: ["AC-9999"] } })));
  const r = await gate("spec", env, "requirements");
  assert.deepEqual(rules(r).sort(), ["below-threshold", "no-question", "unknown-evidence"]);
  assert.match(r.failures.find((f) => f.rule === "below-threshold").message, /completeness 75\/100 is below 85/);
  writeFileSync(join(env.dir, ".factory/context/normalised/brief.md"), "# brief.md\n\n[SRC-001] Returning B2B customers want a coupon code at checkout, at most 3 attempts per hour.\n\n[SRC-002] The order total is the sum of the lines plus shipping, rounded half-even to 2 decimals.\n");
  assert.ok(rules(await gate("spec", env, "requirements"), true).includes("number-dropped"));
  const off = setup(`${COMPLETENESS}\nquality: { completeness_min: 0 }`);
  putArtifact(off.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  assert.deepEqual(rules(await gate("spec", off, "requirements")), [], "completeness_min: 0 turns it off");
});

test("gate-spec: a PRD needs performance, accessibility and security NFRs; NFRs are measurable; no placeholders", async () => {
  const env = setup("");
  putArtifact(env.featureDir, "prd.md", "01-requirements/prd.md", (s) => s.replace(/  - \{ id: NFR-2[^\n]*\n/, "").replace("Reorder adds up to 50 lines to the cart in under 1 s at the 95th percentile", "Reordering feels fast").replace('"Reorder" adds every line', '"{{action}}" adds every line'));
  const r = rules(await gate("spec", env));
  for (const rule of ["nfr-missing", "vague-nfr", "placeholder"]) assert.ok(r.includes(rule), `${rule}: ${r}`);
  const wcag = setup("");
  putArtifact(wcag.featureDir, "prd.md", "01-requirements/prd.md", (t) => t.replace("Every screen meets WCAG 2.2 AA and works with the keyboard only", "Every screen is responsive and meets WCAG 2.2 AA"));
  assert.ok(!rules(await gate("spec", wcag)).includes("vague-nfr"), "a versioned standard is a measure");
  const delta = setup("");
  putArtifact(delta.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  assert.ok(!rules(await gate("spec", delta)).includes("nfr-missing"), "a delta-spec inherits the app's NFRs");
});

test("gate-stories: a must story needs an unhappy-path AC or a reason; a story that wants 3 things is a warning", async () => {
  const env = setup("");
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (s) => s.replace("kind: error", "kind: happy"));
  putArtifact(env.featureDir, "stories.yaml", "02-stories/stories.yaml", (s) => s.replace("to apply a coupon code at checkout", "to apply a coupon code, see the discount line and remove the coupon again"));
  putArtifact(env.featureDir, "ux-notes.md", "02-stories/ux-notes.md");
  const r = await gate("stories", env);
  assert.deepEqual(rules(r), ["unhappy-path-missing"]);
  assert.match(r.failures.find((f) => f.rule === "unhappy-path-missing").message, /STORY-0001/);
  assert.deepEqual(rules(r, true), ["story-too-big"]);
  assert.equal(r.pass, false);
});

test("a low score does not ask; the gaps and spec.md are on GATE-A", async () => {
  const env = setup(`${COMPLETENESS}\ncontext: { digest: engine }`);
  const s = conductor.step(env.dir);
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  writeFileSync(join(env.featureDir, "01-requirements", "completeness.yaml"), YAML.stringify(credits()));
  const r = await conductor.record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(r.action, "ask_human");
  assert.equal(r.verdict, "advance", `a low score no longer blocks: ${JSON.stringify(r.gate?.failures)}`);
  const asked = conductor.step(env.dir);
  assert.equal(asked.gate, "GATE-A");
  assert.match(asked.reason, /completeness 75\/100 \(below 85\)\. permissions_roles \(partial\): Can a guest/);
  assert.match(asked.review[0], /01-requirements\/spec\.md$/);
  const view = readFileSync(join(env.featureDir, "01-requirements", "spec.md"), "utf8");
  assert.match(view, /REQ-0001/);
  assert.match(view, /## Must not change/);
});
