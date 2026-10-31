// The Conductor protocol. The model in the main session only calls `step`, dispatches what it
// returns, and passes each envelope to `record`. Everything that decides — stage order, retries,
// escalation, gates, budgets — happens here, deterministically, from files.
import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { UsageError, deepMerge, factoryPaths, matchesAny, now, readFrontMatter, readText, toPosix, writeAtomic, writeJson } from "./core.mjs";
import { loadConfig, profileStages, enabledRoles } from "./config.mjs";
import { resolvePacks, stageIndex } from "./registry.mjs";
import { ARTIFACT_TYPES, artifactFiles, parseArtifactRef, validate } from "./schemas.mjs";
import { activeDispatches, appendEvent, clearActive, loadAppState, loadFeature, pauseClock, pickFeature, resumeClock, saveAppState, saveFeature, setActive, withLock } from "./state.mjs";
import { buildPack } from "./broker.mjs";
import { gateContext, idCoverage, normaliseResult, runGate } from "./gatekeeper.mjs";
import { RUNG_INSTRUCTIONS, decide, exhaustedBudgets } from "./warden.mjs";
import { addNote, applyMappings, openNotes } from "./notes.mjs";
import { extractIds } from "./ids.mjs";

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

function evalWhen(s, key) {
  if (!key) return true;
  return s.flags?.[key] === true;
}

function persist(c) {
  saveFeature(c.projectDir, c.app, c.feature);
  saveAppState(c.projectDir, c.app);
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
    s.status = "done";
    appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: s.stage, to: "done" });
    return;
  }
  const to = profile[i + 1];
  appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: s.stage, to });
  s.stage = to;
  s.stages[to] ??= { status: "pending", attempts: 0, rung: 0 };
}

function block(c, reason) {
  const s = c.feature.state;
  s.status = "blocked";
  pauseClock(s);
  s.halts.push({ reason, stage: s.stage, at: now() });
  writeAtomic(join(c.feature.dir, "blockers.md"), `# Blocked: ${s.feature} at ${s.stage}\n\n${reason}\n\nSee gate-log.jsonl and envelopes/ for everything that was tried.\n`);
  appendEvent(c.projectDir, { type: "halt", feature: s.feature, stage: s.stage, reason });
}

function makeDispatch(c, { stageId, stage, target, phase, attempt, rung, model, feedback, instruction, extraReads, extraWrites, mission, gate }) {
  const s = c.feature.state;
  const id = `${s.feature}/${stageId}/${target.agent}/a${attempt}`;
  const pack = buildPack(c.projectDir, c.feature, c.config, {
    id, stageId, stage, agent: target.agent, subagent_type: target.subagent_type, model, attempt, rung, role: target.role,
    phase, feedback, instruction, extraReads, extraWrites, mission, gate: gate ?? stage?.gate,
    openNotes: phase === "stage" ? openNotes(c.feature.dir).map((n) => n.id) : [],
  });
  return { id, stage: stageId, agent: target.agent, subagent_type: target.subagent_type, pack: pack.rel, model, phase, ts: now(), context_degraded: pack.front.context_degraded };
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
    appendEvent(c.projectDir, { type: "dispatch", feature: s.feature, stage: d.stage, agent: d.agent, model: d.model ?? undefined, pack: d.pack });
  });
  return { action: "dispatch", feature: s.feature, dispatches: dispatches.map((d) => ({ ...d, prompt: promptFor(d, c.projectDir) })) };
}

export function step(projectDir, { feature } = {}) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (["done", "aborted"].includes(s.status)) return { action: "done", feature: s.feature, status: s.status };
    if (s.status === "blocked") return { action: "halt", feature: s.feature, reason: s.halts.at(-1)?.reason ?? "blocked" };
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
      const skip = (stage.modes && !stage.modes.includes(s.mode)) || (s.overrides?.[stageId] === "skip") || (s.overrides?.[stageId] !== "force" && !evalWhen(s, stage.when));
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
        persist(c);
        return { action: "halt", feature: s.feature, reason: "the implementation task loop needs a role pack (phase 3)" };
      }
      if (st.diagnose_pending) {
        const target = engineTarget(c, "diagnostician");
        const d = makeDispatch(c, {
          stageId, stage: { ...stage, outputs: ["root-cause"], writes: [] }, target, phase: "diagnose", attempt: st.attempts, rung: 3,
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
      st.status = "running";
      const targets = resolveAgents(c, stage);
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
      const done = new Set(st.done_agents ?? []);
      const todo = targets.filter((t) => !done.has(`${t.agent}@${t.role ?? ""}`));
      const batch = stage.parallel ? todo : todo.slice(0, 1);
      const rootCause = join(c.feature.dir, "diagnosis", `${stageId}.md`);
      const dispatches = batch.map((target) =>
        makeDispatch(c, {
          stageId, stage, target, phase: "stage", attempt: (st.attempts ?? 0) + 1, rung: st.rung ?? 0,
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
  let result = null;
  if (envelope.status === "done") {
    const remaining = resolveAgents(c, stage).filter((t) => !st.done_agents.includes(`${t.agent}@${t.role ?? ""}`));
    if (remaining.length || s.pending.some((d) => d.stage === stageId)) {
      persist(c);
      return { action: "continue", feature: s.feature, waiting_for: remaining.map((t) => t.subagent_type) };
    }
    const ctx = gateContext({ projectDir: c.projectDir, app: c.app, feature: c.feature, config: c.config, stage });
    const gated = stage.gate ? await runGate(stage.gate, ctx) : normaliseResult("none", []);
    const coverage = stage.tracked_ids?.length ? idCoverage(ctx, { inputs: stage.inputs, outputs: stage.outputs, kinds: stage.tracked_ids }) : [];
    result = coverage.length ? normaliseResult(gated.gate, [...gated.failures, ...coverage], gated.input_hash) : gated;
    appendEvent(c.projectDir, { type: "gate", feature: s.feature, stage: stageId, gate: result.gate, pass: result.pass, progress_signal: result.progress_signal, fingerprint: result.fingerprint, cached: result.cached });
  }
  st.attempts = (st.attempts ?? 0) + 1;
  const reasoning = MODELS.includes(c.config.model_tiers?.reasoning) ? c.config.model_tiers.reasoning : "opus";
  const verdict = decide(st, result, { envelope, attemptsMax: c.config.budgets?.stage?.attempts_max, isTask: false, tiers: { reasoning } });
  Object.assign(st, verdict.unit, { last_gate: result ? summary(result) : null });
  appendEvent(c.projectDir, { type: "verdict", feature: s.feature, stage: stageId, verdict: verdict.verdict, rung: verdict.rung, reason: verdict.reason });
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
      // Only a real gate failure sends the feature back; transient or envelope-only failures retry in place.
      if (goto && verdict.verdict === "retry" && result && !result.pass) return regress(c, stageId, goto, st.feedback);
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

/** Backward edge (on_fail: goto:<stage>): rewinds to an earlier stage, counted against the regression budget. */
function regress(c, from, to, feedback) {
  const s = c.feature.state;
  const profile = profileStages(c.config, s.profile);
  const edge = `${from}_to_${to}`;
  const limit = c.config.budgets?.backward_edges?.[edge];
  s.budgets.edges = { ...(s.budgets.edges ?? {}), [edge]: (s.budgets.edges?.[edge] ?? 0) + 1 };
  if (limit !== undefined && s.budgets.edges[edge] > limit) {
    block(c, `backward edge ${edge} used more than ${limit} time(s)`);
    return;
  }
  s.budgets.regressions += 1;
  for (const id of profile.slice(profile.indexOf(to), profile.indexOf(from) + 1)) {
    s.stages[id] = { ...s.stages[id], status: "pending", done_agents: [] };
  }
  s.stages[to].feedback = `Sent back from ${from}:\n${feedback}`;
  s.stage = to;
  appendEvent(c.projectDir, { type: "advance", feature: s.feature, stage: from, to, backward: true });
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
    if (g.gate === "CLARIFY") {
      st.status = "pending";
      st.feedback = `Human answer${note ? ` (${note.id})` : ""}: ${notes ?? "(no text) — proceed with the defaults you proposed"}`;
    } else {
      st.status = "passed";
      nextStage(c);
    }
    appendEvent(projectDir, { type: "human", feature: s.feature, stage: g.stage, gate: g.gate, result: "approved", note: note?.id });
    persist(c);
    return { action: "continue", feature: s.feature, gate: g.gate, note: note?.id ?? null, stage: s.stage };
  });
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
    Object.assign(st, { status: "pending", done_agents: [], feedback: `Rejected at ${g.gate} by a human (${note.id}): ${reason}\nRevise your outputs to address it and map ${note.id} in your artifacts.` });
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

const FRESH = { attempts: 0, rung: 0, dispatches: 0, progress_signal: [], fingerprints: [], state_hashes: [], feedback: null, instruction: null, model: null, diagnose_pending: false, done_agents: [] };

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
    for (const id of profile.slice(from, to + 1)) s.stages[id] = { ...s.stages[id], ...FRESH, status: "pending" };
    s.stages[stage].feedback = `Replay requested by a human: ${feedback}`;
    Object.assign(s, { stage, status: "active", awaiting_human: null, digest: null });
    resumeClock(s);
    appendEvent(projectDir, { type: "advance", feature: s.feature, stage, to: stage, by: "replay" });
    persist(c);
    return { feature: s.feature, status: s.status, stage: s.stage };
  });
}

/** Jumps a stage to escalation rung 3; also reopens a blocked feature at that stage. */
export function diagnose(projectDir, { feature, stage }) {
  return withLock(projectDir, () => {
    const c = load(projectDir, feature);
    const s = c.feature.state;
    if (!s.stages[stage]) throw new UsageError(`unknown stage "${stage}" for ${s.feature}`);
    clearPending(c);
    Object.assign(s.stages[stage], { status: "pending", rung: 3, diagnose_pending: true, instruction: RUNG_INSTRUCTIONS[3], done_agents: [] });
    Object.assign(s, { stage, status: "active", awaiting_human: null });
    resumeClock(s);
    appendEvent(projectDir, { type: "advance", feature: s.feature, stage, to: stage, by: "diagnose" });
    persist(c);
    return { feature: s.feature, status: s.status, stage: s.stage };
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
