// Phase 5 and 7 of the improvement plan: acceptance waivers and relock, source conflicts, automatic sizing and the
// small profile, GATE-A at requirements, budgets that follow the plan, backward-edge caps, early quality
// (per-task audits, the reviewer after the first slice) and the doctor's project warnings.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, cli, deepMerge, conductor, envelope, loopSetup, makeFeature, makeProject, putArtifact, putIntake, report } from "./helpers.mjs";

const ROOT = join(TESTS, "..", "..");
const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");
const V2 = (name) => join(ROOT, "app-dev-kitv2", name);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const saveState = (dir, s) => writeFileSync(join(dir, "state.json"), JSON.stringify(s));
const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { fileHash } = await import(`${ENGINE}/scripts/lib/core.mjs`);
const { estimateSize, sizeFromSpec } = await import(`${ENGINE}/scripts/lib/sizing.mjs`);
const { budgetsForTasks, raiseBudgetsFromPlan } = await import(`${ENGINE}/scripts/lib/budgets.mjs`);
const { exhaustedBudgets } = await import(`${ENGINE}/scripts/lib/warden.mjs`);
const { resolveStack } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
const { doctor } = await import(`${ENGINE}/scripts/lib/doctor.mjs`);
const { intake } = await import(`${ENGINE}/scripts/lib/intake.mjs`);
const { decideBash } = await import(`${ENGINE}/hooks/guard.mjs`);
const { matchesAny } = await import(`${ENGINE}/scripts/lib/core.mjs`);

const write = (dir, file, text) => {
  mkdirSync(join(dir, file, ".."), { recursive: true });
  writeFileSync(join(dir, file), text);
};
const rules = (r) => r.failures.map((f) => f.rule);
const gate = async (dir, name, extra = {}) => {
  const c = conductor.load(dir);
  return runGate(name, gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs, ...extra }), { useCache: false });
};
const events = (dir) => readFileSync(join(dir, ".factory", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ACCEPT = "src/pages/checkout/checkout.acceptance.test.tsx";
const OTHER = "src/pages/cart/cart.acceptance.test.tsx";

/** A project at verification with the real quality/delivery packs, a fake stack and a locked acceptance file. */
function verifyEnv(extra = "") {
  const dir = makeProject(
    [
      `packs: { factory-role-frontend: "${V2("factory-role-frontend")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}", factory-analysis: "${V2("factory-analysis")}", factory-quality: "${V2("factory-quality")}", factory-delivery: "${V2("factory-delivery")}" }`,
      `roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: ["src/**"], stack_overrides: { commands: { typecheck: [node, "${FAKE}", typecheck], lint: [node, "${FAKE}", lint], architecture_check: [node, "${FAKE}", arch], build: [node, "${FAKE}", build], test: [node, "${FAKE}", test, "{report}"] } } } }`,
      "pipeline: { profiles: { test: [planning, implementation, acceptance, verification] }, stages: { planning: { pack: factory-analysis } } }",
      extra,
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["planning", "implementation", "acceptance", "verification"] });
  putIntake(dir);
  for (const [f, t] of [["delta-spec.yaml", "01-requirements/delta-spec.yaml"], ["stories.yaml", "02-stories/stories.yaml"], ["tasks.yaml", "04-plan/tasks.yaml"], ["test-plan.yaml", "04-plan/test-plan.yaml"]]) putArtifact(featureDir, f, t);
  mkdirSync(join(dir, ".fake"), { recursive: true });
  const fake = (command, body) => writeFileSync(join(dir, ".fake", `${command}.json`), JSON.stringify(body));
  write(dir, ACCEPT, 'test("AC-0001 discount line", () => {});\ntest("AC-0002 expired", () => {});\n');
  write(dir, OTHER, 'test("AC-0003 cart total", () => {});\n');
  const s = featureState(featureDir);
  Object.assign(s, { stage: "verification", tasks: { "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { status: "done" } } });
  for (const id of ["planning", "implementation", "acceptance"]) s.stages[id].status = "passed";
  s.acceptance_lock = { [ACCEPT]: fileHash(join(dir, ACCEPT)), [OTHER]: fileHash(join(dir, OTHER)) };
  saveState(featureDir, s);
  for (const f of [ACCEPT, OTHER]) {
    const copy = join(featureDir, "acceptance-lock", `${f}.snapshot`);
    mkdirSync(join(copy, ".."), { recursive: true });
    writeFileSync(copy, readFileSync(join(dir, f)));
  }
  return { dir, featureDir, fake };
}
const failingRun = (env) =>
  env.fake("test", { code: 1, report: report({ [join(env.dir, ACCEPT)]: [["AC-0001 discount line", "failed", "Unable to find a label"], ["AC-0002 expired", "passed"]], [join(env.dir, OTHER)]: [["AC-0003 cart total", "failed", "expected 1"]] }) });

// ---- Phase 5: waiver and relock (A4) ----

test("a failing acceptance test passes gate-checks only through a human waiver, and the waiver is listed", async () => {
  const env = verifyEnv();
  failingRun(env);
  assert.deepEqual(rules(await gate(env.dir, "checks")).sort(), ["acceptance-failing", "acceptance-failing"], "nothing waived: both fail, fixable");

  // The CLI is the only writer, it needs a reason, and it only knows this feature's acceptance files.
  assert.equal(cli(env.dir, ["acceptance", "waive", ACCEPT]).code, 2, "no --reason");
  assert.match(cli(env.dir, ["acceptance", "waive", "src/x.test.ts", "--reason", "r"]).json.error, /not one of this feature's acceptance test files/);
  assert.equal(existsSync(join(env.featureDir, "acceptance-waiver.yaml")), false);
  const waived = cli(env.dir, ["acceptance", "waive", `${ACCEPT}::AC-0001 discount line`, "--reason", "fixture disagrees with the contract (result[] vs items[])", "--by", "alice"]);
  assert.equal(waived.code, 0, JSON.stringify(waived.json));
  assert.equal(waived.json.waived.approved_by, "alice");
  const file = YAML.parse(readFileSync(join(env.featureDir, "acceptance-waiver.yaml"), "utf8"));
  assert.deepEqual(Object.keys(file.entries[0]).sort(), ["approved_at", "approved_by", "reason", "test"]);

  const r = await gate(env.dir, "checks");
  assert.deepEqual(rules(r).sort(), ["acceptance-failing", "acceptance-waived"], "the other file's failure still blocks; the waived test is a warning");
  const hard = r.failures.filter((f) => !f.warn);
  assert.deepEqual(hard.map((f) => f.file), [OTHER]);
  assert.ok(r.failures.find((f) => f.rule === "acceptance-waived").warn);
  // A waiver of the file covers every test in it; a name-only waiver never covers another test of the same file.
  write(env.dir, ACCEPT, readFileSync(join(env.dir, ACCEPT), "utf8")); // unchanged content, same hash
  env.fake("test", { code: 1, report: report({ [join(env.dir, ACCEPT)]: [["AC-0001 discount line", "failed", "x"], ["AC-0002 expired", "failed", "y"]], [join(env.dir, OTHER)]: [["AC-0003 cart total", "passed"]] }) });
  assert.deepEqual(rules(await gate(env.dir, "checks")).sort(), ["acceptance-failing", "acceptance-waived"], "AC-0002 is not waived");
  cli(env.dir, ["acceptance", "waive", ACCEPT, "--reason", "whole file is off", "--by", "alice"]);
  assert.deepEqual(rules(await gate(env.dir, "checks")), ["acceptance-waived", "acceptance-waived"]);
  assert.ok((await gate(env.dir, "checks")).pass, "only warnings left: gate-checks passes");

  // The waiver cannot be bypassed any other way: the lock still fails, an agent cannot write the file or run the command.
  write(env.dir, ACCEPT, "// edited\n");
  assert.ok(rules(await gate(env.dir, "checks")).includes("acceptance-test-changed"), "a waiver is not a licence to edit a locked test");
  const actives = [{ id: "FEAT-001/x/fe-builder/a1", agent: "fe-builder", subagent_type: "factory-role-frontend:fe-builder", write_allow: ["src/features/**"], write_deny: [], read_deny: [] }];
  const bash = (command) => decideBash({ agent_type: "fe-builder", tool_input: { command } }, actives, "/p", {});
  assert.match(bash('node /x/factory/scripts/factory.mjs acceptance waive a --reason "x"'), /factory acceptance is for the Conductor/);
  assert.match(bash("echo x > .factory/features/FEAT-001-a/acceptance-waiver.yaml"), /engine-owned/);

  // verification lists it: in the digest and the review the engine writes
  const c = conductor.load(env.dir);
  const { engineDigest } = await import(`${ENGINE}/scripts/lib/digest.mjs`);
  assert.match(engineDigest(c, "verification"), /Waived acceptance tests[\s\S]*checkout\.acceptance\.test\.tsx — whole file is off/);
});

test("replay acceptance --relock: only the disputed file is rewritten by the author, then re-locked; other locks stay", async () => {
  const env = verifyEnv();
  assert.equal(cli(env.dir, ["replay", "acceptance", "--relock", "src/nope.acceptance.test.ts"]).code, 2);
  const before = fileHash(join(env.dir, OTHER));
  const r = cli(env.dir, ["replay", "acceptance", "--relock", `${ACCEPT}::AC-0001 discount line`, "--with", "the fixture uses items[]; the contract says result[]"]);
  assert.equal(r.code, 0, JSON.stringify(r.json));
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.agent, "acceptance-test-author");
  assert.equal(d.phase, "relock");
  const pack = readFileSync(join(env.dir, d.pack), "utf8");
  assert.match(pack, /RELOCK: a human disputes the test "AC-0001 discount line" in src\/pages\/checkout/);
  assert.match(pack, /result\[\]/);
  const allow = YAML.parse(pack.split("---")[1]).write_allow;
  assert.deepEqual(allow, [ACCEPT], "the author may write only the disputed file");

  // An attempt that loses a test is sent back; the lock does not move.
  write(env.dir, ACCEPT, 'test("AC-0001 discount line", () => {});\n');
  let out = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(out.relock, "failed");
  assert.match(out.reason, /lost the test\(s\) AC-0002 expired/);
  const retry = conductor.step(env.dir).dispatches[0];
  assert.match(readFileSync(join(env.dir, retry.pack), "utf8"), /keep every other title/);
  write(env.dir, ACCEPT, 'test("AC-0001 discount line", () => { /* result[] */ });\ntest("AC-0002 expired", () => {});\n');
  out = await conductor.record(env.dir, { dispatchId: retry.id, envelopeText: envelope(retry.id) });
  assert.equal(out.relocked, ACCEPT);
  const s = featureState(env.featureDir);
  assert.equal(s.relock, null);
  assert.equal(s.acceptance_lock[ACCEPT], fileHash(join(env.dir, ACCEPT)), "the rewritten file is locked again");
  assert.equal(s.acceptance_lock[OTHER], before, "the other file's lock is untouched");
  assert.match(readFileSync(join(env.featureDir, "acceptance-lock", `${ACCEPT}.snapshot`), "utf8"), /result\[\]/);
  assert.equal(conductor.step(env.dir).action === "dispatch" && conductor.step(env.dir).dispatches?.[0]?.phase === "relock", false);
});

test("the acceptance stage hands its author the contract, the inbox API sections and the entity types; implementation stays unreadable", () => {
  const stage = YAML.parse(readFileSync(join(V2("factory-quality"), "stages", "acceptance", "stage.yaml"), "utf8"));
  for (const ref of ["api-contract?", "normalised-sources?", "entity-types?"]) assert.ok(stage.inputs.includes(ref), ref);
  assert.match(readFileSync(join(V2("factory-quality"), "stages", "acceptance", "stage.yaml"), "utf8"), /Timing \(decided\)/);
  const deny = stage.read_deny;
  assert.equal(matchesAny("src/features/x/ui/x.tsx", deny), true, "components stay unreadable");
  assert.equal(matchesAny("src/entities/document/model/types.ts", deny), false, "entity types are readable");
  assert.equal(matchesAny("src/entities/document/model/schema.ts", deny), false);
  assert.equal(matchesAny("src/pages/x/x.acceptance.test.tsx", deny), false);
});

// ---- Phase 7: source conflicts (D5) ----

const COMPLETENESS = 'pipeline: { stages: { requirements: { outputs: ["prd|delta-spec", completeness] } } }\nquality: { completeness_min: 0 }';
const credits = () => {
  const cats = YAML.parse(readFileSync(join(V2("factory-analysis"), "templates", "fa-completeness.yaml"), "utf8")).categories;
  return { feature: "FEAT-001", categories: cats };
};
const CONFLICTS = [
  { topic: "Detailed view button", claims: [{ source: "base.md", claim: "the button is disabled" }, { source: "mockup-spec.md", claim: "it is not given the disabled attribute" }], default_winner: "base.md", status: "open" },
  { topic: "Row height", claims: [{ source: "base.md", claim: "48px" }, { source: "mockup-spec.md", claim: "56px" }], default_winner: "base.md", status: "open" },
];

test("source conflicts raise exactly ONE clarify listing every contradiction, then the analyst records them resolved", async () => {
  const dir = makeProject(COMPLETENESS);
  const featureDir = makeFeature(dir);
  putIntake(dir);
  let s = conductor.step(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  write(featureDir, "01-requirements/completeness.yaml", YAML.stringify({ ...credits(), conflicts: CONFLICTS }));
  let r = await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(r.action, "ask_human");
  assert.equal(featureState(featureDir).stages.requirements.attempts ?? 0, 0, "the round costs no attempt");
  s = conductor.step(dir);
  assert.equal(s.gate, "CLARIFY");
  assert.equal(s.questions.length, 1, "one question, not one per contradiction");
  assert.match(s.questions[0], /2 point\(s\)[\s\S]*Detailed view button[\s\S]*Row height[\s\S]*proposed winner: base\.md/);
  assert.match(s.questions[0], /user's own brief/);

  conductor.approve(dir, { notes: "base.md wins on both" });
  s = conductor.step(dir);
  assert.equal(s.action, "dispatch");
  assert.match(readFileSync(join(dir, s.dispatches[0].pack), "utf8"), /2 source conflict\(s\) were put to the human[\s\S]*Human answer/);
  write(featureDir, "01-requirements/completeness.yaml", YAML.stringify({ ...credits(), conflicts: CONFLICTS.map((c) => ({ ...c, status: "resolved", resolution: "base.md (HD-1)" })) }));
  r = await conductor.record(dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id, { notes_mapped: [{ id: "HD-1", to: ["REQ-0001"] }] }) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures));
});

test("gate-spec: an open conflict fails, a resolved one needs a resolution, none is fine; patch stages are not checked", async () => {
  const dir = makeProject(COMPLETENESS);
  const featureDir = makeFeature(dir);
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const run = async (conflicts, stageId = "requirements") => {
    write(featureDir, "01-requirements/completeness.yaml", YAML.stringify({ ...credits(), ...(conflicts ? { conflicts } : {}) }));
    const c = conductor.load(dir);
    return runGate("spec", gateContext({ projectDir: dir, app: c.app, feature: c.feature, config: c.config, stage: conductor.resolveStage(c, stageId) }), { useCache: false });
  };
  assert.deepEqual(rules(await run(undefined)).filter((x) => /conflict|resolution/.test(x)), []);
  assert.ok(rules(await run(CONFLICTS)).includes("unresolved-conflict"));
  assert.ok(rules(await run([{ ...CONFLICTS[0], status: "resolved" }])).includes("no-resolution"));
  assert.deepEqual(rules(await run([{ ...CONFLICTS[0], status: "resolved", resolution: "base.md" }])).filter((x) => /conflict|resolution/.test(x)), []);
});

// ---- Phase 7: sizing and the small profile (A1) ----

test("sizing: a one-line fix is a patch, a short brief is small, a long or greenfield one is standard; --tier wins", () => {
  assert.equal(estimateSize("Fix the typo in the checkout button label.").tier, "patch");
  const brief = "# Document types\n\nAdd an overview panel.\n\n- the panel opens from a row\n- it shows the type's fields\n- it closes with Escape\n";
  assert.equal(estimateSize(brief).tier, "small");
  assert.equal(estimateSize(brief, { references: 1 }).tier, "small", "a mockup reference keeps it small");
  assert.equal(estimateSize(brief, { mode: "greenfield" }).tier, "standard");
  const big = `${"- the page must show a table of items\n".repeat(12)}${"word ".repeat(300)}`;
  assert.equal(estimateSize(big).tier, "standard");
  assert.equal(estimateSize("a ".repeat(900)).tier, "standard");
  assert.equal(sizeFromSpec({ reqs: 3, acs: 9 }).tier, "small");
  assert.equal(sizeFromSpec({ reqs: 9, acs: 30 }).tier, "standard");

  const dir = makeProject("pipeline: { profile: standard }");
  mkdirSync(join(dir, ".factory", "inbox"), { recursive: true });
  writeFileSync(join(dir, ".factory", "inbox", "brief.md"), brief);
  const res = intake(dir, { mode: "change-request" });
  const st = featureState(join(dir, ".factory", "features", readdirSync(join(dir, ".factory", "features"))[0]));
  assert.equal(res.created, true);
  assert.deepEqual([st.tier, st.profile, st.tier_auto], ["small", "small", true]);
  assert.ok(events(dir).some((e) => e.type === "feature" && e.tier === "small" && /requirement-like/.test(e.sizing)));
  const own = makeProject();
  mkdirSync(join(own, ".factory", "inbox"), { recursive: true });
  writeFileSync(join(own, ".factory", "inbox", "brief.md"), brief);
  intake(own, { mode: "change-request" });
  assert.equal(featureState(join(own, ".factory", "features", readdirSync(join(own, ".factory", "features"))[0])).profile, "test", "a project's own default profile is kept: no sizing");
  const explicit = makeProject("pipeline: { profile: standard }");
  mkdirSync(join(explicit, ".factory", "inbox"), { recursive: true });
  writeFileSync(join(explicit, ".factory", "inbox", "brief.md"), brief);
  intake(explicit, { mode: "change-request", tier: "standard" });
  const s2 = featureState(join(explicit, ".factory", "features", readdirSync(join(explicit, ".factory", "features"))[0]));
  assert.deepEqual([s2.tier, s2.tier_auto ?? false], ["standard", false], "an explicit tier is kept and never re-sized");
});

/** Adds a pack (and config keys) to a project's config file. */
function configure(dir, patch) {
  const file = join(dir, ".factory", "factory.config.yaml");
  writeFileSync(file, YAML.stringify(deepMerge(YAML.parse(readFileSync(file, "utf8")), patch)));
}

function realPacksProject(extra = "") {
  const names = ["factory-analysis", "factory-quality", "factory-delivery", "factory-adapter-github", "factory-role-frontend"];
  return makeProject(
    [
      `packs: { ${names.map((n) => `${n}: "${V2(n)}"`).join(", ")}, frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}" }`,
      "roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit } }",
      "pipeline: { profile: standard, stages: { planning: { pack: factory-analysis }, requirements: { pack: factory-analysis }, stories: { pack: factory-analysis } } }",
      extra,
    ].join("\n"),
  );
}

test("every profile (patch, small, standard, greenfield) is reachable, every stage has an exit gate and reads only what an earlier stage wrote", async () => {
  const dir = realPacksProject();
  makeFeature(dir);
  const c = conductor.load(dir);
  const profiles = c.config.pipeline.profiles;
  delete profiles.test; // the test helper's own profile
  assert.deepEqual(Object.keys(profiles).sort(), ["greenfield", "patch", "small", "standard"]);
  assert.equal(profiles.small.includes("acceptance"), false, "small has no separate acceptance stage");
  const { ARTIFACT_TYPES, parseArtifactRef } = await import(`${ENGINE}/scripts/lib/schemas.mjs`);
  const known = new Set(["discovery.needed", "pr.comments", "docs.enabled"]);
  for (const [name, stages] of Object.entries(profiles)) {
    assert.equal(new Set(stages).size, stages.length, `${name}: a stage twice`);
    assert.equal(stages[0], "intake", `${name} starts at intake`);
    const produced = new Set(Object.keys(ARTIFACT_TYPES).filter((t) => ARTIFACT_TYPES[t].external || ARTIFACT_TYPES[t].producer === "engine"));
    for (const id of stages) {
      const stage = conductor.resolveStage(c, id);
      assert.ok(stage, `${name}: stage ${id} is provided by no pack`);
      assert.ok(stage.gate || stage.kind === "task_loop", `${name}/${id}: no exit gate`);
      if (stage.when) assert.ok(known.has(stage.when), `${name}/${id}: unknown condition ${stage.when}`);
      for (const ref of stage.inputs ?? []) {
        const { names, optional } = parseArtifactRef(ref);
        if (!optional) assert.ok(names.some((n) => produced.has(n)), `${name}/${id} reads "${ref}", which no earlier stage of the profile writes`);
      }
      for (const ref of stage.outputs ?? []) for (const n of parseArtifactRef(ref).names) produced.add(n);
    }
    // reachable: one path from the first to the last stage (every stage is listed once and every backward edge points into the profile)
    for (const id of stages) {
      const stage = conductor.resolveStage(c, id);
      const back = /^(?:goto|fix):(.+)$/.exec(stage.on_fail ?? "")?.[1] ?? /^fix:(.+)$/.exec(stage.on_reject ?? "")?.[1];
      if (back) assert.ok(stages.includes(back) && stages.indexOf(back) < stages.indexOf(id), `${name}/${id}: backward edge to ${back}`);
    }
  }
  const r = doctor(dir);
  assert.deepEqual([...r.errors, ...r.warnings].filter((w) => /^profile (?!test:)|unknown gate/.test(w)), []);
});

test("A2: every backward edge of every stage has a cap in defaults, and a halt names the edge", async () => {
  const dir = realPacksProject();
  makeFeature(dir);
  const c = conductor.load(dir);
  const caps = c.config.budgets.backward_edges;
  assert.equal(caps.verification_to_implementation, 4);
  for (const stages of Object.values(c.config.pipeline.profiles)) {
    for (const id of stages) {
      const stage = conductor.resolveStage(c, id);
      const edges = [/^(?:goto|fix):(.+)$/.exec(stage.on_fail ?? "")?.[1], /^fix:(.+)$/.exec(stage.on_reject ?? "")?.[1]].filter(Boolean).map((to) => `${id}_to_${to}`);
      if (stage.on_approve === "spec_delta") edges.push(`${id}_to_requirements`);
      if (id === "feedback") edges.push("feedback_to_implementation");
      // lateNotesBack: a /factory:note after the build sends the feature back from ANY later stage
      if (stages.indexOf(id) > stages.indexOf("implementation") && stages.includes("implementation")) edges.push(`${id}_to_implementation`);
      for (const edge of edges) assert.equal(typeof caps[edge], "number", `${edge} has no cap`);
    }
  }
  // a halt: verification may go back to implementation only `cap` times, and says which edge
  const env = verifyEnv("budgets: { backward_edges: { verification_to_implementation: 1 } }");
  const git = (...args) => execFileSync("git", args, { cwd: env.dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@example.invalid");
  git("config", "user.name", "T");
  writeFileSync(join(env.dir, ".git", "info", "exclude"), ".fake\n");
  git("add", "-A", "--", ".", ":(exclude).factory");
  git("commit", "-q", "-m", "baseline");
  env.fake("test", { code: 1, report: report({ [join(env.dir, ACCEPT)]: [["AC-0001 discount line", "failed", "x"]] }) });
  const round = async () => {
    const st = featureState(env.featureDir);
    Object.assign(st, { stage: "verification", status: "active", awaiting_human: null, pending: [] });
    st.stages.verification = { status: "pending", attempts: 0, rung: 0 };
    saveState(env.featureDir, st);
    const s = await conductor.stepAsync(env.dir);
    return s;
  };
  const first = await round();
  assert.notEqual(first.action, "halt", JSON.stringify(first));
  assert.equal(featureState(env.featureDir).stage, "implementation");
  const second = await round();
  assert.equal(second.action, "halt");
  assert.match(second.reason, /backward edge verification_to_implementation used more than 1 time/);
});

// ---- Phase 7: GATE-A at requirements, autopilot, skip_gates ----

async function agentDoes(dir, featureDir, d, files) {
  for (const [target, fixture] of Object.entries(files)) putArtifact(featureDir, fixture, target);
  return conductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
}

test("GATE-A is asked at requirements, before stories", async () => {
  for (const mode of ["change-request", "greenfield"]) {
    const dir = makeProject("context: { digest: engine }");
    const featureDir = makeFeature(dir, { mode });
    putIntake(dir);
    const s = conductor.step(dir);
    await agentDoes(dir, featureDir, s.dispatches[0], { "01-requirements/delta-spec.yaml": "delta-spec.yaml" });
    const asked = conductor.step(dir);
    assert.equal(asked.gate, "GATE-A", mode);
    assert.equal(asked.stage, "requirements", mode);
  }
});

test("autopilot: GATE-B passes by itself once gate plan is green, the auto-pass is in events; GATE-D and GATE-C still ask", async () => {
  const dir = makeProject("automation: { autopilot: true }\ncontext: { digest: engine }");
  const featureDir = makeFeature(dir);
  putIntake(dir);
  let s = conductor.step(dir);
  await agentDoes(dir, featureDir, s.dispatches[0], { "01-requirements/delta-spec.yaml": "delta-spec.yaml" });
  s = conductor.step(dir);
  await agentDoes(dir, featureDir, s.dispatches[0], { "02-stories/stories.yaml": "stories.yaml", "02-stories/ux-notes.md": "ux-notes.md" });
  s = conductor.step(dir);
  const r = await agentDoes(dir, featureDir, s.dispatches[0], { "04-plan/tasks.yaml": "tasks.yaml", "04-plan/test-plan.yaml": "test-plan.yaml" });
  assert.equal(r.verdict, "advance", "gate plan is green");
  assert.equal(conductor.step(dir).action, "done");
  const auto = events(dir).find((e) => e.type === "human" && e.gate === "GATE-B");
  assert.deepEqual([auto.result, auto.by, auto.auto, auto.reason], ["approved", "autopilot", true, "gate plan green"]);
  const { ENGINE_ROOT } = await import(`${ENGINE}/scripts/lib/core.mjs`);
  const defaults = YAML.parse(readFileSync(join(ENGINE_ROOT, "defaults.yaml"), "utf8"));
  assert.deepEqual(defaults.pipeline.skip_gates.small, ["GATE-D", "GATE-B"]);
  assert.equal(defaults.pipeline.skip_gates.standard.includes("GATE-C"), false);
  assert.equal(defaults.pipeline.skip_gates.standard.includes("GATE-A"), false);
  assert.equal(defaults.delivery.docs, false);
  assert.equal(defaults.delivery.pr, false);
});

test("the small profile does not ask GATE-B; the stage's own gate has passed and the skip is recorded", async () => {
  const dir = makeProject('pipeline: { skip_gates: { test: [GATE-B] } }\ncontext: { digest: engine }');
  const featureDir = makeFeature(dir);
  putIntake(dir);
  let s = conductor.step(dir);
  await agentDoes(dir, featureDir, s.dispatches[0], { "01-requirements/delta-spec.yaml": "delta-spec.yaml" });
  conductor.approve(dir, {});
  s = conductor.step(dir);
  await agentDoes(dir, featureDir, s.dispatches[0], { "02-stories/stories.yaml": "stories.yaml", "02-stories/ux-notes.md": "ux-notes.md" });
  s = conductor.step(dir);
  await agentDoes(dir, featureDir, s.dispatches[0], { "04-plan/tasks.yaml": "tasks.yaml", "04-plan/test-plan.yaml": "test-plan.yaml" });
  assert.equal(conductor.step(dir).action, "done");
  const g = featureState(featureDir).gates["GATE-B"];
  assert.deepEqual([g.result, g.by, g.auto], ["approved", "profile:test", true]);
});

// ---- Phase 7: budgets follow the plan (E4) ----

test("budgets: dispatches = 4 × tasks + 20, stage max the same, wall clock 30 × tasks + 120 (≥ 240); only ever raised; recorded", () => {
  assert.deepEqual(budgetsForTasks(8), { dispatches: 52, wall_clock_min: 360 });
  assert.deepEqual(budgetsForTasks(2), { dispatches: 28, wall_clock_min: 240 });
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  const c = conductor.load(dir);
  const small = raiseBudgetsFromPlan(c, 8);
  assert.deepEqual(small, { "feature.wall_clock_min": 360, "stage.dispatches_max.implementation": 52, "stage.dispatches_max.verification": 52 }, "60 feature dispatches already cover 8 tasks; the implementation/verification caps and the clock rise");
  assert.equal(c.config.budgets.stage.dispatches_max_by_stage.implementation, 52);
  assert.equal(c.config.budgets.stage.dispatches_max, 8, "every other stage keeps the fixed cap");
  const big = raiseBudgetsFromPlan(c, 12);
  assert.deepEqual(big, { "feature.dispatches": 68, "feature.wall_clock_min": 480, "stage.dispatches_max.implementation": 68, "stage.dispatches_max.verification": 68 });
  assert.deepEqual(raiseBudgetsFromPlan(c, 3), {}, "never lowered");
  const reloaded = conductor.load(dir).config.budgets;
  assert.deepEqual([reloaded.feature.dispatches, reloaded.stage.dispatches_max_by_stage.implementation, reloaded.feature.wall_clock_min], [68, 68, 480], "kept in the feature's overrides.yaml");
  assert.ok(existsSync(join(featureDir, "overrides.yaml")));
  assert.equal(events(dir).filter((e) => e.type === "budget").length, 2);
  // a value a person set higher stays
  const human = makeProject("budgets: { feature: { dispatches: 500 }, stage: { dispatches_max: 99 } }");
  makeFeature(human);
  const hc = conductor.load(human);
  assert.deepEqual(raiseBudgetsFromPlan(hc, 12), { "feature.wall_clock_min": 480 });
  assert.deepEqual([hc.config.budgets.feature.dispatches, hc.config.budgets.stage.dispatches_max], [500, 99]);
  assert.equal(hc.config.budgets.stage.dispatches_max_by_stage, undefined, "a higher value a person set is not shadowed");
});

test("E4: planning raises the budgets from the plan itself, so no run halts on a default and nobody raises one by hand", async () => {
  const dir = makeProject("context: { digest: engine }\nautomation: { autopilot: true }");
  const featureDir = makeFeature(dir);
  putIntake(dir);
  let s = conductor.step(dir);
  await agentDoes(dir, featureDir, s.dispatches[0], { "01-requirements/delta-spec.yaml": "delta-spec.yaml" });
  s = conductor.step(dir);
  await agentDoes(dir, featureDir, s.dispatches[0], { "02-stories/stories.yaml": "stories.yaml", "02-stories/ux-notes.md": "ux-notes.md" });
  assert.equal(conductor.load(dir).config.budgets.stage.dispatches_max, 8, "the default before the plan");
  s = conductor.step(dir);
  await agentDoes(dir, featureDir, s.dispatches[0], { "04-plan/tasks.yaml": "tasks.yaml", "04-plan/test-plan.yaml": "test-plan.yaml" });
  const tasks = YAML.parse(readFileSync(join(featureDir, "04-plan", "tasks.yaml"), "utf8")).tasks.length;
  const b = conductor.load(dir).config.budgets;
  assert.equal(b.stage.dispatches_max_by_stage.implementation, 4 * tasks + 20, "the implementation cap follows the plan");
  assert.equal(b.stage.dispatches_max, 8, "other stages keep the default cap");
  const ev = events(dir).find((e) => e.type === "budget");
  assert.deepEqual([ev.tasks, ev.source, ev.raised["stage.dispatches_max.implementation"]], [tasks, "plan", 4 * tasks + 20]);
  // the 8-task plan of the real run: budgetsForTasks(8) holds 8 tasks at 4 dispatches each plus 20 for the stages
  const st = featureState(featureDir);
  st.budgets.dispatches = 8 * 4 + 20 - 1;
  assert.deepEqual(exhaustedBudgets(st, { budgets: { feature: { dispatches: budgetsForTasks(8).dispatches } } }), []);
});

// ---- Phase 7: early quality (F1, F2) ----

test("F1: gate impl runs the raw-colour and i18n audits on the task's files; verification still runs them as a net", async () => {
  const env = loopSetup();
  write(env.dir, "package.json", '{ "dependencies": { "i18next": "25.0.0" } }\n');
  const tasks = YAML.parse(readFileSync(join(env.featureDir, "04-plan", "tasks.yaml"), "utf8")).tasks;
  const task = tasks.find((t) => t.id === "TASK-003");
  const tsx = task.files_expected.find((f) => f.endsWith(".tsx") && !f.includes(".test."));
  write(env.dir, tsx, 'export const CouponField = () => <p style={{ color: "#ff0000" }}>Apply the coupon</p>;\n');
  env.fake("test", { code: 0, report: report({}) });
  const c = conductor.load(env.dir);
  const r = await gate(env.dir, "impl", { task, stack: resolveStack(c, task.role) });
  const audits = r.failures.filter((f) => f.check === "audit");
  assert.deepEqual(audits.map((f) => f.rule).sort(), ["i18n", "raw-colours"]);
  assert.ok(audits.every((f) => f.file === tsx && !f.warn), "P2 findings block the task by default");
  assert.match(audits.find((f) => f.rule === "raw-colours").message, /raw colour instead of a design token/);
  // a clean file passes both; a project can lower the blocking severities or switch an audit off
  write(env.dir, tsx, 'export const CouponField = () => <p className="text-foreground">{t("coupon.apply")}</p>;\n');
  assert.deepEqual((await gate(env.dir, "impl", { task, stack: resolveStack(c, task.role) })).failures.filter((f) => f.check === "audit"), []);
  const role = YAML.parse(readFileSync(join(V2("factory-role-frontend"), "role.yaml"), "utf8"));
  assert.deepEqual(role.gates.audits.filter((a) => a.per_task).map((a) => a.name), ["raw-colours", "i18n"]);
  assert.ok(role.gates.audits.some((a) => a.name === "bundle" && !a.per_task) && role.gates.audits.some((a) => a.name === "axe" && !a.per_task), "bundle and axe stay at verification");
});

test("F2: the reviewer runs once after the first finished slice, non-blocking; its findings amend the owning slices", async () => {
  const env = loopSetup();
  configure(env.dir, { packs: { "factory-quality": V2("factory-quality") } });
  const st = featureState(env.featureDir);
  st.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, st);
  const s = conductor.step(env.dir);
  assert.equal(s.dispatches.length, 1);
  const d = s.dispatches[0];
  assert.deepEqual([d.agent, d.phase], ["reviewer", "early_review"]);
  assert.match(readFileSync(join(env.dir, d.pack), "utf8"), /EARLY REVIEW after the first slice \(TASK-001\)[\s\S]*does not block anything/);
  assert.ok(existsSync(join(env.featureDir, "06-verify", "change-set.yaml")));
  const r = await conductor.record(env.dir, { dispatchId: d.id, envelopeText: envelope(d.id, { findings: [{ lens: "tests", severity: "P1", file: "src/entities/order/model/total.ts", claim: "rounds the total twice" }, { lens: "over-engineering", severity: "P3", claim: "naming" }] }) });
  assert.equal(r.action, "continue");
  const after = featureState(env.featureDir);
  assert.deepEqual([after.early_review.done, after.early_review.findings], [true, 1], "P3 is dropped");
  assert.equal(after.fix_pending.source, "early review");
  assert.match(after.fix_pending.items[0].message, /rounds the total twice[\s\S]*amend the slice/);
  assert.equal(after.status, "active", "nothing blocks");
  const next = conductor.step(env.dir).dispatches[0];
  assert.equal(next.phase, "fixplan", "the existing fix path: the planner amends the owning slices");
  assert.match(readFileSync(join(env.dir, next.pack), "utf8"), /AMEND that task/);
  // never a second review
  const again = featureState(env.featureDir);
  assert.ok(again.early_review.done);
});

test("F2: quality.early_review: false switches the early review off", () => {
  const env = loopSetup();
  configure(env.dir, { packs: { "factory-quality": V2("factory-quality") }, quality: { early_review: false } });
  const st = featureState(env.featureDir);
  st.tasks = { "TASK-001": { status: "done" } };
  saveState(env.featureDir, st);
  assert.notEqual(conductor.step(env.dir).dispatches[0].phase, "early_review");
});

// ---- doctor: the project around the factory ----

test("doctor warns when `eslint .` would lint .factory/", () => {
  const dir = makeProject("roles: { frontend: { enabled: true } }");
  assert.deepEqual(doctor(dir).warnings.filter((w) => /eslint/.test(w)), [], "nothing to warn about yet");
  write(dir, "eslint.config.js", "export default [{ rules: {} }];\n");
  const e = doctor(dir).warnings.filter((x) => /eslint/.test(x));
  assert.equal(e.length, 1);
  assert.match(e[0], /\.factory\/\*\*/);
  write(dir, "eslint.config.js", 'export default [{ ignores: [".factory/**"] }];\n');
  assert.deepEqual(doctor(dir).warnings.filter((x) => /eslint/.test(x)), []);
  // a role in its own folder never lints the project root
  const apart = makeProject("roles: { frontend: { enabled: true, path: web } }");
  mkdirSync(join(apart, "web"), { recursive: true });
  write(apart, "eslint.config.js", "export default [];\n");
  assert.deepEqual(doctor(apart).warnings.filter((x) => /eslint/.test(x)), []);
});

// ---- rules for builders, planners (F3) ----

test("F3: builders and the planner are told never to bend production code to a fixture, and to dispute naming the test and the contract", () => {
  for (const file of ["factory-role-frontend/agents/fe-builder.md", "factory-role-backend/agents/be-builder.md", "factory-role-ai-agent/agents/ai-builder.md", "factory-analysis/agents/planner.md"]) {
    const text = readFileSync(join(V2(""), file), "utf8").replace(/\s+/g, " ");
    assert.match(text, /fit a (test )?fixture's shape/, file);
    assert.match(text, /test-only hook, shim or adapter/, file);
    assert.match(text, /`test_dispute` naming the test and the contract line/, file);
  }
  for (const file of ["factory-role-frontend/skills/fe-implement-task/SKILL.md", "factory-role-backend/skills/be-implement-task/SKILL.md", "factory-role-ai-agent/skills/ai-implement-task/SKILL.md"]) {
    assert.match(readFileSync(join(V2(""), file), "utf8").replace(/\s+/g, " "), /shim, adapter,? or test-only hook/, file);
  }
});
