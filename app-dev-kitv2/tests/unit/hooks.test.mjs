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
