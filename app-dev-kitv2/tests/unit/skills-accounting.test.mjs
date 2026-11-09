// Skills reach the build agents (doctor, pack skills_required, envelope skills_loaded, hooks) and the
// accounting plumbing (real token usage, saved envelopes, envelope check, note remap).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { CLI, ENGINE, cli, conductor, envelope, hook, makeFeature, makeProject, putIntake, rawConductor, state } from "./helpers.mjs";

const { skillChecks } = await import(`${ENGINE}/scripts/lib/doctor.mjs`);
const { buildPack } = await import(`${ENGINE}/scripts/lib/broker.mjs`);
const { missingSkills } = await import(`${ENGINE}/scripts/lib/knowledge.mjs`);
const { remapNotes, addNote, readNotes } = await import(`${ENGINE}/scripts/lib/notes.mjs`);
const guard = await import(`${ENGINE}/hooks/guard.mjs`);

const decision = (r) => r?.hookSpecificOutput?.permissionDecision ?? null;
const reasonOf = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? "";

/** A fake plugin root with one agent and (optionally) skills, for the doctor checks. */
function fakePack(name, { tools, body, skills = [], agentSkills, stackSkills }) {
  const root = mkdtempSync(join(tmpdir(), "factory-skillpack-"));
  mkdirSync(join(root, "agents"), { recursive: true });
  const fm = [`name: builder`, `description: x`, `tools: ${tools}`, "model: sonnet", ...(agentSkills ? [`skills: [${agentSkills}]`] : [])].join("\n");
  writeFileSync(join(root, "agents", "builder.md"), `---\n${fm}\n---\n${body}\n`);
  for (const s of skills) {
    mkdirSync(join(root, "skills", s), { recursive: true });
    writeFileSync(join(root, "skills", s, "SKILL.md"), `---\nname: ${s}\ndescription: x\n---\n`);
  }
  return { name, root, agents: ["builder"], skills, stack: stackSkills ? { skills: stackSkills } : null };
}

test("doctor: an agent told to load skills without the Skill tool is an error; with it, healthy", () => {
  const body = "2. Load every T1 skill with the Skill tool, then write.";
  const bad = fakePack("p1", { tools: "Read, Write, Edit", body });
  const errors = [];
  skillChecks({ p1: bad }, errors, []);
  assert.match(errors.join("\n"), /p1 agent builder: .*no "Skill"/);
  const good = fakePack("p2", { tools: "Read, Write, Edit, Skill", body });
  const none = [];
  skillChecks({ p2: good }, none, []);
  assert.deepEqual(none, []);
});

test("doctor: stack skills and agent preloads must resolve to a SKILL.md", () => {
  const stack = fakePack("kit", { tools: "Read, Skill", body: "x", skills: ["testing"], stackSkills: { test: "kit:testing", form: ["kit:testing", "kit:missing"] } });
  const errors = [];
  const warnings = [];
  skillChecks({ kit: stack }, errors, warnings);
  assert.deepEqual(errors.filter((e) => /missing/.test(e)).length, 1);
  assert.match(errors[0], /stack\.yaml skills "form": skill "kit:missing"/);
  const preload = fakePack("kit2", { tools: "Read, Skill", body: "x", agentSkills: "ghost" });
  const e2 = [];
  skillChecks({ kit2: preload }, e2, []);
  assert.match(e2[0], /preloads skill "ghost"/);
  const w = [];
  skillChecks({ kit: fakePack("kit", { tools: "Read, Skill", body: "x", stackSkills: { test: "other-kit:a" } }) }, [], w);
  assert.match(w[0], /plugin "other-kit", which is not installed/);
});

test("missingSkills accepts bare names and inline digests", () => {
  const req = ["frontend-dev-kit:testing", "frontend-dev-kit:react-component"];
  assert.deepEqual(missingSkills(req, ["frontend-dev-kit:testing"]), ["frontend-dev-kit:react-component"]);
  assert.deepEqual(missingSkills(req, ["testing", "inline:frontend-dev-kit:react-component@abc123"]), []);
  assert.deepEqual(missingSkills([], []), []);
});

/** The fixture spec-writer dispatch, with its pack and active entry marked as requiring skills. */
function withSkills(required = ["frontend-dev-kit:testing", "frontend-dev-kit:react-component"]) {
  const dir = makeProject();
  makeFeature(dir);
  putIntake(dir);
  const d = conductor.step(dir).dispatches[0];
  const packFile = join(dir, d.pack);
  const text = readFileSync(packFile, "utf8");
  writeFileSync(packFile, text.replace(/^---\n/, `---\nskills_required: [${required.join(", ")}]\n`));
  const activeFile = join(dir, ".factory", ".active", `${state.activeName(d.id)}.json`);
  writeFileSync(activeFile, JSON.stringify({ ...JSON.parse(readFileSync(activeFile, "utf8")), skills_required: required }));
  return { dir, d, agent: "spec-writer", required };
}

test("pack: skills_required comes from the knowledge skills and a Skills preflight opens T1", () => {
  const dir = makeProject();
  makeFeature(dir);
  const c = conductor.load(dir);
  const pack = buildPack(dir, c.feature, c.config, {
    id: "FEAT-001/x/b/a1", stageId: "x", stage: { outputs: [], inputs: [] }, agent: "b", subagent_type: "p:b", model: "sonnet", attempt: 1,
    knowledge: { skills: ["frontend-dev-kit:testing", "frontend-dev-kit:testing", "frontend-dev-kit:api-client"], rules: [], golden: [] },
  });
  assert.deepEqual(pack.front.skills_required, ["frontend-dev-kit:testing", "frontend-dev-kit:api-client"]);
  const body = readFileSync(pack.file, "utf8");
  assert.match(body, /## T1[^\n]*\nSkills preflight \(blocking/);
  assert.match(body, /skills unavailable: <names>/);
  const plain = buildPack(dir, c.feature, c.config, { id: "FEAT-001/x/b/a2", stageId: "x", stage: { outputs: [], inputs: [] }, agent: "b", subagent_type: "p:b", model: "sonnet", attempt: 2 });
  assert.equal(plain.front.skills_required, undefined);
});

test("record: a done envelope that skipped required skills is sent back; with skills_loaded it is taken", async () => {
  const { dir, d, required } = withSkills();
  const back = await rawConductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id, { skills_loaded: [required[0]] }) });
  assert.equal(back.action, "redispatch");
  assert.match(back.reason, /required skills not loaded: frontend-dev-kit:react-component/);
  const none = await rawConductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(none.action, "redispatch");
  // Two sends back is the limit: the third skipped done halts the feature naming the skills.
  const third = await rawConductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id) });
  assert.equal(third.action, "halt");
  assert.match(third.reason, /skills unavailable: frontend-dev-kit:testing, frontend-dev-kit:react-component/);
});

test("record: skills_loaded naming every required skill (or inline digests) passes", async () => {
  const { dir, d, required } = withSkills();
  const out = await rawConductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id, { skills_loaded: [required[0], `inline:${required[1]}@abc`] }) });
  assert.notEqual(out.action, "redispatch");
  assert.notEqual(out.action, "halt");
});

test("record: a blocked envelope saying skills are unavailable halts at once, naming them", async () => {
  const { dir, d } = withSkills();
  const text = envelope(d.id, { status: "blocked", open_questions: ["skills unavailable: frontend-dev-kit:testing, frontend-dev-kit:react-component"] });
  const out = await rawConductor.record(dir, { dispatchId: d.id, envelopeText: text });
  assert.equal(out.action, "halt");
  assert.deepEqual(out.skills, ["frontend-dev-kit:testing", "frontend-dev-kit:react-component"]);
  assert.equal(conductor.load(dir).feature.state.status, "blocked");
  assert.equal(conductor.load(dir).feature.state.pending.length, 0);
});

test("guard: writes are denied until the required skills are logged by PostToolUse(Skill)", () => {
  const { dir, d, agent, required } = withSkills();
  const write = () => hook(dir, "pre-write", { tool_name: "Write", agent_type: agent, tool_input: { file_path: join(dir, ".factory/features/FEAT-001-coupons-at-checkout/01-requirements/delta-spec.yaml") } });
  const first = write();
  assert.equal(decision(first), "deny");
  assert.match(reasonOf(first), /Load the required skills first: frontend-dev-kit:testing, frontend-dev-kit:react-component/);
  hook(dir, "post-skill", { tool_name: "Skill", agent_type: agent, tool_input: { skill: required[0] } });
  assert.match(reasonOf(write()), /Load the required skills first: frontend-dev-kit:react-component$|first: frontend-dev-kit:react-component/);
  hook(dir, "post-skill", { tool_name: "Skill", agent_type: `fixture-stages:${agent}`, tool_input: { skill: required[1] } });
  assert.equal(decision(write()), null);
  assert.ok(existsSync(state.skillsLogFile(dir, d)), "the load log lives in the feature dir");
  assert.equal(decision(hook(dir, "pre-write", { tool_name: "Write", agent_type: agent, tool_input: { file_path: join(dir, ".factory/features/FEAT-001-coupons-at-checkout/skills-loaded/x.log") } })), "deny", "the log is engine-owned");
});

test("guard: a dispatched agent may write a scratch envelope and run envelope check on it", () => {
  const { dir, agent } = withSkills();
  const scratch = join(dir, ".factory/scratch/envelope.json");
  assert.equal(decision(hook(dir, "pre-write", { tool_name: "Write", agent_type: agent, tool_input: { file_path: scratch } })), null, "scratch is writable even before skills load");
  const bash = (command) => decision(hook(dir, "pre-bash", { tool_name: "Bash", agent_type: agent, cwd: dir, tool_input: { command } }));
  assert.equal(bash(`node ${CLI} envelope check --file .factory/scratch/envelope.json`), null);
  assert.equal(bash(`node ${CLI} record --dispatch X`), "deny");
});

test("envelope check without --file fails fast on an empty stdin instead of waiting", () => {
  const r = spawnSync(process.execPath, [CLI, "envelope", "check"], { input: "", encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /usage: factory envelope check --file/);
  const ok = spawnSync(process.execPath, [CLI, "envelope", "check"], { input: envelope("P/1"), encoding: "utf8", timeout: 20000 });
  assert.equal(JSON.parse(ok.stdout).valid, true);
});

const usageLine = (id, input, output, extra = {}) => JSON.stringify({ type: "assistant", message: { id, role: "assistant", content: [{ type: "text", text: "ok" }], usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 999_999 }, ...extra } });

test("tokens: SubagentStop adds real usage from the hook payload to the budget, and --tokens is not counted twice", async () => {
  const { dir, d, agent } = withSkills([]);
  const stop = (extra) => hook(dir, "subagent-stop", { agent_type: agent, last_assistant_message: envelope(d.id), ...extra });
  stop({ usage: { input_tokens: 1000, output_tokens: 500 } });
  assert.equal(conductor.load(dir).feature.state.budgets.tokens, 1500);
  stop({ usage: { input_tokens: 1000, output_tokens: 700 }, stop_hook_active: true });
  assert.equal(conductor.load(dir).feature.state.budgets.tokens, 1700, "a second stop adds only the difference");
  await rawConductor.record(dir, { dispatchId: d.id, envelopeText: envelope(d.id), tokens: 5000 });
  assert.equal(conductor.load(dir).feature.state.budgets.tokens, 1700, "--tokens is ignored once the hook counted");
});

test("tokens: usage is summed from the agent transcript (each message once, cache reads left out)", () => {
  const { dir, d, agent } = withSkills([]);
  const file = join(mkdtempSync(join(tmpdir(), "factory-tr-")), "agent.jsonl");
  writeFileSync(file, [usageLine("m1", 100, 10), usageLine("m1", 100, 40), usageLine("m2", 200, 50), "{not json", JSON.stringify({ type: "user", message: { role: "user", content: "x" } })].join("\n"));
  hook(dir, "subagent-stop", { agent_type: agent, last_assistant_message: envelope(d.id), agent_transcript_path: file });
  assert.equal(conductor.load(dir).feature.state.budgets.tokens, 100 + 40 + 200 + 50);
  assert.equal(guard.tokenUsage({ transcript_path: file }), 0, "the main transcript counts only sidechain entries");
});

test("saveEnvelope: matches plugin-prefixed agent types and reads the reply from the transcript when the payload has none", () => {
  const { dir, d } = withSkills([]);
  const actives = state.activeDispatches(dir);
  const why = [];
  const prefixed = guard.saveEnvelope(dir, { agent_type: "factory-stages:spec-writer", last_assistant_message: `done\n\`\`\`json\n${envelope(d.id)}\n\`\`\`` }, actives, 200, why);
  assert.ok(prefixed && existsSync(prefixed), why.join("; "));
  const file = join(mkdtempSync(join(tmpdir(), "factory-tr-")), "agent.jsonl");
  writeFileSync(file, JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: envelope(d.id) }] } }));
  rmEnvelope(dir, d);
  const viaTranscript = guard.saveEnvelope(dir, { agent_type: "spec-writer", agent_transcript_path: file }, actives, 200, why);
  assert.ok(viaTranscript && existsSync(viaTranscript));
  const missed = [];
  assert.equal(guard.saveEnvelope(dir, { agent_type: "nobody:else", last_assistant_message: envelope(d.id) }, actives, 200, missed), null);
  assert.match(missed[0], /no active dispatch matches agent_type "nobody:else"/);
  const wrong = [];
  assert.equal(guard.saveEnvelope(dir, { agent_type: "spec-writer", last_assistant_message: envelope("FEAT-001/other/x/a1") }, actives, 200, wrong), null);
  assert.match(wrong[0], /pack_id "FEAT-001\/other\/x\/a1" is not one of/);
});

function rmEnvelope(dir, d) {
  const f = state.savedEnvelopeFile(dir, d.id);
  if (existsSync(f)) writeFileSync(f, "{}");
}

test("subagent-stop logs why an envelope was not saved", () => {
  const { dir, agent } = withSkills([]);
  // stop_hook_active: the agent already had its chance to fix the envelope, so the stop is let through.
  hook(dir, "subagent-stop", { agent_type: agent, stop_hook_active: true, last_assistant_message: "no envelope here" });
  const log = existsSync(join(dir, ".factory/logs/hooks.log")) ? readFileSync(join(dir, ".factory/logs/hooks.log"), "utf8") : "";
  assert.match(log, /subagent-stop envelope not saved for spec-writer: reply has no JSON envelope/);
});

test("note remap: repoints mapped_to from a split task to its replacement", () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  const app = state.loadAppState(dir);
  const a = addNote(app, featureDir, { text: "keep pagination", at: "note" });
  const b = addNote(app, featureDir, { text: "other", at: "note" });
  const notes = readNotes(featureDir);
  notes[0].mapped_to = ["TASK-005", "AC-0001"];
  notes[1].mapped_to = ["TASK-006"];
  writeFileSync(join(featureDir, "human-notes.yaml"), JSON.stringify(notes)); // YAML is a JSON superset
  const out = remapNotes(featureDir, ["TASK-005=TASK-019"]);
  assert.deepEqual(out.changed, [a.id]);
  const after = readNotes(featureDir);
  assert.deepEqual(after[0].mapped_to, ["TASK-019", "AC-0001"]);
  assert.deepEqual(after[1].mapped_to, ["TASK-006"]);
  assert.equal(b.status, "open");
  assert.throws(() => remapNotes(featureDir, ["TASK-005=AC-0001"]), /bad remap/);
  assert.throws(() => remapNotes(featureDir, ["nonsense"]), /bad remap/);
});

test("note remap CLI rewrites the notes and rejects a bad pair", () => {
  const dir = makeProject();
  const featureDir = makeFeature(dir);
  cli(dir, ["note", "do the thing"]);
  const notes = readNotes(featureDir);
  notes[0].mapped_to = ["TASK-001"];
  writeFileSync(join(featureDir, "human-notes.yaml"), JSON.stringify(notes));
  const ok = cli(dir, ["note", "remap", "TASK-001=TASK-004"]);
  assert.equal(ok.code, 0, JSON.stringify(ok.json));
  assert.deepEqual(readNotes(featureDir)[0].mapped_to, ["TASK-004"]);
  assert.equal(cli(dir, ["note", "remap", "TASK-001"]).code, 2);
  assert.equal(cli(dir, ["note", "remap"]).code, 2);
});
