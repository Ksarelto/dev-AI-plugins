// Phase 5: the backend and AI-agent role packs through the role contract — role tracks in parallel,
// specialist builders by task type, role checks inside gate-impl, role package paths, the architect
// slot, doctor's role checks and the backend audit scripts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, envelope, makeFeature, makeProject, putArtifact, putIntake, report } from "./helpers.mjs";

const ROOT = join(TESTS, "..", "..");
const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");
const V2 = (name) => join(ROOT, "app-dev-kitv2", name);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { resolveStack } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
const { doctor } = await import(`${ENGINE}/scripts/lib/doctor.mjs`);
const BE_SCRIPTS = join(V2("factory-role-backend"), "scripts");

const fakeCommands = (extra = {}) =>
  JSON.stringify({ typecheck: ["node", FAKE, "typecheck"], lint: ["node", FAKE, "lint"], architecture_check: ["node", FAKE, "arch"], build: ["node", FAKE, "build"], test: ["node", FAKE, "test", "{report}"], ...extra });

const task = (id, role, type, files, extra = {}) => ({
  id, role, type, title: `${type} ${id}`, depends_on: [], satisfies: ["AC-0003"], files_expected: files,
  tdd: extra.red ? { mode: "required", red_tests: extra.red } : { mode: "exempt", reason: "exempt type" },
  reuse: { considered: [], reuse_rejected: "new" }, definition_of_done: ["done"], ...(extra.depends_on ? { depends_on: extra.depends_on } : {}),
});

/** Three roles in three package folders (web/, api/, agent/), each with a fake stack, at implementation. */
function setup(tasks, { extra = "", paths = { frontend: "web", backend: "api", "ai-agent": "agent" } } = {}) {
  const role = (name, pack, stack, path, cmds = fakeCommands()) =>
    `${name}: { enabled: true, pack: ${pack}, stack: ${stack}, ${path ? `path: ${path}, ` : ""}owns_paths: ["${path ?? "src"}/**"], stack_overrides: { commands: ${cmds} } }`;
  const dir = makeProject(
    [
      `packs: { factory-role-frontend: "${V2("factory-role-frontend")}", factory-role-backend: "${V2("factory-role-backend")}", factory-role-ai-agent: "${V2("factory-role-ai-agent")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}", node-backend-dev-kit: "${join(ROOT, "node-backend-dev-kit")}", node-agent-dev-kit: "${join(ROOT, "node-agent-dev-kit")}", factory-analysis: "${V2("factory-analysis")}" }`,
      `roles: { ${[
        role("frontend", "factory-role-frontend", "frontend-dev-kit", paths.frontend),
        role("backend", "factory-role-backend", "node-backend-dev-kit", paths.backend),
        role("ai-agent", "factory-role-ai-agent", "node-agent-dev-kit", paths["ai-agent"], fakeCommands({ eval: ["node", FAKE, "eval", "{report}"] })),
      ].join(", ")} }`,
      "pipeline: { profiles: { test: [planning, implementation] }, stages: { planning: { pack: factory-analysis } } }",
      extra.includes("quality:") ? "" : "quality: { integration_tests: skip }",
      extra,
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["implementation"] });
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "test-plan.yaml", "04-plan/test-plan.yaml");
  writeFileSync(join(featureDir, "04-plan", "tasks.yaml"), YAML.stringify({ feature: "FEAT-001", tasks }));
  const fake = (path, command, body) => {
    mkdirSync(join(dir, path ?? ".", ".fake"), { recursive: true });
    writeFileSync(join(dir, path ?? ".", ".fake", `${command}.json`), JSON.stringify(body));
  };
  const write = (file, text) => {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  return { dir, featureDir, fake, write };
}
const implGate = async (env, taskId) => {
  const c = conductor.load(env.dir);
  const t = YAML.parse(readFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), "utf8")).tasks.find((x) => x.id === taskId);
  return runGate("impl", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, task: t, stack: resolveStack(c, t.role), packs: c.packs }), { useCache: false });
};
const rules = (r) => r.failures.map((f) => f.rule);

const TASKS = [
  task("TASK-001", "frontend", "feature-ui", ["web/src/features/x/ui/x.tsx", "web/src/features/x/ui/x.test.tsx"], { red: ["web/src/features/x/ui/x.test.tsx"] }),
  task("TASK-002", "backend", "endpoint", ["api/src/controllers/v.controller.ts", "api/tests/unit/v.test.ts"], { red: ["api/tests/unit/v.test.ts"] }),
  task("TASK-003", "backend", "migration", ["api/drizzle/0001_deployments.sql", "api/drizzle/rollback/0001_deployments.down.sql", "api/drizzle/meta/_journal.json"]),
];

test("role tracks: one task per role runs in parallel when the roles have their own package paths", () => {
  const env = setup(TASKS);
  const s = conductor.step(env.dir);
  assert.deepEqual(s.dispatches.map((d) => `${d.task}:${d.agent}`), ["TASK-001:fe-test-author", "TASK-002:be-test-author"], "TASK-003 waits for the backend track");
  assert.deepEqual(s.dispatches.map((d) => d.parallel_group), [0, 1]);
});

test("role tracks run one at a time when roles share a path or flow.role_tracks is sequential", () => {
  assert.equal(conductor.step(setup(TASKS, { extra: "flow: { role_tracks: sequential }" }).dir).dispatches.length, 1);
  assert.equal(conductor.step(setup(TASKS, { paths: {} }).dir).dispatches.length, 1);
});

test("a migration task goes to the migration author, not the backend builder", () => {
  const env = setup([TASKS[2]]);
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.agent, "migration-author");
  assert.equal(d.subagent_type, "factory-role-backend:migration-author");
  assert.equal(d.phase, "green");
});

test("gate-impl runs the backend migration check for migration tasks, in the role's package folder", async () => {
  const env = setup([TASKS[2]]);
  env.fake("api", "test", { code: 0, report: report({}) });
  env.write("api/drizzle/0001_deployments.sql", "CREATE TABLE deployments (id serial primary key);\n");
  env.write("api/drizzle/meta/_journal.json", JSON.stringify({ entries: [{ idx: 0, tag: "0000_init" }] }));
  let r = await implGate(env, "TASK-003");
  assert.deepEqual(rules(r), ["migrations-failed"]);
  assert.match(r.failures[0].message, /no entry with tag "0001_deployments"[\s\S]*rollback .* is missing/);
  env.write("api/drizzle/meta/_journal.json", JSON.stringify({ entries: [{ idx: 0, tag: "0000_init" }, { idx: 1, tag: "0001_deployments" }] }));
  env.write("api/drizzle/rollback/0001_deployments.down.sql", "DROP TABLE deployments;\n");
  r = await implGate(env, "TASK-003");
  assert.deepEqual(rules(r), []);
  assert.ok(existsSync(join(env.dir, ".factory", "logs", "TASK-003-impl-migrations.log")), "logs stay in the project's .factory");
  assert.ok(!existsSync(join(env.dir, "api", ".factory")), "nothing is written under the role's folder");
});

test("gate-impl runs the AI eval check: failing or all-skipped evals fail; a project may allow skipped evals", async () => {
  const tool = task("TASK-004", "ai-agent", "tool", ["agent/src/agents/a/tools/t.ts"]);
  const env = setup([tool]);
  env.fake("agent", "test", { code: 0, report: report({}) });
  const evalFile = join(env.dir, "agent", "evals", "a.eval.ts");
  env.fake("agent", "eval", { code: 0, report: report({ [evalFile]: [["AC-0003 answers with the time", "skipped"]] }) });
  assert.deepEqual(rules(await implGate(env, "TASK-004")), ["eval-skipped"]);
  env.fake("agent", "eval", { code: 1, report: report({ [evalFile]: [["AC-0003 answers with the time", "failed", "pass rate 0.5 < 0.8"]] }) });
  assert.deepEqual(rules(await implGate(env, "TASK-004")), ["eval-failing"]);
  const cfg = join(env.dir, ".factory", "factory.config.yaml");
  const merged = YAML.parse(readFileSync(cfg, "utf8"));
  merged.quality = { ...merged.quality, allow_skipped_checks: true };
  writeFileSync(cfg, YAML.stringify(merged));
  env.fake("agent", "eval", { code: 0, report: report({ [evalFile]: [["AC-0003 answers with the time", "skipped"]] }) });
  assert.deepEqual(rules(await implGate(env, "TASK-004")), []);
  const state = task("TASK-005", "ai-agent", "state", ["agent/src/agents/a/state.ts"]);
  writeFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), YAML.stringify({ feature: "FEAT-001", tasks: [tool, state] }));
  env.fake("agent", "eval", { code: 1, report: report({ [evalFile]: [["x", "failed", "boom"]] }) });
  assert.deepEqual(rules(await implGate(env, "TASK-005")), [], "a state task is not model-facing: no eval run");
});

test("RAG and eval tasks go to their specialist builders; red phases stay with the AI test author", () => {
  const env = setup([
    task("TASK-006", "ai-agent", "rag", ["agent/src/rag/retriever.ts", "agent/tests/unit/rag/r.test.ts"], { red: ["agent/tests/unit/rag/r.test.ts"] }),
    task("TASK-007", "ai-agent", "eval", ["agent/evals/golden/a.json"], { depends_on: ["TASK-006"] }),
  ]);
  const s = featureState(env.featureDir);
  s.tasks = { "TASK-006": { status: "green", phase: "green", round: 1 } };
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  assert.equal(conductor.step(env.dir).dispatches[0].agent, "rag-builder");
  const env2 = setup([task("TASK-006", "ai-agent", "rag", ["agent/src/rag/retriever.ts", "agent/tests/unit/rag/r.test.ts"], { red: ["agent/tests/unit/rag/r.test.ts"] })]);
  assert.equal(conductor.step(env2.dir).dispatches[0].agent, "ai-test-author");
  const env3 = setup([task("TASK-007", "ai-agent", "eval", ["agent/evals/golden/a.json"])]);
  assert.equal(conductor.step(env3.dir).dispatches[0].agent, "eval-author");
});

test("the AI architect joins the architecture stage, and gate-arch then requires agent-design.md", async () => {
  const dir = makeProject(
    [
      `packs: { factory-analysis: "${V2("factory-analysis")}", factory-role-ai-agent: "${V2("factory-role-ai-agent")}", node-agent-dev-kit: "${join(ROOT, "node-agent-dev-kit")}" }`,
      `roles: { frontend: { enabled: false }, ai-agent: { enabled: true, pack: factory-role-ai-agent, stack: node-agent-dev-kit, owns_paths: ["src/**"] } }`,
      "pipeline: { profiles: { test: [architecture] } }",
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["architecture"] });
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  const agents = [];
  for (let i = 0; i < 3; i++) {
    const d = conductor.step(dir).dispatches[0];
    agents.push(d.subagent_type);
    if (d.agent === "solution-architect") {
      putArtifact(featureDir, "component-map.md", "03-architecture/component-map.md");
      putArtifact(featureDir, "adr-example.md", "03-architecture/adr-001-discount.md");
    }
    if (d.agent === "ai-architect") assert.match(readFileSync(join(dir, d.pack), "utf8"), /03-architecture\/agent-design\.md/);
    const r = await conductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
    if (i === 2) assert.ok(r.gate.failures.some((f) => f.check === "agent-design" && f.rule === "missing"), JSON.stringify(r.gate.failures));
  }
  assert.deepEqual(agents, ["factory-analysis:solution-architect", "factory-analysis:contract-steward", "factory-role-ai-agent:ai-architect"]);
});

test("doctor: specialist builders must name a task type, check scripts must exist, shared role paths are reported", () => {
  const pack = mkdtempSync(join(tmpdir(), "factory-role-copy-"));
  cpSync(V2("factory-role-backend"), pack, { recursive: true });
  const role = YAML.parse(readFileSync(join(pack, "role.yaml"), "utf8"));
  role.agents.builders = { schema: "migration-author" };
  role.gates.checks = [{ name: "migrations", node: "scripts/nope.mjs" }];
  writeFileSync(join(pack, "role.yaml"), YAML.stringify(role));
  const dir = makeProject(
    [
      `packs: { factory-role-backend: "${pack}", factory-role-frontend: "${V2("factory-role-frontend")}", node-backend-dev-kit: "${join(ROOT, "node-backend-dev-kit")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}" }`,
      "roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: [web/**] }, backend: { enabled: true, pack: factory-role-backend, stack: node-backend-dev-kit, owns_paths: [api/**] } }",
    ].join("\n"),
  );
  const r = doctor(dir);
  assert.ok(r.errors.some((e) => /builders names "schema", which is not in task_types/.test(e)), r.errors.join("\n"));
  assert.ok(r.errors.some((e) => /check migrations script scripts\/nope\.mjs is missing/.test(e)), r.errors.join("\n"));
  assert.ok(r.warnings.some((w) => /roles frontend and backend share the folder "\."/.test(w)), r.warnings.join("\n"));
});

const run = (script, args, cwd) => spawnSync(process.execPath, [join(BE_SCRIPTS, script), ...args], { cwd, encoding: "utf8" });

test("check-migrations: destructive statements need a human approval line above them", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-mig-"));
  mkdirSync(join(dir, "drizzle", "meta"), { recursive: true });
  mkdirSync(join(dir, "drizzle", "rollback"), { recursive: true });
  writeFileSync(join(dir, "drizzle", "meta", "_journal.json"), JSON.stringify({ entries: [{ tag: "0002_drop" }] }));
  writeFileSync(join(dir, "drizzle", "rollback", "0002_drop.down.sql"), "ALTER TABLE users ADD COLUMN nickname text;\n");
  writeFileSync(join(dir, "drizzle", "0002_drop.sql"), "ALTER TABLE users DROP COLUMN nickname;\n");
  let r = run("check-migrations.mjs", ["--project", dir, "--files", "drizzle/0002_drop.sql"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /0002_drop\.sql:1: destructive statement without/);
  writeFileSync(join(dir, "drizzle", "0002_drop.sql"), "-- factory: approved HD-3\nALTER TABLE users DROP COLUMN nickname;\n");
  r = run("check-migrations.mjs", ["--project", dir, "--files", "drizzle/0002_drop.sql"]);
  assert.equal(r.status, 0, r.stdout);
});

test("openapi-conformance compares the contract with the backend boilerplate's OpenAPI document", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-oas-"));
  writeFileSync(join(dir, "contract.yaml"), "openapi: 3.1.0\npaths:\n  /api/v1/users:\n    get:\n      summary: list\n  /api/v1/version:\n    get:\n      summary: version\n");
  const r = run("openapi-conformance.mjs", ["--contract", join(dir, "contract.yaml"), "--document", join(ROOT, "backend-boilerplate", "src", "openapi", "document.ts")]);
  const hits = JSON.parse(r.stdout);
  assert.deepEqual(hits.filter((h) => h.rule === "missing-in-document"), [{ rule: "missing-in-document", method: "get", path: "/api/v1/version" }]);
  assert.ok(hits.some((h) => h.rule === "not-in-contract" && h.path.startsWith("/api/v1/users/")), JSON.stringify(hits));
});

// ── Fixes found while building the role scenarios ──

test("gate-plan: a role widens the file limit for its task types; the project's limit by type wins", async () => {
  const mig = task("TASK-003", "backend", "migration", ["api/src/db/schema/d.ts", "api/src/db/schema/index.ts", "api/drizzle/0001_d.sql", "api/drizzle/meta/_journal.json", "api/drizzle/rollback/0001_d.down.sql"]);
  const fe = task("TASK-001", "frontend", "feature-ui", ["web/src/a.tsx", "web/src/b.tsx", "web/src/c.tsx", "web/src/a.test.tsx"], { red: ["web/src/a.test.tsx"] });
  const plan = async (extra = "") => {
    const env = setup([mig, fe], { extra });
    const c = conductor.load(env.dir);
    const r = await runGate("plan", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
    return r.failures.filter((f) => f.rule === "too-many-files").map((f) => f.message);
  };
  assert.deepEqual(await plan(), ["TASK-001 touches 4 files (max 3 for feature-ui)"], "the backend role allows 6 files for a migration");
  assert.deepEqual(await plan("quality: { task_limits_by_type: { migration: { files_max: 4 } } }"), ["TASK-003 touches 5 files (max 4 for migration)", "TASK-001 touches 4 files (max 3 for feature-ui)"]);
});

test("gate-stories: a story without UX surfaces needs no states", async () => {
  const dir = makeProject(`packs: { factory-analysis: "${V2("factory-analysis")}" }\npipeline: { profiles: { test: [stories] } }`);
  const featureDir = makeFeature(dir, { stages: ["stories"] });
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml", (t) => t.replace(/ux: \{ surfaces: \[[^\]]*\], states: \[[^\]]*\] \}/g, "ux: { surfaces: [], states: [] }"));
  const c = conductor.load(dir);
  const r = await runGate("stories", gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config }), { useCache: false });
  assert.ok(!r.failures.some((f) => f.rule === "no-states"), JSON.stringify(r.failures));
});

test("red snapshots are inert copies (*.snapshot) that project tools never pick up, and a dispute still restores them", async () => {
  const env = setup([TASKS[1]]);
  env.write("api/src/controllers/v.controller.ts", "export const stub = 1;\n");
  env.write("api/tests/unit/v.test.ts", "test('v', () => expect(1).toBe(2));\n");
  env.fake("api", "test", { code: 1, report: report({ [join(env.dir, "api/tests/unit/v.test.ts")]: [["v", "failed", "AssertionError: expected 1 to be 2"]] }) });
  let d = conductor.step(env.dir).dispatches[0];
  await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  const snap = join(env.featureDir, "snapshots", "TASK-002", "api", "src", "controllers", "v.controller.ts");
  assert.ok(existsSync(`${snap}.snapshot`) && !existsSync(snap));
  assert.match(readFileSync(join(env.dir, ".factory", ".gitignore"), "utf8"), /features\/\*\/snapshots\//);
  d = conductor.step(env.dir).dispatches[0];
  env.write("api/src/controllers/v.controller.ts", "export const implemented = 2;\n");
  await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { test_dispute: { test: "api/tests/unit/v.test.ts", reason: "wrong" } }) });
  assert.equal(readFileSync(join(env.dir, "api/src/controllers/v.controller.ts"), "utf8"), "export const stub = 1;\n");
});

test("factory metrics: first-pass rates per task agent and per stage, rung-1 resolution, red validity, gates", () => {
  const dir = makeProject();
  const ev = (e) => ({ ts: "2026-11-01T10:00:00.000Z", feature: "FEAT-001", ...e });
  const lines = [
    ev({ type: "dispatch", stage: "implementation", task: "TASK-001", agent: "be-test-author", model: "sonnet", context_degraded: false }),
    ev({ type: "verdict", stage: "implementation", task: "TASK-001", agent: "be-test-author", phase: "red", attempt: 1, verdict: "advance", rung: 0 }),
    ev({ type: "verdict", stage: "implementation", task: "TASK-001", agent: "be-builder", phase: "green", attempt: 1, verdict: "retry", rung: 1 }),
    ev({ type: "verdict", stage: "implementation", task: "TASK-001", agent: "be-builder", phase: "green", attempt: 2, verdict: "advance", rung: 1 }),
    ev({ type: "verdict", stage: "verification", agent: "fe-auditor", attempt: 1, verdict: "retry", rung: 1 }),
    ev({ type: "verdict", stage: "verification", agent: "reviewer", attempt: 2, verdict: "diagnose", rung: 3, reason: "same failure fingerprint twice in a row" }),
    ev({ type: "verdict", stage: "verification", agent: "reviewer", attempt: 3, verdict: "advance", rung: 3 }),
    ev({ type: "human", stage: "delivery", gate: "GATE-C", result: "rejected" }),
    ev({ type: "envelope", stage: "delivery", agent: "release-manager", status: "done", tokens: 1200 }),
    ev({ ts: "2026-11-01T10:30:00.000Z", type: "advance", stage: "delivery", to: "done" }),
  ];
  writeFileSync(join(dir, ".factory", "events.jsonl"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  const r = spawnSync(process.execPath, [join(ENGINE, "scripts", "factory.mjs"), "metrics", "--project", dir], { encoding: "utf8" });
  const m = JSON.parse(r.stdout);
  assert.deepEqual(m.first_pass_rates, {
    "be-test-author": { units: 1, first_pass: 1, rate: 1 },
    "be-builder": { units: 1, first_pass: 0, rate: 0 },
    "stage verification": { units: 1, first_pass: 0, rate: 0 },
  });
  assert.equal(m.resolved_at_rung_le_1, 0.667, "verification needed rung 3");
  assert.equal(m.red_phase_validity, 1);
  assert.equal(m.repeat_fingerprint_escalations, 1);
  assert.deepEqual(m.human_gates, { "GATE-C": { approved: 0, rejected: 1 } });
  assert.deepEqual([m.tokens, m.features["FEAT-001"].lead_time_min], [1200, 30]);
  const md = spawnSync(process.execPath, [join(ENGINE, "scripts", "factory.mjs"), "metrics", "--md", "--project", dir], { encoding: "utf8" }).stdout;
  assert.match(md, /\| Red-phase validity \| 100% \| > 90% \|/);
});

// ── Regression tests for the phase-5 review findings ──

test("doctor accepts an owner supplied by a role slot (architecture's ai-architect) with the default profile", () => {
  const dir = makeProject(`packs: { factory-analysis: "${V2("factory-analysis")}", factory-role-ai-agent: "${V2("factory-role-ai-agent")}" }\npipeline: { profile: standard }`);
  const cfg = join(dir, ".factory", "factory.config.yaml");
  const config = YAML.parse(readFileSync(cfg, "utf8"));
  delete config.pipeline.profiles;
  writeFileSync(cfg, YAML.stringify(config));
  const r = doctor(dir);
  assert.ok(!r.errors.some((e) => /owner "ai-architect"/.test(e)), r.errors.join("\n"));
});

test("parallel tracks: a block survives the other track's answered question, and a second question waits its turn", async () => {
  const fe = TASKS[0];
  const be = TASKS[1];
  const env = setup([fe, be]);
  let [a, b] = conductor.step(env.dir).dispatches;
  await conductor.record(env.dir, { dispatchId: a.id, envelopeText: envelope(a.id, { status: "blocked", summary: "the API does not exist" }) });
  await conductor.record(env.dir, { dispatchId: b.id, envelopeText: envelope(b.id, { status: "needs_clarification", open_questions: ["Which status code?"] }) });
  let s = featureState(env.featureDir);
  assert.equal(s.status, "blocked", "the block is not overwritten by the question");
  conductor.diagnose(env.dir, { task: "TASK-001" });
  const ask = conductor.step(env.dir);
  assert.deepEqual([ask.action, ask.gate], ["ask_human", "CLARIFY"], "the queued question comes first");
  assert.deepEqual(ask.questions, ["Which status code?"]);

  const env2 = setup([fe, be]);
  [a, b] = conductor.step(env2.dir).dispatches;
  await conductor.record(env2.dir, { dispatchId: a.id, envelopeText: envelope(a.id, { status: "needs_clarification", open_questions: ["Q-front?"] }) });
  await conductor.record(env2.dir, { dispatchId: b.id, envelopeText: envelope(b.id, { status: "needs_clarification", open_questions: ["Q-back?"] }) });
  assert.deepEqual(conductor.step(env2.dir).questions, ["Q-front?"]);
  conductor.approve(env2.dir, { notes: "front answer" });
  assert.deepEqual(conductor.step(env2.dir).questions, ["Q-back?"], "the second question is asked, not dropped");

  const env3 = setup([fe, be]);
  [a, b] = conductor.step(env3.dir).dispatches;
  await conductor.record(env3.dir, { dispatchId: a.id, envelopeText: envelope(a.id, { status: "blocked", summary: "no API" }) });
  s = featureState(env3.featureDir);
  Object.assign(s, { status: "active" }); // e.g. a human answered something else in between
  writeFileSync(join(env3.featureDir, "state.json"), JSON.stringify(s));
  await conductor.record(env3.dir, { dispatchId: b.id, envelopeText: envelope(b.id, { status: "needs_clarification", open_questions: ["Q?"] }) }).catch(() => {});
  const again = conductor.step(env3.dir);
  assert.notEqual(again.action, "dispatch", "a blocked task is never re-dispatched without a human decision");
});

test("the gate CLI (agents' exit check) sees the role packs: role file limits and role checks apply", () => {
  const env = setup([TASKS[2]]);
  const run = (args) => JSON.parse(spawnSync(process.execPath, [join(ENGINE, "scripts", "factory.mjs"), "gate", ...args, "--project", env.dir, "--no-cache"], { encoding: "utf8" }).stdout);
  assert.ok(!run(["plan"]).failures.some((f) => f.rule === "too-many-files"), "the backend role allows a 3-file migration and more");
  env.fake("api", "test", { code: 0, report: report({}) });
  const impl = run(["impl", "--task", "TASK-003"]);
  assert.ok(impl.failures.some((f) => f.rule === "migrations-failed"), JSON.stringify(impl.failures));
});

test("gate-verify and gate-acceptance judge 'did it run' and AC coverage over every role's report together", async () => {
  const env = setup([TASKS[0], TASKS[1]]);
  const accept = "web/src/pages/c/c.acceptance.test.tsx";
  env.write(accept, 'test("AC-0001 a", () => {});\ntest("AC-0002 b", () => {});\ntest("AC-0003 c", () => {});\n');
  const failing = [["AC-0001 a", "failed", "x"], ["AC-0002 b", "failed", "x"], ["AC-0003 c", "failed", "x"]];
  env.fake("web", "test", { code: 1, report: report({ [join(env.dir, accept)]: failing }) });
  env.fake("api", "test", { code: 0, report: report({}) });
  env.fake("agent", "test", { code: 0, report: report({}) });
  const c = conductor.load(env.dir);
  const ctx = gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs });
  assert.deepEqual(rules(await runGate("acceptance", ctx, { useCache: false })), []);
  mkdirSync(join(env.featureDir, "06-verify"), { recursive: true });
  writeFileSync(join(env.featureDir, "06-verify", "review.md"), "---\nfeature: FEAT-001\nround: 1\nfindings: []\n---\n");
  env.fake("web", "test", { code: 0, report: report({ [join(env.dir, accept)]: failing.map(([n]) => [n, "passed"]) }) });
  assert.deepEqual(rules(await runGate("verify", ctx, { useCache: false })), []);
});

test("role tracks: nested or equal folders count as shared, however they are written", () => {
  assert.equal(conductor.step(setup(TASKS, { paths: { frontend: ".", backend: "apps/api" } }).dir).dispatches.length, 1);
  assert.equal(conductor.step(setup(TASKS, { paths: { frontend: "./api/", backend: "api" } }).dir).dispatches.length, 1);
});

test("never two live dispatches of one agent type: parallel diagnoses go one at a time", () => {
  const env = setup([TASKS[0], TASKS[1]]);
  const s = featureState(env.featureDir);
  s.tasks = { "TASK-001": { status: "red", phase: "red", diagnose_pending: true, round: 1 }, "TASK-002": { status: "red", phase: "red", diagnose_pending: true, round: 1 } };
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(s));
  const d = conductor.step(env.dir).dispatches;
  assert.deepEqual(d.map((x) => x.agent), ["diagnostician"]);
});

test("check-migrations: a migration task must change one; nested drizzle folders and DELETE FROM are handled", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-mig2-"));
  let r = run("check-migrations.mjs", ["--project", dir, "--task-type", "migration", "--files", "src/db/schema/x.ts"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /a migration task changes no drizzle/);
  assert.equal(run("check-migrations.mjs", ["--project", dir, "--task-type", "endpoint", "--files", "src/x.ts"]).status, 0);
  mkdirSync(join(dir, "apps", "api", "drizzle", "meta"), { recursive: true });
  mkdirSync(join(dir, "apps", "api", "drizzle", "rollback"), { recursive: true });
  writeFileSync(join(dir, "apps/api/drizzle/meta/_journal.json"), JSON.stringify({ entries: [{ tag: "0003_x" }] }));
  writeFileSync(join(dir, "apps/api/drizzle/rollback/0003_x.down.sql"), "INSERT INTO users (id) VALUES (1);\n");
  writeFileSync(join(dir, "apps/api/drizzle/0003_x.sql"), "DELETE FROM users WHERE id = 1;\n");
  r = run("check-migrations.mjs", ["--project", dir, "--task-type", "migration", "--files", "apps/api/drizzle/0003_x.sql"]);
  assert.match(r.stdout, /0003_x\.sql:1: destructive statement/);
  assert.doesNotMatch(r.stdout, /journal|rollback/, r.stdout);
});

test("openapi-conformance: a contract prefix matches whole path segments only", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-oas2-"));
  writeFileSync(join(dir, "c.yaml"), "paths:\n  /api/v1/version:\n    get:\n      summary: v\n");
  writeFileSync(join(dir, "d.ts"), "registry.registerPath({ method: 'get', path: '/api/v1/version' });\nregistry.registerPath({ method: 'get', path: '/api/v1/versions' });\n");
  const hits = JSON.parse(run("openapi-conformance.mjs", ["--contract", join(dir, "c.yaml"), "--document", join(dir, "d.ts")]).stdout);
  assert.deepEqual(hits, []);
});
