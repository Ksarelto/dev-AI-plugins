import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { ENGINE, conductor, envelope, hook, makeFeature, makeProject, putIntake } from "./helpers.mjs";

/** A project with one active dispatch (the fixture spec-writer at requirements). */
function active() {
  const dir = makeProject();
  makeFeature(dir);
  putIntake(dir);
  const d = conductor.step(dir).dispatches[0];
  return { dir, d, agent: "spec-writer", file: (p) => join(dir, p) };
}
const decision = (r) => r?.hookSpecificOutput?.permissionDecision ?? null;

test("engine-owned files are denied to everyone, including the main session", () => {
  const { dir, file } = active();
  for (const p of [".factory/state.json", ".factory/features/FEAT-001-coupons-at-checkout/state.json", ".factory/features/FEAT-001-coupons-at-checkout/human-notes.yaml"]) {
    assert.equal(decision(hook(dir, "pre-write", { tool_name: "Write", tool_input: { file_path: file(p) } })), "deny", p);
  }
});

test("a dispatched agent may write only its allowlist; protected paths are always denied", () => {
  const { dir, agent, file } = active();
  const write = (p, type = agent) => decision(hook(dir, "pre-write", { tool_name: "Write", agent_type: type, tool_input: { file_path: file(p) } }));
  assert.equal(write(".factory/features/FEAT-001-coupons-at-checkout/01-requirements/delta-spec.yaml"), null);
  assert.equal(write("src/app.ts"), "deny");
  assert.equal(write(".github/workflows/ci.yml"), "deny");
  assert.equal(write("src/app.ts", "fixture-stages:spec-writer"), "deny", "namespaced agent_type also matches");
  assert.equal(write("src/app.ts", "Explore"), null, "a subagent the factory did not dispatch is not restricted");
  assert.equal(write("src/app.ts", null), null, "the human's own session is not restricted");
});

test("reads: unscoped search blocked, black-box paths denied, budget enforced, pack reads free", () => {
  const { dir, agent, d, file } = active();
  const activeFile = join(dir, ".factory", ".active", "FEAT-001.requirements.spec-writer.a1.json");
  const act = JSON.parse(spawnSync("cat", [activeFile], { encoding: "utf8" }).stdout);
  writeFileSync(activeFile, JSON.stringify({ ...act, read_deny: ["src/**"], read_budget: 1 }));
  const read = (tool, input) => decision(hook(dir, "pre-read", { tool_name: tool, agent_type: agent, tool_input: input }));
  assert.equal(read("Grep", { pattern: "coupon" }), "deny");
  assert.equal(read("Grep", { pattern: "coupon", path: file("docs") }), null);
  assert.equal(read("Read", { file_path: file("src/entities/order/model/total.ts") }), "deny");
  assert.equal(read("Read", { file_path: file(d.pack) }), null, "the pack itself is free");
  assert.equal(read("Read", { file_path: file("README.md") }), null);
  assert.equal(read("Read", { file_path: file("CHANGELOG.md") }), "deny", "budget of 1 used up");
});

test("bash: force-push denied for everyone; installs and network only for dispatched agents", () => {
  const { dir, agent } = active();
  const bash = (command, type) => decision(hook(dir, "pre-bash", { tool_name: "Bash", agent_type: type, tool_input: { command } }));
  assert.equal(bash("git push --force origin main"), "deny");
  assert.equal(bash("npm install lodash", agent), "deny");
  assert.equal(bash("npm install lodash"), null);
  assert.equal(bash("curl https://example.com", agent), "deny");
  assert.equal(bash("pnpm exec vitest run src/a.test.ts", agent), null);
});

test("post-write validates .factory artifacts against their schema", () => {
  const { dir } = active();
  const target = join(dir, ".factory/features/FEAT-001-coupons-at-checkout/02-stories/stories.yaml");
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, "feature: FEAT-001\nstories: []\n");
  const r = hook(dir, "post-write", { tool_name: "Write", tool_input: { file_path: target } });
  assert.equal(r.decision, "block");
  assert.match(r.reason, /stories schema/);
  writeFileSync(join(dir, "notes.txt"), "x");
  assert.equal(hook(dir, "post-write", { tool_name: "Write", tool_input: { file_path: join(dir, "notes.txt") } }), null);
});

test("subagent-stop blocks a dispatched agent until its envelope is valid", () => {
  const { dir, agent, d } = active();
  const stop = (msg, extra = {}) => hook(dir, "subagent-stop", { agent_type: agent, last_assistant_message: msg, ...extra });
  assert.equal(stop("all done").decision, "block");
  assert.match(stop(envelope("wrong/id")).reason, /pack_id/);
  assert.equal(stop(envelope(d.id)), null);
  assert.equal(stop("all done", { stop_hook_active: true }), null, "never loops");
});

test("session-start re-injects the brief after compaction and registers the engine", () => {
  const { dir } = active();
  conductor.note(dir, { text: "Hide the coupon field for guests" });
  const r = hook(dir, "session-start", { source: "compact", session_id: "s-42" });
  const ctx = r.hookSpecificOutput.additionalContext;
  assert.match(ctx, /re-read from \.factory/);
  assert.match(ctx, /HD-1: Hide the coupon field for guests/);
  assert.match(ctx, /Pending dispatches: FEAT-001\/requirements\/spec-writer\/a1/);
  const reg = JSON.parse(spawnSync("cat", [join(dir, ".factory/.registry/factory.json")], { encoding: "utf8" }).stdout);
  assert.equal(reg.session_id, "s-42");
});

test("a hook bug fails open and is logged, never blocking the session", () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-broken-"));
  mkdirSync(join(dir, ".factory"), { recursive: true });
  writeFileSync(join(dir, ".factory", "factory.config.yaml"), "this: [is: not yaml");
  const r = spawnSync(process.execPath, [join(ENGINE, "hooks", "guard.mjs"), "pre-write"], {
    input: JSON.stringify({ tool_name: "Write", agent_type: "x", tool_input: { file_path: join(dir, "a.ts") } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("hooks.json short-circuits outside factory projects", () => {
  const hooks = JSON.parse(spawnSync("cat", [join(ENGINE, "hooks", "hooks.json")], { encoding: "utf8" }).stdout).hooks;
  for (const entries of Object.values(hooks)) {
    for (const h of entries.flatMap((e) => e.hooks)) assert.match(h.command, /^\[ -f "\$CLAUDE_PROJECT_DIR\/\.factory\/state\.json" \] \|\| exit 0; /);
  }
});

// ---- Cursor (hooks/cursor-hooks.json → guard.mjs <event> --cursor) ----------------------------
function cursor(projectDir, event, payload) {
  const r = spawnSync(process.execPath, [join(ENGINE, "hooks", "guard.mjs"), event, "--cursor"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CURSOR_PROJECT_DIR: projectDir, CLAUDE_PROJECT_DIR: projectDir },
  });
  assert.equal(r.status, 0);
  return JSON.parse(r.stdout);
}
const MAIN = "conv-main";
const SUB = "sub-1";

test("cursor: permission hooks always answer; the Conductor's own calls are not restricted", () => {
  const { dir, agent, file } = active();
  cursor(dir, "subagent-start", { subagent_id: SUB, subagent_type: agent, parent_conversation_id: MAIN, conversation_id: MAIN });
  const write = (p, conv) => cursor(dir, "pre-write", { conversation_id: conv, tool_name: "Write", tool_input: { file_path: file(p) } }).permission;
  assert.equal(write("src/app.ts", MAIN), "allow", "the parent conversation is the Conductor");
  assert.equal(write(".factory/state.json", MAIN), "deny", "engine-owned files stay denied");
  assert.equal(write("src/app.ts", SUB), "deny", "the subagent's own conversation is matched exactly");
  assert.equal(write(".factory/features/FEAT-001-coupons-at-checkout/01-requirements/delta-spec.yaml", SUB), "allow");
  assert.equal(write("src/app.ts", "conv-unknown"), "deny", "an unknown conversation while a factory subagent runs gets the union");
  const bash = (command, conv) => cursor(dir, "pre-bash", { conversation_id: conv, command, cwd: dir });
  assert.equal(bash("node factory.mjs record --dispatch x", MAIN).permission, "allow");
  const denied = bash("curl https://example.com", SUB);
  assert.equal(denied.permission, "deny");
  assert.match(denied.agent_message, /only localhost/);
  cursor(dir, "subagent-stop", { subagent_type: agent, status: "completed", summary: "done", conversation_id: MAIN });
  assert.equal(write("src/app.ts", "conv-unknown"), "allow", "nothing runs after subagent-stop");
});

test("cursor: beforeReadFile honours read_deny; stop clears what the turn started", () => {
  const { dir, agent, file } = active();
  const activeFile = join(dir, ".factory", ".active", "FEAT-001.requirements.spec-writer.a1.json");
  const act = JSON.parse(spawnSync("cat", [activeFile], { encoding: "utf8" }).stdout);
  writeFileSync(activeFile, JSON.stringify({ ...act, read_deny: ["src/**"] }));
  cursor(dir, "subagent-start", { subagent_id: SUB, subagent_type: agent, parent_conversation_id: MAIN });
  const read = (p) => cursor(dir, "pre-read", { conversation_id: SUB, file_path: file(p), content: "" }).permission;
  assert.equal(read("src/entities/order/model/total.ts"), "deny");
  assert.equal(read("README.md"), "allow");
  cursor(dir, "stop", { conversation_id: MAIN, status: "completed" });
  assert.equal(read("src/entities/order/model/total.ts"), "allow", "a stale marker is cleared when the turn ends");
});

test("cursor: subagent-stop asks for a fixed envelope only when one is in the summary", () => {
  const { dir, agent, d } = active();
  const stop = (summary, extra = {}) => cursor(dir, "subagent-stop", { subagent_type: agent, status: "completed", summary, ...extra });
  assert.deepEqual(stop("all done"), {}, "a plain summary is left to record");
  assert.match(stop(envelope("wrong/id")).followup_message, /pack_id/);
  assert.deepEqual(stop(envelope(d.id)), {});
  assert.deepEqual(stop(envelope("wrong/id"), { loop_count: 2 }), {}, "never loops");
});

test("cursor: session-start gives additional_context; a hook that throws still answers allow", () => {
  const { dir } = active();
  conductor.note(dir, { text: "Hide the coupon field for guests" });
  assert.match(cursor(dir, "session-start", { session_id: "c-1" }).additional_context, /HD-1/);
  const broken = mkdtempSync(join(tmpdir(), "factory-broken-"));
  mkdirSync(join(broken, ".factory"), { recursive: true });
  writeFileSync(join(broken, ".factory", "factory.config.yaml"), "this: [is: not yaml");
  mkdirSync(join(broken, ".factory", ".active", "cursor"), { recursive: true });
  writeFileSync(join(broken, ".factory", ".active", "cursor", "x.json"), JSON.stringify({ id: "s", type: "t", parent: "p", ts: "1" }));
  writeFileSync(join(broken, ".factory", ".active", "d.json"), JSON.stringify({ agent: "t", subagent_type: "p:t" }));
  assert.deepEqual(cursor(broken, "pre-write", { conversation_id: "s", tool_input: { file_path: join(broken, "a.ts") } }), { permission: "allow" });
});

test("cursor: a subagent asked to fix its envelope stays restricted until it stops cleanly", () => {
  const { dir, agent, d, file } = active();
  cursor(dir, "subagent-start", { subagent_id: SUB, subagent_type: agent, parent_conversation_id: MAIN });
  const write = () => cursor(dir, "pre-write", { conversation_id: SUB, tool_input: { file_path: file("src/app.ts") } }).permission;
  const stop = (summary) => cursor(dir, "subagent-stop", { subagent_type: agent, status: "completed", summary, conversation_id: SUB });
  assert.ok(stop(envelope("wrong/id")).followup_message);
  assert.equal(write(), "deny", "still running after the followup");
  assert.deepEqual(stop(envelope(d.id)), {});
  assert.equal(write(), "allow", "stopped");
});

test("cursor: leftover markers and the human's other chats never restrict the human", () => {
  const { dir, agent, file } = active();
  cursor(dir, "subagent-start", { subagent_id: SUB, subagent_type: agent, parent_conversation_id: MAIN });
  const write = (conv) => cursor(dir, "pre-write", { conversation_id: conv, tool_input: { file_path: file("src/app.ts") } }).permission;
  assert.equal(write("conv-2"), "deny", "an unknown chat while a subagent runs gets the union");
  cursor(dir, "session-start", { conversation_id: "conv-2" });
  assert.equal(write("conv-2"), "allow", "a chat that fired sessionStart is the human's");
  assert.equal(write(SUB), "deny", "the subagent itself is still matched");
  conductor.abort(dir, { reason: "test" });
  assert.equal(write("conv-3"), "allow", "a marker whose dispatch is gone is ignored");
  writeFileSync(join(dir, ".factory/.active/cursor/half.json"), "{");
  assert.equal(write("conv-3"), "allow", "a half-written marker is skipped");
});

test("cursor: Grep honours read_deny on a known path, and lets a pathless search through", () => {
  const { dir, agent, file } = active();
  const activeFile = join(dir, ".factory", ".active", "FEAT-001.requirements.spec-writer.a1.json");
  const act = JSON.parse(spawnSync("cat", [activeFile], { encoding: "utf8" }).stdout);
  writeFileSync(activeFile, JSON.stringify({ ...act, read_deny: ["src/**"] }));
  cursor(dir, "subagent-start", { subagent_id: SUB, subagent_type: agent, parent_conversation_id: MAIN });
  const grep = (input) => cursor(dir, "pre-grep", { conversation_id: SUB, tool_name: "Grep", tool_input: input }).permission;
  assert.equal(grep({ pattern: "x", path: file("src/a.acceptance.test.ts") }), "deny");
  assert.equal(grep({ pattern: "x", path: file("docs") }), "allow");
  assert.equal(grep({ pattern: "x" }), "allow");
});

test("claude: the read budget still applies when the same agent runs for two features", () => {
  const { dir, agent, file } = active();
  const activeFile = join(dir, ".factory", ".active", "FEAT-001.requirements.spec-writer.a1.json");
  const act = JSON.parse(spawnSync("cat", [activeFile], { encoding: "utf8" }).stdout);
  writeFileSync(activeFile, JSON.stringify({ ...act, read_budget: 0 }));
  writeFileSync(join(dir, ".factory", ".active", "FEAT-002.requirements.spec-writer.a1.json"), JSON.stringify({ ...act, id: "FEAT-002/requirements/spec-writer/a1", read_budget: 0 }));
  assert.equal(decision(hook(dir, "pre-read", { tool_name: "Read", agent_type: agent, tool_input: { file_path: file("README.md") } })), "deny");
});

test("cursor-hooks.json: camelCase events, the guard found from the plugin folder, an answer outside factory projects", () => {
  const engineHooks = JSON.parse(spawnSync("cat", [join(ENGINE, "hooks", "cursor-hooks.json")], { encoding: "utf8" }).stdout);
  assert.equal(engineHooks.version, 1);
  const outside = mkdtempSync(join(tmpdir(), "factory-none-"));
  for (const [event, entries] of Object.entries(engineHooks.hooks)) {
    assert.match(event, /^[a-z][A-Za-z]+$/, event);
    for (const h of entries) {
      assert.match(h.command, /G=\.\/hooks\/guard\.mjs; .*node "\$G" [a-z-]+ --cursor$/);
      const r = spawnSync("sh", ["-c", h.command], { encoding: "utf8", env: { ...process.env, CURSOR_PROJECT_DIR: outside, CURSOR_PLUGIN_ROOT: ENGINE } });
      const answerJson = JSON.parse(r.stdout);
      if (["preToolUse", "beforeReadFile", "beforeShellExecution", "subagentStart"].includes(event)) assert.equal(answerJson.permission, "allow", event);
    }
  }
  const pack = JSON.parse(spawnSync("cat", [join(ENGINE, "..", "factory-analysis", "hooks", "cursor-hooks.json")], { encoding: "utf8" }).stdout);
  const [start] = pack.hooks.sessionStart;
  const r = spawnSync("sh", ["-c", start.command], { encoding: "utf8", env: { ...process.env, CURSOR_PROJECT_DIR: outside } });
  assert.deepEqual(JSON.parse(r.stdout), {});
  // Inside a factory project, in the plugin folder, with CURSOR_PLUGIN_ROOT naming another plugin (seen
  // in Cursor 2026.10): the pack still registers its own root.
  const { dir } = active();
  const analysis = join(ENGINE, "..", "factory-analysis");
  const reg = spawnSync("sh", ["-c", start.command], { cwd: analysis, encoding: "utf8", env: { ...process.env, CURSOR_PROJECT_DIR: dir, CLAUDE_PROJECT_DIR: dir, CURSOR_PLUGIN_ROOT: tmpdir(), CLAUDE_PLUGIN_ROOT: tmpdir() } });
  assert.equal(reg.status, 0, reg.stderr);
  assert.equal(JSON.parse(spawnSync("cat", [join(dir, ".factory/.registry/factory-analysis.json")], { encoding: "utf8" }).stdout).root, analysis);
});

test("cursor: the Task call marks a subagent; its first call binds its conversation; the Task result ends it", () => {
  const { dir, agent, file } = active();
  cursor(dir, "session-start", { conversation_id: MAIN });
  const task = { conversation_id: MAIN, tool_name: "Task", tool_use_id: "tu-1", tool_input: { subagent_type: agent, prompt: "x" } };
  assert.equal(cursor(dir, "task-start", task).permission, "allow");
  const write = (conv) => cursor(dir, "pre-write", { conversation_id: conv, tool_name: "Write", tool_input: { file_path: file("src/app.ts"), content: "x" } }).permission;
  assert.equal(write(MAIN), "allow", "the Conductor's chat");
  assert.equal(write("sub-conv"), "deny", "the first unknown conversation is the subagent");
  assert.equal(write("sub-conv"), "deny");
  cursor(dir, "task-end", { ...task, tool_output: JSON.stringify({ status: "success", agentId: "sub-conv" }) });
  assert.equal(write("sub-conv"), "allow", "the subagent finished");
  cursor(dir, "task-start", { ...task, tool_use_id: "tu-2" });
  cursor(dir, "task-start", { ...task, tool_use_id: "tu-3" });
  assert.equal(write("conv-a"), "deny", "two unbound subagents of the factory: the union applies");
});

test("browser MCP navigation by a dispatched agent stays on loopback", async () => {
  const { decideNavigate } = await import(`${ENGINE}/hooks/guard.mjs`);
  const actives = [{ agent: "qa-engineer", subagent_type: "factory-quality:qa-engineer" }];
  const nav = (url, agent_type = "qa-engineer") => decideNavigate({ agent_type, tool_input: { url } }, actives);
  assert.equal(nav("http://localhost:5173/checkout"), null);
  assert.equal(nav("http://127.0.0.1:4173/"), null);
  assert.equal(nav("file:///tmp/x/.factory/prototype/index.html"), null);
  assert.match(nav("https://example.com/"), /outside this machine/);
  assert.equal(nav("https://example.com/", null), null, "the main session is not restricted");
});

test("reads outside the project (plugin skills, references, stack rules) never use up the read budget", async () => {
  const { decideRead } = await import(`${ENGINE}/hooks/guard.mjs`);
  const dir = makeProject();
  const actives = [{ id: "FEAT-001/x/fe-builder/a1", agent: "fe-builder", subagent_type: "factory-role-frontend:fe-builder", read_budget: 1 }];
  const read = (file_path) => decideRead({ agent_type: "fe-builder", tool_name: "Read", tool_input: { file_path } }, dir, actives);
  assert.equal(read(`${ENGINE}/../factory-role-frontend/skills/fe-implement-task/SKILL.md`), null);
  assert.equal(read(`${ENGINE}/../factory-role-frontend/skills/fe-implement-task/SKILL.md`), null, "still free the second time");
  assert.equal(read(join(dir, "src/entities/order/model/total.ts")), null);
  assert.match(read(join(dir, "src/entities/order/model/total.ts")), /read budget used up/);
});
