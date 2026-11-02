// The "no unexpected changes" precondition: after every record the engine stores the file states
// outside .factory/; a step halts when a person or a stray tool changed the tree since, until
// `factory accept-changes` (or a revert). Outside git, or with policy.unexpected_changes: off, no check.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { conductor, envelope, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const git = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
function setup(extra = "", { repo = true } = {}) {
  // The engine writes the digest itself, so after the record nothing is pending: the next step checks.
  const dir = makeProject(`context: { digest: engine }\n${extra}`);
  if (repo) {
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "t@example.invalid");
    git(dir, "config", "user.name", "T");
    git(dir, "add", "-A", "--", ".", ":(exclude).factory");
    git(dir, "commit", "-q", "-m", "baseline");
  }
  const featureDir = makeFeature(dir);
  putIntake(dir);
  return { dir, featureDir };
}
async function firstStage(env) {
  const s = conductor.step(env.dir);
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  await conductor.record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
}

test("an edit outside .factory/ between steps halts the next step until accept-changes", async () => {
  const env = setup();
  await firstStage(env);
  assert.equal(conductor.step(env.dir).gate, "GATE-A", "nothing changed since the record");
  writeFileSync(join(env.dir, "src", "entities", "order", "model", "total.ts"), "export const total = 1;\n");
  writeFileSync(join(env.dir, "stray.txt"), "x\n");
  const s = conductor.step(env.dir);
  assert.equal(s.action, "halt");
  assert.deepEqual(s.changed, ["src/entities/order/model/total.ts", "stray.txt"]);
  assert.match(s.reason, /factory accept-changes/);
  assert.deepEqual(conductor.acceptChanges(env.dir).accepted, s.changed);
  assert.equal(conductor.step(env.dir).gate, "GATE-A");
});

test("outside git, or with policy.unexpected_changes: off, there is no check", async () => {
  for (const env of [setup("", { repo: false }), setup("policy: { unexpected_changes: off }")]) {
    await firstStage(env);
    writeFileSync(join(env.dir, "stray.txt"), "x\n");
    assert.notEqual(conductor.step(env.dir).action, "halt");
  }
});
