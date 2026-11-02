// Phase 2 engine pieces: deterministic intake, mode detection, profile choice, the arch / discovery /
// profile gates, built-in stage conditions, the greenfield backlog split, and ID coverage of bodies.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TEMPLATES, conductor, envelope, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const { intake, paragraphs, detectMode } = await import(`${ENGINE}/scripts/lib/intake.mjs`);
const { profileFor } = await import(`${ENGINE}/scripts/lib/config.mjs`);
const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));

function inbox(dir, files) {
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, ".factory", "inbox"), { recursive: true });
    writeFileSync(join(dir, ".factory", "inbox", name), body);
  }
}

test("paragraphs: headings kept, list items split, code fences whole, front matter dropped", () => {
  const text = "---\nx: 1\n---\n# Title\n\nIntro line one\ncontinues here.\n\n- first rule\n- second rule\n  wraps\n\n```\ncode block\n\nstill code\n```";
  assert.deepEqual(paragraphs(text), ["# Title", "Intro line one\ncontinues here.", "- first rule", "- second rule wraps", "```\ncode block\n\nstill code\n```"]);
  assert.deepEqual(paragraphs("## Rules\nExpired coupons are rejected."), ["## Rules", "Expired coupons are rejected."], "text right under a heading gets its own ID");
});

test("intake tags text, placeholders images, skips hidden and empty files, and is idempotent", () => {
  const dir = makeProject();
  inbox(dir, { "brief.md": "# Coupons\n\nWe want coupons.\n\n- one per order\n- expired ones are rejected\n", "shot.png": "PNGDATA", ".DS_Store": "x", "empty.txt": "" });
  const first = intake(dir, { mode: "change-request" });
  assert.deepEqual(first.added.map((a) => [a.file, a.kind, a.ids]), [["brief.md", "text", 3], ["shot.png", "image", 0]]);
  const normalised = readFileSync(join(dir, ".factory/context/normalised/brief.md.md"), "utf8");
  assert.match(normalised, /\[SRC-001\] We want coupons\.\n\n\[SRC-002\] - one per order\n\n\[SRC-003\] - expired ones are rejected/);
  assert.match(readFileSync(join(dir, ".factory/context/normalised/shot.png.md"), "utf8"), /<!-- image/);
  assert.equal(first.created, true);
  const again = intake(dir, { text: "Also: coupons are case-insensitive." });
  assert.deepEqual(again.added.map((a) => a.ids), [1], "only the new request is added");
  assert.equal(again.created, false, "the open feature keeps going");
  assert.match(again.note, /--new/);
});

test("intake on an empty inbox needs --interview", () => {
  const dir = makeProject();
  assert.throws(() => intake(dir, {}), /--interview/);
  assert.equal(intake(dir, { interview: true, title: "Portal" }).created, true);
});

test("gate-intake reports an undescribed image as a placeholder", async () => {
  const dir = makeProject();
  inbox(dir, { "shot.png": "PNGDATA" });
  intake(dir, { mode: "change-request" });
  putArtifact(join(dir, ".factory"), "coverage.yaml", "context/coverage.yaml");
  const c = conductor.load(dir);
  const r = await runGate("intake", gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config }), { useCache: false });
  assert.ok(r.failures.some((f) => f.rule === "placeholder"));
});

test("mode detection: greenfield, change request, extension", () => {
  const empty = makeProject();
  writeFileSync(join(empty, "src", "entities", "order", "model", "total.ts"), "");
  const fresh = join(empty, "fresh");
  mkdirSync(join(fresh, ".factory"), { recursive: true });
  assert.equal(detectMode(fresh, "Build a portal").mode, "greenfield");
  const app = makeProject();
  assert.equal(detectMode(app, "Currently checkout has no coupons").mode, "change-request");
  assert.equal(detectMode(app, "Add a wishlist page").mode, "brownfield-extend");
});

test("profile choice: tier first, then mode, then default", () => {
  const config = { pipeline: { profile: "standard", mode_profiles: { greenfield: "greenfield" }, tier_profiles: { patch: "patch" } } };
  assert.equal(profileFor(config, { mode: "greenfield", tier: "patch" }), "patch");
  assert.equal(profileFor(config, { mode: "greenfield" }), "greenfield");
  assert.equal(profileFor(config, { mode: "change-request" }), "standard");
});

function archSetup(mutate = {}) {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  putArtifact(featureDir, "component-map.md", "03-architecture/component-map.md", mutate.map);
  putArtifact(featureDir, "adr-example.md", "03-architecture/adr-001-discount.md", mutate.adr);
  putArtifact(featureDir, "api-contract.yaml", "03-architecture/api-contract.yaml", mutate.contract);
  return dir;
}
async function gate(dir, name) {
  const c = conductor.load(dir);
  return runGate(name, gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config }), { useCache: false });
}
const rules = (r) => r.failures.map((f) => f.rule);

test("gate-arch: the worked example passes", async () => {
  const r = await gate(archSetup(), "arch");
  assert.deepEqual(r.failures, []);
});

test("gate-arch: unowned story, unknown story, reuse without reason, missing ADR, contract errors", async () => {
  const dir = archSetup({
    map: (s) => s.replace("stories: [STORY-0002]", "stories: [STORY-0099]").replace('    reuse_rejected: "no coupon-specific input exists; the new field composes shared/ui/input and inline-error"\n', "").replace("decisions: [ADR-001]", "decisions: [ADR-001, ADR-002]"),
    contract: (s) => s.replace("acs: [AC-0001, AC-0002]", "acs: [AC-0404]").replace("openapi: 3.1.0", "openapi: 2.0"),
  });
  const r = rules(await gate(dir, "arch"));
  for (const rule of ["unknown-story", "story-without-component", "no-reason", "missing-adr", "unknown-ac", "openapi-version"]) assert.ok(r.includes(rule), `${rule} in ${r}`);
});

test("gate-discovery: profile origin, empty map and phantom paths", async () => {
  const dir = makeProject();
  makeFeature(dir);
  putArtifact(join(dir, ".factory"), "app-profile.yaml", "app-profile.yaml", (s) => s.replace("\norigin: discovered\n", "\norigin: greenfield\n"));
  putArtifact(join(dir, ".factory"), "capability-map.yaml", "_index/capability-map.yaml");
  putArtifact(join(dir, ".factory"), "feature-ledger.yaml", "ledger/feature-ledger.yaml");
  const r = rules(await gate(dir, "discovery"));
  assert.ok(r.includes("origin"));
  assert.ok(r.includes("phantom-path"), "src/pages/** does not exist in the test project");
  assert.deepEqual(rules(await gate(dir, "profile")), [], "the profile itself is schema-valid");
});

test("ID coverage reads Markdown bodies, not just front matter (found by the GT-04 harness)", async () => {
  const dir = makeProject("pipeline: { profiles: { test: [requirements, stories, planning] }, stages: { planning: { outputs: [component-map], gate: null, tracked_ids: [HD] } } }");
  const featureDir = makeFeature(dir);
  putIntake(dir);
  conductor.note(dir, { text: "Hide the coupon field for guests" });
  const s = featureState(featureDir);
  s.stage = "planning";
  writeFileSync(join(featureDir, "state.json"), JSON.stringify(s));
  const d = conductor.step(dir).dispatches[0];
  putArtifact(featureDir, "component-map.md", "03-architecture/component-map.md", (t) => `${t}\nGuests never see the field (HD-1).\n`);
  const r = await conductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance");
});

test("discovery runs only while the baseline is missing (built-in condition)", () => {
  const dir = makeProject(`packs: { factory-analysis: "${join(TEMPLATES, "..")}" }\npipeline: { profiles: { test: [discovery, requirements] } }`);
  const featureDir = makeFeature(dir, { stages: ["discovery", "requirements"] });
  assert.equal(conductor.step(dir).dispatches[0].agent, "codebase-analyst");
  const dir2 = makeProject(`packs: { factory-analysis: "${join(TEMPLATES, "..")}" }\npipeline: { profiles: { test: [discovery, requirements] } }`);
  makeFeature(dir2, { stages: ["discovery", "requirements"] });
  putArtifact(join(dir2, ".factory"), "app-profile.yaml", "app-profile.yaml");
  putArtifact(join(dir2, ".factory"), "capability-map.yaml", "_index/capability-map.yaml");
  const s = conductor.step(dir2);
  assert.equal(s.dispatches[0].stage, "requirements", "discovery skipped: baseline exists");
  assert.ok(featureDir);
});

test("GATE-A on a PRD backlog splits it into features; a dependent feature waits", async () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir, { mode: "greenfield" });
  putIntake(dir);
  const d = conductor.step(dir).dispatches[0];
  putArtifact(featureDir, "prd.md", "01-requirements/prd.md", (t) => t.replace("sources: [SRC-002, HD-1]", "sources: [SRC-002]"));
  await conductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  const curator = conductor.step(dir).dispatches[0];
  writeFileSync(join(featureDir, "digest.md"), "REQ-0001 REQ-0002 AC-0001 AC-0002 AC-0003\n");
  await conductor.record(dir, { dispatchId: curator.id, envelopeText: envelope(curator.id) });
  const res = conductor.approve(dir, {});
  assert.deepEqual(res.backlog_features, ["FEAT-002"]);
  const parentPrd = readFileSync(join(featureDir, "01-requirements", "prd.md"), "utf8");
  assert.match(parentPrd, /REQ-0001/);
  assert.doesNotMatch(parentPrd, /REQ-0002/);
  const childDir = join(dir, ".factory", "features", readdirSync(join(dir, ".factory", "features")).find((n) => n.startsWith("FEAT-002")));
  const child = featureState(childDir);
  assert.equal(child.stage, "stories");
  assert.deepEqual(child.depends_on, ["FEAT-001"]);
  assert.equal(child.gates["GATE-A"].inherited_from, "FEAT-001");
  assert.match(readFileSync(join(childDir, "01-requirements", "prd.md"), "utf8"), /feature: FEAT-002/);
  assert.equal(conductor.step(dir, { feature: "FEAT-002" }).action, "wait");
});
