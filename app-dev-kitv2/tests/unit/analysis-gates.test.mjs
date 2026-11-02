// Batch 2 of the post-phase-5 audit fixes: the analysis gates (S0–S4) reject plausible but poor
// artifacts, and the planner and the human see what the gates enforce.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, makeFeature, makeProject, putArtifact, putIntake } from "./helpers.mjs";

const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const ROOT = join(TESTS, "..", "..");
const V2 = (name) => join(ROOT, "app-dev-kitv2", name);
const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");

function setup(mutate = {}, extra = "") {
  const dir = makeProject(extra);
  const featureDir = makeFeature(dir);
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", mutate.spec);
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml", mutate.stories);
  putArtifact(featureDir, "ux-notes.md", "02-stories/ux-notes.md");
  putArtifact(featureDir, "tasks.yaml", "04-plan/tasks.yaml", mutate.tasks);
  putArtifact(featureDir, "test-plan.yaml", "04-plan/test-plan.yaml", mutate.testPlan);
  return { dir, featureDir };
}
async function rules(name, env) {
  const c = conductor.load(env.dir);
  const r = await runGate(name, gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
  return r.failures.map((f) => f.rule);
}
const AC1 = `'Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line'`;

test("gate-spec: vague words are phrases and need a real measure; a quoted value or a unit is one", async () => {
  for (const [text, vague] of [
    ["'Coupons work well and errors are handled gracefully'", true],
    ["'The field is user friendly on iOS 17'", true],
    ["'The total is calculated correctly and displayed properly'", true],
    ["'The discount line appears quickly, within 200 ms'", false],
    ["'A quick reorder adds \"3 items\" to the cart'", false],
  ]) {
    const r = await rules("spec", setup({ spec: (s) => s.replace(AC1, text) }));
    assert.equal(r.includes("vague-ac"), vague, text);
  }
});

test("gate-spec: every source paragraph of the feature is cited or set aside with a reason", async () => {
  const drop = (s) => s.replace(/modified:[\s\S]*?removed:/, "modified: []\nremoved:");
  assert.ok((await rules("spec", setup({ spec: drop }))).includes("source-dropped"));
  const setAside = (s) => drop(s).replace("open_questions:", "sources_not_used:\n  - { id: SRC-002, reason: rounding is unchanged and stays as it is }\nopen_questions:");
  assert.ok(!(await rules("spec", setup({ spec: setAside }))).includes("source-dropped"));
});

test("gate-spec: every question has a default; blocker and major ones cannot stay open", async () => {
  const q = (line) => (s) => s.replace(/open_questions:[\s\S]*$/, `open_questions:\n  - ${line}\n`);
  assert.deepEqual((await rules("spec", setup({ spec: q('{ id: OQ-1, severity: minor, text: "Show the code?", status: defaulted }') }))).filter((x) => /default|open/.test(x)), ["no-default"]);
  assert.ok((await rules("spec", setup({ spec: q('{ id: OQ-1, severity: major, text: "Stackable?", default: "no", status: open }') }))).includes("major-open"));
  assert.ok(!(await rules("spec", setup({ spec: q('{ id: OQ-1, severity: major, text: "Stackable?", default: "no", status: defaulted }') }))).some((x) => /open|default/.test(x)));
});

test("gate-intake: covered needs a source, a gap says why, essentials are never a plain gap, tagged text is kept", async () => {
  const env = setup();
  writeFileSync(join(env.dir, ".factory/context/coverage.yaml"), YAML.stringify({ topics: { users: { status: "covered" }, goals: { status: "gap", note: "unknown" }, scope: { status: "gap" }, data: { status: "not_applicable", note: "no data" }, rules: { status: "covered", sources: ["SRC-001"] }, nfr: { status: "gap", note: "none given" }, acceptance: { status: "covered", sources: ["SRC-002"] } } }));
  const index = YAML.parse(readFileSync(join(env.dir, ".factory/context/index.yaml"), "utf8"));
  index.sources[0].normalised_sha = "0".repeat(64);
  writeFileSync(join(env.dir, ".factory/context/index.yaml"), YAML.stringify(index));
  const r = await rules("intake", env);
  for (const rule of ["covered-without-source", "gap-without-note", "essential-gap", "edited-source"]) assert.ok(r.includes(rule), `${rule} in ${r}`);
});

test("gate-stories: real steps, the spec's exact values, the AC's own REQ, and ux-notes for UI stories", async () => {
  const r1 = await rules("stories", setup({ stories: (s) => s.replace("Given a cart with total 100.00 EUR", "Given x").replace("-10.00 EUR", "-20.00 EUR") }));
  assert.ok(r1.includes("empty-step") && r1.includes("value-missing"), r1.join());
  const r2 = await rules("stories", setup({ stories: (s) => s.replace("traces: [REQ-0001]", "traces: [REQ-0002]") }));
  assert.ok(r2.includes("ac-req-not-traced"), r2.join());
  const env = setup();
  const ux = readdirSync(join(env.featureDir, "02-stories")).find((f) => f.startsWith("ux-notes"));
  writeFileSync(join(env.featureDir, "02-stories", ux), "");
  const { rmSync } = await import("node:fs");
  rmSync(join(env.featureDir, "02-stories", ux));
  assert.ok((await rules("stories", env)).includes("no-ux-notes"));
});

test("gate-plan: size estimates, exempt tasks, test cases tied to their task, characterisation first, red tests are tests", async () => {
  const r = await rules("plan", setup({
    tasks: (t) => t
      .replace("    size: { files: 2, est_loc: 120 }\n", "")
      .replace("tdd: { mode: required, red_tests: [src/features/apply-coupon/ui/coupon-field.test.tsx], stubs: [\"CouponField(props: { cartId: string }): JSX.Element\"] }", 'tdd: { mode: exempt, reason: "small" }')
      .replace("type: feature-ui", "type: refactor")
      .replace("depends_on: [TASK-001]", "depends_on: []")
      .replace("red_tests: [src/entities/order/model/total.test.ts]", "red_tests: [src/entities/order/model/total.test-data.ts]")
      .replace("files_expected: [src/entities/order/model/total.ts, src/entities/order/model/total.test.ts]", "files_expected: [src/entities/order/model/total.ts, src/entities/order/model/total.test-data.ts]"),
    testPlan: (p) => p.replace("ac: AC-0003, level: unit, title: total with discount and shipping, task: TASK-002", "ac: AC-0001, level: unit, title: total with discount and shipping, task: TASK-002"),
  }));
  for (const rule of ["no-estimate", "exempt-satisfies", "case-task-mismatch", "red-test-not-a-test", "change-before-characterisation"]) assert.ok(r.includes(rule), `${rule} in ${r}`);
  const onlyAcceptance = await rules("plan", setup({ testPlan: (p) => p.replaceAll("level: component", "level: acceptance") }));
  assert.ok(onlyAcceptance.includes("task-without-case"), onlyAcceptance.join());
});

test("gate-plan: an API operation owned by an enabled role is claimed by a task", async () => {
  const extra = `packs: { factory-role-backend: "${V2("factory-role-backend")}", node-backend-dev-kit: "${join(ROOT, "node-backend-dev-kit")}" }\nroles: { backend: { enabled: true, pack: factory-role-backend, stack: node-backend-dev-kit, path: ".", owns_paths: ["api/**"] } }`;
  const env = setup({}, extra);
  putArtifact(env.featureDir, "api-contract.yaml", "03-architecture/api-contract.yaml");
  assert.ok((await rules("plan", env)).includes("contract-op-without-task"));
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t.replace("    type: feature-ui\n", "    type: feature-ui\n    contract_ops: [applyCoupon]\n"));
  assert.ok((await rules("plan", env)).includes("contract-op-without-task"), "a frontend consumer listing it does not build it");
  const backendTask = `  - id: TASK-004\n    role: backend\n    type: endpoint\n    title: PUT coupon\n    depends_on: []\n    satisfies: [AC-0001]\n    contract_ops: [applyCoupon]\n    files_expected: [api/src/coupon.ts, api/tests/coupon.test.ts]\n    tdd: { mode: required, red_tests: [api/tests/coupon.test.ts] }\n    reuse: { considered: [], reuse_rejected: "no coupon endpoint exists yet in the api" }\n    definition_of_done: ["PUT applies the coupon"]\n    size: { files: 2, est_loc: 60 }\n`;
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => t + backendTask);
  putArtifact(env.featureDir, "test-plan.yaml", "04-plan/test-plan.yaml", (p) => `${p}  - { id: TEST-0009, ac: AC-0001, level: unit, title: "PUT B2B10 answers the -10.00 EUR cart", task: TASK-004 }\n`);
  assert.ok(!(await rules("plan", env)).includes("contract-op-without-task"));
});

test("gate-arch: reuse claims are checked and contract operations declare success", async () => {
  const env = setup();
  putArtifact(env.featureDir, "component-map.md", "03-architecture/component-map.md", (m) =>
    m.replace("path: src/entities/order/model/total.ts", "path: src/entities/order/model/gone.ts").replace("    reuse_considered: [shared/ui/input, shared/ui/inline-error]\n", "").replace(/reuse_rejected: ".*"/, 'reuse_rejected: "n/a"'));
  putArtifact(env.featureDir, "adr-example.md", "03-architecture/adr-001-discount.md");
  const contract = { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: { "/carts/{cartId}/coupon": { put: { operationId: "applyCoupon", "x-factory": { acs: ["AC-0001"] }, responses: { 422: { description: "invalid" } } } } } };
  writeFileSync(join(env.featureDir, "03-architecture", "api-contract.yaml"), YAML.stringify(contract));
  const r = await rules("arch", env);
  for (const rule of ["missing-path", "nothing-considered", "no-reason", "no-success-response"]) assert.ok(r.includes(rule), `${rule} in ${r}`);
});

test("gate-discovery: a capability spanning the whole app is too broad; 'conformant' must survive the architecture check", async () => {
  const dir = makeProject(`packs: { factory-role-frontend: "${V2("factory-role-frontend")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}" }\nroles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: ["src/**"], stack_overrides: { commands: { architecture_check: [node, "${FAKE}", arch] } } } }`);
  makeFeature(dir);
  for (let i = 0; i < 24; i++) {
    mkdirSync(join(dir, "src", "f", `m${i}`), { recursive: true });
    writeFileSync(join(dir, "src", "f", `m${i}`, "index.ts"), "export {};\n");
  }
  const factory = join(dir, ".factory");
  mkdirSync(join(factory, "_index"), { recursive: true });
  mkdirSync(join(factory, "ledger"), { recursive: true });
  putArtifact(factory, "app-profile.yaml", "app-profile.yaml", (t) => t.replace(/origin: \w+/, "origin: discovered").replace(/conformance: \w+(-\w+)?/, "conformance: conformant"));
  writeFileSync(join(factory, "_index", "capability-map.yaml"), YAML.stringify({ features: [{ name: "everything", paths: ["src/**"], routes: [] }, { name: "m1", paths: ["src/f/m1/**"], routes: [] }] }));
  putArtifact(factory, "feature-ledger.yaml", "ledger/feature-ledger.yaml");
  mkdirSync(join(dir, ".fake"), { recursive: true });
  writeFileSync(join(dir, ".fake", "arch.json"), JSON.stringify({ code: 1, output: "entities → features import" }));
  const c = conductor.load(dir);
  const r = (await runGate("discovery", gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false })).failures.map((f) => f.rule);
  assert.ok(r.includes("too-broad") && r.includes("not-conformant"), r.join());
});

test("the planner's pack states the plan rules; GATE-B shows the architecture; GATE-A shows unanswered questions", () => {
  const dir = makeProject(`packs: { factory-analysis: "${V2("factory-analysis")}" }\npipeline: { profiles: { test: [planning] }, stages: { planning: { pack: factory-analysis } } }`);
  const featureDir = makeFeature(dir, { stages: ["planning"] });
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  putArtifact(featureDir, "component-map.md", "03-architecture/component-map.md");
  const d = conductor.step(dir).dispatches[0];
  const pack = readFileSync(join(dir, d.pack), "utf8");
  assert.match(pack, /Plan rules \(gate-plan checks every one\):/);
  assert.match(pack, /size\.est_loc is required/);
  assert.doesNotMatch(pack, /- prd: \(missing/, "one of prd|delta-spec is enough");
  const s = JSON.parse(readFileSync(join(featureDir, "state.json"), "utf8"));
  Object.assign(s, { status: "awaiting_human", awaiting_human: { gate: "GATE-B", stage: "planning", since: new Date().toISOString() }, pending: [] });
  writeFileSync(join(featureDir, "state.json"), JSON.stringify(s));
  const ask = conductor.step(dir);
  assert.ok(ask.review.some((f) => f.endsWith("03-architecture/component-map.md")), ask.review.join());
  assert.ok(ask.questions.some((q) => /^OQ-1 \(/.test(q)), JSON.stringify(ask.questions));
});

test("review fixes: fenced code with blank lines, apostrophes, thousands separators, revisions, removals, fix-task cases", async () => {
  const { intake } = await import(`${ENGINE}/scripts/lib/intake.mjs`);
  const { init } = await import(`${ENGINE}/scripts/lib/doctor.mjs`);
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const p = mkdtempSync(join(tmpdir(), "factory-fence-"));
  init(p, { mode: "change-request" });
  writeFileSync(join(p, ".factory", "inbox", "brief.md"), "# Brief\n\nThe API returns this sample:\n\n```json\n{ \"a\": 1,\n\n  \"b\": 2 }\n```\n\nDone.\n");
  intake(p, { title: "Fence" });
  const c = conductor.load(p);
  const r = await runGate("intake", gateContext({ projectDir: p, app: c.app, feature: c.feature, config: c.config }), { useCache: false });
  assert.ok(!r.failures.some((f) => f.rule === "untagged-paragraph"), JSON.stringify(r.failures));

  const { acValues } = await import(`${ENGINE}/scripts/lib/ids.mjs`);
  assert.deepEqual(acValues("The customer's cart keeps the item's quantity"), []);
  assert.deepEqual(acValues("Orders over 1,000 EUR use OAuth2"), ["1000"]);

  const removedBy = (s) => s.replace("removed: []", "removed:\n  - { id: REQ-0009, reason: retired, sources: [SRC-002] }").replace(/modified:[\s\S]*?removed:/, "modified: []\nremoved:");
  assert.ok(!(await rules("spec", setup({ spec: removedBy }))).includes("source-dropped"), "a removal cites its source");

  const env = setup();
  const index = YAML.parse(readFileSync(join(env.dir, ".factory/context/index.yaml"), "utf8"));
  index.sources[0].superseded = true;
  writeFileSync(join(env.dir, ".factory/context/index.yaml"), YAML.stringify(index));
  const old = await rules("spec", setup({ spec: (s) => s.replace(/modified:[\s\S]*?removed:/, "modified: []\nremoved:") }));
  assert.ok(old.includes("source-dropped"));
  putArtifact(env.featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml", (s) => s.replace(/modified:[\s\S]*?removed:/, "modified: []\nremoved:"));
  assert.ok(!(await rules("spec", env)).includes("source-dropped"), "a superseded revision is not counted");

  const fix = `  - id: TASK-004\n    role: frontend\n    type: fix\n    title: Label the coupon field\n    depends_on: []\n    satisfies: []\n    files_expected: [src/features/apply-coupon/ui/label.tsx, src/features/apply-coupon/ui/label.test.tsx]\n    tdd: { mode: required, red_tests: [src/features/apply-coupon/ui/label.test.tsx] }\n    reuse: { considered: [], reuse_rejected: "a one-off aria fix for a review finding" }\n    definition_of_done: ["the field has an accessible name"]\n    size: { files: 2, est_loc: 20 }\n`;
  const r2 = await rules("plan", setup({ tasks: (t) => t + fix, testPlan: (p) => `${p}  - { id: TEST-0009, level: component, title: "the field is named Coupon code", task: TASK-004 }\n` }));
  assert.ok(!r2.some((x) => ["task-without-case", "case-task-mismatch", "schema"].includes(x)), r2.join());
});

test("sources added while a feature is past requirements wait for the next intake --new", async () => {
  const { intake } = await import(`${ENGINE}/scripts/lib/intake.mjs`);
  const { init } = await import(`${ENGINE}/scripts/lib/doctor.mjs`);
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const p = mkdtempSync(join(tmpdir(), "factory-owner-"));
  init(p, { mode: "change-request" });
  writeFileSync(join(p, ".factory", "inbox", "a.md"), "# A\n\nCustomers want coupons.\n");
  const a = intake(p, { title: "A" }).feature;
  const index = () => YAML.parse(readFileSync(join(p, ".factory/context/index.yaml"), "utf8")).sources;
  assert.equal(index()[0].feature, a);
  writeFileSync(join(p, ".factory", "inbox", "a2.md"), "# A2\n\nAlso show the coupon code on the receipt.\n");
  intake(p, {});
  assert.equal(index()[1].feature, a, "still specifying: the open feature takes it");
  const c = conductor.load(p);
  const s = c.feature.state;
  s.stages.requirements = { ...(s.stages.requirements ?? {}), status: "passed" };
  writeFileSync(join(c.feature.dir, "state.json"), JSON.stringify(s));
  writeFileSync(join(p, ".factory", "inbox", "b.md"), "# B\n\nExport orders as CSV.\n");
  intake(p, {});
  assert.deepEqual([index()[2].feature, index()[2].unassigned], [undefined, true]);
  const b = intake(p, { newFeature: true, title: "B" }).feature;
  assert.deepEqual([index()[2].feature, index()[2].unassigned], [b, undefined]);
});
