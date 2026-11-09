// S5 task loop: one task per dispatch, routed by task.role. Phases per task:
//   tdd required, quality.tdd.author builder_two_phase (default)
//                         → build (ONE builder dispatch: red tests, `gate red`, implementation, `gate impl`;
//                           the engine checks the gate log: red passed before impl)
//   tdd required, author separate
//                         → red (gate red) → green (gate impl): by default one builder dispatch does both (quality.tdd.author: builder_two_phase); `separate` has the role test author write red, then the builder
//   type characterisation → char (role test author writes passing tests only, gate impl)
//   tdd exempt            → green (role builder, gate impl)
// Every phase runs through the same Loop Warden ladder; rung 4 asks the planner to AMEND the task (a split
// stays a human command, /factory:split, for a task that is genuinely two unrelated behaviours).
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { ENGINE_ROOT, fileHash, matchesAny, now, readYaml, sha, toPosix } from "./core.mjs";
import { appendEvent } from "./state.mjs";
import { gateContext, normaliseResult, runGate } from "./gatekeeper.mjs";
import { resolveStack } from "./stackexec.mjs";
import { decide } from "./warden.mjs";
import { applyMappings, openNotes } from "./notes.mjs";
import { taskKnowledge } from "./knowledge.mjs";
import { recordBaseRef } from "./baseref.mjs";

const CLOSED = ["done", "parked", "replaced"];
/** Task types that are mechanical work: a failing attempt escalates to the execution tier (rung 2), not to the reasoning tier. */
export const MECHANICAL_TASK_TYPES = ["i18n", "styling-token", "config"];
const DEFAULT_INPUTS = ["prd|delta-spec", "stories?", "ux-notes?", "component-map?", "api-contract?", "agent-design?", "tasks", "test-plan"];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
/** Everything that resets when a task enters a new phase or round. */
export const FRESH = {
  attempts: 0, rung: 0, progress_signal: [], fingerprints: [], state_hashes: [], transient_retries: 0,
  feedback: null, instruction: null, model: null, diagnose_pending: false,
};

export function loadTasks(c) {
  const file = join(c.feature.dir, "04-plan", "tasks.yaml");
  return existsSync(file) ? readYaml(file) : null;
}

/** quality.tdd.author: one builder dispatch writes the red tests and the implementation. */
export const twoPhase = (config) => config?.quality?.tdd?.author === "builder_two_phase";

export function phasesFor(task, config) {
  if (task.tdd?.mode === "required") return twoPhase(config) ? ["build"] : ["red", "green"];
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
export function syncTasks(state, plan, config, projectDir) {
  for (const t of plan.tasks) {
    const unit = (state.tasks[t.id] ??= { status: "pending", ...FRESH, round: 1 });
    // A fix round that amended a finished task (more files, a longer definition of done) reopens it.
    if (unit.status === "done") {
      unit.task_hash ??= planHash(t);
      if (unit.task_hash !== planHash(t)) restartTask(projectDir, t, unit, "Reopened: a fix round amended this task (files, definition of done or tests). Extend the work of the slice; keep what already passes.");
    }
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

/** The parts of a task entry that change what has to be built; a rewrite that leaves them alone reopens nothing. */
export const planHash = (t) => sha(JSON.stringify([t.files_expected, t.write_scope ?? [], t.definition_of_done, t.satisfies, t.tdd?.red_tests ?? [], t.type]));

/** The task runs again from its first phase; its existing red tests become "extends" (their old tests may pass). */
function restartTask(projectDir, task, unit, feedback) {
  const extend = projectDir ? (task.tdd?.red_tests ?? []).filter((f) => existsSync(join(projectDir, f))) : [];
  Object.assign(unit, FRESH, {
    status: "pending", phase: null, red_lock: null, build_since: null, snapshot_absent: null, disputed: false, round: (unit.round ?? 1) + 1,
    base_ref: null, reopened: true, extends: [...new Set([...(unit.extends ?? []), ...extend])], feedback, task_hash: null, amend_pending: false,
  });
}

const filesHash = (projectDir, files) => sha(files.map((f) => `${f}:${fileHash(join(projectDir, f)) ?? "-"}`).join("\n"));

// Snapshot copies carry a suffix so the project's own tools (eslint ., tsc, test globs) never pick them up.
const SNAP = ".snapshot";

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
    copyFileSync(src, join(dir, f + SNAP));
  }
  return absent;
}

function restoreSnapshot(c, task, absent = []) {
  const dir = join(c.feature.dir, "snapshots", task.id);
  for (const f of task.files_expected) {
    if (absent.includes(f)) rmSync(join(c.projectDir, f), { force: true });
    else if (existsSync(join(dir, f + SNAP))) copyFileSync(join(dir, f + SNAP), join(c.projectDir, f));
  }
}

/** Sends a task back to its red phase (dispute or human decision): sources restored, red lock cleared. */
export function backToRed(c, task, unit, feedback) {
  restoreSnapshot(c, task, unit.snapshot_absent);
  Object.assign(unit, FRESH, { phase: twoPhase(c.config) ? "build" : "red", status: "red", red_lock: null, build_since: null, round: (unit.round ?? 1) + 1, feedback });
}

/** The engine command an agent runs as its exit check or to prove its red. */
const gateCommand = (c, gates, task) => `node ${toPosix(join(ENGINE_ROOT, "scripts", "factory.mjs"))} gate ${gates} --project ${toPosix(c.projectDir)} --feature ${c.feature.state.feature} --task ${task.id}`;

function missionFor(c, task, phase, role, unit, redGate) {
  const spec = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }).spec()?.reqs ?? [];
  const acText = new Map(spec.flatMap((r) => r.acs.map((a) => [a.id, a.text])));
  const planFile = join(c.feature.dir, "04-plan", "test-plan.yaml");
  const cases = existsSync(planFile) ? (readYaml(planFile).cases ?? []).filter((x) => x.task === task.id) : [];
  const stack = c.packs[role.stack]?.stack;
  const doing = {
    red: () => `Write the failing tests in ${task.tdd.red_tests.join(", ")} and only the stubs the tests import (${(task.tdd.stubs ?? []).join("; ") || "signatures in files_expected"}). Every test must run and fail on an assertion or "not implemented" (no skip/todo). Do not implement.`,
    green: () => `Make ${task.tdd?.red_tests?.length ? `the red tests (${task.tdd.red_tests.join(", ")})` : "the task"} pass by implementing it. The red tests are read-only; if one is wrong, return "test_dispute" instead of editing it.`,
    build: () => unit?.red_lock
      ? `Your red tests (${task.tdd.red_tests.join(", ")}) already passed gate red and are locked: do not edit them (if one is wrong, return "test_dispute"). Implement the task until its tests pass.`
      : `Do both phases in this one dispatch, in this order. 1 RED: write the failing tests in ${task.tdd.red_tests.join(", ")} and only the stubs they import (${(task.tdd.stubs ?? []).join("; ") || "signatures in files_expected"}); every test must run and fail on an assertion or "not implemented" (no skip/todo). Prove it: run \`${gateCommand(c, redGate ?? "red", task)}\` and fix until it passes (it passes when the tests FAIL for the right reason). Do not implement before it passes. 2 GREEN: implement until your exit check passes. The engine refuses the result unless gate red passed first and the red tests are unchanged after it.`,
    char: () => `Write characterisation tests in ${taskTestFiles(task, stack).join(", ")} that pin today's behaviour. They must pass now; you may write only those test files.`,
  }[phase];
  const slice = taskSlice(c, task);
  return [
    `Task ${task.id} (${task.type}, role ${task.role}): ${task.title} — phase ${phase}`,
    doing(),
    `Satisfies: ${task.satisfies.map((id) => `${id} — ${acText.get(id) ?? "?"}`).join(" | ") || "(none — characterisation)"}`,
    ...(cases.length ? [`Planned test cases: ${cases.map((x) => `${x.id} (${x.level}${x.ac ? `, ${x.ac}` : ""}) ${x.title}`).join(" | ")}`] : []),
    `Definition of done: ${task.definition_of_done.join(" | ")}`,
    `Files: ${task.files_expected.join(", ")}`,
    ...(task.write_scope?.length ? [`Write scope (you may also create files here): ${task.write_scope.join(", ")}`] : []),
    ...slice,
  ].join("\n");
}

/** The IDs a human note may be mapped to for it to concern this task: itself, its ACs and their REQs, and the tasks of its slice. */
export function noteScope(c, task) {
  const ids = new Set([task.id, ...(task.satisfies ?? [])]);
  const spec = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }).spec();
  for (const r of spec?.reqs ?? []) if (ids.has(r.id) || r.acs.some((a) => ids.has(a.id))) ids.add(r.id);
  const folders = sliceFolders(task);
  for (const t of loadTasks(c)?.tasks ?? []) {
    const sameSlice = (task.slice && t.slice === task.slice) || (folders.length && t.files_expected.some((f) => folders.some((d) => f.startsWith(`${d}/`))));
    if (sameSlice) ids.add(t.id);
  }
  return [...ids];
}

const flat = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const clip = (text, n) => (text.length > n ? `${text.slice(0, n)} …` : text);

/**
 * The task's slice of the feature artifacts, inlined so the whole files stay optional reads: the
 * requirements and stories its ACs belong to (with the Gherkin of the ACs it satisfies), and the
 * component-map entries and API operations for its files. A part whose artifact is missing is left out.
 */
export function taskSlice(c, task) {
  const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config });
  const out = [];
  const mine = new Set(task.satisfies ?? []);
  const reqs = (ctx.spec()?.reqs ?? []).filter((r) => mine.has(r.id) || r.acs.some((a) => mine.has(a.id)));
  if (reqs.length) out.push(`Requirements: ${reqs.map((r) => `${r.id} — ${flat(r.text)}`).join(" | ")}`);
  const stories = (ctx.load("stories")?.data?.stories ?? []).filter((st) => (st.acs ?? []).some((a) => mine.has(a.id)) || (st.traces ?? []).some((id) => mine.has(id)));
  for (const st of stories) {
    out.push(`Story ${st.id} (${(st.traces ?? []).join(", ")}): as ${flat(st.as_a)}, I want ${flat(st.i_want)}, so that ${flat(st.so_that)}${st.ux?.surfaces?.length ? ` · surfaces ${st.ux.surfaces.join(", ")}; states ${(st.ux.states ?? []).join(", ")}` : ""}`);
    for (const a of (st.acs ?? []).filter((x) => mine.has(x.id))) out.push(`  ${a.id}: ${clip(flat(a.gherkin), 400)}`);
  }
  const inScope = (f) => (task.files_expected ?? []).includes(f) || matchesAny(f, task.write_scope ?? []);
  const components = (ctx.load("component-map")?.data?.components ?? []).filter((x) => x.path && inScope(x.path));
  if (components.length) {
    out.push("Component map (your files):", ...components.map((x) => `  - ${x.name} · ${x.path} · ${x.layer}${x.reuse ? ` · reuse ${x.reuse}` : ""}${x.reuse_considered?.length ? ` (considered ${x.reuse_considered.join(", ")})` : ""}${x.reuse_rejected ? ` — ${flat(x.reuse_rejected)}` : ""}`));
  }
  const ops = [];
  for (const [path, item] of Object.entries(ctx.load("api-contract")?.data?.paths ?? {})) {
    for (const [method, op] of Object.entries(item ?? {})) {
      if (!op?.operationId) continue;
      const acs = op["x-factory"]?.acs ?? [];
      if ((task.contract_ops ?? []).includes(op.operationId) || acs.some((id) => mine.has(id))) ops.push({ method, path, op });
    }
  }
  if (ops.length) {
    out.push("API contract (operations of this task):", ...ops.map(({ method, path, op }) => `  - ${method.toUpperCase()} ${path} ${clip(JSON.stringify({ operationId: op.operationId, parameters: op.parameters, requestBody: op.requestBody, responses: op.responses }), 1500)}`));
  }
  return out;
}

/** The planner is whoever owns tasks.yaml in the planning stage (owners), else its first agent. */
function plannerTarget(c, h) {
  const planning = h.resolveStage(c, "planning") ?? { agents: [] };
  const agents = h.resolveAgents(c, planning);
  return agents.find((t) => t.agent === planning.owners?.tasks) ?? agents[0];
}

/** budgets.stage.dispatches_max_by_stage.<stage> caps the stage's dispatches (the engine raises it with the plan): a halt when it is spent. */
function overDispatchCap(c, stageId, h) {
  const s = c.feature.state;
  const cap = c.config.budgets?.stage?.dispatches_max_by_stage?.[stageId];
  if (!cap || (s.stages[stageId]?.dispatches ?? 0) < cap) return null;
  h.block(c, `stage "${stageId}" used its ${cap} dispatches (budgets.stage.dispatches_max_by_stage.${stageId}) — raise it with: factory budget raise stage.dispatches_max_by_stage.${stageId} <higher number>, then factory resume`);
  return { action: "halt", feature: s.feature, reason: s.halts.at(-1).reason };
}

/** The next dispatch of the task loop, or { advance: true } when every task is closed. */
export function taskStep(c, stageId, stage, h) {
  const s = c.feature.state;
  const plan = loadTasks(c);
  if (!plan) return { action: "halt", feature: s.feature, reason: "04-plan/tasks.yaml is missing" };
  syncTasks(s, plan, c.config, c.projectDir);
  // Human notes still open when the build runs (given at GATE-B or with /factory:note since) reach
  // the planner as fix items; the plan gate then requires every one to be mapped.
  const noteItems = openNotes(c.feature.dir).map((n) => ({ check: "note", rule: n.id, file: null, message: `${n.id}: ${n.text}` }));
  if (noteItems.length) {
    // Joined to fix items already waiting (QA, review, PR) — the plan gate wants every open note mapped.
    s.fix_pending ??= { source: "human notes", items: [], attempts: 0 };
    const known = new Set(s.fix_pending.items.map((i) => i.rule));
    s.fix_pending.items.push(...noteItems.filter((i) => !known.has(i.rule)));
  }
  if (s.fix_pending) {
    const capped = overDispatchCap(c, stageId, h);
    if (capped) return capped;
    const planner = plannerTarget(c, h);
    if (!planner?.pack) return { action: "halt", feature: s.feature, reason: "fix items are waiting, but no planner is installed" };
    const round = (s.fix_rounds ?? 0) + 1;
    const items = s.fix_pending.items.map((i) => `- [${i.check}${i.rule ? `/${i.rule}` : ""}] ${i.file ? `${i.file}: ` : ""}${i.message}`).join("\n");
    return h.issue(c, [
      h.makeDispatch(c, {
        stageId, idStage: `${stageId}.fix${round}`, gateTask: null,
        stage: { outputs: ["tasks", "test-plan"], inputs: ["prd|delta-spec", "stories?", "tasks", "test-plan", "change-set?", "review?", "defects?", "triage?", "human-notes?"], context_role: "analysis_roles" },
        // Fix tasks for a known failure list are execution-tier work; a human-requested split keeps the planner's own model (rung 4 is an amendment).
        target: planner, phase: "fixplan", attempt: (s.fix_pending.attempts ?? 0) + 1, rung: 0, model: c.config.model_tiers?.execution ?? "sonnet", gate: "plan", feedback: s.fix_pending.feedback ?? null,
        mission:
          `${s.fix_pending.source} failed. Plan the fixes for these items in tasks.yaml.\n${items}\n` +
          "Group the items by the slice (component folder / FSD slice) that owns the code. For each slice that an existing task owns (its files_expected / write_scope / slice), AMEND that task: add the items to its definition_of_done and any new files to files_expected; the engine reopens a finished task whose entry changed. Batch every item of one slice into ONE amendment. Add a new task (new ID from \"Next free IDs\") only when no existing task owns the work. A fix that changes behaviour is test-first: its red test goes into the owning task's test file (extend it) or a new file. Add test-plan cases for new tests. Map any human note behind an item in notes_mapped.",
      }),
    ]);
  }
  const open = plan.tasks.filter((t) => !CLOSED.includes(s.tasks[t.id].status));
  if (!open.length) {
    const parked = plan.tasks.filter((t) => s.tasks[t.id].status === "parked").map((t) => t.id);
    if (parked.length) appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: stageId, parked });
    return { advance: true };
  }
  // A blocked task keeps the feature blocked until a human acts on it (diagnose --task, split, replay),
  // even when a parallel task's question was answered in between.
  const blocked = plan.tasks.find((t) => s.tasks[t.id].status === "blocked");
  if (blocked) {
    h.block(c, `${blocked.id}: ${s.tasks[blocked.id].reason ?? "blocked"} — run /factory:diagnose --task ${blocked.id}, /factory:scope ${blocked.id} add <file> for a missing file, /factory:split ${blocked.id} when it is two behaviours, or /factory:resume --task ${blocked.id} to run the same phase again`);
    return { action: "halt", feature: s.feature, reason: s.halts.at(-1).reason };
  }
  const isDone = (id) => s.tasks[id]?.status === "done";
  const runnable = open.filter((t) => t.depends_on.every(isDone));
  if (!runnable.length) {
    const waiting = open.map((t) => `${t.id} ← ${t.depends_on.filter((d) => !isDone(d)).join(",")}`).join("; ");
    return { action: "halt", feature: s.feature, reason: `no runnable task (dependencies blocked): ${waiting}` };
  }
  const capped = overDispatchCap(c, stageId, h);
  if (capped) return capped;
  if (earlyReviewDue(c, plan)) {
    const review = earlyReviewDispatch(c, stageId, plan, h);
    if (review) return review;
  }
  const dispatches = [];
  for (const task of pickTracks(c, runnable)) {
    const r = taskDispatch(c, stageId, stage, task, h);
    if (r.action === "halt") return r;
    // Hooks scope writes by agent type: never two live dispatches of one agent (e.g. two diagnosticians).
    if (dispatches.some((d) => d.subagent_type === r.subagent_type)) continue;
    dispatches.push(r);
  }
  return h.issue(c, dispatches);
}

const sliceKey = (t) => t.slice ?? sliceFolders(t)[0] ?? t.id;

/**
 * F2 (early quality): once the first slice (the first finished task and every task of its slice) is done and more
 * work remains, the reviewer looks at it once — a non-blocking review whose findings amend the owning slices.
 * Off with quality.early_review: false. Verification reviews everything again.
 */
function earlyReviewDue(c, plan) {
  const s = c.feature.state;
  if (s.early_review || c.config.quality?.early_review === false) return false;
  const status = (t) => s.tasks[t.id]?.status;
  const first = plan.tasks.find((t) => status(t) === "done");
  if (!first) return false;
  const slice = plan.tasks.filter((t) => sliceKey(t) === sliceKey(first));
  return slice.every((t) => [...CLOSED].includes(status(t))) && plan.tasks.some((t) => !CLOSED.includes(status(t)));
}

/** One reviewer dispatch over the finished tasks' change set; its findings become fix items for the planner (amend mode). */
function earlyReviewDispatch(c, stageId, plan, h) {
  const s = c.feature.state;
  const vstage = ["verification", "verification-lite"].map((id) => h.resolveStage(c, id)).find((st) => st?.agents?.length);
  const [target] = vstage ? h.resolveAgents(c, vstage) : [];
  if (!target?.pack || !h.MODELS.includes(target.model)) {
    s.early_review = { skipped: "no reviewer installed", at: now() };
    return null;
  }
  const done = plan.tasks.filter((t) => s.tasks[t.id]?.status === "done");
  s.early_review = { dispatched: true, at: now(), tasks: done.map((t) => t.id) };
  h.writeChangeSet(c);
  return h.issue(c, [
    h.makeDispatch(c, {
      stageId, idStage: `${stageId}.review1`, stage: { ...vstage, gate: null, audits: undefined, precheck: undefined }, target, phase: "early_review",
      attempt: 1, rung: 0, model: target.model, gate: null,
      mission: `EARLY REVIEW after the first slice (${done.map((t) => t.id).join(", ")}); the rest of the plan is not built yet. This review does not block anything. Review only the finished tasks' files in 06-verify/change-set.yaml with your lenses, once, and report at most 8 findings, each with file and line, P0–P2 only; skip what a later task of the plan will add. Return them in the envelope's findings; fix nothing.`,
    }),
  ]);
}

/**
 * Role tracks: one runnable task per enabled role at a time, run in parallel when the roles live in
 * different package directories (roles.<role>.path), so their gates never see each other's edits.
 * A split rewrites tasks.yaml and runs alone; flow.role_tracks: sequential turns tracks off.
 */
function pickTracks(c, runnable) {
  if (planChanging(c.feature.state.tasks[runnable[0].id])) return [runnable[0]];
  if (c.config.flow?.role_tracks === "sequential") return [runnable[0]];
  const picked = [];
  const dirs = [];
  for (const task of runnable) {
    const dir = rolePath(c.config, task.role);
    if (picked.some((t) => t.role === task.role) || dirs.some((d) => pathsOverlap(d, dir)) || planChanging(c.feature.state.tasks[task.id])) continue;
    picked.push(task);
    dirs.push(dir);
  }
  return picked;
}

const planChanging = (unit) => unit.split_pending || unit.amend_pending;

/** A role's package folder, normalised ("" = the project root). */
export const rolePath = (config, role) => posix.normalize(String(config.roles?.[role]?.path ?? ".").replaceAll("\\", "/")).replace(/^\.\/?$|\/$/g, "");

/** Folders overlap when one contains the other: the root contains every role's folder. */
export const pathsOverlap = (a, b) => a === b || a === "" || b === "" || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

/** One task's next dispatch (red, green, char, split or diagnose), or a halt. */
function taskDispatch(c, stageId, stage, task, h) {
  const s = c.feature.state;
  const unit = s.tasks[task.id];
  const role = { name: task.role, ...c.config.roles[task.role] };
  const rolePack = c.packs[role.pack];
  if (!rolePack?.role) return { action: "halt", feature: s.feature, reason: `role pack "${role.pack}" for ${task.id} is not installed` };
  const inputs = stage.inputs ?? DEFAULT_INPUTS;
  const rel = (p) => toPosix(relative(c.projectDir, p));
  const round = unit.round ?? 1;

  if (unit.split_pending || unit.amend_pending) {
    const planner = plannerTarget(c, h);
    if (!planner?.pack) return { action: "halt", feature: s.feature, reason: `${task.id} needs a plan change, but no planner is installed` };
    const split = Boolean(unit.split_pending);
    return h.makeDispatch(c, {
      stageId, idStage: `${stageId}.${task.id}.${split ? "split" : "amend"}`, task, gateTask: null, noteScope: noteScope(c, task),
      stage: { outputs: ["tasks", "test-plan"], inputs: ["prd|delta-spec", "tasks", "test-plan", "root-cause?"], context_role: "analysis_roles" },
      // An amendment corrects the plan along a diagnosis that is already written (execution tier); a split is a re-plan (the planner's own model).
      target: planner, phase: split ? "split" : "amend", attempt: 1, rung: 4, model: split ? planner.model : c.config.model_tiers?.execution ?? "sonnet", gate: "plan", feedback: unit.feedback,
      mission: split
        ? `A human asked to split ${task.id}. Replace it in tasks.yaml with 2–3 smaller tasks (new IDs from "Next free IDs", same role) that together satisfy ${task.satisfies.join(", ") || "its purpose"}. ` +
          `Point every task that depended on ${task.id} at the new tasks, and move test-plan cases that name ${task.id} to the new tasks. ` +
          `Leave everything else unchanged. Read diagnosis/${task.id}.md first if it exists.`
        : `${task.id} keeps failing its gates even after a diagnosis. Read diagnosis/${task.id}.md first, then AMEND ${task.id} in place (same ID): correct its files_expected / write_scope, its definition_of_done, its red_tests or its dependencies so that the diagnosed cause is gone. ` +
          `Do NOT split it into smaller tasks and do not add tasks for it: a split is only ever a human's /factory:split. Leave every other task unchanged.`,
    });
  }
  const phase = unit.phase ?? phasesFor(task, c.config)[0];
  if (unit.diagnose_pending) {
    const target = h.engineTarget(c, "diagnostician");
    return h.makeDispatch(c, {
      stageId, idStage: `${stageId}.${task.id}.${phase}${round > 1 ? round : ""}.diagnose`, task, gateTask: null, noteScope: noteScope(c, task),
      stage: { outputs: ["root-cause"], inputs, context_role: "analysis_roles" },
      target, phase: "diagnose", attempt: Math.max(unit.attempts ?? 0, 1), rung: 3, model: target.model, feedback: unit.feedback, gate: null,
      mission: `Diagnose why ${task.id} (${task.title}) keeps failing its ${phase} gate. Write diagnosis/${task.id}.md. Do not fix anything yourself.`,
    });
  }

  // A task type may have a specialist builder (migration-author, ai-rag-builder, …); red is the test author's only with quality.tdd.author: separate (the default builder_two_phase has the builder write and prove red itself).
  const builds = phase === "green" || phase === "build";
  const slot = builds ? (rolePack.role.agents.builders?.[task.type] ? `builders.${task.type}` : "builder") : "test_author";
  const agent = builds ? (rolePack.role.agents.builders?.[task.type] ?? rolePack.role.agents.builder) : rolePack.role.agents.test_author;
  const model = agent ? h.agentModel(rolePack, agent) : null;
  if (!agent || !h.MODELS.includes(model)) {
    return { action: "halt", feature: s.feature, reason: `${rolePack.name} has no usable ${slot} ("${agent ?? "missing"}", model "${model}")` };
  }
  const target = { agent, pack: rolePack, role: task.role, subagent_type: `${rolePack.name}:${agent}`, model };
  const red = task.tdd?.red_tests ?? [];
  const tests = taskTestFiles(task, c.packs[role.stack]?.stack);
  // The write allowlist is files_expected plus write_scope (folder globs); the red tests are read-only once locked.
  const scope = task.write_scope ?? [];
  const locked = unit.red_lock ? red : [];
  const writes = { red: [...task.files_expected, ...scope], build: [...task.files_expected, ...scope], green: [...task.files_expected.filter((f) => !red.includes(f)), ...scope], char: tests }[phase];
  Object.assign(unit, { status: phase === "green" || (phase === "build" && unit.red_lock) ? "green" : "red", phase });
  if (phase === "build" && !unit.red_lock) unit.build_since ??= now();
  // The tree as it is when the task's first dispatch starts: its gates test and lint only what changes from here (baseref.mjs).
  if (!unit.base_ref) unit.base_ref = recordBaseRef(c.projectDir);
  const rootCause = join(c.feature.dir, "diagnosis", `${task.id}.md`);
  return h.makeDispatch(c, {
    stageId, idStage: `${stageId}.${task.id}.${phase}${round > 1 ? round : ""}`, task,
    // The task's slice of the plan is inlined in the mission; the whole artifacts are optional reads.
    slim: true, noteScope: noteScope(c, task),
    // The acceptance tests are the holdout: test authors and builders never read them.
    stage: { outputs: [], inputs, context_role: stage.context_role ?? "execution_roles", read_deny: ["**/*.acceptance.test.*"] },
    target, phase, attempt: (unit.attempts ?? 0) + 1, rung: unit.rung ?? 0, model: unit.model ?? target.model,
    // The builder's exit check is gate impl only: gate red cannot pass once the code is written (the mission says when to run it).
    feedback: unit.feedback, instruction: unit.instruction, gate: phase === "red" ? rolePack.role.gates.red : rolePack.role.gates.impl,
    extraWrites: writes, writeDeny: phase === "green" ? red : phase === "build" ? locked : [],
    extraReads: (unit.rung ?? 0) >= 3 && existsSync(rootCause) ? [{ label: "Root cause", path: rel(rootCause) }] : [],
    mission: missionFor(c, task, phase, role, unit, rolePack.role.gates.red),
    knowledge: taskKnowledge(c.packs[role.stack], task.type, phase),
  });
}

const PATHLIKE = /(?:^|[\s`'"(])((?:[\w@.-]+\/)+[\w@.\-[\]]+\.[A-Za-z0-9]+)(?=$|[\s`'",.;:)])/g;

/** The slice folder of a task: the fixed prefix of its write_scope globs, else the folder its files share (two segments deep at least). */
export function sliceFolders(task) {
  const scoped = (task.write_scope ?? []).map((g) => g.split("/").filter((seg) => !/[*?{[]/.test(seg)).join("/")).filter(Boolean);
  if (scoped.length) return scoped;
  const parts = task.files_expected.map((f) => dirname(f).split("/"));
  let common = parts[0] ?? [];
  for (const p of parts) {
    let i = 0;
    while (i < common.length && i < p.length && common[i] === p[i]) i++;
    common = common.slice(0, i);
  }
  return common.length >= 2 ? [common.join("/")] : [];
}

/** Files a needs_scope_change names: split into those inside the task's slice folder (mechanical) and the rest. */
export function scopeSuggestion(task, envelope) {
  const named = new Set((envelope.scope_files ?? []).map(toPosix));
  for (const text of [...(envelope.open_questions ?? []), envelope.summary ?? ""]) for (const m of String(text).matchAll(PATHLIKE)) named.add(m[1]);
  const folders = sliceFolders(task);
  const have = new Set(task.files_expected);
  const list = [...named].filter((f) => !have.has(f) && !matchesAny(f, task.write_scope ?? []));
  const inside = list.filter((f) => folders.some((d) => f === d || f.startsWith(`${d}/`)));
  return { inside, outside: list.filter((f) => !inside.includes(f)) };
}

/** Runs the phase gate for a task envelope. Called outside the state lock: gates can take minutes. */
export async function taskGate(c, pending, envelope) {
  if (envelope.status !== "done" || envelope.test_dispute || !["red", "green", "char", "build"].includes(pending.phase)) return null;
  const task = loadTasks(c)?.tasks.find((t) => t.id === pending.task);
  const rolePack = task && c.packs[c.config.roles[task.role]?.pack];
  if (!rolePack?.role) return null;
  const gate = pending.phase === "red" ? rolePack.role.gates.red : rolePack.role.gates.impl;
  const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config, task, stack: resolveStack(c, task.role), packs: c.packs });
  // builder_two_phase: no impl verdict without proof that red passed first (A3 of the quality checklist).
  if (pending.phase === "build") {
    const proof = redBeforeImpl(c, task, c.feature.state.tasks[task.id]);
    if (proof.length) return normaliseResult("red", proof);
  }
  // The agent ran this gate as its exit check: a pass on the same working tree is reused, not re-run.
  return runGate(gate, ctx);
}

/**
 * The gate log is the proof that a builder_two_phase task went red before green: a passing `red` entry for
 * the task since its build began, written before any passing `impl` entry, and the red tests unchanged
 * since that pass. Returns gate failures (empty = proven).
 */
export function redBeforeImpl(c, task, unit) {
  const fail = (rule, message) => [{ check: "red-first", rule, message }];
  const red = task.tdd?.red_tests ?? [];
  if (!red.length) return [];
  const file = join(c.feature.dir, "gate-log.jsonl");
  const since = unit?.build_since ?? "";
  const entries = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
  const mine = entries.filter((e) => e.task === task.id && e.ts >= since && e.pass);
  const redPass = mine.find((e) => e.gate === "red");
  if (!redPass || !unit?.red_lock) {
    return fail("red-not-run", `gate red never passed for ${task.id} in this build: write the failing tests and the stubs first, run \`gate red --task ${task.id}\` until it passes (every test fails for the right reason), and only then implement. If you already implemented, put the implementation files back to stubs, run gate red, then implement again.`);
  }
  const implFirst = mine.find((e) => e.gate === "impl" && e.ts < redPass.ts);
  if (implFirst) return fail("impl-before-red", `gate impl passed at ${implFirst.ts}, before gate red passed at ${redPass.ts}: red must come first`);
  for (const [f, hash] of Object.entries(unit.red_lock)) {
    if (fileHash(join(c.projectDir, f)) !== hash) return fail("red-test-changed", `${f} changed after gate red passed; red tests are read-only once red has passed (return "test_dispute" if one is wrong)`);
  }
  return [];
}

/** `factory gate red` passed in a builder_two_phase build: lock the red tests and snapshot the stubs, as the red phase would. */
export function markRedPassed(c, task) {
  const unit = c.feature.state.tasks?.[task.id];
  if (!twoPhase(c.config) || task.tdd?.mode !== "required" || !unit || unit.phase !== "build" || unit.red_lock) return false;
  const red = task.tdd.red_tests ?? [];
  Object.assign(unit, { red_lock: Object.fromEntries(red.map((f) => [f, fileHash(join(c.projectDir, f))])), status: "green", snapshot_absent: snapshot(c, task, red), red_passed_at: now() });
  return true;
}

/** Records a task-phase envelope: Loop Warden verdict, red lock, split and dispute handling. */
export async function finishTask(c, pending, envelope, h, result) {
  const s = c.feature.state;
  if (pending.phase === "fixplan") {
    if (envelope.notes_mapped?.length) applyMappings(c.feature.dir, envelope.notes_mapped, h.featureIds(c));
    const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config, packs: c.packs });
    const planResult = await runGate("plan", ctx, { useCache: false });
    if (!planResult.pass || envelope.status !== "done") {
      // One more try with the gate's failures as feedback, then a human.
      s.fix_pending.attempts = (s.fix_pending.attempts ?? 0) + 1;
      s.fix_pending.feedback = planResult.pass ? `Previous attempt returned status "${envelope.status}": ${envelope.summary}` : h.formatFeedback(planResult);
      if (s.fix_pending.attempts >= 2) h.block(c, `the fix plan for ${s.fix_pending.source} failed gate-plan (${planResult.failures.length} failure(s))`);
    } else {
      appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: pending.stage, verdict: "advance", reason: `fix tasks planned for ${s.fix_pending.source}` });
      s.fix_pending = null;
      s.fix_rounds = (s.fix_rounds ?? 0) + 1;
      syncTasks(s, loadTasks(c), c.config, c.projectDir);
      h.raiseBudgets(c); // a fix round that added tasks raises the budgets the same way planning did
    }
    h.persist(c);
    return { action: s.status === "blocked" ? "halt" : "continue", feature: s.feature, verdict: "fixplan", gate: h.summary(planResult) };
  }
  // An amendment (rung 4): the same task, corrected; it restarts its cycle with its existing tests as "extends".
  if (pending.phase === "amend") {
    const unit = s.tasks[pending.task];
    const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config, packs: c.packs });
    const planResult = await runGate("plan", ctx, { useCache: false });
    if (!planResult.pass || envelope.status !== "done") {
      h.block(c, `${pending.task}: the amended plan failed gate-plan (${planResult.failures.length} failure(s))`);
    } else {
      const plan = loadTasks(c);
      const task = plan.tasks.find((t) => t.id === pending.task);
      if (task) {
        restartTask(c.projectDir, task, unit, `Amended after a failed diagnosis (rung 4): see diagnosis/${task.id}.md and the changed definition of done.`);
        unit.rung = 0;
        unit.amend_count = (unit.amend_count ?? 0) + 1; // the warden sends a second ladder exhaustion to a human (rung 5)
      }
      syncTasks(s, plan, c.config, c.projectDir);
      appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: pending.stage, task: pending.task, verdict: "amend", reason: "task amended in place" });
    }
    h.persist(c);
    return { action: s.status === "blocked" ? "halt" : "continue", feature: s.feature, verdict: "amend", gate: h.summary(planResult) };
  }
  // A split rewrites tasks.yaml, so the original task is gone from the plan by now: handle it first.
  if (pending.phase === "split") {
    const unit = s.tasks[pending.task];
    const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config, packs: c.packs });
    const planResult = await runGate("plan", ctx, { useCache: false });
    if (!planResult.pass || envelope.status !== "done") {
      h.block(c, `${pending.task}: the split plan failed gate-plan (${planResult.failures.length} failure(s))`);
    } else {
      unit.split_pending = false;
      syncTasks(s, loadTasks(c), c.config, c.projectDir);
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

  if (["green", "build"].includes(pending.phase) && envelope.test_dispute) {
    // In one-dispatch mode a dispute is only possible once red passed (the tests are the builder's own and locked).
    if (!unit.disputed && (pending.phase === "green" || unit.red_lock)) {
      unit.disputed = true;
      backToRed(c, task, unit, `The builder disputes ${envelope.test_dispute.test}: ${envelope.test_dispute.reason}\nThe sources are back to how they were at your red. Revise the red tests once if the dispute is right (in builder_two_phase mode: fix the test, run gate red again until it passes, then implement); otherwise keep them and explain why in your summary.`);
      appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: pending.stage, task: task.id, verdict: "retry", reason: "test dispute: back to red once (the builder in builder_two_phase, the test author in separate mode)" });
      h.persist(c);
      return { action: "continue", feature: s.feature, verdict: "test_dispute" };
    }
    envelope = {
      ...envelope,
      status: "needs_clarification",
      open_questions: [`${task.id}: the builder disputes ${envelope.test_dispute.test} again — ${envelope.test_dispute.reason}. Approve to keep the test, reject to send the task back to red (the builder, or the test author in separate mode).`],
    };
  }

  unit.attempts = (unit.attempts ?? 0) + 1;
  const verdict = decide(unit, result, {
    envelope, isTask: true, attemptsMax: c.config.budgets?.task?.attempts_max,
    stateHash: filesHash(c.projectDir, task.files_expected), tiers: { reasoning: MECHANICAL_TASK_TYPES.includes(task.type) ? c.config.model_tiers?.execution ?? "sonnet" : h.reasoningModel(c) },
  });
  Object.assign(unit, verdict.unit, { last_gate: result ? h.summary(result) : null });
  appendEvent(c.projectDir, {
    type: "verdict", feature: s.feature, stage: pending.stage, task: task.id, agent: pending.agent, phase: pending.phase, attempt: unit.attempts,
    verdict: verdict.verdict, rung: verdict.rung, reason: verdict.reason,
  });

  switch (verdict.verdict) {
    case "advance":
      if (pending.phase === "red") {
        const red = task.tdd?.red_tests ?? [];
        const lock = Object.fromEntries(red.map((f) => [f, fileHash(join(c.projectDir, f))]));
        Object.assign(unit, FRESH, { phase: "green", status: "green", red_lock: lock, snapshot_absent: snapshot(c, task, red) });
      } else {
        Object.assign(unit, FRESH, { phase: null, status: "done", build_since: null, done_hash: filesHash(c.projectDir, task.files_expected), task_hash: planHash(task) });
      }
      break;
    case "retry":
    case "diagnose":
      unit.feedback = result ? h.formatFeedback(result) : `Previous attempt returned "${envelope.status}": ${envelope.summary}`;
      unit.instruction = verdict.instruction ?? null;
      unit.model = verdict.model ?? null;
      unit.diagnose_pending = verdict.verdict === "diagnose";
      break;
    case "amend":
      unit.amend_pending = true;
      unit.feedback = result ? h.formatFeedback(result) : null;
      break;
    case "split":
      unit.split_pending = true;
      unit.feedback = result ? h.formatFeedback(result) : null;
      break;
    case "block":
      Object.assign(unit, { status: "blocked", reason: verdict.reason });
      h.block(c, `${task.id}: ${verdict.reason}`);
      break;
    case "ask_human": {
      const scope = envelope.status === "needs_scope_change";
      const fit = scope ? scopeSuggestion(task, envelope) : null;
      if (fit?.inside.length) unit.scope_suggestion = fit.inside;
      h.askHuman(c, {
        stage: pending.stage, task: task.id,
        reason: !scope
          ? verdict.reason
          : fit?.inside.length
            ? `${verdict.reason} — the files fall inside the task's slice folder: approve them with /factory:scope ${task.id} add ${fit.inside.join(" ")} (no planner run; the same task continues)${fit.outside.length ? `; ${fit.outside.join(", ")} lie outside the slice: add them by hand or /factory:replay planning` : ""}`
            : `${verdict.reason} — widen it with /factory:scope ${task.id} add <file or glob> for a file of this task's slice, or /factory:replay planning when the plan itself is wrong; approving alone keeps the same files`,
        questions: envelope.open_questions ?? [],
      });
      break;
    }
  }
  h.persist(c);
  return { action: s.status === "awaiting_human" ? "ask_human" : s.status === "blocked" ? "halt" : "continue", feature: s.feature, task: task.id, phase: pending.phase, verdict: verdict.verdict, reason: verdict.reason, gate: result ? h.summary(result) : null };
}

/** The early reviewer's envelope: findings of P0–P2 become fix items (the planner amends the owning slices); nothing blocks. */
export function finishEarlyReview(c, pending, envelope, h) {
  const s = c.feature.state;
  const findings = (envelope.findings ?? []).filter((f) => ["P0", "P1", "P2"].includes(f.severity));
  s.early_review = { ...(s.early_review ?? {}), done: true, status: envelope.status, findings: findings.length };
  if (envelope.status === "done" && findings.length) {
    const items = findings.slice(0, 20).map((f) => ({ check: "review", rule: f.id ?? null, file: f.file ?? null, message: `${f.severity} ${f.claim}${f.line ? ` (line ${f.line})` : ""} — amend the slice that owns this file; do not add a task per finding` }));
    if (s.fix_pending) s.fix_pending.items.push(...items);
    else s.fix_pending = { source: "early review", items, attempts: 0 };
  }
  appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: pending.stage, verdict: "advance", reason: `early review after the first slice: ${findings.length} finding(s) to amend` });
  h.persist(c);
  return { action: "continue", feature: s.feature, early_review: findings.length };
}
