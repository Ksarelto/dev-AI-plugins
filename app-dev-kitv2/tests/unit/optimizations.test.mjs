// Batch 5 of the post-phase-5 audit: less repeated work for the same guarantees — task gates run their
// commands side by side and only the tests the change touches, a passing exit check is not run again
// at record, verification checks the build before any reviewer is dispatched, role audits are scripts,
// the engine writes the digest, record hands back the next step, and packs inline the digest.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CLI, ENGINE, TESTS, conductor, envelope, hook, makeFeature, makeProject, putArtifact, putIntake, report } from "./helpers.mjs";

const ROOT = join(TESTS, "..", "..");
const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");
const V2 = (name) => join(ROOT, "app-dev-kitv2", name);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const saveState = (dir, s) => writeFileSync(join(dir, "state.json"), JSON.stringify(s));
const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { coveredCommands } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
const { resolveStack } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
const write = (dir, file, text) => {
  mkdirSync(join(dir, file, ".."), { recursive: true });
  writeFileSync(join(dir, file), text);
};

/** A git project with the frontend role on a fake stack (it logs its calls), at `stage`. */
function project(stage, tasks) {
  const dir = makeProject(
    [
      `packs: { factory-role-frontend: "${V2("factory-role-frontend")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}", factory-analysis: "${V2("factory-analysis")}", factory-quality: "${V2("factory-quality")}", factory-delivery: "${V2("factory-delivery")}" }`,
      `roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: ["src/**"], stack_overrides: { commands: { typecheck: [node, "${FAKE}", typecheck], lint: [node, "${FAKE}", lint], architecture_check: [node, "${FAKE}", arch], build: [node, "${FAKE}", build], test: [node, "${FAKE}", test, "{report}"], test_integration: null } } } }`,
      `pipeline: { profiles: { test: [planning, implementation, verification, qa] }, stages: { planning: { pack: factory-analysis } } }`,
    ].join("\n"),
  );
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.invalid");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, ".git", "info", "exclude"), ".fake\n");
  git(dir, "add", "-A", "--", ".", ":(exclude).factory");
  git(dir, "commit", "-q", "-m", "baseline");
  const featureDir = makeFeature(dir, { stages: ["planning", "implementation", "verification", "qa"] });
  putIntake(dir);
  for (const [f, t] of [["delta-spec.yaml", "01-requirements/delta-spec.yaml"], ["stories.yaml", "02-stories/stories.yaml"], ["tasks.yaml", "04-plan/tasks.yaml"], ["test-plan.yaml", "04-plan/test-plan.yaml"]]) putArtifact(featureDir, f, t);
  const s = featureState(featureDir);
  Object.assign(s, { stage, tasks });
  s.stages.planning.status = "passed";
  if (stage !== "implementation") s.stages.implementation.status = "passed";
  saveState(featureDir, s);
  mkdirSync(join(dir, ".fake"), { recursive: true });
  const fake = (command, body) => writeFileSync(join(dir, ".fake", `${command}.json`), JSON.stringify(body));
  const calls = () => (existsSync(join(dir, ".fake", "calls.log")) ? readFileSync(join(dir, ".fake", "calls.log"), "utf8").trim().split("\n") : []);
  return { dir, featureDir, fake, calls };
}

const taskCtx = (dir, id) => {
  const c = conductor.load(dir);
  const task = gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config }).load("tasks").data.tasks.find((t) => t.id === id);
  return gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config, task, stack: resolveStack(c, task.role), packs: c.packs });
};
const TOTAL_TEST = "src/entities/order/model/total.test.ts";

test("gate-impl runs the change's tests (--changed) until the role's last task, which runs them all", async () => {
  const env = project("implementation", { "TASK-001": { status: "done" }, "TASK-002": { status: "green", phase: "green" }, "TASK-003": { status: "pending" } });
  write(env.dir, TOTAL_TEST, "x\n");
  env.fake("test", { code: 0, report: report({ [join(env.dir, TOTAL_TEST)]: [["total", "passed"]] }) });
  assert.equal((await runGate("impl", taskCtx(env.dir, "TASK-002"), { useCache: false })).pass, true);
  assert.ok(env.calls().includes("test --changed"), env.calls().join(" | "));
  const s = featureState(env.featureDir);
  s.tasks["TASK-003"].status = "done";
  saveState(env.featureDir, s);
  writeFileSync(join(env.dir, ".fake", "calls.log"), "");
  assert.equal((await runGate("impl", taskCtx(env.dir, "TASK-002"), { useCache: false })).pass, true);
  assert.deepEqual(env.calls().filter((x) => x.startsWith("test")), ["test"], "the last task of the role runs the whole suite");
});

test("a passing task gate is reused while the working tree is unchanged — the agent's exit check is not run twice", async () => {
  const env = project("implementation", { "TASK-001": { status: "done" }, "TASK-002": { status: "green", phase: "green" }, "TASK-003": { status: "pending" } });
  write(env.dir, TOTAL_TEST, "x\n");
  env.fake("test", { code: 0, report: report({ [join(env.dir, TOTAL_TEST)]: [["total", "passed"]] }) });
  const first = await runGate("impl", taskCtx(env.dir, "TASK-002"));
  const runs = env.calls().filter((x) => x.startsWith("test")).length;
  const again = await runGate("impl", taskCtx(env.dir, "TASK-002"));
  assert.deepEqual([first.cached, again.cached], [false, true]);
  assert.equal(env.calls().filter((x) => x.startsWith("test")).length, runs, "nothing ran the second time");
  write(env.dir, "src/entities/order/model/total.ts", "export const total = 2;\n");
  assert.equal((await runGate("impl", taskCtx(env.dir, "TASK-002"))).cached, false, "a changed file runs it again");
  env.fake("test", { code: 1, report: report({ [join(env.dir, TOTAL_TEST)]: [["total", "failed", "AssertionError: x"]] }) });
  write(env.dir, "src/entities/order/model/total.ts", "export const total = 3;\n");
  const failed = await runGate("impl", taskCtx(env.dir, "TASK-002"));
  assert.equal(failed.pass, false);
  assert.equal((await runGate("impl", taskCtx(env.dir, "TASK-002"))).cached, false, "a failure is never reused");
});

test("an architecture check the lint script already runs, and a tsc-only build, are left out of task gates", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-covered-"));
  const stack = (scripts, extra = {}) => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts }));
    return { cwd: dir, stack: { commands: { lint: { script: "lint" }, build: { script: "build" }, architecture_check: { exec: "depcruise", args: ["src"] }, ...extra } } };
  };
  assert.deepEqual([...coveredCommands(stack({ lint: "eslint . && depcruise src", build: "tsc -p tsconfig.build.json" }))].sort(), ["architecture_check", "build"]);
  assert.deepEqual([...coveredCommands(stack({ lint: "eslint .", build: "vite build" }))], []);
  assert.deepEqual([...coveredCommands(stack({ lint: "eslint .", build: "tsc && vite build" }))], [], "a build that does more than tsc stays");
  assert.deepEqual([...coveredCommands(stack({ lint: "eslint .", build: "tsc" }), { quality: { impl_build: true } })], [], "impl_build: true keeps it");
  assert.deepEqual([...coveredCommands(stack({ lint: "eslint .", build: "vite build" }), { quality: { impl_build: false } })], ["build"]);
});

test("verification checks the build first: failing tests go to the fix loop with no reviewer dispatched", async () => {
  const env = project("verification", { "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { status: "done" } });
  const accept = "src/pages/checkout/checkout.acceptance.test.tsx";
  write(env.dir, accept, 'test("AC-0001 x", () => {});\n');
  env.fake("test", { code: 1, report: report({ [join(env.dir, accept)]: [["AC-0001 x", "failed", "AssertionError: no"]] }) });
  const r = await conductor.stepAsync(env.dir);
  assert.equal(r.dispatches?.[0]?.phase, "fixplan", JSON.stringify(r).slice(0, 300));
  const s = featureState(env.featureDir);
  assert.equal(s.fix_pending.source, "verification");
  assert.ok(s.fix_pending.items.some((i) => i.rule === "acceptance-failing"));
  assert.equal(s.stages.verification.dispatches ?? 0, 0, "no reviewer was dispatched");
});

test("verification with a green build dispatches only the reviewer; gate-verify reuses the passing checks and adds role audits", async () => {
  const env = project("verification", { "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { status: "done" } });
  write(env.dir, "src/features/apply-coupon/ui/coupon-field.tsx", 'export const C = () => <i style={{ color: "rgb(1,2,3)" }} />;\n');
  env.fake("test", { code: 0, report: report({}) });
  const s = await conductor.stepAsync(env.dir);
  assert.deepEqual(s.dispatches.map((d) => d.agent), ["reviewer"]);
  const runs = env.calls().filter((x) => x.startsWith("test")).length;
  const r = await conductor.record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate));
  assert.equal(env.calls().filter((x) => x.startsWith("test")).length, runs, "the precheck's passing run was reused");
  const review = readFileSync(join(env.featureDir, "06-verify", "review.md"), "utf8");
  assert.match(review, /\(audit, frontend:raw-colours\) `src\/features\/apply-coupon\/ui\/coupon-field\.tsx:1`/);
});

test("record --saved takes the envelope the stop hook kept; the last record of a batch returns the next step", () => {
  const dir = makeProject("pipeline: { stages: { requirements: { agents: [spec-writer, story-writer-fx], parallel: true, human_gate: null } } }\ncontext: { digest: engine }");
  const featureDir = makeFeature(dir);
  putIntake(dir);
  const { dispatches } = conductor.step(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  for (const d of dispatches) assert.equal(hook(dir, "subagent-stop", { agent_type: d.agent, last_assistant_message: `done\n\`\`\`json\n${envelope(d.id)}\n\`\`\`` }), null);
  const record = (d) => JSON.parse(spawnSync(process.execPath, [CLI, "record", "--dispatch", d.id, "--saved", "--project", dir], { encoding: "utf8" }).stdout);
  const first = record(dispatches[0]);
  assert.equal(first.action, "continue");
  assert.equal(first.next, undefined, "another result of the batch is still to be recorded");
  const last = record(dispatches[1]);
  assert.equal(last.next.action, "dispatch");
  assert.equal(last.next.dispatches[0].stage, "stories");
  assert.ok(existsSync(join(featureDir, "envelopes")), "envelopes are persisted as before");
});

test("packs inline the digest and the human notes instead of asking for two reads", () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  putIntake(dir);
  writeFileSync(join(featureDir, "digest.md"), "# FEAT-001 — digest after requirements\n- REQ-0001 — coupons\n");
  conductor.note(dir, { text: "Hide the coupon field for guests" });
  const d = conductor.step(dir).dispatches[0];
  const pack = readFileSync(join(dir, d.pack), "utf8");
  assert.match(pack, /HD-1 \(open\): Hide the coupon field for guests/);
  assert.match(pack, /REQ-0001 — coupons/);
  assert.doesNotMatch(pack, /\[READ\]/);
});

// ── Regression tests for the batch-5 review findings ──
const { treeHash } = await import(`${ENGINE}/scripts/lib/core.mjs`);
const { runStackCommandAsync } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
const { saveEnvelope } = await import(`${ENGINE}/hooks/guard.mjs`);

test("the tree hash sees ignored files and the run environment, and gives up on nested repositories", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-tree-"));
  git(dir, "init", "-q");
  writeFileSync(join(dir, ".gitignore"), ".env\nnode_modules/\n");
  writeFileSync(join(dir, ".env"), "A=1\n");
  mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "x", "i.js"), "1");
  const before = treeHash(dir);
  writeFileSync(join(dir, "node_modules", "x", "i.js"), "2");
  assert.equal(treeHash(dir), before, "an ignored folder counts by name only");
  writeFileSync(join(dir, ".env"), "A=2\n");
  assert.notEqual(treeHash(dir), before, "an ignored file's content counts");
  const path = process.env.PATH;
  const withEnv = treeHash(dir);
  process.env.PATH = `/tmp/fake-bin:${path}`;
  try {
    assert.notEqual(treeHash(dir), withEnv, "PATH is part of the hash");
  } finally {
    process.env.PATH = path;
  }
  mkdirSync(join(dir, "nested"));
  git(join(dir, "nested"), "init", "-q");
  writeFileSync(join(dir, "nested", "a.ts"), "x");
  assert.equal(treeHash(dir), null, "a nested repository hides its changes: never cache");
});

test("a timed-out command ends with its whole process tree; a leftover child does not hold the gate", async () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-timeout-"));
  const stack = (cmd) => ({ stack: { commands: { x: ["sh", "-c", cmd] } }, cwd: dir, projectDir: dir });
  let t = Date.now();
  const r = await runStackCommandAsync(stack("sleep 3 & sleep 30"), "x", { timeoutMs: 500 });
  assert.ok(Date.now() - t < 4000 && !r.ok && /timed out/.test(r.tail), `${Date.now() - t} ms`);
  t = Date.now();
  const ok = await runStackCommandAsync(stack("sleep 20 & echo done"), "x", { timeoutMs: 60_000 });
  assert.ok(ok.ok && Date.now() - t < 5000, `${Date.now() - t} ms`);
});

test("two records at once: only the one that empties the batch hands back the next step", async () => {
  const dir = makeProject("pipeline: { stages: { requirements: { agents: [spec-writer, story-writer-fx], parallel: true, human_gate: null } } }\ncontext: { digest: engine }");
  const featureDir = makeFeature(dir);
  putIntake(dir);
  const { dispatches } = conductor.step(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const run = (d) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, "record", "--dispatch", d.id, "--project", dir]);
      let out = "";
      child.stdout.on("data", (b) => (out += b));
      child.on("close", () => resolve(JSON.parse(out)));
      child.stdin.end(envelope(d.id));
    });
  const results = await Promise.all(dispatches.map(run));
  assert.equal(results.filter((r) => r.next).length, 1, JSON.stringify(results.map(({ action, verdict, waiting_for, next }) => ({ action, verdict, waiting_for, next: next?.action }))));
  assert.equal(featureState(featureDir).pending.length, 1, "the next stage was dispatched once");
});

test("the migrations audit finds an unplanned destructive migration; an envelope is never saved under Cursor's union", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-mig-audit-"));
  write(dir, "drizzle/0007_drop.sql", "ALTER TABLE users DROP COLUMN email;\n");
  const r = spawnSync(process.execPath, [join(V2("factory-role-backend"), "scripts", "check-migrations.mjs"), "--project", dir, "--findings", "--files", "drizzle/0007_drop.sql"], { encoding: "utf8" });
  const findings = JSON.parse(r.stdout);
  assert.equal(r.status, 0);
  assert.ok(findings.length >= 3 && findings.every((f) => f.severity === "P1" && f.file === "drizzle/0007_drop.sql"), r.stdout);
  assert.ok(findings.some((f) => f.line === 1 && /destructive/.test(f.claim)));
  const actives = [{ id: "FEAT-001/x/a/a1", agent: "a", subagent_type: "p:a" }];
  assert.equal(saveEnvelope(dir, { agent_type: "*", last_assistant_message: envelope("FEAT-001/x/a/a1") }, actives, 200), null);
});
