// Phase 4: acceptance, verify, qa, docs, ready and triage gates; the fix loop from verification, PR
// review and PR comments; shipping with real git; the ledger.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, envelope, makeFeature, makeProject, putArtifact, putIntake, report } from "./helpers.mjs";

const ROOT = join(TESTS, "..", "..");
const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");
const V2 = (name) => join(ROOT, "app-dev-kitv2", name);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { typecheckForTask } = await import(`${ENGINE}/scripts/lib/testrun.mjs`);

/** A project past planning: spec, stories, plan, three done tasks, quality/delivery packs, fake stack. */
function setup(stages, extra = "") {
  const dir = makeProject(
    [
      `packs: { factory-role-frontend: "${V2("factory-role-frontend")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}", factory-analysis: "${V2("factory-analysis")}", factory-quality: "${V2("factory-quality")}", factory-delivery: "${V2("factory-delivery")}", factory-adapter-github: "${V2("factory-adapter-github")}" }`,
      `roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: ["src/**"], stack_overrides: { commands: { typecheck: [node, "${FAKE}", typecheck], lint: [node, "${FAKE}", lint], architecture_check: [node, "${FAKE}", arch], build: [node, "${FAKE}", build], test: [node, "${FAKE}", test, "{report}"] } } } }`,
      `pipeline: { profiles: { test: [planning, ${stages.join(", ")}] }, stages: { planning: { pack: factory-analysis } } }`,
      extra,
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["planning", ...stages] });
  putIntake(dir);
  for (const [fixture, target] of [["delta-spec.yaml", "01-requirements/delta-spec.yaml"], ["stories.yaml", "02-stories/stories.yaml"], ["tasks.yaml", "04-plan/tasks.yaml"], ["test-plan.yaml", "04-plan/test-plan.yaml"]]) {
    putArtifact(featureDir, fixture, target);
  }
  const s = featureState(featureDir);
  s.stages.planning.status = "passed";
  s.stage = stages[0];
  s.tasks = { "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { status: "done" } };
  writeFileSync(join(featureDir, "state.json"), JSON.stringify(s));
  mkdirSync(join(dir, ".fake"), { recursive: true });
  const fake = (command, body) => writeFileSync(join(dir, ".fake", `${command}.json`), JSON.stringify(body));
  const write = (file, text) => {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  return { dir, featureDir, fake, write };
}
const gate = async (env, name) => {
  const c = conductor.load(env.dir);
  return runGate(name, gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
};
const rules = (r) => r.failures.map((f) => f.rule);
const ACCEPT = "src/pages/checkout/checkout.acceptance.test.tsx";

test("gate-acceptance: every AC needs a named test, and none may pass before implementation", async () => {
  const env = setup(["acceptance"]);
  env.write(ACCEPT, 'test("AC-0001 discount line", () => {});\ntest("AC-0002 expired", () => {});\n');
  env.fake("test", { code: 1, report: report({ [join(env.dir, ACCEPT)]: [["AC-0001 discount line", "failed", "Unable to find a label"], ["AC-0002 expired", "passed"]] }) });
  const r = rules(await gate(env, "acceptance"));
  assert.deepEqual(r.sort(), ["ac-without-test", "passes-before-implementation"], "AC-0003 has no test; AC-0002 already passes");
});

test("gate-acceptance: a file that cannot import the unbuilt feature is a red; other features' passing tests are ignored", async () => {
  const env = setup(["acceptance"]);
  env.write(ACCEPT, 'import { applyCoupon } from "@/features/apply-coupon";\ntest("AC-0001 discount", () => {});\nit(`AC-0002 expired`, () => {});\ntest.each([1])("AC-0003 summary %s", () => {});\n');
  const OTHER = "src/pages/cart/cart.acceptance.test.tsx";
  env.write(OTHER, 'test("AC-0099 cart total", () => {});\n');
  env.fake("test", { code: 1, report: report({ [join(env.dir, ACCEPT)]: "load-error", [join(env.dir, OTHER)]: [["AC-0099 cart total", "passed"]] }) });
  assert.deepEqual(rules(await gate(env, "acceptance")), []);
});

test("verification: findings from reviewer and auditor land in review.md; P1 and failing acceptance block; P2 does not", async () => {
  const env = setup(["verification", "qa"]);
  env.write(ACCEPT, "// acceptance\n");
  env.fake("test", { code: 1, report: report({ [join(env.dir, ACCEPT)]: [["AC-0001 discount line", "failed", "Unable to find a label"]] }) });
  const s = conductor.step(env.dir);
  assert.deepEqual(s.dispatches.map((d) => d.agent).sort(), ["fe-auditor", "reviewer"], "reviewer and role auditor run in parallel");
  const byAgent = Object.fromEntries(s.dispatches.map((d) => [d.agent, d]));
  await conductor.record(env.dir, { dispatchId: byAgent.reviewer.id, envelopeText: envelope(byAgent.reviewer.id, { findings: [{ lens: "spec-adr-drift", severity: "P1", claim: "the page never renders the field" }, { lens: "edge-cases", severity: "P2", claim: "no max length" }] }) });
  const r = await conductor.record(env.dir, { dispatchId: byAgent["fe-auditor"].id, envelopeText: envelope(byAgent["fe-auditor"].id, { findings: [] }) });
  assert.deepEqual(r.gate.failures.map((f) => f.rule).sort(), ["acceptance-failing", "blocking-P1"]);
  const review = readFileSync(join(env.featureDir, "06-verify", "review.md"), "utf8");
  assert.match(review, /RV-1 P1/);
  assert.match(review, /RV-2 P2/);
  const st = featureState(env.featureDir);
  assert.equal(st.status, "blocked", "no implementation stage in this profile: block instead of a broken regress");
  assert.match(st.halts.at(-1).reason, /not in the "test" profile/);
});

test("the fix loop: a failing verification sends fix items to the planner, who adds tasks before the build continues", async () => {
  const env = setup(["implementation", "verification"]);
  const s0 = featureState(env.featureDir);
  s0.stage = "verification";
  s0.stages.implementation.status = "passed";
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s0));
  env.fake("test", { code: 0, report: report({}) });
  const s = conductor.step(env.dir);
  for (const d of s.dispatches) {
    await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { findings: d.agent === "reviewer" ? [{ lens: "tests", severity: "P0", file: "src/x.ts", claim: "crashes on empty cart" }] : [] }) });
  }
  const st = featureState(env.featureDir);
  assert.equal(st.stage, "implementation");
  assert.equal(st.fix_pending.source, "verification");
  assert.match(st.fix_pending.items[0].message, /crashes on empty cart/);
  assert.equal(readFileSync(join(env.featureDir, "06-verify", "change-set.yaml"), "utf8").includes("TASK-003"), true);
  const fix = conductor.step(env.dir).dispatches[0];
  assert.equal(fix.phase, "fixplan");
  assert.equal(fix.subagent_type, "factory-analysis:planner");
  assert.match(readFileSync(join(env.dir, fix.pack), "utf8"), /crashes on empty cart/);
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", (t) => `${t}  - id: TASK-004\n    role: frontend\n    type: fix\n    title: Empty cart does not crash\n    depends_on: []\n    satisfies: [AC-0003]\n    files_expected: [src/entities/order/model/empty.ts, src/entities/order/model/empty.test.ts]\n    tdd: { mode: required, red_tests: [src/entities/order/model/empty.test.ts] }\n    reuse: { considered: [], reuse_rejected: "new guard" }\n    definition_of_done: ["empty cart totals 0"]\n    size: { files: 2, est_loc: 20 }\n`);
  putArtifact(env.featureDir, "test-plan.yaml", "04-plan/test-plan.yaml", (t) => `${t}  - { id: TEST-0009, ac: AC-0003, level: unit, title: "an empty cart totals 0.00", task: TASK-004 }\n`);
  const r = await conductor.record(env.dir, { dispatchId: fix.id, envelopeText: envelope(fix.id) });
  assert.equal(r.verdict, "fixplan");
  const after = featureState(env.featureDir);
  assert.equal(after.fix_pending, null);
  assert.equal(conductor.step(env.dir).dispatches[0].task, "TASK-004");
});

test("gate-qa: an open S2 defect or S1 spec gap blocks; a human waiver that names it lets it through", async () => {
  const env = setup(["qa"]);
  const record = (defects) =>
    writeFileSync(join(env.featureDir, "07-qa", "defects.yaml"), YAML.stringify({ feature: "FEAT-001", charters: [{ id: "CH-1", mission: "m", timebox_min: 10, result: "defects" }], defects }));
  mkdirSync(join(env.featureDir, "07-qa"), { recursive: true });
  writeFileSync(join(env.featureDir, "07-qa", "qa-report.md"), "report\n");
  const d = (extra) => ({ id: "DEF-001", type: "defect", severity: "S2", title: "t", steps: ["s"], expected: "e", actual: "a", ...extra });
  record([d(), { ...d(), id: "DEF-002", type: "spec_gap", severity: "S1" }]);
  assert.deepEqual(rules(await gate(env, "qa")), ["open-S2", "open-spec-gap-S1"]);
  conductor.note(env.dir, { text: "Accept DEF-001 for this release" });
  record([d({ waived_by: "HD-1" })]);
  assert.deepEqual(rules(await gate(env, "qa")), []);
});

test("gate-docs: every AC in the feature doc, ADRs promoted, a CHANGELOG entry and a report", async () => {
  const env = setup(["docs"]);
  putArtifact(env.featureDir, "adr-example.md", "03-architecture/adr-001-discount.md");
  env.write("docs/features/FEAT-001.md", "# FEAT-001\nAC-0001 AC-0002\n");
  const r = rules(await gate(env, "docs"));
  assert.deepEqual(r.sort(), ["ac-missing", "adr-not-promoted", "no-changelog", "no-report"]);
});

function deliverySetup(extra = "") {
  const env = setup(["delivery"], extra);
  for (const [f, body] of [["src/entities/order/model/total.characterisation.test.ts", "t1"], ["src/entities/order/model/total.ts", "t2"], ["src/entities/order/model/total.test.ts", "t2t"], ["src/features/apply-coupon/ui/coupon-field.tsx", "t3"], ["src/features/apply-coupon/ui/coupon-field.test.tsx", "t3t"], ["CHANGELOG.md", "FEAT-001"]]) env.write(f, `${body}\n`);
  execFileSync("git", ["init", "-q"], { cwd: env.dir });
  execFileSync("git", ["config", "user.email", "t@example.invalid"], { cwd: env.dir });
  execFileSync("git", ["config", "user.name", "T"], { cwd: env.dir });
  const commit = (task, message, files) => ({ ...(task ? { task } : {}), message, files });
  const plan = {
    feature: "FEAT-001",
    commits: [
      commit("TASK-001", "test(order): characterise\n\nFactory-Task: TASK-001", ["src/entities/order/model/total.characterisation.test.ts"]),
      commit("TASK-002", "feat(order): discount\n\nFactory-Task: TASK-002", ["src/entities/order/model/total.ts", "src/entities/order/model/total.test.ts"]),
      commit("TASK-003", "feat(apply-coupon): field\n\nFactory-Task: TASK-003", ["src/features/apply-coupon/ui/coupon-field.tsx", "src/features/apply-coupon/ui/coupon-field.test.tsx"]),
      commit(null, "docs: coupons (FEAT-001)", ["CHANGELOG.md"]),
    ],
  };
  const pr = "# feat: Coupons (FEAT-001)\n\n## Summary\nx\n\n## Spec trace\n| AC | Task | Tests |\n|---|---|---|\n| AC-0001 | TASK-003 | TEST-0001 |\n| AC-0002 | TASK-003 | TEST-0002 |\n| AC-0003 | TASK-002 | TEST-0003 |\n\n## Docs\nx\n\n## Provenance\nx\n";
  return { env, plan, pr };
}

test("gate-ready-for-pr: commits per task with trailers, conventional subjects, PR sections and trace, no open notes", async () => {
  const { env, plan, pr } = deliverySetup();
  mkdirSync(join(env.featureDir, "08-delivery"), { recursive: true });
  const bad = structuredClone(plan);
  bad.commits[1] = { task: "TASK-002", message: "added discount", files: ["src/entities/order/model/total.ts", "src/secret.ts"] };
  bad.commits.splice(2, 1);
  writeFileSync(join(env.featureDir, "08-delivery", "commits.yaml"), YAML.stringify(bad));
  writeFileSync(join(env.featureDir, "08-delivery", "pr.md"), pr.replace("## Docs\nx\n\n", "").replace(" AC-0003", ""));
  conductor.note(env.dir, { text: "still open" });
  const r = rules(await gate(env, "ready"));
  for (const rule of ["task-without-commit", "not-conventional", "no-trailer", "unplanned-file", "uncommitted-file", "missing-section", "trace-missing", "open-note"]) assert.ok(r.includes(rule), `${rule} in ${r}`);
});

test("delivery ships with real git and a dry-run PR, then GATE-C reject becomes fix items", async () => {
  const { env, plan, pr } = deliverySetup();
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.agent, "release-manager");
  mkdirSync(join(env.featureDir, "08-delivery"), { recursive: true });
  writeFileSync(join(env.featureDir, "08-delivery", "commits.yaml"), YAML.stringify(plan));
  writeFileSync(join(env.featureDir, "08-delivery", "pr.md"), pr);
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance");
  const shipped = JSON.parse(readFileSync(join(env.featureDir, "08-delivery", "ship.json"), "utf8"));
  assert.equal(shipped.branch, "factory/FEAT-001-coupons-at-checkout");
  assert.equal(featureState(env.featureDir).branch, shipped.branch);
  assert.deepEqual(shipped.commits.map((c) => c.task), ["TASK-001", "TASK-002", "TASK-003", null, null]);
  assert.equal(shipped.pr.dry_run, true);
  assert.deepEqual(shipped.pr.commands.map((c) => c.slice(0, 3).join(" ")), ["git push --set-upstream", "gh pr create"]);
  assert.match(execFileSync("git", ["log", "--format=%B", "-n", "5"], { cwd: env.dir, encoding: "utf8" }), /Factory-Task: TASK-002/);
  assert.equal(conductor.step(env.dir).gate, "GATE-C");

  const env2 = setup(["implementation", "delivery"]);
  const s = featureState(env2.featureDir);
  Object.assign(s, { stage: "delivery", status: "awaiting_human", awaiting_human: { gate: "GATE-C", stage: "delivery", since: new Date().toISOString() } });
  s.stages.implementation.status = "passed";
  writeFileSync(join(env2.featureDir, "state.json"), JSON.stringify(s));
  conductor.reject(env2.dir, { reason: "Trim spaces in the coupon code" });
  const after = featureState(env2.featureDir);
  assert.equal(after.stage, "implementation");
  assert.match(after.fix_pending.items[0].message, /HD-1: Trim spaces/);
  assert.equal(after.budgets.edges.delivery_to_implementation, 1);
});

test("S9: fetched PR comments reopen feedback; 'change' comments become fix items; a done feature is in the ledger", async () => {
  const env = setup(["implementation", "feedback"]);
  const s = featureState(env.featureDir);
  Object.assign(s, { stage: "feedback" });
  s.stages.implementation.status = "passed";
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  assert.equal(conductor.step(env.dir).action, "done", "no comments: S9 is skipped and the feature finishes");
  const ledger = YAML.parse(readFileSync(join(env.dir, ".factory", "ledger", "feature-ledger.yaml"), "utf8"));
  assert.equal(ledger.features[0].status, "changed");

  const comments = join(env.dir, "comments.json");
  writeFileSync(comments, JSON.stringify([{ id: "c1", body: "Trim spaces" }, { id: 2, body: "Why no i18n?" }]));
  const { spawnSync } = await import("node:child_process");
  const cli = () => spawnSync(process.execPath, [join(ENGINE, "scripts", "factory.mjs"), "comments", "--file", comments, "--project", env.dir], { encoding: "utf8" });
  assert.match(JSON.parse(cli().stdout).error, /has not shipped yet/);
  mkdirSync(join(env.featureDir, "08-delivery"), { recursive: true });
  writeFileSync(join(env.featureDir, "08-delivery", "ship.json"), JSON.stringify({ branch: "b", commits: [], pr: { dry_run: true } }));
  assert.equal(JSON.parse(cli().stdout).stage, "feedback");
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.agent, "release-manager");
  writeFileSync(join(env.featureDir, "08-delivery", "triage.yaml"), YAML.stringify({ feature: "FEAT-001", comments: [{ id: "c1", class: "change", summary: "Trim spaces before applying" }] }));
  let r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.deepEqual(r.gate.failures.map((f) => f.rule), ["unclassified"], "c2 is not classified");
  const d2 = conductor.step(env.dir).dispatches[0];
  writeFileSync(join(env.featureDir, "08-delivery", "triage.yaml"), YAML.stringify({ feature: "FEAT-001", comments: [{ id: "c1", class: "change", summary: "Trim spaces before applying" }, { id: "2", class: "question", answer: "No i18next in this app" }] }));
  r = await conductor.record(env.dir, { dispatchId: d2.id, envelopeText: envelope(d2.id) });
  const after = featureState(env.featureDir);
  assert.equal(after.stage, "implementation");
  assert.equal(after.fix_pending.items[0].message, "Trim spaces before applying");
  assert.ok(existsSync(join(env.featureDir, "08-delivery", "comments-handled-1.json")), "triaged comments are archived");
  assert.equal(after.stages.feedback.entered, false, "S9 checks for new comments again after the fix round");
});

test("task typecheck ignores errors that are only in acceptance tests", () => {
  const env = setup(["implementation"]);
  env.fake("typecheck", { code: 2, output: "src/pages/checkout/checkout.acceptance.test.tsx(13,24): error TS2322: Property 'isGuest' does not exist\n" });
  const stack = { cwd: env.dir, stack: { package_manager: "npm", commands: { typecheck: ["node", FAKE, "typecheck"] } } };
  assert.equal(typecheckForTask(stack, "t").ok, true);
  env.fake("typecheck", { code: 2, output: "src/pages/checkout/checkout.acceptance.test.tsx(1,1): error TS1\nsrc/x.ts(2,2): error TS2322: bad\n" });
  assert.equal(typecheckForTask(stack, "t2").ok, false);
});

// ── Regression tests for the phase-4 review findings ──

const shipPlan = (env, plan, pr) => {
  mkdirSync(join(env.featureDir, "08-delivery"), { recursive: true });
  writeFileSync(join(env.featureDir, "08-delivery", "commits.yaml"), YAML.stringify(plan));
  writeFileSync(join(env.featureDir, "08-delivery", "pr.md"), pr);
};
const gitOut = (env, args) => execFileSync("git", args, { cwd: env.dir, encoding: "utf8" });

test("ship commits only the planned paths: the user's staged work and task snapshots stay out", async () => {
  const { env, plan, pr } = deliverySetup();
  env.write("notes.txt", "my unrelated work\n");
  execFileSync("git", ["add", "notes.txt"], { cwd: env.dir });
  mkdirSync(join(env.featureDir, "snapshots", "TASK-002"), { recursive: true });
  writeFileSync(join(env.featureDir, "snapshots", "TASK-002", "total.ts.snapshot"), "copy\n");
  const d = conductor.step(env.dir).dispatches[0];
  shipPlan(env, plan, pr);
  assert.equal((await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) })).verdict, "advance");
  const shipped = gitOut(env, ["log", "--name-only", "--format="]);
  assert.doesNotMatch(shipped, /notes\.txt/);
  assert.doesNotMatch(shipped, /snapshots/);
  assert.match(shipped, /state\.json/, "the feature record is committed");
  assert.match(gitOut(env, ["diff", "--cached", "--name-only"]), /notes\.txt/, "still staged for the user");
});

test("ship refuses a branch pattern that names the default branch", async () => {
  const { env, plan, pr } = deliverySetup('policy: { branch_pattern: "main" }');
  const d = conductor.step(env.dir).dispatches[0];
  shipPlan(env, plan, pr);
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.action, "halt");
  assert.match(featureState(env.featureDir).halts.at(-1).reason, /is the default branch/);
});

test("with real PRs on, a failed push blocks instead of asking for GATE-C", async () => {
  const { env, plan, pr } = deliverySetup("delivery: { dry_run: false }");
  const d = conductor.step(env.dir).dispatches[0];
  shipPlan(env, plan, pr);
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.action, "halt", "there is no origin remote, so git push fails");
  assert.match(featureState(env.featureDir).halts.at(-1).reason, /pull request was not opened — git push/);
});

test("a fix round starts verification fresh: no stale findings, no escalation, a new dispatch id", async () => {
  const env = setup(["implementation", "verification"]);
  const s0 = featureState(env.featureDir);
  s0.stage = "verification";
  s0.stages.implementation.status = "passed";
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s0));
  env.fake("test", { code: 0, report: report({}) });
  for (const d of conductor.step(env.dir).dispatches) {
    await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { findings: d.agent === "reviewer" ? [{ lens: "tests", severity: "P0", claim: "crash" }] : [] }) });
  }
  const st = featureState(env.featureDir);
  assert.deepEqual([st.stages.verification.attempts, st.stages.verification.prior_attempts, st.stages.verification.fingerprints, st.stages.verification.findings, st.stages.verification.instruction], [0, 1, [], [], null]);
  Object.assign(st, { stage: "verification", fix_pending: null });
  st.stages.implementation.status = "passed";
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(st));
  const again = conductor.step(env.dir).dispatches;
  assert.ok(again.every((d) => d.id.endsWith("/a2")), again.map((d) => d.id).join());
  for (const d of again) await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(featureState(env.featureDir).status, "done", "the old P0 is gone from review.md");
});

test("a fix plan that fails gate-plan is retried once with the failures, then blocks; replay drops it", async () => {
  const env = setup(["implementation", "verification"]);
  const s0 = featureState(env.featureDir);
  Object.assign(s0, { stage: "implementation", fix_pending: { source: "verification", items: [{ check: "review", message: "crash" }], attempts: 0 } });
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s0));
  const broken = (t) => t.replace("type: feature-ui", "type: wizardry");
  let d = conductor.step(env.dir).dispatches[0];
  putArtifact(env.featureDir, "tasks.yaml", "04-plan/tasks.yaml", broken);
  await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(featureState(env.featureDir).status, "active");
  d = conductor.step(env.dir).dispatches[0];
  assert.match(d.id, /fix1\/planner\/a2$/);
  assert.match(readFileSync(join(env.dir, d.pack), "utf8"), /unknown-task-type/);
  await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(featureState(env.featureDir).status, "blocked");
  conductor.replay(env.dir, { stage: "implementation", feedback: "start over" });
  assert.equal(featureState(env.featureDir).fix_pending, null);
});

test("rejecting a CLARIFY at delivery revises delivery; only GATE-C rejects start a fix round", () => {
  const env = setup(["implementation", "delivery"]);
  const s = featureState(env.featureDir);
  Object.assign(s, { stage: "delivery", status: "awaiting_human", awaiting_human: { gate: "CLARIFY", stage: "delivery", since: new Date().toISOString() } });
  s.stages.implementation.status = "passed";
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  conductor.reject(env.dir, { reason: "Do not mention the old checkout" });
  const after = featureState(env.featureDir);
  assert.deepEqual([after.stage, after.fix_pending ?? null], ["delivery", null]);
  assert.match(after.stages.delivery.feedback, /Do not mention the old checkout/);
});

test("gate-qa: a waiver note must name the defect", async () => {
  const env = setup(["qa"]);
  mkdirSync(join(env.featureDir, "07-qa"), { recursive: true });
  writeFileSync(join(env.featureDir, "07-qa", "qa-report.md"), "report\n");
  conductor.note(env.dir, { text: "Use the brand blue" });
  writeFileSync(join(env.featureDir, "07-qa", "defects.yaml"), YAML.stringify({ feature: "FEAT-001", charters: [{ id: "CH-1", mission: "m", timebox_min: 10, result: "defects" }], defects: [{ id: "DEF-003", type: "defect", severity: "S1", title: "t", steps: ["s"], expected: "e", actual: "a", waived_by: "HD-1" }] }));
  assert.deepEqual(rules(await gate(env, "qa")), ["open-S1"]);
});

test("gate-verify and gate-acceptance fail when no enabled role can run tests", async () => {
  const env = setup(["verification"]);
  const cfg = join(env.dir, ".factory", "factory.config.yaml");
  writeFileSync(cfg, readFileSync(cfg, "utf8").replace("enabled: true", "enabled: false"));
  env.write(ACCEPT, 'test("AC-0001 x", () => {});\n');
  mkdirSync(join(env.featureDir, "06-verify"), { recursive: true });
  writeFileSync(join(env.featureDir, "06-verify", "review.md"), "---\nfeature: FEAT-001\nround: 1\nfindings: []\n---\n");
  assert.deepEqual(rules(await gate(env, "verify")), ["no-stack"]);
  assert.deepEqual(rules(await gate(env, "acceptance")), ["no-stack"]);
});
