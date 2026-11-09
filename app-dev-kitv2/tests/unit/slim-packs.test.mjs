// Phase 4: slim packs and cheaper gates. A task pack inlines only the task's slice (E1), carries only the
// notes that concern it (D3), no stale digest, stable rules first and the unique mission last; task gates
// test and lint only what the task changed since its base ref, never build, and reuse an identical failure (E3);
// no opus does mechanical work (E5).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, loopSetup, makeFeature, makeProject, putArtifact, report } from "./helpers.mjs";

const ROOT = join(TESTS, "..", "..");
const { buildPack } = await import(`${ENGINE}/scripts/lib/broker.mjs`);
const { classifyNote, notesForPack, addNote, openNotes, readNotes } = await import(`${ENGINE}/scripts/lib/notes.mjs`);
const { freshDigest } = await import(`${ENGINE}/scripts/lib/digest.mjs`);
const { recordBaseRef, changedSinceBase } = await import(`${ENGINE}/scripts/lib/baseref.mjs`);
const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const { coveredCommands, incrementalTscArgs, resolveStack } = await import(`${ENGINE}/scripts/lib/stackexec.mjs`);
const { loadConfig } = await import(`${ENGINE}/scripts/lib/config.mjs`);

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
const write = (dir, file, text) => {
  mkdirSync(join(dir, file, ".."), { recursive: true });
  writeFileSync(join(dir, file), text);
};
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const saveState = (dir, s) => writeFileSync(join(dir, "state.json"), JSON.stringify(s));
const setState = (env, patch) => {
  const s = featureState(env.featureDir);
  Object.assign(s, patch(s) ?? s);
  saveState(env.featureDir, s);
};
const packText = (env, d) => readFileSync(join(env.dir, d.pack), "utf8");
const front = (text) => YAML.parse(text.split("---")[1]);
const rest = (text) => text.split("---").slice(2).join("---");
const notesFile = (env) => join(env.featureDir, "human-notes.yaml");
const note = (id, text, extra = {}) => ({ id, at: "note", by: "t", text, status: "open", mapped_to: [], ...extra });

/** loopSetup + the artifacts a task slice draws on + a git baseline. */
function slimEnv(extra = "") {
  const env = loopSetup(extra);
  for (const [f, t] of [["stories.yaml", "02-stories/stories.yaml"], ["component-map.md", "03-architecture/component-map.md"], ["api-contract.yaml", "03-architecture/api-contract.yaml"]]) putArtifact(env.featureDir, f, t);
  return env;
}
function gitInit(dir) {
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.invalid");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, ".git", "info", "exclude"), ".fake\n");
  git(dir, "add", "-A", "--", ".", ":(exclude).factory");
  git(dir, "commit", "-q", "-m", "baseline");
}

// ---- notes (D3) ----

test("notes: kind is explicit or heuristic; a process note is stored as done and is never open", () => {
  assert.equal(classifyNote("raise the dispatch budget to 120"), "process");
  assert.equal(classifyNote("please stop asking me questions"), "process");
  assert.equal(classifyNote("the discount line must show the coupon code"), "product");
  assert.equal(classifyNote("raise the dispatch budget", "product"), "product", "an explicit kind wins");
  assert.equal(classifyNote("anything", "process"), "process");
  const env = slimEnv();
  const app = conductor.load(env.dir).app;
  const process_ = addNote(app, env.featureDir, { text: "stop asking, keep going", at: "note" });
  const product = addNote(app, env.featureDir, { text: "show the code on the discount line", at: "note" });
  assert.deepEqual([process_.kind, process_.status, product.kind, product.status], ["process", "done", "product", "open"]);
  assert.deepEqual(openNotes(env.featureDir).map((n) => n.id), [product.id]);
  // Even a hand-edited open process note is not an open note.
  writeFileSync(notesFile(env), YAML.stringify([...readNotes(env.featureDir), note("HD-9", "x", { kind: "process" })]));
  assert.deepEqual(openNotes(env.featureDir).map((n) => n.id), [product.id]);
});

test("notesForPack: scope by mapping, open product notes always, no process, declined or done, identical texts once", () => {
  const all = [
    note("HD-1", "Mapped to this task", { status: "mapped", mapped_to: ["TASK-003"] }),
    note("HD-2", "Mapped to its AC", { status: "mapped", mapped_to: ["AC-0001"] }),
    note("HD-3", "Mapped to another task", { status: "mapped", mapped_to: ["TASK-009"] }),
    note("HD-4", "An open product note"),
    note("HD-5", "Raise the budget", { kind: "process" }),
    note("HD-6", "Declined one", { status: "declined" }),
    note("HD-7", "AN   open product  note"),
    note("HD-8", "Delivered", { status: "done", mapped_to: ["TASK-003"] }),
  ];
  const scope = new Set(["TASK-003", "AC-0001", "REQ-0001"]);
  const out = notesForPack(all, scope);
  assert.deepEqual(out.map((n) => n.id), ["HD-1", "HD-2", "HD-4"]);
  assert.deepEqual(out.find((n) => n.id === "HD-4").also, ["HD-7"], "the duplicate is folded into the first");
  assert.deepEqual(notesForPack(all).map((n) => n.id), ["HD-1", "HD-2", "HD-3", "HD-4", "HD-8"], "without a scope (a stage pack): everything except process and declined, deduped");
});

test("a process note never sends the feature to the planner; a product note does", () => {
  const env = slimEnv();
  conductor.note(env.dir, { text: "raise the dispatch budget to 200 and stop asking", feature: undefined });
  let r = conductor.step(env.dir);
  assert.equal(r.dispatches?.[0]?.phase, "char", JSON.stringify(r).slice(0, 200));
  assert.equal(featureState(env.featureDir).fix_pending ?? null, null);
  const kinds = readNotes(env.featureDir).map((n) => [n.kind, n.status]);
  assert.deepEqual(kinds, [["process", "done"]]);
  const env2 = slimEnv();
  conductor.note(env2.dir, { text: "the coupon field must keep its focus after an error" });
  r = conductor.step(env2.dir);
  assert.equal(r.dispatches?.[0]?.phase, "fixplan");
});

// ---- the pack (E1) ----

test("a build pack inlines the task's slice, lists the whole artifacts as optional reads and is estimated under 25k tokens (forced skills included)", () => {
  const env = slimEnv();
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-001": { status: "done" }, "TASK-002": { status: "done" } } }));
  writeFileSync(
    notesFile(env),
    YAML.stringify([
      note("HD-1", "Coupon codes are case-insensitive", { status: "mapped", mapped_to: ["AC-0001"] }),
      note("HD-2", "Totals round half-even", { status: "mapped", mapped_to: ["TASK-009"] }),
      note("HD-3", "Raise the budget to 300", { kind: "process" }),
      // (An unmapped open note would send the feature to the planner first; the open case is in notesForPack's test.)
      note("HD-4", "The empty state needs an icon", { status: "mapped", mapped_to: ["REQ-0001"] }),
      note("HD-5", "the EMPTY state needs an icon", { status: "mapped", mapped_to: ["REQ-0001"] }),
    ]),
  );
  write(env.featureDir, "digest.md", "# FEAT-001 — digest after planning\nDIGEST-MARKER\n");
  const r = conductor.step(env.dir);
  const d = r.dispatches.find((x) => x.task === "TASK-003");
  assert.ok(d, JSON.stringify(r).slice(0, 300));
  const text = packText(env, d);
  const body = rest(text);
  assert.doesNotMatch(body, /DIGEST-MARKER/, "no digest in a task pack");
  assert.match(body, /Coupon codes are case-insensitive/, "mapped to the task's AC");
  assert.match(body, /The empty state needs an icon/, "mapped to the task's requirement");
  assert.match(body, /HD-4 \(also HD-5\)/, "duplicates folded");
  assert.doesNotMatch(body, /Totals round half-even/, "mapped to another task");
  assert.doesNotMatch(body, /Raise the budget/, "process note");
  // The slice: requirement, story with the AC's Gherkin, planned cases, the component and the contract operation.
  assert.match(body, /Requirements: REQ-0001/);
  assert.match(body, /Story STORY-0001/);
  assert.match(body, /AC-0001: Given a cart with total 100\.00 EUR/);
  assert.match(body, /Planned test cases: TEST-0001 \(component, AC-0001\)/);
  assert.match(body, /Component map \(your files\):\n\s+- CouponField · src\/features\/apply-coupon\/ui\/coupon-field\.tsx/);
  assert.match(body, /API contract \(operations of this task\):\n\s+- PUT \/carts\/\{cartId\}\/coupon/);
  // The whole artifacts are optional reads, not counted.
  assert.match(body, /## T2 — Optional reads \(read only if needed/);
  assert.match(body, /- tasks: .*tasks\.yaml/);
  const f = front(text);
  const mandatory = [...body.matchAll(/^(?:Rule|Root cause): (\S+) \[READ\]/gm)].map((m) => m[1]);
  // The skills the agent is forced to load (Skills preflight) are read in full: their SKILL.md bodies count (E1, review 5).
  const skills = (/call the Skill tool once for each of: ([^.]+)\./.exec(body)?.[1] ?? "").split(",").map((x) => x.trim().split(":").pop()).filter(Boolean);
  assert.ok(skills.length > 0, "the build pack forces skill loads");
  // Stack skills live in the stack kit; the agent's own procedure skills live in the role pack.
  const skillFile = (name) => ["frontend-dev-kit", "app-dev-kitv2/factory-role-frontend"].map((kit) => join(ROOT, kit, "skills", name, "SKILL.md")).find((p) => existsSync(p));
  const skillTokens = skills.reduce((n, name) => n + Math.ceil(statSync(skillFile(name)).size / 4), 0);
  const expected = Math.ceil(Buffer.byteLength(body.replace(/^\n/, "").replace(/\n$/, "")) / 4) + mandatory.reduce((n, p) => n + Math.ceil(statSync(p).size / 4), 0) + skillTokens;
  assert.ok(skillTokens > 1000, `the skills are a real share of the estimate: ${skillTokens}`);
  assert.ok(f.estimated_tokens < 25000, `estimated ${f.estimated_tokens} (the forced skills add ~${skillTokens}; the pack text and rules alone were < 20k)`);
  assert.ok(Math.abs(f.estimated_tokens - expected) <= 2, `the estimate is the pack text plus the [READ] rules plus the forced skills: ${f.estimated_tokens} vs ${expected}`);
  assert.equal(f.context_degraded, false);
});

test("stable first, unique last: packs of two tasks share the leading rules and the mission comes last", () => {
  const env = slimEnv();
  const first = conductor.step(env.dir).dispatches[0];
  const a = rest(packText(env, first));
  setState(env, (s) => ({ pending: [], tasks: { ...s.tasks, "TASK-001": { status: "done" }, [first.task]: { status: "done" } } }));
  const second = conductor.step(env.dir).dispatches[0];
  assert.notEqual(second.task, first.task);
  const b = rest(packText(env, second));
  for (const text of [a, b]) {
    const at = (h) => text.indexOf(h);
    assert.ok(at("## T1") < at("## T4") && at("## T4") < at("## T2") && at("## T2") < at("## T0 — Mission"), "T1, T4, T2, then the mission");
    assert.ok(at("## T0 — Mission") < at("Exit check") && at("Exit check") < at("Return: end your reply"), "mission, exit check and return line are at the end");
  }
  const common = (() => {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  })();
  assert.ok(common.includes("## T1 — Orientation"), "the header and the first stable lines are identical");
  assert.ok(!common.includes("## T0 — Mission"), "the mission differs");
  // The Task prompt: a fixed text with the unique pack at the end.
  const p = (d) => d.prompt.replace(/Context pack: .*$/, "");
  assert.equal(p(first), p(second));
  assert.match(first.prompt, /Context pack: \S+ \(pack_id "[^"]+"\)$/);
});

test("digest: a fresh one is inlined for a stage pack; a stale one (older than an artifact, or from before the build) is left out", () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  const c = conductor.load(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  const digest = join(featureDir, "digest.md");
  writeFileSync(digest, "# FEAT-001 — digest after requirements\nDIGEST-MARKER\n");
  const past = new Date(Date.now() + 5000);
  utimesSync(digest, past, past);
  assert.match(freshDigest(dir, c.feature, c.config, "stories") ?? "", /DIGEST-MARKER/);
  const pack = (id) => buildPack(dir, c.feature, c.config, { id, stageId: "stories", stage: { outputs: [], inputs: [] }, agent: "b", subagent_type: "p:b", model: "sonnet", attempt: 1 });
  assert.match(readFileSync(pack("FEAT-001/stories/b/a1").file, "utf8"), /DIGEST-MARKER/);
  const later = new Date(Date.now() + 60000);
  utimesSync(join(featureDir, "01-requirements", "delta-spec.yaml"), later, later);
  assert.equal(freshDigest(dir, c.feature, c.config, "stories"), null, "an artifact written after the digest makes it stale");
  assert.doesNotMatch(readFileSync(pack("FEAT-001/stories/b/a2").file, "utf8"), /DIGEST-MARKER/);
  // "after planning" is stale once the build began.
  utimesSync(join(featureDir, "01-requirements", "delta-spec.yaml"), new Date(0), new Date(0));
  writeFileSync(digest, "# FEAT-001 — digest after planning\nDIGEST-MARKER\n");
  utimesSync(digest, past, past);
  const impl = { ...c.config, pipeline: { ...c.config.pipeline, profiles: { test: ["requirements", "planning", "implementation"] } } };
  assert.ok(freshDigest(dir, c.feature, impl, "planning"), "fresh while planning");
  assert.equal(freshDigest(dir, c.feature, impl, "implementation"), null);
});

test("degradation: a large optional input goes first, golden files last", () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  write(featureDir, "02-stories/ux-notes.md", `# UX\n${"words ".repeat(8000)}\n`);
  const c = conductor.load(dir);
  const build = (budget, id) => {
    const config = { ...c.config, context: { ...c.config.context, budgets: { ...c.config.context?.budgets, probe: budget } } };
    return buildPack(dir, c.feature, config, {
      id, stageId: "stories", stage: { outputs: [], inputs: ["delta-spec", "ux-notes?"], context_role: "probe" }, agent: "b", subagent_type: "p:b", model: "sonnet", attempt: 1,
      knowledge: { skills: [], rules: [], golden: ["/kit/skills/x/examples.md"] },
    });
  };
  const full = build(1e9, "FEAT-001/stories/b/a1");
  assert.equal(full.front.context_degraded, false);
  const ftext = readFileSync(full.file, "utf8");
  assert.match(ftext, /- ux-notes: /);
  assert.match(ftext, /Golden files/);
  const mid = build(full.front.estimated_tokens - 500, "FEAT-001/stories/b/a2");
  const mtext = readFileSync(mid.file, "utf8");
  assert.equal(mid.front.context_degraded, true);
  assert.doesNotMatch(mtext, /- ux-notes: /, "the large optional input is dropped");
  assert.match(mtext, /Golden files/, "golden files stay");
  assert.match(mtext, /- delta-spec: /, "a required input stays");
  const tiny = build(400, "FEAT-001/stories/b/a3");
  const ttext = readFileSync(tiny.file, "utf8");
  assert.doesNotMatch(ttext, /Golden files/, "golden files go last");
  assert.match(ttext, /- delta-spec: /);
});

// ---- gates (E3) ----

/** A git project on a fake stack with a files-only lint command that logs the files it is given. */
function gateEnv(extra = "") {
  const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");
  const env = loopSetup(extra);
  const file = join(env.dir, ".factory", "factory.config.yaml");
  const config = YAML.parse(readFileSync(file, "utf8"));
  config.roles.frontend.stack_overrides.commands.lint_files = ["node", FAKE, "lint_files", "{report}", "{files}"];
  config.roles.frontend.stack_overrides.commands.test_related = ["node", FAKE, "test_related", "{report}", "{files}"];
  writeFileSync(file, YAML.stringify(config));
  gitInit(env.dir);
  const calls = () => (existsSync(join(env.dir, ".fake", "calls.log")) ? readFileSync(join(env.dir, ".fake", "calls.log"), "utf8").trim().split("\n") : []);
  const ctx = (id) => {
    const c = conductor.load(env.dir);
    const task = gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config }).load("tasks").data.tasks.find((t) => t.id === id);
    return gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, task, stack: resolveStack(c, task.role), packs: c.packs });
  };
  return { ...env, calls, ctx };
}
const TOTAL_TEST = "src/entities/order/model/total.test.ts";

test("base ref: recorded without touching branch, index or worktree; changedSinceBase lists only later changes", () => {
  const env = gateEnv();
  write(env.dir, "src/a.ts", "export const a = 1;\n");
  const head = git(env.dir, "rev-parse", "HEAD");
  const status = git(env.dir, "status", "--porcelain=v1", "--", ".", ":(exclude).factory");
  const indexBefore = readFileSync(join(env.dir, ".git", "index"));
  const ref = recordBaseRef(env.dir);
  assert.match(ref, /^[0-9a-f]{40}$/);
  assert.equal(git(env.dir, "rev-parse", "HEAD"), head);
  assert.equal(git(env.dir, "status", "--porcelain=v1", "--", ".", ":(exclude).factory"), status, "the worktree and index are as they were");
  assert.ok(readFileSync(join(env.dir, ".git", "index")).equals(indexBefore), "the user's index file is untouched");
  assert.equal(git(env.dir, "stash", "list"), "");
  assert.deepEqual(changedSinceBase(env.dir, ref), [], "nothing changed since");
  write(env.dir, "src/b.ts", "export const b = 1;\n");
  write(env.dir, "src/a.ts", "export const a = 2;\n");
  assert.deepEqual(changedSinceBase(env.dir, ref).sort(), ["src/a.ts", "src/b.ts"]);
  assert.equal(changedSinceBase(env.dir, "0".repeat(40)), null, "an unknown ref is unknown, not empty");
  const plain = mkdtempSync(join(tmpdir(), "factory-nogit-"));
  assert.equal(recordBaseRef(plain), null, "outside git there is no base ref");
});

test("gate impl: tests run on the files related to the task's change since its base ref, lint only the task's changed files, no build, incremental off for a fake typecheck", async () => {
  const env = gateEnv();
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-001": { status: "done" }, "TASK-002": { status: "green", phase: "green" }, "TASK-003": { status: "pending" } } }));
  write(env.dir, "src/entities/order/model/old.ts", "export const old = 1;\n");
  const ref = recordBaseRef(env.dir);
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-002": { ...s.tasks["TASK-002"], base_ref: ref } } }));
  write(env.dir, TOTAL_TEST, "x\n");
  write(env.dir, "src/entities/order/model/total.ts", "export const total = 1;\n");
  env.fake("test_related", { code: 0, report: report({ [join(env.dir, TOTAL_TEST)]: [["total", "passed"]] }) });
  const result = await runGate("impl", env.ctx("TASK-002"), { useCache: false });
  assert.equal(result.pass, true, JSON.stringify(result.failures));
  const calls = env.calls();
  assert.ok(calls.includes(`test_related ${TOTAL_TEST} src/entities/order/model/total.ts`), calls.join(" | "));
  assert.ok(!calls.some((x) => x.startsWith("test --changed")), "`--changed <ref>` does not narrow the run (vitest diffs <ref>...HEAD plus every uncommitted file)");
  assert.ok(calls.some((x) => x === `lint_files ${TOTAL_TEST} src/entities/order/model/total.ts`), `lint names only the changed files: ${calls.join(" | ")}`);
  assert.ok(!calls.includes("lint"), "the whole-project lint did not run");
  assert.ok(!calls.includes("build"), "no production build per task");
  assert.ok(calls.some((x) => x.startsWith("typecheck")) && calls.some((x) => x.startsWith("arch")));
});

test("gate impl: without a base ref it falls back to --changed and the whole lint; impl_build: true builds", async () => {
  const env = gateEnv("quality: { impl_build: true }");
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-001": { status: "done" }, "TASK-002": { status: "green", phase: "green" }, "TASK-003": { status: "pending" } } }));
  write(env.dir, TOTAL_TEST, "x\n");
  env.fake("test", { code: 0, report: report({ [join(env.dir, TOTAL_TEST)]: [["total", "passed"]] }) });
  assert.equal((await runGate("impl", env.ctx("TASK-002"), { useCache: false })).pass, true);
  const calls = env.calls();
  assert.ok(calls.includes("test --changed"), calls.join(" | "));
  assert.ok(calls.includes("lint") && !calls.some((x) => x.startsWith("lint_files")));
  assert.ok(calls.includes("build"), "impl_build: true keeps the build");
});

test("impl_build defaults to false, and verification (gate checks) still builds", async () => {
  assert.equal(loadConfig(loopSetup().dir).quality.impl_build, false);
  const env = gateEnv();
  setState(env, (s) => ({ tasks: Object.fromEntries(["TASK-001", "TASK-002", "TASK-003", "TASK-004"].map((id) => [id, { status: "done" }])) }));
  env.fake("test", { code: 0, report: report({}) });
  const c = conductor.load(env.dir);
  await runGate("checks", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
  assert.ok(env.calls().includes("build"), env.calls().join(" | "));
});

test("tsc typechecks become incremental only when the command is plain tsc", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-tsc-"));
  const args = (script) => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { typecheck: script } }));
    return incrementalTscArgs({ cwd: dir, projectDir: dir, role: "frontend", stack: { commands: { typecheck: { script: "typecheck" } } } });
  };
  const plain = args("tsc --noEmit -p tsconfig.app.json");
  assert.deepEqual(plain.slice(0, 2), ["--incremental", "--tsBuildInfoFile"]);
  assert.match(plain[2], /\.factory\/cache\/tsbuildinfo-frontend$/);
  assert.deepEqual(args("tsc -b"), []);
  assert.deepEqual(args("tsc --noEmit && tsc -p tsconfig.node.json"), []);
  assert.deepEqual(args("vue-tsc --noEmit"), []);
});

test("failure cache: an identical failed check is not re-run; a changed tree or an infrastructure failure is", async () => {
  const env = gateEnv();
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-001": { status: "done" }, "TASK-002": { status: "green", phase: "green" }, "TASK-003": { status: "pending" } } }));
  write(env.dir, TOTAL_TEST, "x\n");
  env.fake("test", { code: 1, report: report({ [join(env.dir, TOTAL_TEST)]: [["total", "failed", "AssertionError: x"]] }) });
  const first = await runGate("impl", env.ctx("TASK-002"));
  assert.equal(first.pass, false);
  const runs = env.calls().filter((x) => x.startsWith("test")).length;
  const again = await runGate("impl", env.ctx("TASK-002"));
  assert.equal(again.cached, true, "the engine does not re-run what the agent's exit check just ran");
  assert.equal(again.fingerprint, first.fingerprint);
  assert.equal(env.calls().filter((x) => x.startsWith("test")).length, runs);
  write(env.dir, "src/entities/order/model/total.ts", "export const total = 2;\n");
  assert.equal((await runGate("impl", env.ctx("TASK-002"))).cached, false, "a changed tree runs it again");
  // A test command that writes no report is an infrastructure failure: never reused.
  env.fake("test", { code: 1 });
  write(env.dir, "src/entities/order/model/total.ts", "export const total = 3;\n");
  const broken = await runGate("impl", env.ctx("TASK-002"));
  assert.ok(broken.failures.some((f) => f.rule === "no-report"));
  assert.equal((await runGate("impl", env.ctx("TASK-002"))).cached, false);
});

// ---- models (E5) ----

test("only reasoning agents run on opus; mechanical work is sonnet or haiku", () => {
  const opus = [];
  for (const kit of readdirSync(join(ROOT, "app-dev-kitv2")).filter((d) => existsSync(join(ROOT, "app-dev-kitv2", d, "agents")))) {
    for (const f of readdirSync(join(ROOT, "app-dev-kitv2", kit, "agents"))) {
      if (/^model:\s*opus\s*$/m.test(readFileSync(join(ROOT, "app-dev-kitv2", kit, "agents", f), "utf8"))) opus.push(f.replace(/\.md$/, ""));
    }
  }
  assert.deepEqual(opus.sort(), ["ai-architect", "diagnostician", "planner", "requirements-analyst", "reviewer", "solution-architect"]);
});

test("a plan amendment runs on the execution tier; a split keeps the planner's model", () => {
  const env = slimEnv();
  setState(env, (s) => ({ tasks: { ...s.tasks, "TASK-001": { status: "done" }, "TASK-002": { status: "done" }, "TASK-003": { ...s.tasks["TASK-003"], status: "red", amend_pending: true } } }));
  const amend = conductor.step(env.dir).dispatches[0];
  assert.equal(amend.phase, "amend");
  assert.equal(amend.model, "sonnet");
  // The amend pack still lists the whole plan (the planner edits it) and is not slim.
  assert.match(packText(env, amend), /## T2 — Inputs/);
});
