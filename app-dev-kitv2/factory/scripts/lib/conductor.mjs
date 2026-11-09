// The Conductor protocol. The model in the main session only calls `step`, dispatches what it
// returns, and passes each envelope to `record`. Everything that decides — stage order, retries,
// escalation, gates, budgets — happens here, deterministically, from files.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { UsageError, YAML, changedSince, deepMerge, factoryPaths, fileHash, fileStates, matchesAny, now, readFrontMatter, readJson, readText, toPosix, treeHash, writeAtomic, writeJson, writeYaml } from "./core.mjs";
import { loadConfig, profileFor, profileStages, enabledRoles } from "./config.mjs";
import { sizeFromSpec } from "./sizing.mjs";
import { raiseBudgetsFromPlan } from "./budgets.mjs";
import { resolvePacks, stageIndex } from "./registry.mjs";
import { ARTIFACT_TYPES, artifactFiles, parseArtifactRef, validate } from "./schemas.mjs";
import { activeDispatches, appendEvent, clearActive, createFeature, loadAppState, loadFeature, pauseClock, pickFeature, resumeClock, saveAppState, saveFeature, savedEnvelopeFile, setActive, tokensCountedFile, withLock } from "./state.mjs";
import { buildPack } from "./broker.mjs";
import { missingSkills, procedureKnowledge, stageKnowledge } from "./knowledge.mjs";
import { completenessSummary } from "../gates/spec.mjs";
import { readReferences, refKey, resolveProposed, scanNormalised } from "./references.mjs";
import { FRESH as TASK_FRESH, backToRed, finishEarlyReview, finishTask, loadTasks, markRedPassed as lockRed, rolePath, taskGate, taskStep } from "./tasks.mjs";
import { isGlob } from "./planlint.mjs";
import { featureChanges, recordInLedger, ship } from "./delivery.mjs";
import { writeSpecView } from "./spec-view.mjs";
import { scaffoldRoles } from "./scaffold.mjs";
import { runAudits } from "./audits.mjs";
import { engineDigest } from "./digest.mjs";
import { declaredTests, featureAcceptance } from "./testrun.mjs";
import { buildIndex } from "./cartographer.mjs";
import { nextId } from "./ids.mjs";
import { gateContext, idCoverage, normaliseResult, runGate } from "./gatekeeper.mjs";
import { RUNG_INSTRUCTIONS, decide, exhaustedBudgets } from "./warden.mjs";
import { addNote, applyMappings, openNotes, readNotes } from "./notes.mjs";
import { extractIds, formatId, observeId } from "./ids.mjs";
import { addWaiver, gitUser, parseWaiverTarget, readWaivers } from "./waivers.mjs";

export const ENGINE_PACK = "factory";
/** Model aliases the Agent tool accepts per call; agents must declare one of these. */
export const MODELS = ["opus", "sonnet", "haiku"];
const DIGEST_INPUTS = ["prd?", "delta-spec?", "open-questions?", "stories?", "component-map?", "adr?", "api-contract?", "tasks?", "test-plan?", "human-notes?", "root-cause?"];

export function load(projectDir, featureId) {
  const app = loadAppState(projectDir);
  const fid = pickFeature(app, featureId);
  const feature = loadFeature(projectDir, app, fid);
  const config = loadConfig(projectDir, feature.dir);
  const { packs, warnings } = resolvePacks(projectDir, config);
  return { projectDir, app, fid, feature, config, packs, warnings };
}

/** Stage manifest after project overrides; `pipeline.stages.<id>.pack` picks a provider explicitly. */
export function resolveStage(c, stageId) {
  const override = c.config.pipeline?.stages?.[stageId] ?? {};
  let base;
  if (override.pack) base = c.packs[override.pack]?.stages?.[stageId];
  else base = stageIndex(c.packs).index[stageId];
  if (!base) return null;
  const { pack: _ignored, ...rest } = override;
  return deepMerge(base, rest);
}

export function agentModel(pack, agent) {
  const file = join(pack.root, "agents", `${agent}.md`);
  return existsSync(file) ? readFrontMatter(file).data.model ?? "sonnet" : null;
}

/** Expands stage.agents into concrete dispatch targets (role:<slot> → one per enabled role). */
export function resolveAgents(c, stage) {
  const targets = [];
  for (const ref of stage.agents ?? []) {
    if (ref.startsWith("role:")) {
      const slot = ref.slice(5);
      for (const role of enabledRoles(c.config)) {
        const pack = c.packs[role.pack];
        const agent = pack?.role?.agents?.[slot];
        if (agent) targets.push({ agent, pack, role: role.name });
      }
      continue;
    }
    const [packName, agent] = ref.includes(":") ? ref.split(":") : [stage.pack, ref];
    targets.push({ agent, pack: c.packs[packName] });
  }
  // stage.models lowers (or raises) an agent's tier for this stage only, e.g. sonnet for patch planning.
  return targets.map((t) => ({ ...t, subagent_type: `${t.pack?.name}:${t.agent}`, model: t.pack ? stage.models?.[t.agent] ?? agentModel(t.pack, t.agent) : null }));
}

/** The done_agents key of a target: one per agent and role, and per screen for a fan-out. */
const doneKey = (t) => `${t.agent}@${t.role ?? ""}${t.screen ? `#${t.screen}` : ""}`;

// The same words for every dispatch, the one variable part (the pack path and ID) at the end: a stable
// prompt prefix is cached. The pack itself repeats the ID in its Return line.
const promptFor = (d, projectDir) =>
  `Follow your context pack exactly, then end your reply with the JSON envelope it asks for. Context pack: ${toPosix(join(projectDir, d.pack))} (pack_id "${d.id}")`;

/** Conditions the engine can answer from files; a feature flag of the same name overrides them. */
const BUILTIN_CONDITIONS = {
  // Discovery runs once per app: until the baseline (profile + capability map) exists.
  "discovery.needed": (c) => {
    const root = factoryPaths(c.projectDir).root;
    return !existsSync(join(root, "app-profile.yaml")) || !existsSync(join(root, "_index", "capability-map.yaml"));
  },
  // S8a runs only when delivery.docs is on. Default off: the pipeline commits and stops.
  "docs.enabled": (c) => c.config.delivery?.docs === true,
  // S9 runs only when PR comments were fetched (/factory:pr-feedback → factory comments).
  "pr.comments": (c) => {
    const file = join(c.feature.dir, "08-delivery", "comments.json");
    return existsSync(file) && (JSON.parse(readText(file)) ?? []).length > 0;
  },
};

function evalWhen(c, key) {
  if (!key) return true;
  const flag = c.feature.state.flags?.[key];
  if (typeof flag === "boolean") return flag;
  return BUILTIN_CONDITIONS[key]?.(c) ?? false;
}

function persist(c) {
  saveFeature(c.projectDir, c.app, c.feature);
  saveAppState(c.projectDir, c.app);
}

/** A /factory:note given after the build sends the feature back through the planner; true when it did. */
function lateNotesBack(c, stageId) {
  const s = c.feature.state;
  const profile = profileStages(c.config, s.profile);
  const late = openNotes(c.feature.dir).filter((n) => n.at === "note");
  if (!late.length || !profile.includes("implementation") || profile.indexOf(stageId) <= profile.indexOf("implementation")) return false;
  requestFixes(c, stageId, "implementation", late.map((n) => ({ check: "note", rule: n.id, message: `${n.id}: ${n.text}` })));
  return true;
}

function ledgerEntry(c) {
  const file = join(factoryPaths(c.projectDir).root, "ledger", "feature-ledger.yaml");
  return (existsSync(file) ? YAML.parse(readText(file))?.features ?? [] : []).find((f) => f.id === c.feature.state.feature) ?? { status: "unknown" };
}

function nextStage(c) {
  const s = c.feature.state;
  const profile = profileStages(c.config, s.profile);
  const i = profile.indexOf(s.stage);
  if (i === -1) {
    block(c, `stage "${s.stage}" is not in profile "${s.profile}" — the config changed under a running feature`);
    return;
  }
  if (i === profile.length - 1) {
    if (lateNotesBack(c, s.stage)) return;
    s.status = "done";
    // A shipped feature was recorded at ship (and committed); one that never shipped is recorded now.
    const shipped = existsSync(join(c.feature.dir, "08-delivery", "ship.json"));
    const entry = shipped ? ledgerEntry(c) : recordInLedger(c, loadTasks(c)?.tasks.filter((t) => s.tasks?.[t.id]?.status === "done"));
    appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: s.stage, to: "done", ledger: entry.status });
    return;
  }
  const to = profile[i + 1];
  appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: s.stage, to });
  s.stage = to;
  s.stages[to] ??= { status: "pending", attempts: 0, rung: 0 };
}

function block(c, reason) {
  const s = c.feature.state;
  // A parallel task's open question survives the block: it is asked once the feature runs again.
  if (s.awaiting_human?.gate === "CLARIFY") s.queued_human = [s.awaiting_human, ...(s.queued_human ?? [])];
  s.awaiting_human = null;
  s.status = "blocked";
  pauseClock(s);
  s.halts.push({ reason, stage: s.stage, at: now() });
  writeAtomic(join(c.feature.dir, "blockers.md"), `# Blocked: ${s.feature} at ${s.stage}\n\n${reason}\n\nSee gate-log.jsonl and envelopes/ for everything that was tried.\n`);
  appendEvent(c.projectDir, { type: "halt", feature: s.feature, stage: s.stage, reason });
}


/** Stages and task types that build or judge what the screens look like get a customer mockup as a binding input. */
const MOCKUP_STAGES = new Set(["stories", "architecture", "qa", "verification", "requirements", "requirements-lite", "verification-lite"]);
const MOCKUP_TASKS = new Set(["feature-ui", "page", "component", "form", "styling-token"]);
const BINDING_RULE = "structure, states, copy, density, and colour intent are binding; the stack kit is the implementation; the brief wins on conflict";
const NO_PROTOTYPE = "No prototype is registered. Decide layout, states, copy and styling from the spec and the stack kit (shadcn, Tailwind semantic colours). Do not call prototype-kit or a designer.";

/** The mockup the brief points at, as labelled paths. The original reference, not a generated copy. */
function mockupLines(c) {
  const { projectDir } = c;
  return readReferences(projectDir, { feature: c.feature.state.feature }).map((r) => {
    const pages = (r.pages ?? []).map((id) => `${id} (pages/${id}.html)`).join(", ");
    const detail = [
      r.entry ? `entry ${r.entry}` : null,
      r.run ? `documented run: ${r.run}` : null,
      pages ? `pages: ${pages}` : null,
      r.intent ? `intent: ${r.intent}` : null,
      "read-only, Glob/Grep/Read work there",
    ].filter(Boolean);
    return {
      label: `Customer mockup (${BINDING_RULE}; ${detail.join("; ")})`,
      ...(r.path ? { path: isAbsolute(r.path) ? r.path : toPosix(join(projectDir, r.path)) } : { url: r.url }),
    };
  });
}

function referenceInputs(c, { stageId, task } = {}) {
  if (!(MOCKUP_STAGES.has(stageId) || (task && MOCKUP_TASKS.has(task.type)))) return [];
  const lines = mockupLines(c);
  return lines.length ? lines : [{ label: NO_PROTOTYPE }];
}

function makeDispatch(c, { stageId, idStage, stage, target, phase, attempt, rung, model, feedback, instruction, extraReads, extraWrites, writeDeny, mission, gate, task, gateTask = task, laterAgents = [], knowledge, gateScreen, slim, noteScope, binding, inline }) {
  const s = c.feature.state;
  const id = `${s.feature}/${idStage ?? stageId}/${target.agent}/a${attempt}`;
  const owners = stage?.owners ?? {};
  const pack = buildPack(c.projectDir, c.feature, c.config, {
    id, stageId, stage, agent: target.agent, subagent_type: target.subagent_type, model, attempt, rung, role: target.role,
    phase, feedback, instruction, extraReads, extraWrites, writeDeny, mission, task, gateTask, gateScreen, slim, noteScope, gate: gate === undefined ? stage?.gate : gate,
    binding: binding ?? referenceInputs(c, { stageId, task }), inline,
    readDeny: roleScoped(c.config, stage?.read_deny ?? []),
    openNotes: phase === "stage" ? openNotes(c.feature.dir).map((n) => n.id) : [],
    // Outputs owned by another agent of the stage are not this agent's to write.
    notMine: Object.entries(owners).filter(([, agent]) => agent !== target.agent).map(([type]) => type),
    laterOwned: Object.entries(owners).filter(([, agent]) => laterAgents.includes(agent)).map(([type, agent]) => `${type} (${agent})`),
    stacks: stackLines(c),
    // A task carries its own type's knowledge; every other agent gets what the stacks name for it.
    knowledge,
    // The agent's own procedure skills (frontmatter `skills:`), forced the same way as stack skills.
    procedure: procedureKnowledge(target.pack, target.agent, { stageId, mode: s.mode }),
    stageKnowledge: knowledge ? [] : stageKnowledge(enabledRoles(c.config).map((r) => ({ role: r.name, pack: c.packs[r.stack] })), target.agent),
    planRules: (stage?.outputs ?? []).includes("tasks") ? planRules(c) : [],
    nextIds: nextFreeIds(c),
  });
  return {
    id, stage: stageId, agent: target.agent, subagent_type: target.subagent_type, pack: pack.rel, model, phase, ts: now(),
    ...(task ? { task: task.id } : {}), ...(target.screen ? { screen: target.screen } : {}), context_degraded: pack.front.context_degraded,
  };
}

/** Stage globs like src/** also apply inside each role's folder (api/src/**, apps/web/src/**). */
function roleScoped(config, globs) {
  const dirs = [...new Set(enabledRoles(config).map((r) => rolePath(config, r.name)).filter(Boolean))];
  return [...globs, ...dirs.flatMap((d) => globs.filter((g) => !g.startsWith(`${d}/`)).map((g) => `${d}/${g}`))];
}

function engineTarget(c, agent) {
  const pack = c.packs[ENGINE_PACK];
  return { agent, pack, subagent_type: `${ENGINE_PACK}:${agent}`, model: pack ? agentModel(pack, agent) : null };
}

function issue(c, dispatches) {
  const s = c.feature.state;
  dispatches.forEach((d, i) => {
    d.parallel_group = i;
    s.pending.push(d);
    // The stage's own agents and the task loop's dispatches count toward budgets.stage.dispatches_max(_by_stage); a fan-out batch of screens does not.
    if (d.phase === "stage" || d.task || ["fixplan", "early_review"].includes(d.phase)) s.stages[d.stage].dispatches = (s.stages[d.stage].dispatches ?? 0) + 1;
  });
  s.budgets.dispatches += dispatches.length;
  persist(c); // state first: a failed save must not leave hooks enforcing a dispatch that does not exist
  dispatches.forEach((d) => {
    const front = readFrontMatter(join(c.projectDir, d.pack)).data;
    setActive(c.projectDir, {
      ...d,
      write_allow: front.write_allow,
      write_deny: front.write_deny,
      read_deny: front.read_deny,
      ...(front.skills_required?.length ? { skills_required: front.skills_required } : {}),
      ...(front.skill_files?.length ? { skill_files: front.skill_files } : {}),
      read_budget: front.read_allowlist_max + front.listed_reads,
    });
    appendEvent(c.projectDir, {
      type: "dispatch", feature: s.feature, stage: d.stage, ...(d.task ? { task: d.task } : {}), agent: d.agent, model: d.model ?? undefined,
      phase: d.phase, pack: d.pack, context_degraded: Boolean(d.context_degraded),
    });
  });
  return { action: "dispatch", feature: s.feature, dispatches: dispatches.map((d) => ({ ...d, prompt: promptFor(d, c.projectDir) })) };
}

/** What a human sees at a gate: the reason, the questions (the spec's open ones at a stage gate), the files to review. */
function askPayload(c) {
  const s = c.feature.state;
  const g = s.awaiting_human;
  const { projectDir } = c;
  // At a stage's own gate, the spec's unanswered questions and their defaults are part of the decision.
  const specQuestions = g.gate === "CLARIFY" ? [] : (gateContext({ projectDir, app: c.app, feature: c.feature, config: c.config }).spec()?.data.open_questions ?? [])
    .filter((q) => q.status !== "answered")
    .map((q) => `${q.id} (${q.severity}, ${q.status ?? "open"}): ${q.text}${q.default ? ` — default: ${q.default}` : ""}`);
  return { action: "ask_human", feature: s.feature, gate: g.gate, stage: g.stage, reason: g.reason ?? null, questions: g.questions?.length ? g.questions : specQuestions, review: reviewFiles(c, g.stage), open_notes: openNotes(c.feature.dir).map((n) => n.id) };
}

export function step(projectDir, { feature } = {}) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (["done", "aborted"].includes(s.status)) return { action: "done", feature: s.feature, status: s.status };
    if (s.status === "blocked") return { action: "halt", feature: s.feature, reason: `${s.halts.at(-1)?.reason ?? "blocked"} — once the cause is fixed: factory resume (/factory:resume) runs the same phase again` };
    const deps = (s.depends_on ?? []).map((id) => [id, c.app.features[id]?.status]);
    const aborted = deps.filter(([, status]) => status === "aborted").map(([id]) => id);
    if (aborted.length) return { action: "halt", feature: s.feature, reason: `depends on ${aborted.join(", ")}, which was aborted — abort this feature too, or replan it` };
    const waitingFor = deps.filter(([, status]) => status !== "done").map(([id, status]) => `${id}${status === "blocked" ? " (blocked)" : ""}`);
    if (waitingFor.length) return { action: "wait", feature: s.feature, reason: `waiting for ${waitingFor.join(", ")} to finish` };
    if (s.pending.length) {
      return { action: "dispatch", feature: s.feature, resumed: true, dispatches: s.pending.map((d) => ({ ...d, prompt: promptFor(d, projectDir) })) };
    }
    // An interrupted scaffold left the starter half-copied: resuming it (below) comes first.
    const drift = s.scaffold?.status === "running" ? [] : unexpectedChanges(c);
    if (drift.length) {
      return {
        action: "halt", feature: s.feature, changed: drift,
        reason: `files changed outside any dispatch since the last step: ${drift.slice(0, 10).join(", ")}${drift.length > 10 ? ` (+${drift.length - 10} more)` : ""} — keep them with "factory accept-changes", or revert them`,
      };
    }
    const exhausted = exhaustedBudgets(s, c.config);
    if (exhausted.length) {
      block(c, `budget exhausted: ${exhausted.join(", ")}`);
      persist(c);
      return { action: "halt", feature: s.feature, reason: s.halts.at(-1).reason };
    }

    if (s.digest?.pending && (c.config.context?.digest ?? "engine") === "engine") {
      // The engine writes the digest from the artifacts: every open ID by construction, no dispatch.
      engineDigest(c, s.digest.after);
      appendEvent(projectDir, { type: "digest", feature: s.feature, pass: true, by: "engine", after: s.digest.after });
      s.digest = null;
      persist(c);
    }
    if (s.digest?.pending) {
      const target = engineTarget(c, "curator");
      const d = makeDispatch(c, {
        stageId: `digest-${s.digest.after}`, stage: { outputs: ["digest"], inputs: DIGEST_INPUTS, context_role: "mechanical_roles" }, target,
        phase: "digest", attempt: (s.digest.attempts ?? 0) + 1, rung: 0, model: target.model, gate: "digest",
        feedback: s.digest.feedback ?? null,
        mission: `Compact the feature's artifacts into digest.md (at most ${c.config.context?.digest_max_words ?? 600} words) after stage "${s.digest.after}". Keep every open REQ, AC, ADR, OQ and HD ID.`,
      });
      return issue(c, [d]);
    }

    if (!s.awaiting_human && s.queued_human?.length) {
      s.awaiting_human = { ...s.queued_human.shift(), since: now() };
      s.status = "awaiting_human";
      pauseClock(s);
      persist(c);
    }
    if (s.awaiting_human && autopilotMayApprove(c, s.awaiting_human)) {
      // A feature left waiting before autopilot was turned on: approve it now instead of asking.
      approveGate(c, { by: "autopilot" });
      if (s.status === "done") { persist(c); return { action: "done", feature: s.feature, status: "done" }; }
      if (s.status === "blocked") { persist(c); return { action: "halt", feature: s.feature, reason: s.halts.at(-1)?.reason ?? "blocked" }; }
    }
    if (s.awaiting_human) return askPayload(c);

    if (s.relock) return relockDispatch(c);
    // A mockup the brief seemed to point at is only proposed: one question before it becomes binding.
    scanNormalised(projectDir);
    const proposed = readReferences(projectDir, { status: "proposed", feature: s.feature });
    if (proposed.length) {
      s.status = "awaiting_human";
      s.awaiting_human = {
        gate: "CLARIFY", stage: s.stage, since: now(), references: proposed.map(refKey),
        reason: `the brief seems to point at ${proposed.length === 1 ? "a mockup" : "mockups"}; once confirmed they are binding design inputs (imported, read-only for the agents)`,
        questions: proposed.map((r) => `Is ${refKey(r)}${r.source ? ` (from ${r.source})` : ""} the customer's mockup to follow? Answer yes to make it binding, or "no" to ignore it.`),
      };
      pauseClock(s);
      persist(c);
      return askPayload(c);
    }
    const profile = profileStages(c.config, s.profile);
    for (let guard = 0; guard <= profile.length; guard++) {
      const stageId = s.stage;
      const stage = resolveStage(c, stageId);
      if (!stage) {
        return { action: "halt", feature: s.feature, reason: `stage "${stageId}" is not provided by any installed pack — run: factory doctor` };
      }
      const st = s.stages[stageId];
      if (lateNotesBack(c, stageId)) {
        persist(c);
        if (s.status === "blocked") return { action: "halt", feature: s.feature, reason: s.halts.at(-1).reason };
        continue;
      }
      // Conditions are decided once, when the stage is first reached: a retry never skips a stage.
      const skip = !st.entered && ((stage.modes && !stage.modes.includes(s.mode)) || s.overrides?.[stageId] === "skip" || (s.overrides?.[stageId] !== "force" && !evalWhen(c, stage.when)));
      if (skip && st.status === "pending") {
        // A later feature skips discovery because the baseline exists; the inventory is still rebuilt.
        if (stageId === "discovery" && stage.when && !evalWhen(c, stage.when)) buildIndex(c.projectDir, c.config, c.packs);
        st.status = "skipped";
        nextStage(c);
        if (s.status === "done") {
          persist(c);
          return { action: "done", feature: s.feature, status: "done" };
        }
        continue;
      }
      if (stage.kind === "task_loop") {
        Object.assign(st, { status: "running", entered: true });
        const r = taskStep(c, stageId, stage, helpers);
        if (!r.advance) {
          if (r.action !== "dispatch") persist(c);
          return r;
        }
        st.status = "passed";
        nextStage(c);
        if (s.status === "done") {
          persist(c);
          return { action: "done", feature: s.feature, status: "done" };
        }
        continue;
      }
      if (st.diagnose_pending) {
        const target = engineTarget(c, "diagnostician");
        const d = makeDispatch(c, {
          stageId, stage: { ...stage, outputs: ["root-cause"], writes: [] }, target, phase: "diagnose", attempt: attemptNo(st), rung: 3,
          model: target.model, feedback: st.feedback, gate: null,
          mission: `Diagnose why stage "${stageId}" keeps failing. Write diagnosis/${stageId}.md: root cause, evidence, recommended fix, approaches already tried. Do not fix anything yourself.`,
        });
        return issue(c, [d]);
      }
      const maxDispatches = c.config.budgets?.stage?.dispatches_max_by_stage?.[stageId] ?? c.config.budgets?.stage?.dispatches_max;
      if (maxDispatches && (st.dispatches ?? 0) >= maxDispatches) {
        block(c, `stage "${stageId}" used its ${maxDispatches} dispatches`);
        persist(c);
        return { action: "halt", feature: s.feature, reason: s.halts.at(-1).reason };
      }
      const targets = resolveAgents(c, stage);
      const missingRolePack = enabledRoles(c.config).find((r) => !c.packs[r.pack]?.role);
      if (!targets.length && missingRolePack && (stage.agents ?? []).some((a) => a.startsWith("role:"))) {
        persist(c);
        return { action: "halt", feature: s.feature, reason: `role ${missingRolePack.name} is enabled but its pack "${missingRolePack.pack}" is not installed — run: factory doctor` };
      }
      if (!targets.length && (stage.agents ?? []).every((a) => a.startsWith("role:"))) {
        // A role-slot stage with no enabled role providing the slot: nothing to do.
        st.status = "skipped";
        st.reason = `no enabled role provides ${stage.agents.join(", ")}`;
        nextStage(c);
        if (s.status === "done") {
          persist(c);
          return { action: "done", feature: s.feature, status: "done" };
        }
        continue;
      }
      st.status = "running";
      st.entered = true;
      const missing = targets.filter((t) => !t.pack || !t.model);
      if (!targets.length || missing.length) {
        persist(c);
        return { action: "halt", feature: s.feature, reason: `stage "${stageId}" has unresolved agents: ${missing.map((t) => t.subagent_type).join(", ") || "none listed"}` };
      }
      const badModel = targets.find((t) => !MODELS.includes(t.model));
      if (badModel) {
        persist(c);
        return { action: "halt", feature: s.feature, reason: `${badModel.subagent_type} declares model "${badModel.model}"; use ${MODELS.join(", ")}` };
      }
      if (stage.before === "scaffold" && s.scaffold?.status !== "done") {
        // Greenfield: the role starters must exist first. Installing takes minutes, so it runs as its
        // own command outside the state lock rather than inside step.
        persist(c);
        return { action: "scaffold", feature: s.feature, stage: stageId, command: "factory scaffold", reason: s.scaffold?.status === "running" ? "a scaffold started earlier did not finish; run it again (it resumes)" : "copy and install each role's boilerplate first" };
      }
      if ((stage.inputs ?? []).some((ref) => ref.replace(/\?$/, "") === "change-set")) writeChangeSet(c);
      if (stage.precheck && !st.done_agents?.length) {
        // Machine checks first (stepAsync runs them outside the lock): failing code skips the reviewers.
        const tree = treeHash(projectDir);
        if (tree && st.precheck?.tree !== tree) {
          persist(c);
          return { action: "precheck", feature: s.feature, stage: stageId, gate: stage.precheck };
        }
      }
      if (!st.done_agents?.length) st.findings = [];
      const done = new Set(st.done_agents ?? []);
      const todo = targets.filter((t) => !done.has(doneKey(t)));
      const batch = stage.parallel ? todo : todo.slice(0, 1);
      const rootCause = join(c.feature.dir, "diagnosis", `${stageId}.md`);
      const dispatches = batch.map((target) =>
        makeDispatch(c, {
          stageId, stage, target, phase: "stage", attempt: attemptNo(st) + 1, rung: st.rung ?? 0,
          laterAgents: stage.parallel ? [] : todo.slice(1).map((t) => t.agent),
          model: st.model ?? target.model, feedback: st.feedback, instruction: st.instruction,
          extraReads: (st.rung ?? 0) >= 3 && existsSync(rootCause) ? [{ label: "Root cause", path: toPosix(relative(projectDir, rootCause)) }] : [],
        }),
      );
      return issue(c, dispatches);
    }
    persist(c);
    return { action: "halt", feature: s.feature, reason: "no runnable stage found" };
  });
}

/**
 * Precondition (Suggestions/09, adapted: the factory works in one checkout and commits at delivery, so
 * the tree is dirty by design): nothing outside .factory/ may change between the end of one engine
 * action and the next dispatch. The engine stores the file states after every record, precheck and
 * scaffold; a difference means a person or a stray tool edited the tree. policy.unexpected_changes: off
 * disables it.
 */
const treeSnapshotFile = (c) => join(factoryPaths(c.projectDir).root, "logs", `tree-${c.feature.state.feature}.json`);
function unexpectedChanges(c) {
  if (c.config.policy?.unexpected_changes === "off" || !existsSync(treeSnapshotFile(c))) return [];
  return changedSince(readJson(treeSnapshotFile(c), null), fileStates(c.projectDir));
}
/** For `factory ship` run by hand: the engine's own commit is the new baseline. */
export const writeTreeSnapshot = (projectDir, c) => snapshotTree(projectDir, c.feature.state.feature);
function snapshotTree(projectDir, feature) {
  const c = load(projectDir, feature);
  const states = fileStates(projectDir);
  if (states) writeJson(treeSnapshotFile(c), states);
}

/** `factory accept-changes`: the human keeps edits made outside the factory; the next step goes on. */
export function acceptChanges(projectDir, { feature } = {}) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const changed = unexpectedChanges(c);
    snapshotTree(projectDir, c.feature.state.feature);
    appendEvent(projectDir, { type: "human", feature: c.feature.state.feature, stage: c.feature.state.stage, gate: "accept-changes", result: "approved", files: changed.length });
    return { feature: c.feature.state.feature, accepted: changed };
  });
}

/**
 * `factory step` for the CLI and the runners: a stage with a precheck gate (verification: the whole
 * suite, typecheck, lint, build) runs it first, outside the state lock, so failing code goes back to
 * implementation without dispatching the reviewers. Then the ordinary step.
 */
export async function stepAsync(projectDir, opts = {}) {
  for (let i = 0; i < 6; i++) {
    const r = step(projectDir, opts);
    if (r.action !== "precheck") return r;
    await precheck(projectDir, { ...opts, feature: r.feature });
  }
  return step(projectDir, opts);
}

/** Runs the current stage's precheck gate and records it; fix: true failures go to the fix loop. */
async function precheck(projectDir, { feature } = {}) {
  const c = load(projectDir, feature);
  const s = c.feature.state;
  const stageId = s.stage;
  const stage = resolveStage(c, stageId);
  if (!stage?.precheck || !treeHash(projectDir)) return;
  withLock(projectDir, () => restoreAcceptance(load(projectDir, feature))); // a drifted holdout is put back first
  const ctx = gateContext({ projectDir, app: c.app, feature: c.feature, config: c.config, stage, packs: c.packs });
  const result = await runGate(stage.precheck, ctx);
  // The tree after the run: files the checks themselves write must not ask for another precheck.
  const tree = treeHash(projectDir);
  withLock(projectDir, () => {
    const cur = load(projectDir, feature);
    const s2 = cur.feature.state;
    if (s2.stage !== stageId || s2.pending.length) return;
    s2.stages[stageId].precheck = { tree, pass: result.pass, fingerprint: result.fingerprint };
    appendEvent(projectDir, { type: "gate", feature: s2.feature, stage: stageId, gate: result.gate, pass: result.pass, progress_signal: result.progress_signal, fingerprint: result.fingerprint, cached: result.cached, precheck: true });
    const fix = /^fix:(.+)$/.exec(stage.on_fail ?? "")?.[1];
    const fixable = result.failures.filter((f) => f.fix);
    if (fix && fixable.length) requestFixes(cur, stageId, fix, fixable);
    persist(cur);
    snapshotTree(projectDir, feature);
  });
}

/** Pulls the envelope out of an agent's final message: a bare JSON object or the last ```json block. */
export function parseEnvelope(text) {
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const blocks = [...trimmed.matchAll(/```json\s*\n([\s\S]*?)```/g)];
    if (!blocks.length) throw new UsageError("no JSON envelope found in the agent's reply");
    return JSON.parse(blocks.at(-1)[1]);
  }
}

export function checkEnvelope(envelope, { packId, maxWords = 200 } = {}) {
  const errors = validate("envelope", envelope);
  if (packId && envelope?.pack_id !== packId) errors.push(`pack_id is "${envelope?.pack_id}", expected "${packId}"`);
  const words = String(envelope?.summary ?? "").split(/\s+/).filter(Boolean).length;
  if (words > maxWords) errors.push(`summary has ${words} words (max ${maxWords})`);
  return errors;
}

const formatFeedback = (result) =>
  [`Previous gate ${result.gate}: ${result.failures.length} failure(s) · progress signal ${result.progress_signal} · fingerprint ${result.fingerprint}`,
    ...result.failures.slice(0, 20).map((f) => `- ${f.warn ? "(warning) " : ""}[${f.check}${f.rule ? `/${f.rule}` : ""}] ${f.file ? `${f.file}: ` : ""}${f.message}`),
    ...(result.failures.length > 20 ? [`- … ${result.failures.length - 20} more in gate-log.jsonl`] : [])].join("\n");

/** Puts locked acceptance tests back as they were at gate-acceptance; returns the files it restored. */
function restoreAcceptance(c) {
  const restored = [];
  for (const [f, hash] of Object.entries(c.feature.state.acceptance_lock ?? {})) {
    if (c.feature.state.relock?.file === f) continue; // being rewritten by a human-requested relock
    const copy = join(c.feature.dir, "acceptance-lock", `${f}.snapshot`);
    if (fileHash(join(c.projectDir, f)) === hash || !existsSync(copy)) continue;
    mkdirSync(dirname(join(c.projectDir, f)), { recursive: true });
    copyFileSync(copy, join(c.projectDir, f));
    restored.push(f);
  }
  if (restored.length) appendEvent(c.projectDir, { type: "advance", feature: c.feature.state.feature, stage: c.feature.state.stage, restored_acceptance: restored });
  return restored;
}

/**
 * Records one agent result. When nothing of the batch is left pending and the feature can go on, the
 * result carries `next`: the following step, so the Conductor does not call `step` itself.
 */
export async function record(projectDir, opts) {
  // Decided under the lock: of two records running at once, only the one that empties the batch steps on.
  const batch = { emptied: false };
  const result = await recordOne(projectDir, opts, batch);
  if (result.action === "continue" && batch.emptied) return { ...result, next: await stepAsync(projectDir, { feature: opts.feature }) };
  // Autopilot resolves the gate this envelope just reached: report what actually happens next
  // (a dispatch, or done), keeping this envelope's own verdict/reason/gate as context.
  if (result.action === "ask_human" && autopilotApplies(projectDir, opts.feature)) return { ...result, ...(await stepAsync(projectDir, { feature: opts.feature })) };
  return result;
}

/**
 * automation.autopilot never resolves a CLARIFY stop — there is no safe default answer to invent — and never a
 * gate a human rejected earlier: the revision that comes back to it (the reopened GATE-A included) waits for the
 * human who asked for it.
 */
function autopilotMayApprove(c, g) {
  return Boolean(c.config.automation?.autopilot && g.gate !== "CLARIFY" && c.feature.state.gates?.[g.gate]?.result !== "rejected");
}

function autopilotApplies(projectDir, feature) {
  const c = load(projectDir, feature);
  const g = c.feature.state.awaiting_human;
  return Boolean(g && autopilotMayApprove(c, g));
}

async function recordOne(projectDir, { dispatchId, envelopeText, tokens = 0, feature }, batch = {}) {
  if (envelopeText == null) {
    const saved = dispatchId ? savedEnvelopeFile(projectDir, dispatchId) : null;
    if (!saved || !existsSync(saved)) throw new UsageError(`no saved envelope for ${dispatchId ?? "(no --dispatch)"} — pass the agent's envelope on stdin instead`);
    envelopeText = readText(saved);
  }
  let parsed;
  let parseError = null;
  try {
    parsed = parseEnvelope(envelopeText);
  } catch (error) {
    parseError = error.message;
  }
  const c = load(projectDir, feature);
  const s = c.feature.state;
  const id = dispatchId ?? parsed?.pack_id;
  const pending = s.pending.find((d) => d.id === id);
  if (!pending) throw new UsageError(parseError ? `${parseError}, and no --dispatch id was given` : `no pending dispatch ${id}`);
  const errors = parseError ? [parseError] : checkEnvelope(parsed, { packId: pending.id, maxWords: c.config.context?.return_summary_max_words });
  if (errors.length) {
    return { action: "redispatch", reason: `invalid envelope: ${errors.join("; ")}`, dispatch: { ...pending, prompt: promptFor(pending, projectDir) } };
  }
  const skillsVerdict = skillsCheck(projectDir, feature, pending, parsed);
  if (skillsVerdict) return skillsVerdict;
  restoreAcceptance(c);
  // Task gates run real tests, typecheck and builds: run them before taking the state lock.
  const taskResult = pending.task ? await taskGate(c, pending, parsed) : null;

  // What the agent left (and the engine wrote: restored snapshots, commits) is the new baseline for the
  // "no unexpected changes" check — taken inside the same lock, after the gates.
  return withLock(projectDir, async () => {
    const out = await recordLocked(projectDir, feature, pending, parsed, tokens, batch, taskResult);
    snapshotTree(projectDir, feature);
    return out;
  });
}

/** A pack's skills_required (stack skills for the task type); empty for packs that name none. */
const requiredSkills = (projectDir, pending) => {
  try {
    return readFrontMatter(join(projectDir, pending.pack)).data.skills_required ?? [];
  } catch {
    return [];
  }
};
const SKILL_RETRIES = 2;

/**
 * Stack skills are loaded by the agent, and it says so (envelope.skills_loaded). A `blocked` envelope
 * that says skills are unavailable halts the feature naming them (retrying cannot help); a `done` one
 * that skipped a required skill is sent back with the reason, twice, then the feature halts.
 */
function skillsCheck(projectDir, feature, pending, envelope) {
  const required = requiredSkills(projectDir, pending);
  const asked = (envelope.open_questions ?? []).find((q) => /skills unavailable/i.test(q));
  let names = null;
  let why = null;
  if (envelope.status === "blocked" && asked) {
    names = asked.replace(/^.*skills unavailable:?/i, "").split(/[,\s]+/).map((n) => n.trim().replace(/[.;]$/, "")).filter(Boolean);
    if (!names.length) names = required;
    why = `${pending.agent} cannot load its stack skills: ${names.join(", ")} (skills unavailable) — install the plugin or give the agent the Skill tool, then run: factory resume`;
  } else if (envelope.status === "done" && required.length) {
    const missing = missingSkills(required, envelope.skills_loaded ?? []);
    if (!missing.length) return null;
    const counter = tokensCountedFile(projectDir, pending.id).replace(/\.tokens$/, ".skillretry");
    const used = existsSync(counter) ? Number(readFileSync(counter, "utf8")) || 0 : 0;
    if (used < SKILL_RETRIES) {
      writeFileSync(counter, String(used + 1));
      return {
        action: "redispatch",
        reason: `required skills not loaded: ${missing.join(", ")} — call the Skill tool for each first, redo the work with them, and list them in the envelope's skills_loaded`,
        dispatch: { ...pending, prompt: promptFor(pending, projectDir) },
      };
    }
    names = missing;
    why = `${pending.agent} returned done ${SKILL_RETRIES + 1} times without loading skills: ${missing.join(", ")}`;
  }
  if (!why) return null;
  return withLock(projectDir, () => {
    const cur = load(projectDir, feature);
    cur.feature.state.pending = cur.feature.state.pending.filter((d) => d.id !== pending.id);
    clearActive(projectDir, pending.id);
    writeJson(join(cur.feature.dir, "envelopes", `${pending.id.split("/").slice(1).join(".")}.json`), envelope);
    block(cur, `skills unavailable: ${names.join(", ")} — ${why}`);
    persist(cur);
    return { action: "halt", feature: cur.feature.state.feature, reason: cur.feature.state.halts.at(-1).reason, skills: names };
  });
}

async function recordLocked(projectDir, feature, pending, parsed, tokens, batch, taskResult) {
  const cur = load(projectDir, feature);
  const st8 = cur.feature.state;
  st8.pending = st8.pending.filter((d) => d.id !== pending.id);
  batch.emptied = st8.pending.length === 0;
  // Tokens the SubagentStop hook already counted from the real usage win over --tokens (never both).
  const counted = tokensCountedFile(projectDir, pending.id);
  const hookTokens = existsSync(counted) ? Number(readFileSync(counted, "utf8").split("|").at(-1)) || 0 : 0;
  if (hookTokens) tokens = hookTokens;
  else st8.budgets.tokens += Number(tokens) || 0;
  clearActive(projectDir, pending.id);
  writeJson(join(cur.feature.dir, "envelopes", `${pending.id.split("/").slice(1).join(".")}.json`), parsed);
  const allow = readFrontMatter(join(projectDir, pending.pack)).data.write_allow ?? [];
  const outside = (parsed.artifacts_written ?? []).filter((p) => !matchesAny(toPosix(isAbsolute(p) ? relative(projectDir, p) : p), allow));
  appendEvent(projectDir, {
    type: "envelope", feature: st8.feature, stage: pending.stage, agent: pending.agent, status: parsed.status, tokens: Number(tokens) || 0,
    ...(outside.length ? { claimed_outside_allowlist: outside } : {}),
  });

  if (pending.phase === "digest") return finishDigest(cur, parsed);
  if (pending.phase === "relock") return finishRelock(cur, pending, parsed);
  if (pending.phase === "early_review") return finishEarlyReview(cur, pending, parsed, helpers);
  if (pending.task || pending.phase === "fixplan") return finishTask(cur, pending, parsed, helpers, taskResult);
  if (pending.stage !== st8.stage) {
    persist(cur);
    return { action: "continue", feature: st8.feature, note: `ignored a late envelope from stage "${pending.stage}"; the feature is at "${st8.stage}"` };
  }
  if (pending.phase === "diagnose") {
    keepFirstDiagnosis(cur.feature.dir, pending.stage);
    const st = st8.stages[pending.stage];
    st.diagnose_pending = false;
    st.status = "pending";
    st.done_agents = [];
    persist(cur);
    return { action: "continue", feature: st8.feature, note: "diagnosis recorded; the stage is re-dispatched with root-cause.md" };
  }
  return finishStageAgent(cur, pending, parsed);
}

/**
 * The first root cause of a stage stays at the top of diagnosis/<stage>.md: a later diagnosis (often one
 * that only reports a used-up budget) is appended under it, never written over it.
 */
export function keepFirstDiagnosis(featureDir, stageId) {
  const file = join(featureDir, "diagnosis", `${stageId}.md`);
  const first = join(featureDir, "diagnosis", `.${stageId}.first`);
  if (!existsSync(file)) return;
  const current = readText(file);
  if (!existsSync(first)) return writeAtomic(first, current);
  const kept = readText(first).trimEnd();
  if (!current.startsWith(kept)) writeAtomic(file, `${kept}\n\n---\n## Later diagnosis (${now()})\n\n${current.trim()}\n`);
}

async function finishDigest(c, envelope) {
  const s = c.feature.state;
  const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config });
  const result = await runGate("digest", ctx, { useCache: false });
  appendEvent(c.projectDir, { type: "digest", feature: s.feature, pass: result.pass, failures: result.failures.length });
  if (result.pass && envelope.status === "done") {
    s.digest = null;
  } else {
    s.digest.attempts = (s.digest.attempts ?? 0) + 1;
    s.digest.feedback = envelope.status === "done" ? formatFeedback(result) : `The curator returned "${envelope.status}": ${envelope.summary}`;
    if (s.digest.attempts >= 2) block(c, `digest after "${s.digest.after}" keeps dropping tracked IDs`);
  }
  persist(c);
  return { action: "continue", feature: s.feature, gate: summary(result) };
}

/** What gate-plan enforces, from the config and the role packs — the planner must not have to guess. */
function planRules(c) {
  const tdd = c.config.quality?.tdd ?? {};
  const lim = c.config.quality?.task_limits ?? {};
  return [
    ...enabledRoles(c.config).map((role) => {
      const r = c.packs[role.pack]?.role;
      const wider = Object.entries(r?.budgets?.task_limits ?? {}).map(([t, v]) => `${t} up to ${v.files_max} files`).join(", ");
      return `role ${role.name}${role.path ? ` (folder ${role.path})` : ""}: files only in ${(role.owns_paths ?? []).join(", ")}; task types ${(r?.task_types ?? []).join(", ")}${wider ? `; ${wider}` : ""}`;
    }),
    `one task = one vertical slice (an FSD slice or one component folder, or one endpoint with its schema, service and repository) of one story, 3–8 ACs: at most ${lim.files_max} files_expected and ${lim.loc_max} estimated LOC (size.est_loc is required), unless the role sets a cap per type; the whole plan has at most ${c.config.quality?.tasks_max ?? 10} tasks (too-many-tasks); set \`slice\` and list the slice folder in \`write_scope\` (a glob such as src/features/x/ui/panel/**: it counts as the files you list in files_expected, not as one)`,
    `plan lint: for a new unit the role's convention files (frontend component: styles.ts, index.ts, tests/<name>.test.tsx) are added to files_expected by the engine when you leave them out`,
    `a fix round amends the task that owns the slice (extend its definition_of_done and files); a new task only when no task owns the work`,
    `${tdd.author === "builder_two_phase" ? "one builder dispatch per test-first task writes the red tests, proves them with gate red, then implements" : "a test author writes the red tests, then the builder implements"}; a red test file may extend an existing test file of the task's own write_scope/slice`,
    `test-first for every type except ${(tdd.exempt_types ?? []).join(", ")}; an exempt task satisfies no AC unless it is ${(tdd.exempt_may_satisfy ?? ["migration", "eval"]).join(" or ")}`,
    "every test-first task has a unit, component or integration case naming it; a case's AC (when it has one) is one its task satisfies",
    "change requests: a task touching a file the delta-spec modifies depends on a characterisation task; a removed REQ needs a task with removes: [REQ-…]",
    "a new API operation (x-factory.owner_role enabled, not status: existing) is listed in contract_ops of a task of that role",
  ];
}

/** Stack lines for packs: each enabled role, its stack pack and that stack's reference architecture. */
function stackLines(c) {
  return enabledRoles(c.config).map((role) => {
    const stack = c.packs[role.stack]?.stack;
    return `${role.name}: ${role.stack}${stack?.reference_architecture ? ` — ${stack.reference_architecture}` : " (stack pack not installed)"}`;
  });
}

/** Keeps the app's ID counters ahead of every ID agents have written, then returns the next free ones. */
function nextFreeIds(c) {
  const dirs = { factoryRoot: factoryPaths(c.projectDir).root, featureDir: c.feature.dir, projectDir: c.projectDir };
  for (const type of Object.keys(ARTIFACT_TYPES).filter((t) => !ARTIFACT_TYPES[t].external)) {
    for (const file of artifactFiles(type, dirs)) for (const id of extractIds(readText(file))) observeId(c.app.next_ids, id);
  }
  for (const f of Object.values(c.app.features)) {
    const notes = join(factoryPaths(c.projectDir).root, f.dir, "human-notes.yaml");
    if (existsSync(notes)) for (const id of extractIds(readText(notes))) observeId(c.app.next_ids, id);
  }
  return ["SRC", "REQ", "AC", "NFR", "STORY", "TASK", "TEST", "OQ", "ADR"].map((k) => formatId(k, c.app.next_ids[k] ?? 1));
}

/** Every ID that exists in the feature's artifacts (targets a note may be mapped to). */
function featureIds(c) {
  const dirs = { factoryRoot: factoryPaths(c.projectDir).root, featureDir: c.feature.dir, projectDir: c.projectDir };
  const text = Object.keys(ARTIFACT_TYPES)
    .filter((t) => ARTIFACT_TYPES[t].scope === "feature" && t !== "human-notes")
    .flatMap((t) => artifactFiles(t, dirs).map(readText))
    .join("\n");
  return new Set(extractIds(text));
}

const summary = (r) => ({ gate: r.gate, pass: r.pass, progress_signal: r.progress_signal, fingerprint: r.fingerprint, failures: r.failures.slice(0, 10) });

async function finishStageAgent(c, pending, envelope) {
  const s = c.feature.state;
  const stageId = pending.stage;
  const stage = resolveStage(c, stageId);
  const st = s.stages[stageId];
  const key = doneKey({ agent: pending.agent, role: resolveAgents(c, stage).find((t) => t.agent === pending.agent)?.role, screen: pending.screen });
  st.done_agents = [...new Set([...(st.done_agents ?? []), key])];

  if (envelope.notes_mapped?.length) {
    const mapping = applyMappings(c.feature.dir, envelope.notes_mapped, featureIds(c));
    appendEvent(c.projectDir, { type: "note", feature: s.feature, stage: stageId, mapped: mapping.applied, ignored: mapping.ignored });
  }
  if (envelope.findings?.length) {
    st.findings = [...(st.findings ?? []), ...envelope.findings.map((f) => ({ ...f, id: f.id ?? nextId(c.app.next_ids, "RV"), agent: pending.agent }))];
  }
  let result = null;
  if (envelope.status === "done") {
    const remaining = resolveAgents(c, stage).filter((t) => !st.done_agents.includes(doneKey(t)));
    if (remaining.length || s.pending.some((d) => d.stage === stageId)) {
      persist(c);
      return { action: "continue", feature: s.feature, waiting_for: remaining.map((t) => t.subagent_type) };
    }
    if (stage.audits === "roles") {
      // Role audits are scripts, not agents: their findings join the reviewers' in review.md.
      const set = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }).load("change-set")?.data;
      const changed = set?.changed ?? (set?.tasks ?? []).flatMap((t) => t.files ?? []);
      const artifact = (type) => (ARTIFACT_TYPES[type] ? artifactFiles(type, { factoryRoot: factoryPaths(c.projectDir).root, featureDir: c.feature.dir, projectDir: c.projectDir })[0] ?? null : null);
      st.findings = [...(st.findings ?? []), ...runAudits(c, changed, artifact).map((f) => ({ ...f, id: nextId(c.app.next_ids, "RV") }))];
    }
    if ((stage.outputs ?? []).includes("review")) writeReview(c, st);
    const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config, stage, packs: c.packs });
    const gateList = [stage.gate].flat().filter(Boolean);
    const results = [];
    for (const name of gateList) results.push(await runGate(name, ctx));
    const gated = results.length === 1 ? results[0] : normaliseResult(gateList.join("+") || "none", results.flatMap((r) => r.failures), results.map((r) => r.input_hash).join(""));
    const coverage = stage.tracked_ids?.length ? idCoverage(ctx, { inputs: stage.inputs, outputs: stage.outputs, kinds: stage.tracked_ids }) : [];
    result = coverage.length ? normaliseResult(gated.gate, [...gated.failures, ...coverage], gated.input_hash) : gated;
    appendEvent(c.projectDir, { type: "gate", feature: s.feature, stage: stageId, gate: result.gate, pass: result.pass, progress_signal: result.progress_signal, fingerprint: result.fingerprint, cached: result.cached });
  }
  if (result && !result.pass) {
    const conflicts = conflictRound(c, stageId, st, result);
    if (conflicts.ask) {
      persist(c);
      return { action: "ask_human", feature: s.feature, verdict: "ask_human", reason: conflicts.reason, gate: summary(result) };
    }
    result = conflicts.result;
    const round = completenessRound(c, stageId, st, result);
    if (round.ask) {
      persist(c);
      return { action: "ask_human", feature: s.feature, verdict: "ask_human", reason: round.reason, gate: summary(result) };
    }
    result = round.result;
  }
  st.attempts = (st.attempts ?? 0) + 1;
  const reasoning = MODELS.includes(c.config.model_tiers?.reasoning) ? c.config.model_tiers.reasoning : "opus";
  const verdict = decide(st, result, { envelope, attemptsMax: c.config.budgets?.stage?.attempts_max, isTask: false, tiers: { reasoning } });
  Object.assign(st, verdict.unit, { last_gate: result ? summary(result) : null });
  appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: stageId, agent: pending.agent, attempt: st.attempts, verdict: verdict.verdict, rung: verdict.rung, reason: verdict.reason });
  applyVerdict(c, stageId, stage, verdict, result, envelope);
  persist(c);
  return { action: s.status === "awaiting_human" ? "ask_human" : s.status === "blocked" ? "halt" : s.status === "done" ? "done" : "continue", feature: s.feature, verdict: verdict.verdict, reason: verdict.reason, gate: result ? summary(result) : null };
}

/**
 * Source conflicts (completeness.yaml `conflicts`, checked by gate-spec): when the sources contradict each other
 * the human is asked ONCE, with every contradiction in one question and the user's own brief proposed as the winner.
 * The analyst then records each as resolved. A conflict still open after that round travels to GATE-A as a warning.
 */
function conflictRound(c, stageId, st, result) {
  const open = result.failures.filter((f) => !f.warn && f.check === "conflicts" && f.rule === "unresolved-conflict");
  if (!open.length) return { ask: false, result };
  const s = c.feature.state;
  if (!(st.conflict_rounds ?? 0)) {
    st.conflict_rounds = 1;
    st.prior_attempts = (st.prior_attempts ?? 0) + 1; // a new dispatch id; the round still costs no attempt
    st.status = "pending";
    st.done_agents = [];
    st.feedback = `${open.length} source conflict(s) were put to the human. Record each in completeness.yaml conflicts as status resolved with the human's resolution (or the default winner when the answer is "approve"), and write the spec by it.`;
    const question = `The sources contradict each other on ${open.length} point(s):\n${open.map((f, i) => `${i + 1}. ${f.message}`).join("\n")}\nApprove to take every proposed winner (the user's own brief), or answer with the winner for each point.`;
    s.status = "awaiting_human";
    s.awaiting_human = { gate: "CLARIFY", stage: stageId, since: now(), reason: `${open.length} contradiction(s) between the sources — one question before the requirements are approved`, questions: [question] };
    pauseClock(s);
    appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: stageId, verdict: "ask_human", reason: "source conflicts", conflicts: open.length });
    return { ask: true, reason: s.awaiting_human.reason };
  }
  st.conflict_note = `${open.length} source conflict(s) still open after the question round: ${open.map((f) => f.message).join(" | ")}`;
  return { ask: false, result: normaliseResult(result.gate, result.failures.map((f) => (open.includes(f) ? { ...f, warn: true } : f)), result.input_hash) };
}

/**
 * A low completeness score does not stop the pipeline. The gaps travel to GATE-A, on the readable
 * spec, for the human to accept or reject. A score that shares the gate with another failure still blocks.
 */
function completenessRound(c, stageId, st, result) {
  const low = result.failures.filter((f) => !f.warn && f.check === "completeness" && f.rule === "below-threshold");
  const other = result.failures.filter((f) => !f.warn && !low.includes(f));
  if (!low.length || other.length) return { ask: false, result };
  const summary = completenessSummary(gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }));
  const gaps = (summary?.gaps ?? []).map((g) => `${g.category} (${g.credit}): ${g.question}${g.recommended ? ` — recommended: ${g.recommended}` : ""}`);
  st.completeness_note = `completeness ${summary?.score ?? "?"}/100 (below ${c.config.quality?.completeness_min ?? 85}). ${gaps.join(" | ") || "see completeness.yaml"}`;
  return { ask: false, result: normaliseResult(result.gate, result.failures.map((f) => (low.includes(f) ? { ...f, warn: true } : f)), result.input_hash) };
}

function applyVerdict(c, stageId, stage, verdict, result, envelope) {
  const s = c.feature.state;
  const st = s.stages[stageId];
  switch (verdict.verdict) {
    case "advance": {
      st.status = "passed";
      if (stageId === "discovery") buildIndex(c.projectDir, c.config, c.packs);
      st.feedback = null;
      st.instruction = null;
      st.model = null;
      if ((c.config.pipeline?.digest_after ?? []).includes(stageId)) s.digest = { pending: true, after: stageId, attempts: 0 };
      if (stage.after_pass === "ship") {
        try {
          const shipped = ship(c);
          if (!shipped.pr.skipped && c.config.delivery?.dry_run === false && !shipped.pr.opened) {
            block(c, `${stageId}: committed on ${shipped.branch}, but the pull request was not opened — ${shipped.pr.failed ?? shipped.pr.reason ?? ""}\n${shipped.pr.output ?? ""}`.trim());
            return;
          }
          appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: stageId, shipped: shipped.branch, commits: shipped.commits.length, pr: shipped.pr.skipped ? "skipped" : shipped.pr.dry_run ? "dry-run" : shipped.pr.opened });
        } catch (error) {
          block(c, `${stageId}: shipping failed — ${error.message.split("\n")[0]}`);
          return;
        }
      }
      if (stage.after_pass === "lock_acceptance") {
        // Hash and keep a copy: a formatter or a stray edit later is undone before any gate runs.
        const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config });
        const files = featureAcceptance(ctx).files;
        s.acceptance_lock = Object.fromEntries(files.map((f) => [f, fileHash(join(c.projectDir, f))]));
        for (const f of files) {
          mkdirSync(dirname(join(c.feature.dir, "acceptance-lock", f)), { recursive: true });
          copyFileSync(join(c.projectDir, f), join(c.feature.dir, "acceptance-lock", `${f}.snapshot`));
        }
      }
      if (stage.after_pass === "triage_fixes") {
        const changes = (gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }).load("triage")?.data.comments ?? []).filter((x) => x.class === "change");
        archiveComments(c);
        if (changes.length) {
          const target = /^fix:(.+)$/.exec(stage.on_fail ?? "")?.[1] ?? "implementation";
          return requestFixes(c, stageId, target, changes.map((x) => ({ check: "pr-comment", rule: String(x.id), file: x.file, message: x.summary ?? "" })));
        }
      }
      if (stageId === "requirements" || stageId === "requirements-lite") {
        writeSpecView(c);
        if (resizeAfterRequirements(c)) return;
      }
      if ((stage.outputs ?? []).includes("tasks")) raiseBudgetsFromPlan(c, loadTasks(c)?.tasks?.length ?? 0);
      if (stage.human_gate && stage.human_gate !== "GATE-C" && (c.config.pipeline?.skip_gates?.[s.profile] ?? []).includes(stage.human_gate)) {
        // The profile does not ask this gate. GATE-C always asks: the built feature is reviewed before the commit.
        s.gates[stage.human_gate] = { result: "approved", by: `profile:${s.profile}`, auto: true, at: now() };
        appendEvent(c.projectDir, { type: "human", feature: s.feature, stage: stageId, gate: stage.human_gate, result: "approved", by: `profile:${s.profile}`, auto: true });
        nextStage(c);
      } else if (stage.human_gate) {
        s.status = "awaiting_human";
        const note = [st.completeness_note, st.conflict_note].filter(Boolean).join(" — ");
        s.awaiting_human = { gate: stage.human_gate, stage: stageId, since: now(), ...(note ? { reason: note } : {}) };
        delete st.completeness_note;
        delete st.conflict_note;
        pauseClock(s);
        // automation.autopilot resolves this (see step() and record()) once any pending digest for
        // this same stage has run — not here, or the digest after this stage would be skipped.
      } else nextStage(c);
      return;
    }
    case "retry":
    case "diagnose": {
      st.done_agents = [];
      st.feedback = result ? formatFeedback(result) : `Previous attempt returned status "${envelope.status}": ${envelope.summary}`;
      st.instruction = verdict.instruction ?? null;
      st.model = verdict.model ?? null;
      st.diagnose_pending = verdict.verdict === "diagnose";
      if (stage.on_fail === "block") {
        st.status = "blocked";
        block(c, `${stageId}: gate failed and the stage is configured on_fail: block`);
        return;
      }
      const goto = /^goto:(.+)$/.exec(stage.on_fail ?? "")?.[1];
      const fix = /^fix:(.+)$/.exec(stage.on_fail ?? "")?.[1];
      st.findings = [];
      // Only a real gate failure sends the feature back; transient or envelope-only failures retry in place.
      if (goto && verdict.verdict === "retry" && result && !result.pass) return regress(c, stageId, goto, st.feedback);
      // Only code problems (failures a gate marks fix: true) go back to implementation; a malformed or
      // missing output of this stage's own agents is retried here.
      const fixable = (result?.failures ?? []).filter((f) => f.fix);
      if (fix && verdict.verdict === "retry" && fixable.length) return requestFixes(c, stageId, fix, fixable);
      st.status = "pending";
      return;
    }
    case "split":
    case "block":
      st.status = "blocked";
      block(c, `${stageId}: ${verdict.reason}`);
      return;
    case "ask_human":
      st.status = "pending";
      st.done_agents = [];
      s.status = "awaiting_human";
      s.awaiting_human = { gate: "CLARIFY", stage: stageId, since: now(), reason: verdict.reason, questions: envelope.open_questions ?? [] };
      pauseClock(s);
      return;
  }
}

/** Writes 06-verify/review.md from the reviewers' findings and the role audits'. */
function writeReview(c, st) {
  const s = c.feature.state;
  const findings = st.findings ?? [];
  const front = { feature: s.feature, round: (st.attempts ?? 0) + 1, findings };
  const waived = readWaivers(c.feature.dir);
  const waivedSection = waived.length ? `\n## Waived acceptance tests (accepted as failing by a human)\n\n${waived.map((w) => `- \`${w.test}\` — ${w.reason} (${w.approved_by}, ${w.approved_at})`).join("\n")}\n` : "";
  const lines = findings.map((f) => `- **${f.id} ${f.severity}** (${f.lens ?? "audit"}, ${f.agent}) ${f.file ? `\`${f.file}${f.line ? `:${f.line}` : ""}\` ` : ""}— ${f.claim}`);
  writeAtomic(join(c.feature.dir, "06-verify", "review.md"), `---\n${YAML.stringify(front, { lineWidth: 0 })}---\n\n# Review — ${s.feature} round ${front.round}\n\n${lines.join("\n") || "No findings."}\n${waivedSection}`);
}

/** Writes 06-verify/change-set.yaml: the files each finished task changed (input for reviewers). */
function writeChangeSet(c) {
  const s = c.feature.state;
  const tasks = (loadTasks(c)?.tasks ?? []).filter((t) => s.tasks?.[t.id]?.status === "done");
  // What really changed (git), next to what was planned: reviewers judge the diff, not the plan.
  const tree = featureChanges(c.projectDir, s.baseline ?? {});
  const planned = new Set([...tasks.flatMap((t) => t.files_expected), ...(s.scaffold?.done ?? []).flatMap((d) => d.files ?? [])]);
  const docsOrAcceptance = /^(docs\/|CHANGELOG\.md$|README\.md$)|\.acceptance\.test\./;
  writeYaml(join(c.feature.dir, "06-verify", "change-set.yaml"), {
    feature: s.feature,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, satisfies: t.satisfies, files: t.files_expected })),
    ...(tree ? { changed: tree.changed, outside_plan: tree.changed.filter((f) => !planned.has(f) && !docsOrAcceptance.test(f)) } : {}),
    ...(s.scaffold?.done?.length ? { scaffold: s.scaffold.done.flatMap((d) => d.files ?? []) } : {}),
  });
  if (tree) writeAtomic(join(c.feature.dir, "06-verify", "change.diff"), tree.diff || "(no changes against the last commit)\n");
}

/**
 * The fix loop for verification, QA and PR review: the failures become fix items, the feature goes back
 * to `to` (the implementation stage), and the task loop has the planner add fix tasks for them first.
 */
function requestFixes(c, from, to, items) {
  const s = c.feature.state;
  if (!regress(c, from, to, `Fix items from ${from} — the planner adds fix tasks for them first.`)) return;
  s.fix_pending = {
    source: from,
    items: items.slice(0, 30).map((f) => ({ check: f.check, rule: f.rule ?? null, file: f.file ?? null, message: f.message })),
    attempts: 0,
  };
}

/** Moves fetched PR comments aside once triaged, so S9 runs again only when new comments arrive. */
function archiveComments(c) {
  const dir = join(c.feature.dir, "08-delivery");
  const file = join(dir, "comments.json");
  if (!existsSync(file)) return;
  let n = 1;
  while (existsSync(join(dir, `comments-handled-${n}.json`))) n++;
  renameSync(file, join(dir, `comments-handled-${n}.json`));
}

/**
 * Backward edge (on_fail: goto:/fix:): rewinds to an earlier stage, counted against the regression budget.
 * The stages in between start fresh — escalation, findings and conditions — so a fix round is judged on
 * its own; the edge budget is what stops a loop. Returns false when the feature blocked instead.
 */
function regress(c, from, to, feedback, { human = false } = {}) {
  const s = c.feature.state;
  const profile = profileStages(c.config, s.profile);
  if (!profile.includes(to)) {
    block(c, `${from}: the gate failed and on_fail sends it to "${to}", which is not in the "${s.profile}" profile`);
    return false;
  }
  const edge = `${from}_to_${to}`;
  const limit = c.config.budgets?.backward_edges?.[edge];
  if (human) {
    // A human's rejection is the human driving the loop, not a gate failing: it is counted on its own and never spends the edge or regression budgets.
    s.budgets.human_rejections = (s.budgets.human_rejections ?? 0) + 1;
  } else {
    s.budgets.edges = { ...(s.budgets.edges ?? {}), [edge]: (s.budgets.edges?.[edge] ?? 0) + 1 };
    if (limit !== undefined && s.budgets.edges[edge] > limit) {
      block(c, `backward edge ${edge} used more than ${limit} time(s)`);
      return false;
    }
    s.budgets.regressions += 1;
  }
  for (const id of profile.slice(profile.indexOf(to), profile.indexOf(from) + 1)) s.stages[id] = freshStage(s.stages[id]);
  s.stages[to].feedback = `Sent back from ${from}:\n${feedback}`;
  s.stage = to;
  appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: from, to, backward: true });
  return true;
}

/**
 * `factory scaffold`: the engine half of greenfield bootstrap. Copies and installs every role's
 * boilerplate outside the state lock (it can take minutes), then records the result; resumable.
 */
export function scaffold(projectDir, { feature } = {}) {
  const fid = withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (s.scaffold?.status === "done") return null;
    s.scaffold = { status: "running", at: now() };
    persist(c);
    return s.feature;
  });
  if (!fid) return { action: "continue", note: "already scaffolded" };
  const result = scaffoldRoles(load(projectDir, fid));
  return withLock(projectDir, () => {
    const c = load(projectDir, fid);
    const s = c.feature.state;
    if (result.error) {
      s.scaffold = { status: "failed", error: result.error, at: now() };
      block(c, `bootstrap: ${result.error}`);
    } else {
      s.scaffold = { status: "done", done: result.done, skipped: result.skipped, at: now() };
      if (result.done.length) buildIndex(projectDir, c.config, c.packs);
      if (s.status === "blocked") Object.assign(s, { status: "active" });
      appendEvent(projectDir, { type: "advance", feature: s.feature, stage: s.stage, scaffolded: result.done.map((d) => `${d.role} ← ${d.from}`) });
    }
    persist(c);
    snapshotTree(projectDir, s.feature); // the starter's files are the factory's own, not stray edits
    return { action: s.status === "blocked" ? "halt" : "continue", feature: s.feature, reason: result.error ?? null, scaffold: s.scaffold };
  });
}

/**
 * After requirements the real counts decide between the small and the standard profile (only a feature the engine
 * sized itself at intake, never an explicit --tier, patch or greenfield). The stages of the new profile are added.
 */
function resizeAfterRequirements(c) {
  // Returns true when the requirements stage must run again (a patch that grew: see below).
  const s = c.feature.state;
  if (!s.tier_auto || !["patch", "small", "standard"].includes(s.tier) || s.mode === "greenfield" || c.config.pipeline?.auto_tier === false) return;
  const spec = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }).spec();
  if (!spec) return;
  const size = sizeFromSpec({ reqs: spec.reqs.length, acs: spec.reqs.reduce((n, r) => n + (r.acs?.length ?? 0), 0) }, c.config.pipeline?.size_limits, { from: s.tier });
  if (size.tier === s.tier) return;
  const profile = profileFor(c.config, { mode: s.mode, tier: size.tier });
  const stages = c.config.pipeline?.profiles?.[profile];
  // The patch profile's requirements-lite wrote a delta-spec without the completeness score or GATE-A, and
  // planned too. A patch that grew runs the REQUIREMENTS stage on that spec (the analysis a bigger feature gets:
  // completeness scoring, the spec gate, GATE-A) before the stories stage, instead of counting the lite spec as passed.
  const grew = s.tier === "patch" && s.stage === "requirements-lite" && stages?.includes("requirements");
  if (!grew && !stages?.includes(s.stage)) return;
  appendEvent(c.projectDir, { type: "resize", feature: s.feature, from: s.tier, to: size.tier, profile, reason: size.reason });
  Object.assign(s, { tier: size.tier, profile, size: { ...(s.size ?? {}), tier: size.tier, reason: size.reason, metrics: size.metrics } });
  for (const id of stages) s.stages[id] ??= { status: "pending", attempts: 0, rung: 0 };
  if (grew) {
    s.stages.requirements = { ...freshStage(s.stages.requirements), feedback: `The patch grew to "${size.tier}" (${size.reason}). The delta-spec is written; complete the analysis a ${size.tier} feature gets: write completeness.yaml (score and gaps) for it and revise the spec where it is incomplete. Keep every ID.` };
    s.stage = "requirements";
    return true;
  }
  return false;
}

export function approve(projectDir, { gate, notes, feature, by, kind }) {
  return withLock(projectDir, () => approveGate(load(projectDir, feature), { gate, notes, by, kind }));
}

/**
 * How an answer to the "is this the customer's mockup?" question reads, per proposed reference (in the order asked):
 * true (confirm), false (decline) or null (unclear). Only an explicit affirmative confirms; a negation declines; a
 * per-item answer ("1 yes, 2 no" or "1: no") sets each one; anything else is unclear.
 */
export function readReferenceAnswer(text, count) {
  const t = String(text ?? "").toLowerCase().trim();
  const YES = "yes|y|yep|yeah|confirm(?:ed)?|use it|use them|approve(?:d)?|follow it|follow them|correct";
  const NO = "no|nope|nah|n|skip(?: it)?|ignore(?: it)?|decline(?:d)?|reject(?:ed)?|don'?t use it|do not use it";
  const perItem = [...t.matchAll(new RegExp(`(?:^|[\\s,;])(\\d{1,2})\\s*[:.)=-]?\\s*(${YES}|${NO})(?=$|[\\s,;.!])`, "g"))];
  if (perItem.length) {
    const out = Array(count).fill(null);
    for (const m of perItem) {
      const i = Number(m[1]) - 1;
      if (i >= 0 && i < count) out[i] = new RegExp(`^(?:${YES})$`).test(m[2]);
    }
    return out;
  }
  const negative = /\b(no|nope|nah|not|don'?t|do not|skip|ignore|reject|decline|outdated|never|without|wrong|stale)\b/.test(t);
  const affirmative = new RegExp(`^(?:${YES}|sure|ok(?:ay)?|that is it|that's it)\\b`).test(t);
  if (negative && affirmative) return Array(count).fill(null);
  if (negative) return Array(count).fill(false);
  if (affirmative) return Array(count).fill(true);
  return Array(count).fill(null);
}

/** Shared by a human's `approve` and automation.autopilot: the caller already holds the state lock. */
function approveGate(c, { gate, notes, by, kind }) {
  const s = c.feature.state;
  if (!s.awaiting_human) throw new UsageError(`${s.feature} is not waiting for a human gate`);
  const g = s.awaiting_human;
  if (gate && gate !== g.gate) throw new UsageError(`${s.feature} is waiting for ${g.gate}, not ${gate}`);
  // An answer to a question about defects names them, so the QA gate can match the waiver.
  const defs = g.gate === "CLARIFY" ? [...new Set((g.questions ?? []).join(" ").match(/\bDEF-\d+\b/g) ?? [])] : [];
  const text = notes && defs.length && !defs.every((d) => notes.includes(d)) ? `${notes} (answers ${defs.join(", ")})` : notes;
  // What a human says at a gate is about the product unless they say it only steers the run (--kind process): never guessed from the words.
  const note = text ? addNote(c.app, c.feature.dir, { text, at: g.gate, by, kind: kind ?? "product" }) : null;
  // CLARIFY about proposed mockups: only an explicit yes confirms; a no declines; anything unclear is asked once more.
  let askedAgain = null;
  let refAnswers = null;
  if (g.gate === "CLARIFY" && g.references) {
    refAnswers = readReferenceAnswer(notes, g.references.length);
    if (refAnswers.includes(null)) {
      if (!g.reasked) {
        const options = g.references.map((r, i) => `${i + 1}. ${r} — reply "${i + 1} yes" to follow it as the customer's mockup, or "${i + 1} no" to ignore it`);
        askedAgain = { ...g, since: now(), reasked: true, reason: `the answer was not a clear yes or no (${notes ? `"${String(notes).slice(0, 80)}"` : "no text"}); reply "yes" or "no" for all, or per item (for example "1 yes, 2 no")`, questions: options };
      } else refAnswers = refAnswers.map((a) => a === true); // still unclear after a second ask: not binding
    }
  }
  if (askedAgain) {
    s.status = "awaiting_human";
    s.awaiting_human = askedAgain;
    appendEvent(c.projectDir, { type: "human", feature: s.feature, stage: g.stage, gate: g.gate, result: "unclear", note: note?.id });
    persist(c);
    return { action: "ask_human", feature: s.feature, gate: g.gate, note: note?.id ?? null, ...(note ? { note_kind: note.kind } : {}), stage: s.stage, reasked: true };
  }
  const { history: earlier = [], ...prior } = s.gates[g.gate] ?? {};
  s.gates[g.gate] = { result: "approved", by: by ?? process.env.USER ?? "human", at: now(), notes: note ? [note.id] : [], ...(prior.result ? { history: [...earlier, prior] } : {}) };
  s.awaiting_human = null;
  s.status = "active";
  resumeClock(s);
  const st = s.stages[g.stage];
  if (g.gate === "CLARIFY" && g.task) {
    if (note) applyMappings(c.feature.dir, [{ id: note.id, to: [g.task] }], new Set([g.task]));
    s.tasks[g.task].feedback = `Human answer${note ? ` (${note.id})` : ""}: ${notes ?? "(no text) — proceed with the defaults you proposed"}`;
  } else if (g.gate === "CLARIFY" && g.references) {
    // The proposed mockups, one answer each: a "no" ignores them (a rescan will not propose them again).
    resolveProposed(c.projectDir, s.feature, { accept: (r) => refAnswers[g.references.indexOf(refKey(r))] === true });
  } else if (g.gate === "CLARIFY") {
    st.status = "pending";
    const answer = `Human answer${note ? ` (${note.id})` : ""}: ${notes ?? "(no text) — proceed with the defaults you proposed"}`;
    // A completeness or source-conflict round keeps its instruction (revise the spec and completeness.yaml) with the answer.
    st.feedback = (st.completeness_rounds && st.feedback?.includes("completeness")) || (st.conflict_rounds && st.feedback?.includes("source conflict")) ? `${st.feedback}\n${answer}` : answer;
  } else {
    st.status = "passed";
    nextStage(c);
  }
  const split = g.gate === "GATE-A" ? splitBacklog(c, g.stage) : [];
  appendEvent(c.projectDir, { type: "human", feature: s.feature, stage: g.stage, gate: g.gate, result: "approved", note: note?.id, by: s.gates[g.gate].by, ...(by === "autopilot" ? { auto: true, ...(g.gate === "GATE-B" ? { reason: "gate plan green" } : {}) } : {}) });
  persist(c);
  return { action: "continue", feature: s.feature, gate: g.gate, note: note?.id ?? null, ...(note ? { note_kind: note.kind } : {}), stage: s.stage, ...(split.length ? { backlog_features: split } : {}) };
}

/**
 * Greenfield: an approved PRD whose `backlog` lists several features becomes one feature per entry.
 * This feature keeps the first entry; the others start after requirements with GATE-A inherited.
 * The full approved PRD is kept as 01-requirements/prd-approved.md.
 */
function splitBacklog(c, gatedStage) {
  const s = c.feature.state;
  const prdFile = join(c.feature.dir, "01-requirements", "prd.md");
  if (!existsSync(prdFile)) return [];
  const { data, body } = readFrontMatter(prdFile);
  const backlog = data.backlog ?? [];
  if (backlog.length < 2) return [];
  writeAtomic(join(c.feature.dir, "01-requirements", "prd-approved.md"), readText(prdFile));
  const profile = profileStages(c.config, s.profile);
  // Children skip everything up to and including the gated stage; GATE-A is inherited.
  const inherited = profile.slice(0, profile.indexOf(gatedStage) + 1);
  const firstOwn = profile[profile.indexOf(gatedStage) + 1];
  const writePrd = (dir, featureId, entry) => {
    const subset = { ...data, feature: featureId, requirements: data.requirements.filter((r) => entry.requirements.includes(r.id)), backlog: [] };
    writeAtomic(join(dir, "01-requirements", "prd.md"), `---\n${YAML.stringify(subset, { lineWidth: 0 })}---\n${body}`);
  };
  const byTitle = { [backlog[0].title]: s.feature };
  const children = [];
  for (const entry of backlog.slice(1)) {
    const child = createFeature(c.projectDir, c.app, { title: entry.title, mode: s.mode, profile: s.profile, tier: s.tier, stages: profile });
    const cs = child.state;
    for (const id of inherited) cs.stages[id] = { status: "passed", attempts: 0, rung: 0, reason: `inherited from ${s.feature}` };
    if (firstOwn) cs.stage = firstOwn;
    else {
      cs.stage = gatedStage;
      cs.status = "done";
    }
    cs.parent = s.feature;
    cs.gates["GATE-A"] = { result: "approved", inherited_from: s.feature, at: now() };
    writePrd(child.dir, cs.feature, entry);
    byTitle[entry.title] = cs.feature;
    children.push({ child, entry });
  }
  // Human notes follow the requirements they carry, so no mapping points at an ID that moved away.
  const notes = readNotes(c.feature.dir);
  const idsOf = (entry) => new Set(data.requirements.filter((r) => entry.requirements.includes(r.id)).flatMap((r) => [r.id, ...r.acs.map((a) => a.id)]));
  const citedBy = (entry, noteId) => data.requirements.filter((r) => entry.requirements.includes(r.id) && r.sources.includes(noteId)).map((r) => r.id);
  const notesFor = (entry, isParent) =>
    notes.flatMap((n) => {
      const ids = idsOf(entry);
      const kept = n.mapped_to.filter((t) => (isParent && !/^(REQ|AC)-/.test(t)) || ids.has(t));
      const targets = [...new Set([...kept, ...citedBy(entry, n.id)])];
      if (targets.length) return [{ ...n, mapped_to: targets, status: ["done", "declined"].includes(n.status) ? n.status : "mapped" }];
      if (!isParent) return [];
      return [n.status === "mapped" ? { ...n, mapped_to: [], status: "done", reason: "carried by the features split off at GATE-A" } : n];
    });
  const digestAgain = (c.config.pipeline?.digest_after ?? []).includes(gatedStage) ? { pending: true, after: gatedStage, attempts: 0 } : null;
  for (const { child, entry } of children) {
    child.state.depends_on = (entry.depends_on ?? []).map((t) => byTitle[t]).filter(Boolean);
    const childNotes = notesFor(entry, false);
    if (childNotes.length) writeYaml(join(child.dir, "human-notes.yaml"), childNotes);
    if (child.state.status !== "done") child.state.digest = digestAgain;
    saveFeature(c.projectDir, c.app, child);
  }
  s.depends_on = (backlog[0].depends_on ?? []).map((t) => byTitle[t]).filter(Boolean);
  writePrd(c.feature.dir, s.feature, backlog[0]);
  if (notes.length) writeYaml(join(c.feature.dir, "human-notes.yaml"), notesFor(backlog[0], true));
  if (s.status !== "done") s.digest = digestAgain; // the digest written before GATE-A still lists the moved requirements
  c.app.active_feature = s.feature;
  appendEvent(c.projectDir, { type: "feature", feature: s.feature, split_into: children.map(({ child }) => child.state.feature) });
  return children.map(({ child }) => child.state.feature);
}

export function reject(projectDir, { gate, reason, feature, by, kind }) {
  if (!reason) throw new UsageError("reject needs a reason — it becomes an HD note the agents must address");
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (!s.awaiting_human) throw new UsageError(`${s.feature} is not waiting for a human gate`);
    const g = s.awaiting_human;
    if (gate && gate !== g.gate) throw new UsageError(`${s.feature} is waiting for ${g.gate}, not ${gate}`);
    // A note given at a gate is a product note (it is planned and mapped) unless the human says it only steers the run.
    const note = addNote(c.app, c.feature.dir, { text: reason, at: g.gate, by, kind: kind ?? "product" });
    s.gates[g.gate] = { result: "rejected", by: by ?? process.env.USER ?? "human", at: now(), notes: [note.id] };
    s.awaiting_human = null;
    s.status = "active";
    resumeClock(s);
    const st = s.stages[g.stage];
    const task = g.task ? loadTasks(c)?.tasks.find((t) => t.id === g.task) : null;
    const gateStage = resolveStage(c, g.stage);
    const fixTarget = g.gate === gateStage?.human_gate ? /^fix:(.+)$/.exec(gateStage?.on_reject ?? "")?.[1] : null;
    if (g.gate === "CLARIFY" && g.references) {
      // "Reject" the proposed mockups: they are declined for good (the index keeps them, so a rescan does not ask again).
      resolveProposed(c.projectDir, s.feature, { accept: false });
    } else if (!task && fixTarget) requestFixes(c, g.stage, fixTarget, [{ check: "human-review", rule: g.gate, message: `${note.id}: ${reason}` }]);
    else if (task) {
      applyMappings(c.feature.dir, [{ id: note.id, to: [task.id] }], new Set([task.id]));
      backToRed(c, task, s.tasks[task.id], `A human sent ${task.id} back to red (${note.id}): ${reason}`);
    } else {
      // Same-stage reject: the human is driving the loop, so it is counted and does not spend an edge budget.
      s.budgets.human_rejections = (s.budgets.human_rejections ?? 0) + 1;
      Object.assign(st, {
        status: "pending",
        done_agents: [],
        feedback: `Rejected at ${g.gate} by a human (${note.id}): ${reason}\nRevise your outputs to address it and map ${note.id} in your artifacts.`,
      });
    }
    appendEvent(projectDir, { type: "human", feature: s.feature, stage: g.stage, gate: g.gate, result: "rejected", note: note.id });
    persist(c);
    snapshotTree(projectDir, s.feature); // a task sent back to red had its sources restored by the engine
    return { action: "continue", feature: s.feature, gate: g.gate, note: note.id, note_kind: note.kind, stage: s.stage };
  });
}

export function note(projectDir, { text, feature, by, kind }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const n = addNote(c.app, c.feature.dir, { text, at: "note", by, kind });
    appendEvent(projectDir, { type: "note", feature: c.fid, note: n.id });
    saveAppState(projectDir, c.app);
    return { feature: c.fid, note: n };
  });
}

export function setOverride(projectDir, { feature, stage, value }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    s.overrides = { ...(s.overrides ?? {}), [stage]: value };
    if (value === undefined) delete s.overrides[stage];
    persist(c);
    return { feature: s.feature, overrides: s.overrides };
  });
}

function askHuman(c, { stage, task, reason, questions }) {
  const s = c.feature.state;
  const ask = { gate: "CLARIFY", stage, ...(task ? { task } : {}), since: now(), reason, questions };
  // Parallel role tracks: one human question at a time; a second one (or one while blocked) waits.
  if (s.status === "blocked" || s.awaiting_human) {
    s.queued_human = [...(s.queued_human ?? []), ask];
    return;
  }
  s.status = "awaiting_human";
  s.awaiting_human = ask;
  pauseClock(s);
}

const reasoningModel = (c) => (MODELS.includes(c.config.model_tiers?.reasoning) ? c.config.model_tiers.reasoning : "opus");

/** The conductor's internals the task loop (tasks.mjs) uses; passed in to avoid a circular import. */
const helpers = {
  makeDispatch, issue, block, persist, engineTarget, resolveAgents, resolveStage, agentModel, featureIds, summary, MODELS,
  formatFeedback: (r) => formatFeedback(r), reasoningModel, askHuman,
  writeChangeSet,
  raiseBudgets: (c) => raiseBudgetsFromPlan(c, loadTasks(c)?.tasks?.length ?? 0),
};

/** Files a human reviews at a stage's gate: the stage outputs that exist, plus its `review` list. */
export function reviewFiles(c, stageId) {
  const stage = resolveStage(c, stageId);
  const dirs = { factoryRoot: factoryPaths(c.projectDir).root, featureDir: c.feature.dir, projectDir: c.projectDir };
  const files = [...(stage?.outputs ?? []), ...(stage?.review ?? [])].flatMap((ref) =>
    parseArtifactRef(ref).names.flatMap((t) => artifactFiles(t, dirs).map((f) => toPosix(relative(c.projectDir, f)))),
  );
  // A gate merged into this one brings what it would have shown: the stages from there up to this one (requirements, stories).
  const profile = profileStages(c.config, c.feature.state.profile);
  const held = Object.values(c.feature.state.gates ?? {}).filter((g) => g.result === "merged" && g.into === stageId);
  const more = held.flatMap((g) => profile.slice(profile.indexOf(g.stage), profile.indexOf(stageId)).flatMap((id) => reviewFiles(c, id)));
  const listed = [...new Set([...more, ...files])];
  const showsSpec = [...(stage?.outputs ?? [])].some((ref) => parseArtifactRef(ref).names.some((n) => n === "prd" || n === "delta-spec"));
  const specRel = toPosix(relative(c.projectDir, join(c.feature.dir, "01-requirements", "spec.md")));
  const withSpec = showsSpec && existsSync(join(c.projectDir, specRel)) ? [specRel, ...listed.filter((f) => f !== specRel)] : listed;
  if (stage?.human_gate !== "GATE-C") return withSpec;
  const diffRel = toPosix(relative(c.projectDir, join(c.feature.dir, "06-verify", "change.diff")));
  return existsSync(join(c.projectDir, diffRel)) ? [diffRel, ...withSpec.filter((f) => f !== diffRel)] : withSpec;
}

/** Drops outstanding dispatches (and their hook scopes) before a human-driven jump. */
function clearPending(c) {
  for (const d of c.feature.state.pending) clearActive(c.projectDir, d.id);
  c.feature.state.pending = [];
}

const FRESH = { attempts: 0, rung: 0, dispatches: 0, precheck: null, progress_signal: [], fingerprints: [], state_hashes: [], feedback: null, instruction: null, model: null, diagnose_pending: false, done_agents: [], entered: false, findings: [] };

/** Dispatch ids count every attempt a stage ever had, so a fresh round never reuses an envelope's id. */
const attemptNo = (st) => (st.prior_attempts ?? 0) + (st.attempts ?? 0);
const freshStage = (st = {}) => ({ ...st, ...FRESH, prior_attempts: attemptNo(st), status: "pending" });

/** Human-requested re-run of an earlier stage: it and every later stage start fresh. */
export function replay(projectDir, { feature, stage, feedback }) {
  if (!feedback) throw new UsageError('usage: factory replay <stage> --with "<feedback>"');
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    const profile = profileStages(c.config, s.profile);
    if (!s.stages[stage] || !profile.includes(stage)) throw new UsageError(`unknown stage "${stage}" for ${s.feature}`);
    clearPending(c);
    const from = profile.indexOf(stage);
    const to = Math.max(profile.indexOf(s.stage), from);
    for (const id of profile.slice(from, to + 1)) s.stages[id] = freshStage(s.stages[id]);
    s.stages[stage].feedback = `Replay requested by a human: ${feedback}`;
    // Replaying the plan or the build rebuilds every task: done tasks would otherwise be skipped.
    // Replaying only the acceptance stage (between plan and build) keeps the tasks: it re-locks the tests.
    if (profile.indexOf(stage) <= profile.indexOf("planning") || stage === "implementation") s.tasks = {};
    if (stage === "acceptance") s.acceptance_lock = null;
    s.stages[stage].entered = true; // a replayed stage runs even when its condition would skip it
    Object.assign(s, { stage, status: "active", awaiting_human: null, blocked_gate: null, queued_human: [], digest: null, fix_pending: null });
    resumeClock(s);
    appendEvent(projectDir, { type: "advance", feature: s.feature, stage, to: stage, by: "replay" });
    persist(c);
    return { feature: s.feature, status: s.status, stage: s.stage };
  });
}

/** Jumps a stage — or one task of the implementation loop — to escalation rung 3; reopens a blocked feature. */
export function diagnose(projectDir, { feature, stage, task }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (task) {
      if (!s.tasks[task]) throw new UsageError(`unknown task "${task}" for ${s.feature}`);
      clearPending(c);
      Object.assign(s.tasks[task], { status: "pending", rung: 3, diagnose_pending: true, instruction: RUNG_INSTRUCTIONS[3] });
      stage = s.stage;
    } else if (!s.stages[stage]) throw new UsageError(`unknown stage "${stage}" for ${s.feature}`);
    else {
      clearPending(c);
      Object.assign(s.stages[stage], { status: "pending", rung: 3, diagnose_pending: true, instruction: RUNG_INSTRUCTIONS[3], done_agents: [] });
      if (s.fix_pending) s.fix_pending.attempts = 0; // a blocked fix plan gets another try
    }
    Object.assign(s, { stage, status: "active", awaiting_human: null });
    resumeClock(s);
    appendEvent(projectDir, { type: "advance", feature: s.feature, stage, to: stage, by: "diagnose" });
    persist(c);
    return { feature: s.feature, status: s.status, stage: s.stage };
  });
}

/** `/factory:split`, a human command: the planner replaces a task that is two unrelated behaviours with smaller ones. */
export function split(projectDir, { feature, task }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (!s.tasks?.[task]) throw new UsageError(`unknown task "${task}" for ${s.feature}`);
    clearPending(c);
    Object.assign(s.tasks[task], { status: "pending", rung: 4, split_pending: true });
    Object.assign(s, { status: "active", awaiting_human: null });
    resumeClock(s);
    appendEvent(projectDir, { type: "advance", feature: s.feature, stage: s.stage, task, by: "split" });
    persist(c);
    return { feature: s.feature, task, status: "split requested" };
  });
}

/**
 * `factory acceptance waive <test> --reason "..."`, a human command: accept one failing acceptance test (or
 * a whole acceptance file) for this feature. The waiver is the only way a failing acceptance test passes
 * gate-checks; it is listed in the verification review and the digest.
 */
export function waiveAcceptance(projectDir, { feature, test, reason, by }) {
  by ??= gitUser(projectDir); // the human who ran the command: --by, else the git identity, else the OS user
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    if (!test || !reason) throw new UsageError('usage: factory acceptance waive <test file or file::test name> --reason "..."');
    const files = featureAcceptance(gateContext({ projectDir, app: c.app, feature: c.feature, config: c.config })).files;
    const entry = addWaiver(c.feature.dir, { test, reason, by, files });
    appendEvent(projectDir, { type: "waiver", feature: c.fid, test: entry.test, reason: entry.reason, by: entry.approved_by });
    return { feature: c.fid, waived: entry, total: readWaivers(c.feature.dir).length };
  });
}

/**
 * `factory replay acceptance --relock <test>`, a human command: the acceptance-test-author rewrites only the
 * file of one disputed acceptance test (the next step dispatches it), then the engine re-locks that file.
 * The other locked files stay as they are; the implementation continues from where it was.
 */
export function relockAcceptance(projectDir, { feature, test, reason }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (!test) throw new UsageError('usage: factory replay acceptance --relock <test file or file::test name> [--with "why it is wrong"]');
    const target = parseWaiverTarget(test);
    if (!s.acceptance_lock?.[target.file]) throw new UsageError(`${target.file} is not a locked acceptance file of ${s.feature} (locked: ${Object.keys(s.acceptance_lock ?? {}).join(", ") || "none — the acceptance stage has not locked yet"})`);
    clearPending(c);
    s.relock = { file: target.file, test: target.name, reason: reason ?? null, attempts: 0, titles: declaredTests(readText(join(projectDir, target.file))) };
    if (s.status === "blocked" || s.status === "awaiting_human") Object.assign(s, { status: "active", awaiting_human: null });
    resumeClock(s);
    appendEvent(projectDir, { type: "advance", feature: s.feature, stage: s.stage, by: "relock", test: test });
    persist(c);
    return { feature: s.feature, relock: s.relock.file, status: "the acceptance-test-author rewrites it at the next step" };
  });
}

/** The relock dispatch: one acceptance-test-author run limited to the disputed file. */
function relockDispatch(c) {
  const s = c.feature.state;
  const r = s.relock;
  const stage = resolveStage(c, "acceptance");
  const [target] = stage ? resolveAgents(c, stage) : [];
  if (!target?.pack) return { action: "halt", feature: s.feature, reason: "relock needs the acceptance stage's acceptance-test-author, which is not installed" };
  const d = makeDispatch(c, {
    stageId: "acceptance", idStage: `acceptance.relock${(r.round ?? 0) + 1}`, stage: { ...stage, outputs: [], gate: null }, target, phase: "relock",
    attempt: (r.attempts ?? 0) + 1, rung: 0, model: target.model, gate: null, extraWrites: [r.file], feedback: r.feedback ?? null,
    mission: `RELOCK: a human disputes ${r.test ? `the test "${r.test}" in ` : ""}${r.file}${r.reason ? ` — ${r.reason}` : ""}. Rewrite ONLY that ${r.test ? "test" : "file"} so it matches the API contract (03-architecture/api-contract.yaml), the entity types and the spec; every other test and file stays byte for byte. Keep the AC id first in each title and keep every existing title. The implementation exists now, but you still must not read it: the contract and the types decide. The exit check does not apply (the feature is partly built); run nothing but your test command if you need to see the file parse. The engine re-locks the file when you return.`,
  });
  return issue(c, [d]);
}

/** Records the relock result: the file must still declare every title it had; then it is hashed and snapshotted again. */
function finishRelock(c, pending, envelope) {
  const s = c.feature.state;
  const r = s.relock;
  const file = join(c.projectDir, r.file);
  const titles = existsSync(file) ? declaredTests(readText(file)) : [];
  const lost = (r.titles ?? []).filter((t) => !titles.includes(t) && !(r.test && t === r.test));
  const problem = envelope.status !== "done" ? `the author returned "${envelope.status}"` : !titles.length ? `${r.file} declares no tests` : lost.length ? `${r.file} lost the test(s) ${lost.join(", ")}` : null;
  if (problem) {
    r.attempts = (r.attempts ?? 0) + 1;
    r.feedback = `Previous attempt failed: ${problem}. Rewrite only the disputed test; keep every other title.`;
    if (r.attempts >= 2) {
      block(c, `relock of ${r.file} failed twice (${problem}) — waive it with the CLI (factory acceptance waive <test> --reason "..."; human only), or run /factory:replay acceptance`);
      s.relock = null;
    }
    persist(c);
    return { action: s.status === "blocked" ? "halt" : "continue", feature: s.feature, relock: "failed", reason: problem };
  }
  s.acceptance_lock[r.file] = fileHash(file);
  const copy = join(c.feature.dir, "acceptance-lock", `${r.file}.snapshot`);
  mkdirSync(dirname(copy), { recursive: true });
  copyFileSync(file, copy);
  appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: s.stage, relocked: r.file });
  s.relock = null;
  persist(c);
  return { action: "continue", feature: s.feature, relocked: r.file };
}

/**
 * `factory scope add TASK <file|glob>...`: the mechanical scope fix. A builder that needs a file the plan
 * left out (and the file lies in the task's slice) gets it added to files_expected (a path) or write_scope
 * (a glob) without a planner run; gate-plan re-checks the plan, then the same task continues. Human-run:
 * a dispatched agent cannot call it (hooks/guard.mjs).
 */
export async function scopeAdd(projectDir, { feature, task, entries = [] }) {
  return withLock(projectDir, async () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    const unit = s.tasks?.[task];
    if (!unit) throw new UsageError(`unknown task "${task}" for ${s.feature}`);
    const wanted = (entries.length ? entries : unit.scope_suggestion ?? []).map((e) => toPosix(String(e)).replace(/^\.\//, ""));
    if (!wanted.length) throw new UsageError("usage: factory scope add TASK-NNN <file or glob> [...] (without paths: the files the builder named in its needs_scope_change)");
    const file = join(c.feature.dir, "04-plan", "tasks.yaml");
    const before = readText(file);
    const doc = YAML.parseDocument(before);
    const index = (doc.get("tasks")?.items ?? []).findIndex((t) => t.get("id") === task);
    if (index < 0) throw new UsageError(`${task} is not in tasks.yaml`);
    const added = [];
    for (const entry of wanted) {
      const key = isGlob(entry) ? "write_scope" : "files_expected";
      let seq = doc.getIn(["tasks", index, key], true);
      if (!seq) {
        doc.setIn(["tasks", index, key], doc.createNode([]));
        seq = doc.getIn(["tasks", index, key], true);
      }
      if (seq.items.some((i) => (i.value ?? i) === entry)) continue;
      seq.add(entry);
      added.push({ key, entry });
    }
    writeAtomic(file, doc.toString());
    const planResult = await runGate("plan", gateContext({ projectDir, app: c.app, feature: c.feature, config: c.config, packs: c.packs }), { useCache: false });
    if (!planResult.pass) {
      writeAtomic(file, before);
      throw new UsageError(`scope add refused, gate-plan fails with it (tasks.yaml unchanged):\n${planResult.failures.filter((f) => !f.warn).map((f) => `- [${f.rule ?? f.check}] ${f.message}`).join("\n")}`);
    }
    for (const d of s.pending.filter((x) => x.task === task)) clearActive(projectDir, d.id);
    s.pending = s.pending.filter((d) => d.task !== task);
    if (unit.status !== "done") {
      Object.assign(unit, TASK_FRESH, { status: "pending", scope_suggestion: null, feedback: `Scope widened by a human: ${wanted.join(", ")} may now be written. Continue the task.` });
    }
    // The task that blocked the feature is the one just fixed: the feature runs again (any other halt stays).
    const blockedByTask = s.status === "blocked" && (s.halts.at(-1)?.reason ?? "").startsWith(`${task}:`);
    if (s.awaiting_human?.task === task || s.status === "active" || blockedByTask) Object.assign(s, { status: "active", awaiting_human: null });
    if (s.status === "active") resumeClock(s);
    appendEvent(projectDir, { type: "advance", feature: s.feature, stage: s.stage, task, by: "scope-add", added: wanted });
    persist(c);
    return { feature: s.feature, task, added, plan_lint: planResult.failures.filter((f) => f.check === "plan-lint").map((f) => f.message), status: "scope widened" };
  });
}

/**
 * `factory resume [--task TASK]`, a human command: clears a halt and runs the same phase again at the same
 * rung. Nothing is wiped (tasks, attempts, findings, locks stay); a blocked task becomes pending again. Use it
 * after fixing the cause the halt names (a plugin installed, a budget raised); `diagnose`, `scope add` and
 * `replay` are for halts that need a different plan.
 */
export function resume(projectDir, { feature, task } = {}) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (s.status !== "blocked") throw new UsageError(`${s.feature} is not blocked (status ${s.status}); resume clears a halt`);
    if (task && !s.tasks?.[task]) throw new UsageError(`unknown task "${task}" for ${s.feature}`);
    const reason = s.halts.at(-1)?.reason ?? "blocked";
    clearPending(c);
    const active = factoryPaths(projectDir).active;
    if (existsSync(active)) {
      // A skills-unavailable halt used up the redispatch counter of its dispatch: the resumed run starts it afresh.
      for (const f of readdirSync(active).filter((x) => x.startsWith(`${s.feature}.`) && x.endsWith(".skillretry"))) unlinkSync(join(active, f));
    }
    const units = (task ? [task] : Object.keys(s.tasks ?? {})).filter((id) => s.tasks[id]?.status === "blocked");
    for (const id of units) {
      Object.assign(s.tasks[id], { status: "pending" });
      delete s.tasks[id].reason;
    }
    // A halt of the STAGE (an agent returned blocked, the ladder ran out, a budget): the stage runs its agents again.
    // Its attempts, rung and findings stay, so the warden still knows how far it had escalated; what is cleared is the
    // list of agents that had "finished" (the blocked one included), which is what left the step with nothing to dispatch.
    const st = s.stages?.[s.stage];
    let reopened = null;
    if (!task && st?.status === "blocked" && resolveStage(c, s.stage)?.kind !== "task_loop") {
      Object.assign(st, { status: "pending", done_agents: [], diagnose_pending: false });
      reopened = `stage ${s.stage} runs again`;
    }
    if (s.status === "blocked") Object.assign(s, { status: "active", awaiting_human: null });
    if (s.status === "active") resumeClock(s);
    appendEvent(projectDir, { type: "advance", feature: s.feature, stage: s.stage, by: "resume", ...(units.length ? { tasks: units } : {}), halt: reason });
    persist(c);
    return { feature: s.feature, status: s.status, stage: s.stage, resumed_tasks: units, cleared_halt: reason, ...(reopened ? { reopened } : {}), next: "/factory:next" };
  });
}

/** `factory gate red` just passed for a task of a builder_two_phase build: the engine locks the red tests. */
export function markRedPassed(projectDir, { feature, task }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const t = loadTasks(c)?.tasks.find((x) => x.id === task);
    if (!t || !lockRed(c, t)) return false;
    persist(c);
    // The tests are the builder's own until red passes, read-only for the rest of this dispatch (the write guard reads this).
    for (const d of activeDispatches(projectDir).filter((x) => x.task === task)) setActive(projectDir, { ...d, write_deny: [...new Set([...(d.write_deny ?? []), ...(t.tdd?.red_tests ?? [])])] });
    return true;
  });
}

export function abort(projectDir, { feature, reason }) {
  if (!reason) throw new UsageError('usage: factory abort --reason "..."');
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    clearPending(c);
    s.status = "aborted";
    writeAtomic(join(c.feature.dir, "post-mortem.md"), `# ${s.feature} aborted at ${s.stage}\n\n${now()}\n\nReason: ${reason}\n`);
    appendEvent(projectDir, { type: "halt", feature: s.feature, stage: s.stage, reason: `aborted: ${reason}` });
    persist(c);
    return { feature: s.feature, status: s.status, stage: s.stage };
  });
}

/** Active dispatches are also visible to hooks; exported for `state --brief`. */
export { activeDispatches };
