// Batch 3 of the post-phase-5 audit fixes: the build-to-PR gates (S5–S9) reject plausible but poor
// work — wrong-reason reds, a readable or edited acceptance holdout, mislabelled commits, a fake trace
// table, unplanned changes, self-approved migrations, untested integration, unproven ACs, blocked QA.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, envelope, loopSetup, makeFeature, makeProject, putArtifact, putIntake, report } from "./helpers.mjs";

const ROOT = join(TESTS, "..", "..");
const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");
const V2 = (name) => join(ROOT, "app-dev-kitv2", name);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const saveState = (dir, s) => writeFileSync(join(dir, "state.json"), JSON.stringify(s));
const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { goodRedFailure } = await import(`${ENGINE}/scripts/lib/vitest-report.mjs`);
const { decideBash } = await import(`${ENGINE}/hooks/guard.mjs`);
const MIGRATIONS = join(V2("factory-role-backend"), "scripts", "check-migrations.mjs");

const gate = async (dir, name, extra = {}) => {
  const c = conductor.load(dir);
  return runGate(name, gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs, ...extra }), { useCache: false });
};
const rules = (r) => r.failures.map((f) => f.rule);
const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
const write = (dir, file, text) => {
  mkdirSync(join(dir, file, ".."), { recursive: true });
  writeFileSync(join(dir, file), text);
};

/** A project past implementation with the quality and delivery packs, a fake stack and git history. */
function shipped(stages = ["verification"], extra = "") {
  const dir = makeProject(
    [
      `packs: { factory-role-frontend: "${V2("factory-role-frontend")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}", factory-analysis: "${V2("factory-analysis")}", factory-quality: "${V2("factory-quality")}", factory-delivery: "${V2("factory-delivery")}", factory-adapter-github: "${V2("factory-adapter-github")}" }`,
      `roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: ["src/**"], stack_overrides: { commands: { typecheck: [node, "${FAKE}", typecheck], lint: [node, "${FAKE}", lint], architecture_check: [node, "${FAKE}", arch], build: [node, "${FAKE}", build], test: [node, "${FAKE}", test, "{report}"], test_integration: [node, "${FAKE}", integration] } } } }`,
      `pipeline: { profiles: { test: [planning, implementation, ${stages.join(", ")}] }, stages: { planning: { pack: factory-analysis } } }`,
      extra,
    ].join("\n"),
  );
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.invalid");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, ".git", "info", "exclude"), ".fake\n");
  git(dir, "add", "-A", "--", ".", ":(exclude).factory");
  git(dir, "commit", "-q", "-m", "baseline");
  const featureDir = makeFeature(dir, { stages: ["planning", "implementation", ...stages] });
  putIntake(dir);
  for (const [f, t] of [["delta-spec.yaml", "01-requirements/delta-spec.yaml"], ["stories.yaml", "02-stories/stories.yaml"], ["tasks.yaml", "04-plan/tasks.yaml"], ["test-plan.yaml", "04-plan/test-plan.yaml"]]) putArtifact(featureDir, f, t);
  const s = featureState(featureDir);
  Object.assign(s, { stage: stages[0], tasks: { "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { status: "done" } } });
  s.stages.planning.status = "passed";
  s.stages.implementation.status = "passed";
  saveState(featureDir, s);
  const fake = (command, body) => {
    mkdirSync(join(dir, ".fake"), { recursive: true });
    writeFileSync(join(dir, ".fake", `${command}.json`), JSON.stringify(body));
  };
  return { dir, featureDir, fake };
}

test("a red must fail on an assertion or 'not implemented' — never on the environment", () => {
  for (const [m, ok] of [
    ["AssertionError: expected 1 to be 2", true],
    ["Error: not implemented", true],
    ["TestingLibraryElementError: Unable to find a label with the text of: Coupon code", true],
    ["Error: Invalid environment: DATABASE_URL expected string, received undefined", false],
    ["Error: connect ECONNREFUSED 127.0.0.1:5432 (expected server)", false],
    ["Error: Test timed out in 5000ms.", false],
    ["TypeError: total is not a function", false],
  ]) assert.equal(goodRedFailure(m), ok, m);
});

test("the acceptance tests are a holdout: hidden from builders and locked once their gate passes", async () => {
  const env = loopSetup();
  const d = conductor.step(env.dir).dispatches[0];
  const active = JSON.parse(readFileSync(join(env.dir, ".factory", ".active", readdirSync(join(env.dir, ".factory", ".active")).find((f) => f.endsWith(".json"))), "utf8"));
  assert.ok(active.read_deny.includes("**/*.acceptance.test.*"), d.agent);
  const file = "src/pages/checkout/checkout.acceptance.test.tsx";
  write(env.dir, file, 'test("AC-0001 x", () => {});\n');
  const { fileHash } = await import(`${ENGINE}/scripts/lib/core.mjs`);
  const s = featureState(env.featureDir);
  s.acceptance_lock = { [file]: fileHash(join(env.dir, file)) };
  saveState(env.featureDir, s);
  write(env.dir, file, 'test("AC-0001 x", () => { expect(1).toBe(1); });\n');
  env.fake("test", { code: 0, report: report({}) });
  const c = conductor.load(env.dir);
  const t = YAML.parse(readFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), "utf8")).tasks[0];
  const { resolveStack } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
  const r = await gate(env.dir, "impl", { task: t, stack: resolveStack(c, t.role) });
  assert.ok(rules(r).includes("acceptance-test-changed"), rules(r).join());
});

test("gate-verify: old skips elsewhere are not the feature's problem; skips in its own files are; integration runs", async () => {
  const env = shipped(["verification"]);
  mkdirSync(join(env.featureDir, "06-verify"), { recursive: true });
  writeFileSync(join(env.featureDir, "06-verify", "review.md"), "---\nfeature: FEAT-001\nround: 1\nfindings: []\n---\n");
  writeFileSync(join(env.featureDir, "06-verify", "change-set.yaml"), YAML.stringify({ feature: "FEAT-001", tasks: [{ id: "TASK-002", files: ["src/entities/order/model/total.test.ts"] }] }));
  env.fake("test", { code: 0, report: report({ [join(env.dir, "src/legacy.test.ts")]: [["old", "skipped"]], [join(env.dir, "src/entities/order/model/total.test.ts")]: [["new", "skipped"]] }) });
  env.fake("integration", { code: 1, output: "Error: Could not find a working container runtime strategy" });
  let r = await gate(env.dir, "verify");
  assert.deepEqual(rules(r).sort(), ["failing", "integration-not-run"], "only the feature's own skipped test fails");
  env.fake("integration", { code: 1, output: "1 failed: deployments table missing" });
  r = await gate(env.dir, "verify");
  assert.ok(r.failures.some((f) => f.rule === "integration-failing" && f.fix), JSON.stringify(r.failures));
});

test("the change set carries the real diff; reviewers get no exit check and do not write review.md", async () => {
  const env = shipped(["verification"]);
  write(env.dir, "src/entities/order/model/total.ts", "export const total = 1;\n");
  write(env.dir, "src/stray.ts", "export const stray = 1;\n");
  const d = (await conductor.stepAsync(env.dir)).dispatches.find((x) => x.agent === "reviewer");
  const set = YAML.parse(readFileSync(join(env.featureDir, "06-verify", "change-set.yaml"), "utf8"));
  assert.ok(set.changed.includes("src/entities/order/model/total.ts") && set.outside_plan.includes("src/stray.ts"), JSON.stringify(set));
  assert.match(readFileSync(join(env.featureDir, "06-verify", "change.diff"), "utf8"), /\+export const stray = 1;/);
  const pack = readFileSync(join(env.dir, d.pack), "utf8");
  assert.doesNotMatch(pack, /Exit check/);
  assert.match(pack, /review: written by the engine from your envelope/);
});

function readyFiles(env, { commits, trace }) {
  mkdirSync(join(env.featureDir, "08-delivery"), { recursive: true });
  writeFileSync(join(env.featureDir, "08-delivery", "commits.yaml"), YAML.stringify({ feature: "FEAT-001", commits }));
  writeFileSync(join(env.featureDir, "08-delivery", "pr.md"), `# feat: Coupons (FEAT-001)\n\n## Summary\nx\n\n## Spec trace\n${trace}\n\n## Docs\nx\n\n## Provenance\nx\n`);
}
const C = (task, files, subject = "feat(order): x") => ({ ...(task ? { task } : {}), message: `${subject}\n\n${task ? `Factory-Task: ${task}` : ""}`, files });

test("gate-ready: commits hold their own task's files, the trace names real doers and tests, nothing is left behind", async () => {
  const env = shipped(["delivery"]);
  for (const f of ["src/entities/order/model/total.characterisation.test.ts", "src/entities/order/model/total.ts", "src/entities/order/model/total.test.ts", "src/features/apply-coupon/ui/coupon-field.tsx", "src/features/apply-coupon/ui/coupon-field.test.tsx", "src/forgotten.ts"]) write(env.dir, f, "x\n");
  readyFiles(env, {
    commits: [
      C("TASK-001", ["src/entities/order/model/total.characterisation.test.ts"]),
      C("TASK-002", ["src/features/apply-coupon/ui/coupon-field.tsx", "src/features/apply-coupon/ui/coupon-field.test.tsx"]),
      C("TASK-003", ["src/entities/order/model/total.ts", "src/entities/order/model/total.test.ts"]),
    ],
    trace: "| AC-0001 | TASK-002 | TEST-0001 |\n| AC-0002 | TASK-003 | TEST-0099 |\n| AC-0003 | TASK-002 | TEST-0003 |",
  });
  const r = rules(await gate(env.dir, "ready"));
  for (const rule of ["mislabelled-file", "trace-wrong-task", "trace-unknown-test", "uncommitted-change"]) assert.ok(r.includes(rule), `${rule} in ${r}`);
});

test("check-migrations: approvals name a settled human note, rollbacks do something, more statements are destructive", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-mig3-"));
  mkdirSync(join(dir, "drizzle", "meta"), { recursive: true });
  mkdirSync(join(dir, "drizzle", "rollback"), { recursive: true });
  writeFileSync(join(dir, "drizzle/meta/_journal.json"), JSON.stringify({ entries: [{ tag: "0004_x" }] }));
  writeFileSync(join(dir, "drizzle/rollback/0004_x.down.sql"), "SELECT 1;\n");
  writeFileSync(join(dir, "drizzle/0004_x.sql"), ['-- factory: approved HD-9', 'DROP TABLE "a";', '-- factory: approved HD-2', 'ALTER TABLE "b" DROP CONSTRAINT "b_fk";', 'ALTER TABLE "c" ALTER COLUMN "x" SET NOT NULL;', 'UPDATE "d" SET "y" = 1;', 'UPDATE "d" SET "y" = 2 WHERE id = 1;', ""].join("\n"));
  const out = spawnSync(process.execPath, [MIGRATIONS, "--project", dir, "--notes", "HD-2:open", "--files", "drizzle/0004_x.sql"], { encoding: "utf8" }).stdout;
  assert.match(out, /rollback .* does nothing/);
  assert.match(out, /HD-9 approves .* no such human note/);
  assert.match(out, /HD-2 is still open/);
  assert.match(out, /:5: destructive statement .*SET NOT NULL/);
  assert.match(out, /:6: destructive statement .*UPDATE "d" SET "y" = 1/);
  assert.doesNotMatch(out, /:7:/, "an UPDATE with WHERE is not destructive");
});

test("gate-qa: some charter must run; defects become fix items with their steps", async () => {
  const env = shipped(["qa"]);
  mkdirSync(join(env.featureDir, "07-qa"), { recursive: true });
  writeFileSync(join(env.featureDir, "07-qa", "qa-report.md"), "r\n");
  const record = (charters, defects) => writeFileSync(join(env.featureDir, "07-qa", "defects.yaml"), YAML.stringify({ feature: "FEAT-001", charters, defects }));
  record([{ id: "CH-1", mission: "m", timebox_min: 10, result: "blocked" }], []);
  assert.deepEqual(rules(await gate(env.dir, "qa")), ["no-charter-ran"]);
  record([{ id: "CH-1", mission: "m", timebox_min: 10, result: "defects" }], [{ id: "DEF-001", type: "defect", severity: "S2", title: "t", steps: ["open checkout", "apply B2B10 twice"], expected: "one discount", actual: "two" }]);
  const f = (await gate(env.dir, "qa")).failures[0];
  assert.match(f.message, /steps: 1\) open checkout 2\) apply B2B10 twice/);
});

test("QA can reach the app on this machine, and nothing else", () => {
  const actives = [{ id: "x", agent: "qa-engineer", subagent_type: "factory-quality:qa-engineer", write_allow: [] }];
  const bash = (command) => decideBash({ agent_type: "qa-engineer", tool_input: { command } }, actives, "/p");
  assert.equal(bash("curl -s http://localhost:5173/checkout"), null);
  assert.equal(bash("curl -X POST http://127.0.0.1:3000/api/v1/x"), null);
  assert.match(bash("curl https://api.example.com"), /outside this machine/);
  assert.match(bash("wget http://localhost.evil.com/x"), /outside this machine/);
});

test("the ledger entry is written at ship, so the artifacts commit carries it", async () => {
  const env = shipped(["delivery"]);
  for (const f of ["src/entities/order/model/total.characterisation.test.ts", "src/entities/order/model/total.ts", "src/entities/order/model/total.test.ts", "src/features/apply-coupon/ui/coupon-field.tsx", "src/features/apply-coupon/ui/coupon-field.test.tsx"]) write(env.dir, f, "x\n");
  readyFiles(env, {
    commits: [
      C("TASK-001", ["src/entities/order/model/total.characterisation.test.ts"], "test(order): pin"),
      C("TASK-002", ["src/entities/order/model/total.ts", "src/entities/order/model/total.test.ts"]),
      C("TASK-003", ["src/features/apply-coupon/ui/coupon-field.tsx", "src/features/apply-coupon/ui/coupon-field.test.tsx"]),
    ],
    trace: "| AC-0001 | TASK-003 | TEST-0001 |\n| AC-0002 | TASK-003 | TEST-0002 |\n| AC-0003 | TASK-002 | TEST-0003 |",
  });
  const d = conductor.step(env.dir).dispatches[0];
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures));
  const branch = JSON.parse(readFileSync(join(env.featureDir, "08-delivery", "ship.json"), "utf8")).branch;
  const ledger = YAML.parse(git(env.dir, "show", `${branch}:.factory/ledger/feature-ledger.yaml`));
  assert.equal(ledger.features[0].pr, `branch ${branch}`);
});

// ── Regression tests for the batch-3 review findings ──

test("an assertion is a red even when it is about an error code or ZodError; jest-dom and node:assert count", () => {
  for (const m of [
    "AssertionError: expected [Function] to throw 'ZodError' but 'Error: not implemented' was thrown",
    "AssertionError: expected undefined to be 'ETIMEDOUT'",
    "Error: expect(element).toBeDisabled()",
    "TestingLibraryElementError: Unable to find an accessible element with the role \"button\"",
    "AssertionError [ERR_ASSERTION]: Expected values to be strictly equal",
  ]) assert.equal(goodRedFailure(m), true, m);
});

test("ready: changes from before the feature are not its own; a deleted planned file must ship; paths with spaces parse", async () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-tree-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.invalid");
  git(dir, "config", "user.name", "T");
  write(dir, "app/old.ts", "1\n");
  write(dir, "app/keep.ts", "1\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  write(dir, "app/notes before.txt", "mine\n");
  const { workingTreeChanges, featureChanges } = await import(`${ENGINE}/scripts/lib/delivery.mjs`);
  const sub = join(dir, "app");
  const baseline = workingTreeChanges(sub).hashes;
  assert.deepEqual(Object.keys(baseline), ["notes before.txt"], "paths relative to a project in a subfolder");
  git(dir, "rm", "-q", "app/old.ts");
  write(dir, "app/new file.ts", "2\n");
  const now = featureChanges(sub, baseline);
  assert.deepEqual(now.changed.sort(), ["new file.ts", "old.ts"]);
  assert.deepEqual(now.deleted, ["old.ts"]);
});

test("a drifted acceptance test is restored before the gate runs; replaying acceptance keeps finished tasks", async () => {
  const env = loopSetup();
  const file = "src/pages/checkout/checkout.acceptance.test.tsx";
  write(env.dir, file, 'test("AC-0001 x", () => {});\n');
  const { fileHash } = await import(`${ENGINE}/scripts/lib/core.mjs`);
  const s = featureState(env.featureDir);
  s.acceptance_lock = { [file]: fileHash(join(env.dir, file)) };
  s.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, s);
  write(env.featureDir, `acceptance-lock/${file}.snapshot`, 'test("AC-0001 x", () => {});\n');
  const d = conductor.step(env.dir).dispatches[0];
  write(env.dir, file, "// reformatted by prettier\n");
  env.fake("test", { code: 1, report: report({}) });
  await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(readFileSync(join(env.dir, file), "utf8"), 'test("AC-0001 x", () => {});\n');
  const dir = makeProject(`packs: { factory-analysis: "${V2("factory-analysis")}", factory-quality: "${V2("factory-quality")}" }\npipeline: { profiles: { test: [planning, acceptance, implementation] }, stages: { planning: { pack: factory-analysis } } }`);
  const featureDir = makeFeature(dir, { stages: ["planning", "acceptance", "implementation"] });
  const s2 = featureState(featureDir);
  Object.assign(s2, { stage: "implementation", acceptance_lock: { [file]: "x" }, tasks: { "TASK-001": { status: "done" } } });
  saveState(featureDir, s2);
  conductor.replay(dir, { stage: "acceptance", feedback: "AC-0002's test asserts the wrong message" });
  const after = featureState(featureDir);
  assert.deepEqual([after.stage, after.tasks["TASK-001"]?.status, after.acceptance_lock], ["acceptance", "done", null]);
});

test("per-AC eval proof covers the ACs the plan gives the task as eval cases; skips pass only where allowed", async () => {
  const { resolveStack } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
  const extra = `packs: { factory-role-ai-agent: "${V2("factory-role-ai-agent")}", node-agent-dev-kit: "${join(ROOT, "node-agent-dev-kit")}" }\nroles: { frontend: { enabled: false }, ai-agent: { enabled: true, pack: factory-role-ai-agent, stack: node-agent-dev-kit, path: ".", owns_paths: ["evals/**", "src/**"], stack_overrides: { commands: { typecheck: [node, "${FAKE}", typecheck], lint: [node, "${FAKE}", lint], architecture_check: [node, "${FAKE}", arch], build: [node, "${FAKE}", build], test: [node, "${FAKE}", test, "{report}"], eval: [node, "${FAKE}", eval, "{report}"] } } } }`;
  const dir = makeProject(extra);
  const featureDir = makeFeature(dir, { stages: ["implementation"] });
  const task = { id: "TASK-007", role: "ai-agent", type: "eval", title: "cases", depends_on: [], satisfies: ["AC-0001", "AC-0002"], files_expected: ["evals/golden/a.json"], tdd: { mode: "exempt", reason: "eval" }, reuse: { considered: [], reuse_rejected: "new" }, definition_of_done: ["x"], size: { files: 1, est_loc: 5 } };
  write(featureDir, "04-plan/tasks.yaml", YAML.stringify({ feature: "FEAT-001", tasks: [task] }));
  write(featureDir, "04-plan/test-plan.yaml", YAML.stringify({ feature: "FEAT-001", cases: [{ id: "TEST-0001", ac: "AC-0001", level: "eval", title: "a", task: "TASK-007" }, { id: "TEST-0002", ac: "AC-0002", level: "eval", title: "b", task: "TASK-007" }] }));
  mkdirSync(join(dir, ".fake"), { recursive: true });
  writeFileSync(join(dir, ".fake", "test.json"), JSON.stringify({ code: 0, report: report({}) }));
  const evalFile = join(dir, "evals", "a.eval.ts");
  const run = async (tests) => {
    writeFileSync(join(dir, ".fake", "eval.json"), JSON.stringify({ code: 0, report: report({ [evalFile]: tests }) }));
    const c = conductor.load(dir);
    return rules(await runGate("impl", gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs, task, stack: resolveStack(c, "ai-agent") }), { useCache: false }));
  };
  assert.deepEqual(await run([["AC-0001-refund", "passed"], ["pass rate", "passed"]]), ["eval-ac-not-proven"], "AC-0002 has no passing case");
  assert.deepEqual(await run([["AC-0001-refund", "passed"], ["AC-0002-monthly", "passed"]]), []);
});

test("migration approvals must be about the task; QA answers name the defects they settle", async () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-mig4-"));
  mkdirSync(join(dir, "drizzle", "meta"), { recursive: true });
  mkdirSync(join(dir, "drizzle", "rollback"), { recursive: true });
  writeFileSync(join(dir, "drizzle/meta/_journal.json"), JSON.stringify({ entries: [{ tag: "0005_x" }] }));
  writeFileSync(join(dir, "drizzle/rollback/0005_x.down.sql"), 'CREATE TABLE "a" (id int);\n');
  writeFileSync(join(dir, "drizzle/0005_x.sql"), '-- factory: approved HD-1\nDROP TABLE "a"; -- the old table\nDELETE FROM "b";\n');
  const out = spawnSync(process.execPath, [MIGRATIONS, "--project", dir, "--notes", "HD-1:mapped", "--files", "drizzle/0005_x.sql"], { encoding: "utf8" }).stdout;
  assert.match(out, /HD-1 is not an approval of this migration/);
  assert.match(out, /:3: destructive statement .*DELETE FROM "b"/, "a trailing comment ends a statement");
  assert.equal(spawnSync(process.execPath, [MIGRATIONS, "--project", dir, "--notes", "HD-1:approved", "--files", "drizzle/0005_x.sql"], { encoding: "utf8" }).stdout.includes("HD-1"), false);

  const env = shipped(["qa"]);
  const s = featureState(env.featureDir);
  Object.assign(s, { status: "awaiting_human", awaiting_human: { gate: "CLARIFY", stage: "qa", since: new Date().toISOString(), questions: ["DEF-003 (S2 spec gap): is a second coupon allowed?"] } });
  saveState(env.featureDir, s);
  conductor.approve(env.dir, { notes: "No, one coupon per order" });
  const note = YAML.parse(readFileSync(join(env.featureDir, "human-notes.yaml"), "utf8"))[0];
  assert.match(note.text, /\(answers DEF-003\)/);
});

test("curl and wget reach loopback only, however the URL is written", () => {
  const actives = [{ id: "x", agent: "qa-engineer", subagent_type: "factory-quality:qa-engineer", write_allow: [] }];
  const bash = (command) => decideBash({ agent_type: "qa-engineer", tool_input: { command } }, actives, "/p");
  for (const c of ["curl http://localhost:1@evil.com/x", "curl evil.com", "curl HTTP://Evil.com"]) assert.match(bash(c), /outside this machine/, c);
  assert.equal(bash('curl -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:3000/api'), null);
});

test("the ledger keeps one version per delivery when the same branch ships again", async () => {
  const { recordInLedger } = await import(`${ENGINE}/scripts/lib/delivery.mjs`);
  const env = shipped(["delivery"]);
  write(env.dir, ".factory/ledger/feature-ledger.yaml", "note: hand-edited\n");
  const c = conductor.load(env.dir);
  assert.equal(recordInLedger(c, [], { branch: "factory/x" }).version, 1, "a ledger without features still works");
  assert.equal(recordInLedger(c, [], { branch: "factory/x" }).version, 1);
  assert.equal(recordInLedger(c, [], { branch: "factory/y" }).version, 2);
});
