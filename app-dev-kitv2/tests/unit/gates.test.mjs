import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, conductor, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);

/** A project at the planning stage with every fixture artifact in place. */
function setup(mutate = {}) {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", mutate.spec);
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml", mutate.stories);
  putArtifact(featureDir, "ux-notes.md", "02-stories/ux-notes.md");
  putArtifact(featureDir, "tasks.yaml", "04-plan/tasks.yaml", mutate.tasks);
  putArtifact(featureDir, "test-plan.yaml", "04-plan/test-plan.yaml", mutate.testPlan);
  return { dir, featureDir };
}

async function gate(name, env) {
  const c = conductor.load(env.dir);
  const ctx = gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config });
  return runGate(name, ctx, { useCache: false });
}
const rules = (r) => r.failures.map((f) => f.rule);

test("the fixture artifacts pass every gate", async () => {
  const env = setup();
  for (const name of ["intake", "spec", "stories", "plan"]) {
    const r = await gate(name, env);
    assert.equal(r.pass, true, `${name}: ${JSON.stringify(r.failures)}`);
  }
});

test("gate-intake: untagged paragraph and blocker gap", async () => {
  const env = setup();
  writeFileSync(join(env.dir, ".factory/context/normalised/brief.md"), "# brief\n\n[SRC-001] Coupons at checkout.\n\nA paragraph without a source ID.\n");
  writeFileSync(join(env.dir, ".factory/context/coverage.yaml"), "topics:\n  users: { status: blocker_gap }\n");
  const r = rules(await gate("intake", env));
  for (const rule of ["untagged-paragraph", "phantom-id", "blocker-gap", "topic-missing"]) assert.ok(r.includes(rule), rule);
});

test("gate-spec: vague AC, unknown source, open blocker, phantom file, duplicate id", async () => {
  const env = setup({
    spec: (s) =>
      s
        .replace("shows a -10.00 EUR discount line", "should feel fast")
        .replace("Applying \"B2B10\" to a 100.00 EUR cart", "Applying a coupon")
        .replace("sources: [SRC-001]", "sources: [SRC-999]")
        .replace("status: defaulted", "status: open")
        .replace("severity: major", "severity: blocker")
        .replace("affected: [src/entities/order/model/total.ts]", "affected: [src/nope.ts]")
        .replace("id: AC-0003", "id: AC-0001"),
  });
  const r = rules(await gate("spec", env));
  for (const rule of ["vague-ac", "unknown-source", "blocker-open", "phantom-file", "duplicate"]) assert.ok(r.includes(rule), `${rule} in ${r}`);
});

test("gate-spec: a delta-spec without `removed` fails the schema", async () => {
  const env = setup({ spec: (s) => s.replace("removed: []\n", "") });
  const r = await gate("spec", env);
  assert.equal(r.pass, false);
  assert.match(r.failures[0].message, /removed/);
});

test("gate-stories: invented AC, uncovered AC, missing Gherkin step, UX without states", async () => {
  const env = setup({
    stories: (s) =>
      s
        .replace("id: AC-0003", "id: AC-0099")
        .replace("          When I apply an expired coupon\n", "")
        .replace("states: [empty, applied, invalid, loading]", "states: []"),
  });
  const r = rules(await gate("stories", env));
  for (const rule of ["invented-ac", "uncovered-ac", "missing-step", "no-states"]) assert.ok(r.includes(rule), `${rule} in ${r}`);
});

test("gate-plan: cycle, unsatisfied and untested AC, owns_paths, TDD and size", async () => {
  const env = setup({
    tasks: (s) =>
      s
        .replace("depends_on: []", "depends_on: [TASK-003]")
        .replace("satisfies: [AC-0001, AC-0002]", "satisfies: [AC-0001]")
        .replace("files_expected: [src/features/apply-coupon/ui/coupon-field.tsx, src/features/apply-coupon/ui/coupon-field.test.tsx]", "files_expected: [lib/coupon-field.tsx, a.ts, b.ts, c.ts]")
        .replace("est_loc: 120", "est_loc: 900")
        .replace('    tdd: { mode: required, red_tests: [src/features/apply-coupon/ui/coupon-field.test.tsx], stubs: ["CouponField(props: { cartId: string }): JSX.Element"] }\n', ""),
    testPlan: (s) => s.replace("  - { id: TEST-0003, ac: AC-0003, level: unit, title: total with discount and shipping, task: TASK-002 }\n", ""),
  });
  const r = rules(await gate("plan", env));
  for (const rule of ["cycle", "unsatisfied-ac", "untested-ac", "outside-owns-paths", "too-many-files", "too-large", "missing"]) {
    assert.ok(r.includes(rule), `${rule} in ${r}`);
  }
});

test("gate-plan: change requests need characterisation tests; TDD exemptions are whitelisted", async () => {
  const env = setup({
    tasks: (s) =>
      s
        .replace("    characterisation: true\n", "")
        .replace('tdd: { mode: required, red_tests: [src/features/apply-coupon/ui/coupon-field.test.tsx], stubs: ["CouponField(props: { cartId: string }): JSX.Element"] }', "tdd: { mode: exempt, reason: ui only }"),
  });
  const r = rules(await gate("plan", env));
  assert.ok(r.includes("no-characterisation"));
  assert.ok(r.includes("bad-exemption"));
});

test("gate-plan: an unmapped human note blocks the plan; a mapped one passes", async () => {
  const env = setup();
  conductor.note(env.dir, { text: "Hide the coupon field for guests" });
  assert.ok(rules(await gate("plan", env)).includes("unmapped"));
  writeFileSync(join(env.featureDir, "human-notes.yaml"), "- { id: HD-1, at: note, by: t, text: Hide the coupon field for guests, status: mapped, mapped_to: [AC-0404] }\n");
  assert.ok(rules(await gate("plan", env)).includes("dangling"));
  writeFileSync(join(env.featureDir, "human-notes.yaml"), "- { id: HD-1, at: note, by: t, text: Hide the coupon field for guests, status: mapped, mapped_to: [AC-0001] }\n");
  assert.equal((await gate("plan", env)).pass, true);
});

test("gate-digest: a dropped open ID fails; closed questions may be left out", async () => {
  const env = setup();
  writeFileSync(join(env.featureDir, "digest.md"), "# digest\nREQ-0001 REQ-0002 AC-0001 AC-0002 AC-0003\n");
  assert.equal((await gate("digest", env)).pass, true, "OQ-1 is defaulted, so it may be omitted");
  writeFileSync(join(env.featureDir, "digest.md"), "# digest\nREQ-0001 AC-0001\n");
  const r = await gate("digest", env);
  assert.deepEqual(r.failures.map((f) => f.message.split(" ")[0]).sort(), ["AC-0002", "AC-0003", "REQ-0002"]);
});

test("gate results are cached by input hash and fingerprints are stable", async () => {
  const env = setup({ spec: (s) => s.replace("sources: [SRC-001]", "sources: [SRC-999]") });
  const c = conductor.load(env.dir);
  const ctx = gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config });
  const first = await runGate("spec", ctx);
  const second = await runGate("spec", ctx);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.progress_signal, 2, "SRC-999 is unknown, and SRC-001 is no longer cited");
});
