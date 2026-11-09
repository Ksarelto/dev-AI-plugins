// The readable spec (01-requirements/spec.md) and the gates a profile may skip.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, YAML, conductor, envelope, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const { readFrontMatter } = await import(`${ENGINE}/scripts/lib/core.mjs`);
const { renderSpecView } = await import(`${ENGINE}/scripts/lib/spec-view.mjs`);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const TEMPLATES = join(ENGINE, "..", "factory-analysis", "templates");

test("renderSpecView: a PRD and a delta-spec read as sections, not YAML", () => {
  const prd = readFrontMatter(join(TEMPLATES, "fa-prd.md"));
  const view = renderSpecView({ kind: "prd", data: prd.data });
  assert.match(view, /^# Self-service B2B/);
  assert.match(view, /### REQ-0001 \(must\)/);
  assert.match(view, /- AC-0001 \(happy\):/);
  assert.match(view, /## Non-functional/);
  assert.match(view, /- NFR-2 \(accessibility\):/);
  assert.match(view, /## Out of scope\n\n- payment provider administration/);
  assert.match(view, /## Open questions\n\n- OQ-1 \(major, defaulted\): Can guests use coupons\? Default: no/);

  const delta = renderSpecView({ kind: "delta-spec", data: YAML.parse(readFileSync(join(TEMPLATES, "fa-delta-spec.yaml"), "utf8")) });
  assert.match(delta, /## Added/);
  assert.match(delta, /### REQ-0002\n\nBefore: Order total/);
  assert.match(delta, /## Removed\n\nNone\./);
  assert.match(delta, /## Must not change\n\n- Totals are rounded/);
});

test("a profile may skip GATE-D; GATE-C still asks", async () => {
  const run = async (gate) => {
    const dir = makeProject(`pipeline: { profiles: { test: [requirements] }, skip_gates: { test: [${gate}] }, stages: { requirements: { human_gate: ${gate} } } }\ncontext: { digest: engine }`);
    const featureDir = makeFeature(dir, { stages: ["requirements"] });
    putIntake(dir);
    const s = conductor.step(dir);
    putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
    const r = await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
    return { dir, featureDir, r };
  };
  const skipped = await run("GATE-D");
  assert.equal(skipped.r.action, "done");
  assert.equal(featureState(skipped.featureDir).gates["GATE-D"].auto, true);
  assert.match(readFileSync(join(skipped.featureDir, "01-requirements", "spec.md"), "utf8"), /## Added/);
  const held = await run("GATE-C");
  assert.equal(held.r.action, "ask_human");
  assert.equal(conductor.step(held.dir).gate, "GATE-C");
});
