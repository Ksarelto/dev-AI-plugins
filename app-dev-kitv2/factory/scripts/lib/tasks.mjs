// S5 task loop: one task per dispatch, routed by task.role. Phases per task:
//   tdd required          → red (role test author, gate red) → green (role builder, gate impl)
//   type characterisation → char (role test author writes passing tests only, gate impl)
//   tdd exempt            → green (role builder, gate impl)
// Every phase runs through the same Loop Warden ladder; rung 4 asks the planner to split the task.
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileHash, matchesAny, readYaml, sha, toPosix } from "./core.mjs";
import { appendEvent } from "./state.mjs";
import { gateContext, runGate } from "./gatekeeper.mjs";
import { resolveStack } from "./stackexec.mjs";
import { decide } from "./warden.mjs";
import { applyMappings } from "./notes.mjs";

const CLOSED = ["done", "parked", "replaced"];
const DEFAULT_INPUTS = ["prd|delta-spec", "stories?", "ux-notes?", "component-map?", "api-contract?", "tasks", "test-plan"];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
/** Everything that resets when a task enters a new phase or round. */
const FRESH = {
  attempts: 0, rung: 0, progress_signal: [], fingerprints: [], state_hashes: [], transient_retries: 0,
  feedback: null, instruction: null, model: null, diagnose_pending: false,
};

export function loadTasks(c) {
  const file = join(c.feature.dir, "04-plan", "tasks.yaml");
  return existsSync(file) ? readYaml(file) : null;
}

export function phasesFor(task) {
  if (task.tdd?.mode === "required") return ["red", "green"];
  if (task.type === "characterisation" || task.characterisation) return ["char"];
  return ["green"];
}

/** The test files a task owns: its red tests, or the characterisation tests it writes. */
export function taskTestFiles(task, stack) {
  if (task.tdd?.red_tests?.length) return task.tdd.red_tests;
  if (phasesFor(task)[0] !== "char") return [];
  return task.files_expected.filter((f) => TEST_FILE.test(f) || matchesAny(f, stack?.test_globs ?? []));
}

/** Adds state for new tasks and parks tasks whose role is disabled — and, transitively, their dependents. */
export function syncTasks(state, plan, config) {
  for (const t of plan.tasks) {
    const unit = (state.tasks[t.id] ??= { status: "pending", ...FRESH, round: 1 });
    if (unit.status === "parked" && config.roles?.[t.role]?.enabled) {
      unit.status = "pending";
      delete unit.reason;
    }
    if (unit.status === "pending" && !config.roles?.[t.role]?.enabled) Object.assign(unit, { status: "parked", reason: `role ${t.role} is disabled` });
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of plan.tasks) {
      const unit = state.tasks[t.id];
      const parkedDep = t.depends_on.find((d) => state.tasks[d]?.status === "parked");
      if (unit.status === "pending" && parkedDep) {
        Object.assign(unit, { status: "parked", reason: `depends on parked ${parkedDep}` });
        changed = true;
      }
    }
  }
  for (const [id, unit] of Object.entries(state.tasks)) {
    if (!plan.tasks.some((t) => t.id === id) && unit.status !== "done") unit.status = "replaced";
  }
}

const filesHash = (projectDir, files) => sha(files.map((f) => `${f}:${fileHash(join(projectDir, f)) ?? "-"}`).join("\n"));

/** Snapshot of the task's non-test files at gate-red, so a dispute can hand the author a clean red. */
function snapshot(c, task, red) {
  const dir = join(c.feature.dir, "snapshots", task.id);
  rmSync(dir, { recursive: true, force: true });
  const absent = [];
  for (const f of task.files_expected.filter((x) => !red.includes(x))) {
    const src = join(c.projectDir, f);
    if (!existsSync(src)) {
      absent.push(f);
      continue;
    }
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(src, join(dir, f));
  }
  return absent;
}

function restoreSnapshot(c, task, absent = []) {
  const dir = join(c.feature.dir, "snapshots", task.id);
  for (const f of task.files_expected) {
    if (absent.includes(f)) rmSync(join(c.projectDir, f), { force: true });
    else if (existsSync(join(dir, f))) copyFileSync(join(dir, f), join(c.projectDir, f));
  }
}

/** Sends a task back to its red phase (dispute or human decision): sources restored, red lock cleared. */
export function backToRed(c, task, unit, feedback) {
  restoreSnapshot(c, task, unit.snapshot_absent);
  Object.assign(unit, FRESH, { phase: "red", status: "red", red_lock: null, round: (unit.round ?? 1) + 1, feedback });
}

function missionFor(c, task, phase, role) {
  const spec = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }).spec()?.reqs ?? [];
  const acText = new Map(spec.flatMap((r) => r.acs.map((a) => [a.id, a.text])));
  const planFile = join(c.feature.dir, "04-plan", "test-plan.yaml");
  const cases = existsSync(planFile) ? (readYaml(planFile).cases ?? []).filter((x) => x.task === task.id) : [];
  const stack = c.packs[role.stack]?.stack;
  const procedure = [phase === "green" ? null : stack?.skills?.test, stack?.skills?.[task.type]].filter(Boolean);
  const golden = stack?.golden_files?.[task.type] ? join(c.packs[role.stack].root, stack.golden_files[task.type]) : null;
  const doing = {
    red: () => `Write the failing tests in ${task.tdd.red_tests.join(", ")} and only the stubs the tests import (${(task.tdd.stubs ?? []).join("; ") || "signatures in files_expected"}). Every test must run and fail on an assertion or "not implemented" (no skip/todo). Do not implement.`,
    green: () => `Make ${task.tdd?.red_tests?.length ? `the red tests (${task.tdd.red_tests.join(", ")})` : "the task"} pass by implementing it. The red tests are read-only; if one is wrong, return "test_dispute" instead of editing it.`,
    char: () => `Write characterisation tests in ${taskTestFiles(task, stack).join(", ")} that pin today's behaviour. They must pass now; you may write only those test files.`,
  }[phase];
  return [
    `Task ${task.id} (${task.type}, role ${task.role}): ${task.title} — phase ${phase}`,
    doing(),
    `Satisfies: ${task.satisfies.map((id) => `${id} — ${acText.get(id) ?? "?"}`).join(" | ") || "(none — characterisation)"}`,
    ...(cases.length ? [`Planned test cases: ${cases.map((x) => `${x.id} (${x.level}) ${x.title}`).join(" | ")}`] : []),
    `Definition of done: ${task.definition_of_done.join(" | ")}`,
    `Files: ${task.files_expected.join(", ")}`,
    ...(procedure.length ? [`Procedure: ${procedure.join(" + ")}`] : []),
    ...(golden ? [`Golden file (match its patterns): ${golden}`] : []),
  ].join("\n");
}

/** The next dispatch of the task loop, or { advance: true } when every task is closed. */
export function taskStep(c, stageId, stage, h) {
  const s = c.feature.state;
  const plan = loadTasks(c);
  if (!plan) return { action: "halt", feature: s.feature, reason: "04-plan/tasks.yaml is missing" };
  syncTasks(s, plan, c.config);
  const open = plan.tasks.filter((t) => !CLOSED.includes(s.tasks[t.id].status));
  if (!open.length) {
    const parked = plan.tasks.filter((t) => s.tasks[t.id].status === "parked").map((t) => t.id);
    if (parked.length) appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: stageId, parked });
    return { advance: true };
  }
  const isDone = (id) => s.tasks[id]?.status === "done";
  const task = open.find((t) => t.depends_on.every(isDone));
  if (!task) {
    const waiting = open.map((t) => `${t.id} ← ${t.depends_on.filter((d) => !isDone(d)).join(",")}`).join("; ");
    return { action: "halt", feature: s.feature, reason: `no runnable task (dependencies blocked): ${waiting}` };
  }
  const unit = s.tasks[task.id];
  const role = { name: task.role, ...c.config.roles[task.role] };
  const rolePack = c.packs[role.pack];
  if (!rolePack?.role) return { action: "halt", feature: s.feature, reason: `role pack "${role.pack}" for ${task.id} is not installed` };
  const inputs = stage.inputs ?? DEFAULT_INPUTS;
  const rel = (p) => toPosix(relative(c.projectDir, p));
  const round = unit.round ?? 1;

  if (unit.split_pending) {
    // The planner is whoever owns tasks.yaml in the planning stage (owners), else its first agent.
    const planning = h.resolveStage(c, "planning") ?? { agents: [] };
    const agents = h.resolveAgents(c, planning);
    const planner = agents.find((t) => t.agent === planning.owners?.tasks) ?? agents[0];
    if (!planner?.pack) return { action: "halt", feature: s.feature, reason: `${task.id} needs a split, but no planner is installed` };
    return h.issue(c, [
      h.makeDispatch(c, {
        stageId, idStage: `${stageId}.${task.id}.split`, task, gateTask: null,
        stage: { outputs: ["tasks", "test-plan"], inputs: ["prd|delta-spec", "tasks", "test-plan", "root-cause?"], context_role: "analysis_roles" },
        target: planner, phase: "split", attempt: 1, rung: 4, model: planner.model, gate: "plan", feedback: unit.feedback,
        mission:
          `Replace ${task.id} in tasks.yaml with 2–3 smaller tasks (new IDs from "Next free IDs", same role) that together satisfy ${task.satisfies.join(", ") || "its purpose"}. ` +
          `Point every task that depended on ${task.id} at the new tasks, and move test-plan cases that name ${task.id} to the new tasks. ` +
          `Leave everything else unchanged. Read diagnosis/${task.id}.md first if it exists.`,
      }),
    ]);
  }
  const phase = unit.phase ?? phasesFor(task)[0];
  if (unit.diagnose_pending) {
    const target = h.engineTarget(c, "diagnostician");
    return h.issue(c, [
      h.makeDispatch(c, {
        stageId, idStage: `${stageId}.${task.id}.${phase}${round > 1 ? round : ""}.diagnose`, task, gateTask: null,
        stage: { outputs: ["root-cause"], inputs, context_role: "analysis_roles" },
        target, phase: "diagnose", attempt: unit.attempts, rung: 3, model: target.model, feedback: unit.feedback, gate: null,
        mission: `Diagnose why ${task.id} (${task.title}) keeps failing its ${phase} gate. Write diagnosis/${task.id}.md. Do not fix anything yourself.`,
      }),
    ]);
  }

  const slot = phase === "green" ? "builder" : "test_author";
  const agent = rolePack.role.agents[slot];
  const model = agent ? h.agentModel(rolePack, agent) : null;
  if (!agent || !h.MODELS.includes(model)) {
    return { action: "halt", feature: s.feature, reason: `${rolePack.name} has no usable ${slot} ("${agent ?? "missing"}", model "${model}")` };
  }
  const target = { agent, pack: rolePack, role: task.role, subagent_type: `${rolePack.name}:${agent}`, model };
  const red = task.tdd?.red_tests ?? [];
  const tests = taskTestFiles(task, c.packs[role.stack]?.stack);
  const writes = { red: task.files_expected, green: task.files_expected.filter((f) => !red.includes(f)), char: tests }[phase];
  Object.assign(unit, { status: phase === "green" ? "green" : "red", phase });
  const rootCause = join(c.feature.dir, "diagnosis", `${task.id}.md`);
  return h.issue(c, [
    h.makeDispatch(c, {
      stageId, idStage: `${stageId}.${task.id}.${phase}${round > 1 ? round : ""}`, task,
      stage: { outputs: [], inputs, context_role: stage.context_role ?? "execution_roles" },
      target, phase, attempt: (unit.attempts ?? 0) + 1, rung: unit.rung ?? 0, model: unit.model ?? target.model,
      feedback: unit.feedback, instruction: unit.instruction, gate: phase === "red" ? rolePack.role.gates.red : rolePack.role.gates.impl,
      extraWrites: writes, writeDeny: phase === "green" ? red : [],
      extraReads: (unit.rung ?? 0) >= 3 && existsSync(rootCause) ? [{ label: "Root cause", path: rel(rootCause) }] : [],
      mission: missionFor(c, task, phase, role),
    }),
  ]);
}

/** Runs the phase gate for a task envelope. Called outside the state lock: gates can take minutes. */
export async function taskGate(c, pending, envelope) {
  if (envelope.status !== "done" || envelope.test_dispute || !["red", "green", "char"].includes(pending.phase)) return null;
  const task = loadTasks(c)?.tasks.find((t) => t.id === pending.task);
  const rolePack = task && c.packs[c.config.roles[task.role]?.pack];
  if (!rolePack?.role) return null;
  const gate = pending.phase === "red" ? rolePack.role.gates.red : rolePack.role.gates.impl;
  const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config, task, stack: resolveStack(c, task.role), packs: c.packs });
  return runGate(gate, ctx, { useCache: false });
}

/** Records a task-phase envelope: Loop Warden verdict, red lock, split and dispute handling. */
export async function finishTask(c, pending, envelope, h, result) {
  const s = c.feature.state;
  // A split rewrites tasks.yaml, so the original task is gone from the plan by now: handle it first.
  if (pending.phase === "split") {
    const unit = s.tasks[pending.task];
    const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config, packs: c.packs });
    const planResult = await runGate("plan", ctx, { useCache: false });
    if (!planResult.pass || envelope.status !== "done") {
      h.block(c, `${pending.task}: the split plan failed gate-plan (${planResult.failures.length} failure(s))`);
    } else {
      unit.split_pending = false;
      syncTasks(s, loadTasks(c), c.config);
      appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: pending.stage, task: pending.task, verdict: "split", reason: "task replaced by smaller tasks" });
    }
    h.persist(c);
    return { action: s.status === "blocked" ? "halt" : "continue", feature: s.feature, verdict: "split", gate: h.summary(planResult) };
  }
  const plan = loadTasks(c);
  const task = plan?.tasks.find((t) => t.id === pending.task);
  const unit = s.tasks[pending.task];
  if (!task || !unit) return { action: "continue", feature: s.feature, note: `${pending.task} is no longer in tasks.yaml` };

  if (envelope.notes_mapped?.length) applyMappings(c.feature.dir, envelope.notes_mapped, h.featureIds(c));

  if (pending.phase === "diagnose") {
    unit.diagnose_pending = false;
    h.persist(c);
    return { action: "continue", feature: s.feature, note: `diagnosis for ${task.id} recorded` };
  }

  if (pending.phase === "green" && envelope.test_dispute) {
    if (!unit.disputed) {
      unit.disputed = true;
      backToRed(c, task, unit, `The builder disputes ${envelope.test_dispute.test}: ${envelope.test_dispute.reason}\nThe sources are back to how they were at your red. Revise the red tests once if the dispute is right; otherwise keep them and explain why in your summary.`);
      appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: pending.stage, task: task.id, verdict: "retry", reason: "test dispute: back to the test author once" });
      h.persist(c);
      return { action: "continue", feature: s.feature, verdict: "test_dispute" };
    }
    envelope = {
      ...envelope,
      status: "needs_clarification",
      open_questions: [`${task.id}: the builder disputes ${envelope.test_dispute.test} again — ${envelope.test_dispute.reason}. Approve to keep the test, reject to send the task back to its test author.`],
    };
  }

  unit.attempts = (unit.attempts ?? 0) + 1;
  const verdict = decide(unit, result, {
    envelope, isTask: true, attemptsMax: c.config.budgets?.task?.attempts_max,
    stateHash: filesHash(c.projectDir, task.files_expected), tiers: { reasoning: h.reasoningModel(c) },
  });
  Object.assign(unit, verdict.unit, { last_gate: result ? h.summary(result) : null });
  appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: pending.stage, task: task.id, verdict: verdict.verdict, rung: verdict.rung, reason: verdict.reason });

  switch (verdict.verdict) {
    case "advance":
      if (pending.phase === "red") {
        const red = task.tdd?.red_tests ?? [];
        const lock = Object.fromEntries(red.map((f) => [f, fileHash(join(c.projectDir, f))]));
        Object.assign(unit, FRESH, { phase: "green", status: "green", red_lock: lock, snapshot_absent: snapshot(c, task, red) });
      } else {
        Object.assign(unit, FRESH, { phase: null, status: "done", done_hash: filesHash(c.projectDir, task.files_expected) });
      }
      break;
    case "retry":
    case "diagnose":
      unit.feedback = result ? h.formatFeedback(result) : `Previous attempt returned "${envelope.status}": ${envelope.summary}`;
      unit.instruction = verdict.instruction ?? null;
      unit.model = verdict.model ?? null;
      unit.diagnose_pending = verdict.verdict === "diagnose";
      break;
    case "split":
      unit.split_pending = true;
      unit.feedback = result ? h.formatFeedback(result) : null;
      break;
    case "block":
      unit.status = "blocked";
      h.block(c, `${task.id}: ${verdict.reason}`);
      break;
    case "ask_human": {
      const scope = envelope.status === "needs_scope_change";
      h.askHuman(c, {
        stage: pending.stage, task: task.id,
        reason: scope ? `${verdict.reason} — widen it with /factory:split ${task.id} or /factory:replay planning; approving alone keeps the same files` : verdict.reason,
        questions: envelope.open_questions ?? [],
      });
      break;
    }
  }
  h.persist(c);
  return { action: s.status === "awaiting_human" ? "ask_human" : s.status === "blocked" ? "halt" : "continue", feature: s.feature, task: task.id, phase: pending.phase, verdict: verdict.verdict, reason: verdict.reason, gate: result ? h.summary(result) : null };
}
