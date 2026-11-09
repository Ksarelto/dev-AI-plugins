// Gatekeeper: runs a named gate (scripts/gates/<name>.mjs) and normalises its result to
// { gate, pass, progress_signal, fingerprint, failures, cached }. Gates never make judgement calls.
import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ENGINE_ROOT, factoryPaths, fileHash, readJson, readText, sha, toPosix, treeHash, writeJson, now } from "./core.mjs";
import { TRACKED_KINDS, extractIds, kindOf } from "./ids.mjs";
import { ARTIFACT_TYPES, artifactFiles, loadArtifact, parseArtifactRef, validate } from "./schemas.mjs";

/** Everything a gate may look at. Gates read through these helpers, never by guessing paths. */
export function gateContext({ projectDir, app, feature, config, stage, task, stack, packs, screen }) {
  const paths = factoryPaths(projectDir);
  const dirs = { factoryRoot: paths.root, featureDir: feature?.dir, projectDir };
  const load = (type) => {
    const [file] = artifactFiles(type, dirs);
    return file ? { file, rel: toPosix(relative(projectDir, file)), data: loadArtifact(type, file) } : null;
  };
  const all = (type) =>
    artifactFiles(type, dirs).map((file) => ({ file, rel: toPosix(relative(projectDir, file)), data: loadArtifact(type, file) }));
  const spec = () => {
    const prd = load("prd");
    if (prd) return { ...prd, kind: "prd", reqs: prd.data.requirements ?? [] };
    const delta = load("delta-spec");
    if (delta) return { ...delta, kind: "delta-spec", reqs: [...(delta.data.added ?? []), ...(delta.data.modified ?? [])], removed: (delta.data.removed ?? []).map((r) => r.id) };
    return null;
  };
  return { projectDir, paths, dirs, app, feature, state: feature?.state, config, stage, task, stack, packs, screen, load, all, spec };
}

const gateModules = new Map();
async function gateModule(name) {
  if (!gateModules.has(name)) {
    const file = join(ENGINE_ROOT, "scripts", "gates", `${name}.mjs`);
    if (!existsSync(file)) throw new Error(`unknown gate: ${name}`);
    gateModules.set(name, await import(new URL(`file://${file}`).href));
  }
  return gateModules.get(name);
}

export function gateNames() {
  return readdirSync(join(ENGINE_ROOT, "scripts", "gates"))
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => f.slice(0, -4))
    .sort();
}

const normalise = (text) =>
  String(text)
    .replace(/\d+(\.\d+)?(ms|s)\b/g, "<t>")
    .replace(/:\d+(:\d+)?/g, ":<n>")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Hash of every input artifact a gate depends on; unchanged inputs reuse the cached result. Gates that
 * run code (cacheable: "tree") also hash the working tree, the locks they check and the quality
 * settings, so the agent's own passing exit check is reused at record instead of run a second time.
 */
function inputHash(ctx, inputs, cacheable) {
  const parts = [];
  for (const type of inputs) {
    for (const file of artifactFiles(type, ctx.dirs)) parts.push(`${type}:${sha(readText(file))}`);
  }
  if (ctx.task) parts.push(JSON.stringify(ctx.task));
  if (cacheable === "tree") {
    const tree = treeHash(ctx.projectDir);
    if (!tree) return null; // outside git nothing proves the code is the same: never reuse
    const unit = ctx.task ? ctx.state?.tasks?.[ctx.task.id] : null;
    parts.push(tree, JSON.stringify([unit?.base_ref ?? null, unit?.red_lock ?? null, ctx.state?.acceptance_lock ?? null, ctx.config?.quality ?? null, ctx.stack?.stack ?? null, ctx.config?.roles ?? null]));
  }
  return sha(parts.join("\n"));
}

/** A failure that says nothing about the code (a crashed gate, a timeout, no report, a check that could not run): never reused. */
const infraFailure = (f) => f.check === "gate-error" || f.rule === "no-report" || /-not-run$/.test(f.rule ?? "") || /timed out|ETIMEDOUT|ECONNREFUSED|spawn \S+ ENOENT/i.test(String(f.message));

export async function runGate(name, ctx, { useCache = true } = {}) {
  const mod = await gateModule(name);
  const hash = inputHash(ctx, mod.inputs ?? [], mod.cacheable);
  const cacheFile = ctx.feature ? join(ctx.feature.dir, "gate-cache.json") : null;
  const cache = cacheFile ? readJson(cacheFile, {}) : {};
  const key = ctx.task ? `${name}:${ctx.task.id}` : ctx.screen ? `${name}:${ctx.screen}` : name;
  // A "tree" gate reuses a failure as well as a pass: the key holds the whole working tree, the task's
  // locks and base ref and the quality settings, so an identical failed check the agent already ran is
  // not run again at record; any changed file runs it afresh (quality.cache_failures: false reruns failures).
  // The tree after the run counts too: a gate's own output (a tsbuildinfo, a snapshot) is not a change.
  const reusable = mod.cacheable !== false && hash && (cache[key]?.input_hash === hash || cache[key]?.input_hash_after === hash) && (mod.cacheable !== "tree" || cache[key].pass || (ctx.config?.quality?.cache_failures !== false && !cache[key].failures?.some(infraFailure)));
  if (useCache && reusable) {
    const hit = { ...cache[key], cached: true };
    // A reused result is logged too (cached: true): the gate log is the proof that red came before impl,
    // and a red re-run on an identical tree (a kept test dispute) is a hit that writes no other line.
    logGate(ctx, name, hit);
    return hit;
  }
  let failures;
  try {
    failures = await mod.run(ctx);
  } catch (error) {
    failures = [{ check: "gate-error", message: error.message }];
  }
  const result = normaliseResult(name, failures, hash ?? "");
  const invalid = validate("gate-result", result);
  if (invalid.length) throw new Error(`gate ${name} produced an invalid result: ${invalid.join("; ")}`);
  if (cacheFile) {
    // Re-read: a gate may run another gate (verify → checks) that wrote its own entry meanwhile.
    const after = mod.cacheable === "tree" ? inputHash(ctx, mod.inputs ?? [], mod.cacheable) : null;
    writeJson(cacheFile, { ...readJson(cacheFile, {}), [key]: after && after !== hash ? { ...result, input_hash_after: after } : result });
    logGate(ctx, name, result);
  }
  return result;
}

/**
 * The log names the task, and a passing red also the hashes of the red tests it proved: the engine
 * reads both back to verify that red passed before impl (quality.tdd.author: builder_two_phase).
 */
function logGate(ctx, name, result) {
  if (!ctx.feature) return;
  const redLock = name === "red" && result.pass && ctx.task ? Object.fromEntries((ctx.task.tdd?.red_tests ?? []).map((f) => [f, fileHash(join(ctx.projectDir, f))])) : null;
  appendFileSync(join(ctx.feature.dir, "gate-log.jsonl"), `${JSON.stringify({ ts: now(), ...(ctx.task ? { task: ctx.task.id } : {}), ...result, ...(redLock ? { red_lock: redLock } : {}) })}\n`);
}

/** A failure marked warn: true is reported but never blocks: pass, progress and fingerprint ignore it. */
export function normaliseResult(gate, failures, hash = "") {
  const blocking = failures.filter((f) => !f.warn);
  const keys = blocking.map((f) => `${f.check}|${f.rule ?? ""}|${f.file ?? ""}|${normalise(f.message)}`).sort();
  return {
    gate,
    pass: blocking.length === 0,
    progress_signal: blocking.reduce((n, f) => n + (f.count ?? 1), 0),
    fingerprint: blocking.length ? sha(keys.join("\n"), "sha1").slice(0, 12) : null,
    failures,
    cached: false,
    input_hash: hash,
  };
}

/**
 * IDs an artifact DEFINES that are still open (not IDs it merely cites). Only defined items have to be
 * carried downstream: a spec defines REQ/AC/OQ, an ADR its own id, human-notes the open or mapped notes.
 * A requirement's `sources: [HD-1]` cites HD-1; the note itself is tracked through human-notes.yaml.
 */
export function openIds(type, data, kinds) {
  const keep = (ids) => ids.filter((id) => kinds.includes(kindOf(id)));
  if (!data || typeof data !== "object") return [];
  if (type === "human-notes") return keep((data ?? []).filter((n) => ["open", "mapped"].includes(n.status) && n.kind !== "process").map((n) => n.id));
  if (type === "prd" || type === "delta-spec") {
    const reqs = type === "prd" ? data.requirements ?? [] : [...(data.added ?? []), ...(data.modified ?? [])];
    const questions = (data.open_questions ?? []).filter((q) => !["answered", "defaulted"].includes(q.status)).map((q) => q.id);
    return keep([...reqs.flatMap((r) => [r.id, ...(r.acs ?? []).map((a) => a.id)]), ...questions]);
  }
  if (type === "adr") return keep(data.id ? [data.id] : []);
  return [];
}

/**
 * ID coverage: every open item defined in a stage's inputs must be referenced by its outputs.
 * A human note counts as carried when its ID appears, or — once mapped — when one of its targets (or an
 * acceptance criterion of a target requirement) appears. Returns failures in gate format.
 */
export function idCoverage(ctx, { inputs = [], outputs = [], kinds = TRACKED_KINDS }) {
  const required = new Set();
  const notes = [];
  for (const ref of inputs) {
    for (const type of parseArtifactRef(ref).names) {
      if (ARTIFACT_TYPES[type].external) continue;
      for (const item of ctx.all(type)) {
        if (type === "human-notes") notes.push(...(item.data ?? []).filter((n) => kinds.includes("HD") && ["open", "mapped"].includes(n.status) && n.kind !== "process"));
        else for (const id of openIds(type, item.data, kinds)) required.add(id);
      }
    }
  }
  // Whole files, not parsed data: an ID mentioned in a Markdown body carries the item forward too.
  const outputText = outputs
    .flatMap((ref) => parseArtifactRef(ref).names)
    .flatMap((type) => ctx.all(type).map((item) => readText(item.file)))
    .join("\n");
  const present = new Set(extractIds(outputText));
  const acsOf = new Map((ctx.spec()?.reqs ?? []).map((r) => [r.id, r.acs.map((a) => a.id)]));
  const failures = [...required]
    .filter((id) => !present.has(id))
    .map((id) => ({ check: "id-coverage", rule: "tracked-id-dropped", message: `${id} from the stage inputs is missing in its outputs` }));
  for (const note of notes) {
    const targets = note.mapped_to.flatMap((t) => [t, ...(acsOf.get(t) ?? [])]);
    if (present.has(note.id) || (note.status === "mapped" && targets.some((t) => present.has(t)))) continue;
    failures.push({
      check: "id-coverage",
      rule: "note-not-carried",
      message: `${note.id} ("${note.text.slice(0, 50)}") is ${note.status === "open" ? "not mapped (notes_mapped) and not mentioned" : "mapped, but none of its targets appear"} in the stage outputs`,
    });
  }
  return failures;
}

