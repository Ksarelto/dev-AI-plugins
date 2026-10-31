// The Conductor protocol. The model in the main session only calls `step`, dispatches what it
// returns, and passes each envelope to `record`. Everything that decides — stage order, retries,
// escalation, gates, budgets — happens here, deterministically, from files.
import { existsSync, renameSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { UsageError, YAML, deepMerge, factoryPaths, matchesAny, now, readFrontMatter, readText, toPosix, writeAtomic, writeJson, writeYaml } from "./core.mjs";
import { loadConfig, profileStages, enabledRoles } from "./config.mjs";
import { resolvePacks, stageIndex } from "./registry.mjs";
import { ARTIFACT_TYPES, artifactFiles, parseArtifactRef, validate } from "./schemas.mjs";
import { activeDispatches, appendEvent, clearActive, createFeature, loadAppState, loadFeature, pauseClock, pickFeature, resumeClock, saveAppState, saveFeature, setActive, withLock } from "./state.mjs";
import { buildPack } from "./broker.mjs";
import { backToRed, finishTask, loadTasks, rolePath, taskGate, taskStep } from "./tasks.mjs";
import { recordInLedger, ship } from "./delivery.mjs";
import { scaffoldRoles } from "./scaffold.mjs";
import { buildIndex } from "./cartographer.mjs";
import { nextId } from "./ids.mjs";
import { gateContext, idCoverage, normaliseResult, runGate } from "./gatekeeper.mjs";
import { RUNG_INSTRUCTIONS, decide, exhaustedBudgets } from "./warden.mjs";
import { addNote, applyMappings, openNotes, readNotes } from "./notes.mjs";
import { extractIds, formatId, observeId } from "./ids.mjs";

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
  return targets.map((t) => ({ ...t, subagent_type: `${t.pack?.name}:${t.agent}`, model: t.pack ? agentModel(t.pack, t.agent) : null }));
}

const promptFor = (d, projectDir) =>
  `Read your context pack at ${toPosix(join(projectDir, d.pack))} and follow it exactly. ` +
  `End your reply with the JSON envelope it asks for (pack_id "${d.id}").`;

/** Conditions the engine can answer from files; a feature flag of the same name overrides them. */
const BUILTIN_CONDITIONS = {
  // Discovery runs once per app: until the baseline (profile + capability map) exists.
  "discovery.needed": (c) => {
    const root = factoryPaths(c.projectDir).root;
    return !existsSync(join(root, "app-profile.yaml")) || !existsSync(join(root, "_index", "capability-map.yaml"));
  },
  // S9 runs only when PR comments were fetched (/factory:pr-feedback → factory comments).
  "pr.comments": (c) => {
    const file = join(c.feature.dir, "08-delivery", "comments.json");
    return existsSync(file) && (JSON.parse(readText(file)) ?? []).length > 0;
  },
  // Prototype when stories name user-facing surfaces the app does not have yet (never for patches).
  "prototype.trigger": (c) => {
    if (c.feature.state.tier === "patch") return false;
    const root = factoryPaths(c.projectDir).root;
    const storiesFile = join(c.feature.dir, "02-stories", "stories.yaml");
    if (!existsSync(storiesFile)) return false;
    const known = new Set();
    const map = join(root, "_index", "capability-map.yaml");
    const inventory = join(root, "_index", "component-inventory.yaml");
    if (existsSync(map)) for (const f of YAML.parse(readText(map))?.features ?? []) known.add(f.name.toLowerCase());
    if (existsSync(inventory)) for (const comp of YAML.parse(readText(inventory))?.components ?? []) known.add(comp.name.toLowerCase());
    const surfaces = new Set((YAML.parse(readText(storiesFile))?.stories ?? []).flatMap((s) => s.ux?.surfaces ?? []));
    const fresh = [...surfaces].filter((name) => !known.has(name.toLowerCase()));
    return fresh.length >= (c.config.prototype?.min_new_surfaces ?? 1);
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
    const entry = recordInLedger(c, loadTasks(c)?.tasks.filter((t) => s.tasks?.[t.id]?.status === "done"));
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

function makeDispatch(c, { stageId, idStage, stage, target, phase, attempt, rung, model, feedback, instruction, extraReads, extraWrites, writeDeny, mission, gate, task, gateTask = task, laterAgents = [] }) {
  const s = c.feature.state;
  const id = `${s.feature}/${idStage ?? stageId}/${target.agent}/a${attempt}`;
  const owners = stage?.owners ?? {};
  const pack = buildPack(c.projectDir, c.feature, c.config, {
    id, stageId, stage, agent: target.agent, subagent_type: target.subagent_type, model, attempt, rung, role: target.role,
    phase, feedback, instruction, extraReads, extraWrites, writeDeny, mission, task, gateTask, gate: gate === undefined ? stage?.gate : gate,
    readDeny: roleScoped(c.config, stage?.read_deny ?? []),
    openNotes: phase === "stage" ? openNotes(c.feature.dir).map((n) => n.id) : [],
    // Outputs owned by another agent of the stage are not this agent's to write.
    notMine: Object.entries(owners).filter(([, agent]) => agent !== target.agent).map(([type]) => type),
    laterOwned: Object.entries(owners).filter(([, agent]) => laterAgents.includes(agent)).map(([type, agent]) => `${type} (${agent})`),
    stacks: stackLines(c),
    nextIds: nextFreeIds(c),
  });
  return {
    id, stage: stageId, agent: target.agent, subagent_type: target.subagent_type, pack: pack.rel, model, phase, ts: now(),
    ...(task ? { task: task.id } : {}), context_degraded: pack.front.context_degraded,
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
    if (d.phase === "stage") s.stages[d.stage].dispatches = (s.stages[d.stage].dispatches ?? 0) + 1;
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
      read_budget: front.read_allowlist_max + front.listed_reads,
    });
    appendEvent(c.projectDir, {
      type: "dispatch", feature: s.feature, stage: d.stage, ...(d.task ? { task: d.task } : {}), agent: d.agent, model: d.model ?? undefined,
      phase: d.phase, pack: d.pack, context_degraded: Boolean(d.context_degraded),
    });
  });
  return { action: "dispatch", feature: s.feature, dispatches: dispatches.map((d) => ({ ...d, prompt: promptFor(d, c.projectDir) })) };
}

export function step(projectDir, { feature } = {}) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (["done", "aborted"].includes(s.status)) return { action: "done", feature: s.feature, status: s.status };
    if (s.status === "blocked") return { action: "halt", feature: s.feature, reason: s.halts.at(-1)?.reason ?? "blocked" };
    const deps = (s.depends_on ?? []).map((id) => [id, c.app.features[id]?.status]);
    const aborted = deps.filter(([, status]) => status === "aborted").map(([id]) => id);
    if (aborted.length) return { action: "halt", feature: s.feature, reason: `depends on ${aborted.join(", ")}, which was aborted — abort this feature too, or replan it` };
    const waitingFor = deps.filter(([, status]) => status !== "done").map(([id, status]) => `${id}${status === "blocked" ? " (blocked)" : ""}`);
    if (waitingFor.length) return { action: "wait", feature: s.feature, reason: `waiting for ${waitingFor.join(", ")} to finish` };
    if (s.pending.length) {
      return { action: "dispatch", feature: s.feature, resumed: true, dispatches: s.pending.map((d) => ({ ...d, prompt: promptFor(d, projectDir) })) };
    }
    const exhausted = exhaustedBudgets(s, c.config);
    if (exhausted.length) {
      block(c, `budget exhausted: ${exhausted.join(", ")}`);
      persist(c);
      return { action: "halt", feature: s.feature, reason: s.halts.at(-1).reason };
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
    if (s.awaiting_human) {
      const g = s.awaiting_human;
      return { action: "ask_human", feature: s.feature, gate: g.gate, stage: g.stage, reason: g.reason ?? null, questions: g.questions ?? [], review: reviewFiles(c, g.stage), open_notes: openNotes(c.feature.dir).map((n) => n.id) };
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
      const maxDispatches = c.config.budgets?.stage?.dispatches_max;
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
        // A role-slot stage (e.g. prototype) with no enabled role providing the slot: nothing to do.
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
      if (!st.done_agents?.length) st.findings = [];
      const done = new Set(st.done_agents ?? []);
      const todo = targets.filter((t) => !done.has(`${t.agent}@${t.role ?? ""}`));
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
    ...result.failures.slice(0, 20).map((f) => `- [${f.check}${f.rule ? `/${f.rule}` : ""}] ${f.file ? `${f.file}: ` : ""}${f.message}`),
    ...(result.failures.length > 20 ? [`- … ${result.failures.length - 20} more in gate-log.jsonl`] : [])].join("\n");

export async function record(projectDir, { dispatchId, envelopeText, tokens = 0, feature }) {
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
  // Task gates run real tests, typecheck and builds: run them before taking the state lock.
  const taskResult = pending.task ? await taskGate(c, pending, parsed) : null;

  return withLock(projectDir, async () => {
    const cur = load(projectDir, feature);
    const st8 = cur.feature.state;
    st8.pending = st8.pending.filter((d) => d.id !== pending.id);
    clearActive(projectDir, pending.id);
    writeJson(join(cur.feature.dir, "envelopes", `${pending.id.split("/").slice(1).join(".")}.json`), parsed);
    st8.budgets.tokens += Number(tokens) || 0;
    const allow = readFrontMatter(join(projectDir, pending.pack)).data.write_allow ?? [];
    const outside = (parsed.artifacts_written ?? []).filter((p) => !matchesAny(toPosix(isAbsolute(p) ? relative(projectDir, p) : p), allow));
    appendEvent(projectDir, {
      type: "envelope", feature: st8.feature, stage: pending.stage, agent: pending.agent, status: parsed.status, tokens: Number(tokens) || 0,
      ...(outside.length ? { claimed_outside_allowlist: outside } : {}),
    });

    if (pending.phase === "digest") return finishDigest(cur, parsed);
    if (pending.task || pending.phase === "fixplan") return finishTask(cur, pending, parsed, helpers, taskResult);
    if (pending.stage !== st8.stage) {
      persist(cur);
      return { action: "continue", feature: st8.feature, note: `ignored a late envelope from stage "${pending.stage}"; the feature is at "${st8.stage}"` };
    }
    if (pending.phase === "diagnose") {
      const st = st8.stages[pending.stage];
      st.diagnose_pending = false;
      st.status = "pending";
      st.done_agents = [];
      persist(cur);
      return { action: "continue", feature: st8.feature, note: "diagnosis recorded; the stage is re-dispatched with root-cause.md" };
    }
    return finishStageAgent(cur, pending, parsed);
  });
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
  return ["SRC", "REQ", "AC", "STORY", "TASK", "TEST", "OQ", "ADR"].map((k) => formatId(k, c.app.next_ids[k] ?? 1));
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
  const key = `${pending.agent}@${resolveAgents(c, stage).find((t) => t.agent === pending.agent)?.role ?? ""}`;
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
    const remaining = resolveAgents(c, stage).filter((t) => !st.done_agents.includes(`${t.agent}@${t.role ?? ""}`));
    if (remaining.length || s.pending.some((d) => d.stage === stageId)) {
      persist(c);
      return { action: "continue", feature: s.feature, waiting_for: remaining.map((t) => t.subagent_type) };
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
  st.attempts = (st.attempts ?? 0) + 1;
  const reasoning = MODELS.includes(c.config.model_tiers?.reasoning) ? c.config.model_tiers.reasoning : "opus";
  const verdict = decide(st, result, { envelope, attemptsMax: c.config.budgets?.stage?.attempts_max, isTask: false, tiers: { reasoning } });
  Object.assign(st, verdict.unit, { last_gate: result ? summary(result) : null });
  appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: stageId, agent: pending.agent, attempt: st.attempts, verdict: verdict.verdict, rung: verdict.rung, reason: verdict.reason });
  applyVerdict(c, stageId, stage, verdict, result, envelope);
  persist(c);
  return { action: s.status === "awaiting_human" ? "ask_human" : s.status === "blocked" ? "halt" : s.status === "done" ? "done" : "continue", feature: s.feature, verdict: verdict.verdict, reason: verdict.reason, gate: result ? summary(result) : null };
}

function applyVerdict(c, stageId, stage, verdict, result, envelope) {
  const s = c.feature.state;
  const st = s.stages[stageId];
  switch (verdict.verdict) {
    case "advance": {
      st.status = "passed";
      st.feedback = null;
      st.instruction = null;
      st.model = null;
      if ((c.config.pipeline?.digest_after ?? []).includes(stageId)) s.digest = { pending: true, after: stageId, attempts: 0 };
      if (stage.after_pass === "ship") {
        try {
          const shipped = ship(c);
          if (c.config.delivery?.dry_run === false && !shipped.pr.opened) {
            block(c, `${stageId}: committed on ${shipped.branch}, but the pull request was not opened — ${shipped.pr.failed ?? shipped.pr.reason ?? ""}\n${shipped.pr.output ?? ""}`.trim());
            return;
          }
          appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: stageId, shipped: shipped.branch, commits: shipped.commits.length, pr: shipped.pr.dry_run ? "dry-run" : shipped.pr.opened });
        } catch (error) {
          block(c, `${stageId}: shipping failed — ${error.message.split("\n")[0]}`);
          return;
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
      if (stage.human_gate) {
        s.status = "awaiting_human";
        s.awaiting_human = { gate: stage.human_gate, stage: stageId, since: now() };
        pauseClock(s);
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

/** Writes 06-verify/review.md from the findings the stage's reviewers and auditors returned. */
function writeReview(c, st) {
  const s = c.feature.state;
  const findings = st.findings ?? [];
  const front = { feature: s.feature, round: (st.attempts ?? 0) + 1, findings };
  const lines = findings.map((f) => `- **${f.id} ${f.severity}** (${f.lens ?? "audit"}, ${f.agent}) ${f.file ? `\`${f.file}${f.line ? `:${f.line}` : ""}\` ` : ""}— ${f.claim}`);
  writeAtomic(join(c.feature.dir, "06-verify", "review.md"), `---\n${YAML.stringify(front, { lineWidth: 0 })}---\n\n# Review — ${s.feature} round ${front.round}\n\n${lines.join("\n") || "No findings."}\n`);
}

/** Writes 06-verify/change-set.yaml: the files each finished task changed (input for reviewers). */
function writeChangeSet(c) {
  const s = c.feature.state;
  const tasks = (loadTasks(c)?.tasks ?? []).filter((t) => s.tasks?.[t.id]?.status === "done");
  writeYaml(join(c.feature.dir, "06-verify", "change-set.yaml"), {
    feature: s.feature,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, satisfies: t.satisfies, files: t.files_expected })),
  });
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
function regress(c, from, to, feedback) {
  const s = c.feature.state;
  const profile = profileStages(c.config, s.profile);
  if (!profile.includes(to)) {
    block(c, `${from}: the gate failed and on_fail sends it to "${to}", which is not in the "${s.profile}" profile`);
    return false;
  }
  const edge = `${from}_to_${to}`;
  const limit = c.config.budgets?.backward_edges?.[edge];
  s.budgets.edges = { ...(s.budgets.edges ?? {}), [edge]: (s.budgets.edges?.[edge] ?? 0) + 1 };
  if (limit !== undefined && s.budgets.edges[edge] > limit) {
    block(c, `backward edge ${edge} used more than ${limit} time(s)`);
    return false;
  }
  s.budgets.regressions += 1;
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
    return { action: s.status === "blocked" ? "halt" : "continue", feature: s.feature, reason: result.error ?? null, scaffold: s.scaffold };
  });
}

export function approve(projectDir, { gate, notes, feature, by }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (!s.awaiting_human) throw new UsageError(`${s.feature} is not waiting for a human gate`);
    const g = s.awaiting_human;
    if (gate && gate !== g.gate) throw new UsageError(`${s.feature} is waiting for ${g.gate}, not ${gate}`);
    const note = notes ? addNote(c.app, c.feature.dir, { text: notes, at: g.gate, by }) : null;
    s.gates[g.gate] = { result: "approved", by: by ?? process.env.USER ?? "human", at: now(), notes: note ? [note.id] : [] };
    s.awaiting_human = null;
    s.status = "active";
    resumeClock(s);
    const st = s.stages[g.stage];
    if (g.gate === "CLARIFY" && g.task) {
      if (note) applyMappings(c.feature.dir, [{ id: note.id, to: [g.task] }], new Set([g.task]));
      s.tasks[g.task].feedback = `Human answer${note ? ` (${note.id})` : ""}: ${notes ?? "(no text) — proceed with the defaults you proposed"}`;
    } else if (g.gate === "CLARIFY") {
      st.status = "pending";
      st.feedback = `Human answer${note ? ` (${note.id})` : ""}: ${notes ?? "(no text) — proceed with the defaults you proposed"}`;
    } else if (!breakingDeltaBack(c, g, note)) {
      st.status = "passed";
      nextStage(c);
    }
    const split = g.gate === "GATE-A" ? splitBacklog(c, g.stage) : [];
    appendEvent(projectDir, { type: "human", feature: s.feature, stage: g.stage, gate: g.gate, result: "approved", note: note?.id });
    persist(c);
    return { action: "continue", feature: s.feature, gate: g.gate, note: note?.id ?? null, stage: s.stage, ...(split.length ? { backlog_features: split } : {}) };
  });
}

/**
 * on_approve: spec_delta (the prototype stage). Approving GATE-P with breaking spec deltas in the
 * prototype report sends the feature back to requirements with them; the human rejects instead to
 * have the prototype revised. Returns true when it sent the feature back.
 */
function breakingDeltaBack(c, g, note) {
  const stage = resolveStage(c, g.stage);
  if (stage?.on_approve !== "spec_delta") return false;
  const report = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config }).load("prototype-report");
  const breaking = (report?.data.spec_delta ?? []).filter((d) => d.breaking);
  const profile = profileStages(c.config, c.feature.state.profile);
  const target = ["requirements", "requirements-lite"].find((id) => profile.includes(id));
  if (!breaking.length || !target) return false;
  // Once the edge budget is spent, approving again accepts the deltas as they are and moves on.
  const edge = `${g.stage}_to_${target}`;
  const limit = c.config.budgets?.backward_edges?.[edge];
  if (limit !== undefined && (c.feature.state.budgets.edges?.[edge] ?? 0) >= limit) {
    appendEvent(c.projectDir, { type: "human", feature: c.feature.state.feature, stage: g.stage, gate: g.gate, result: "approved", accepted_spec_delta: breaking.length });
    return false;
  }
  c.feature.state.stages[g.stage].status = "passed";
  const lines = breaking.map((d) => `- ${d.change}${d.affects?.length ? ` (affects ${d.affects.join(", ")})` : ""}`).join("\n");
  // A used-up prototype_to_requirements budget blocks the feature; either way it must not move on.
  return regress(c, g.stage, target, `The approved prototype changes the spec (breaking):\n${lines}${note ? `\nHuman note ${note.id}: ${note.text}` : ""}\nUpdate the spec, then stories; the prototype is checked again.`) || c.feature.state.status === "blocked";
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

export function reject(projectDir, { gate, reason, feature, by }) {
  if (!reason) throw new UsageError("reject needs a reason — it becomes an HD note the agents must address");
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (!s.awaiting_human) throw new UsageError(`${s.feature} is not waiting for a human gate`);
    const g = s.awaiting_human;
    if (gate && gate !== g.gate) throw new UsageError(`${s.feature} is waiting for ${g.gate}, not ${gate}`);
    const note = addNote(c.app, c.feature.dir, { text: reason, at: g.gate, by });
    s.gates[g.gate] = { result: "rejected", by: by ?? process.env.USER ?? "human", at: now(), notes: [note.id] };
    s.awaiting_human = null;
    s.status = "active";
    resumeClock(s);
    const st = s.stages[g.stage];
    const task = g.task ? loadTasks(c)?.tasks.find((t) => t.id === g.task) : null;
    const gateStage = resolveStage(c, g.stage);
    const fixTarget = g.gate === gateStage?.human_gate ? /^fix:(.+)$/.exec(gateStage?.on_reject ?? "")?.[1] : null;
    if (!task && fixTarget) requestFixes(c, g.stage, fixTarget, [{ check: "human-review", rule: g.gate, message: `${note.id}: ${reason}` }]);
    else if (task) {
      applyMappings(c.feature.dir, [{ id: note.id, to: [task.id] }], new Set([task.id]));
      backToRed(c, task, s.tasks[task.id], `A human sent ${task.id} back to its test author (${note.id}): ${reason}`);
    }
    else Object.assign(st, { status: "pending", done_agents: [], feedback: `Rejected at ${g.gate} by a human (${note.id}): ${reason}\nRevise your outputs to address it and map ${note.id} in your artifacts.` });
    appendEvent(projectDir, { type: "human", feature: s.feature, stage: g.stage, gate: g.gate, result: "rejected", note: note.id });
    persist(c);
    return { action: "continue", feature: s.feature, gate: g.gate, note: note.id, stage: s.stage };
  });
}

export function note(projectDir, { text, feature, by }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const n = addNote(c.app, c.feature.dir, { text, at: "note", by });
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
};

/** Files a human reviews at a stage's gate: the stage outputs that exist. */
export function reviewFiles(c, stageId) {
  const stage = resolveStage(c, stageId);
  const dirs = { factoryRoot: factoryPaths(c.projectDir).root, featureDir: c.feature.dir, projectDir: c.projectDir };
  return (stage?.outputs ?? []).flatMap((ref) =>
    parseArtifactRef(ref).names.flatMap((t) => artifactFiles(t, dirs).map((f) => toPosix(relative(c.projectDir, f)))),
  );
}

/** Drops outstanding dispatches (and their hook scopes) before a human-driven jump. */
function clearPending(c) {
  for (const d of c.feature.state.pending) clearActive(c.projectDir, d.id);
  c.feature.state.pending = [];
}

const FRESH = { attempts: 0, rung: 0, dispatches: 0, progress_signal: [], fingerprints: [], state_hashes: [], feedback: null, instruction: null, model: null, diagnose_pending: false, done_agents: [], entered: false, findings: [] };

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
    if (profile.indexOf(stage) <= profile.indexOf("implementation") || stage === "implementation") s.tasks = {};
    s.stages[stage].entered = true; // a replayed stage runs even when its condition would skip it
    Object.assign(s, { stage, status: "active", awaiting_human: null, queued_human: [], digest: null, fix_pending: null });
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

/** Escalation rung 4 for one task: the planner replaces it with 2–3 smaller tasks. */
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
