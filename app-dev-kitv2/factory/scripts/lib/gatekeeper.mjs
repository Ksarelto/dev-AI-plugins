// Gatekeeper: runs a named gate (scripts/gates/<name>.mjs) and normalises its result to
// { gate, pass, progress_signal, fingerprint, failures, cached }. Gates never make judgement calls.
import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ENGINE_ROOT, factoryPaths, readJson, readText, sha, toPosix, writeJson, now } from "./core.mjs";
import { TRACKED_KINDS, extractIds } from "./ids.mjs";
import { ARTIFACT_TYPES, artifactFiles, loadArtifact, parseArtifactRef, validate } from "./schemas.mjs";

/** Everything a gate may look at. Gates read through these helpers, never by guessing paths. */
export function gateContext({ projectDir, app, feature, config, stage, task }) {
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
    if (delta) return { ...delta, kind: "delta-spec", reqs: [...(delta.data.added ?? []), ...(delta.data.modified ?? [])] };
    return null;
  };
  return { projectDir, paths, dirs, app, feature, state: feature?.state, config, stage, task, load, all, spec };
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

/** Hash of every input artifact a gate depends on; unchanged inputs reuse the cached result. */
function inputHash(ctx, inputs) {
  const parts = [];
  for (const type of inputs) {
    for (const file of artifactFiles(type, ctx.dirs)) parts.push(`${type}:${sha(readText(file))}`);
  }
  if (ctx.task) parts.push(JSON.stringify(ctx.task));
  return sha(parts.join("\n"));
}

export async function runGate(name, ctx, { useCache = true } = {}) {
  const mod = await gateModule(name);
  const hash = inputHash(ctx, mod.inputs ?? []);
  const cacheFile = ctx.feature ? join(ctx.feature.dir, "gate-cache.json") : null;
  const cache = cacheFile ? readJson(cacheFile, {}) : {};
  const key = ctx.task ? `${name}:${ctx.task.id}` : name;
  if (useCache && mod.cacheable !== false && cache[key]?.input_hash === hash) {
    return { ...cache[key], cached: true };
  }
  let failures;
  try {
    failures = await mod.run(ctx);
  } catch (error) {
    failures = [{ check: "gate-error", message: error.message }];
  }
  const result = normaliseResult(name, failures, hash);
  const invalid = validate("gate-result", result);
  if (invalid.length) throw new Error(`gate ${name} produced an invalid result: ${invalid.join("; ")}`);
  if (cacheFile) {
    cache[key] = result;
    writeJson(cacheFile, cache);
    appendFileSync(join(ctx.feature.dir, "gate-log.jsonl"), `${JSON.stringify({ ts: now(), ...result })}\n`);
  }
  return result;
}

export function normaliseResult(gate, failures, hash = "") {
  const keys = failures.map((f) => `${f.check}|${f.rule ?? ""}|${f.file ?? ""}|${normalise(f.message)}`).sort();
  return {
    gate,
    pass: failures.length === 0,
    progress_signal: failures.reduce((n, f) => n + (f.count ?? 1), 0),
    fingerprint: failures.length ? sha(keys.join("\n"), "sha1").slice(0, 12) : null,
    failures,
    cached: false,
    input_hash: hash,
  };
}

/** IDs of the given kinds that are still open in an artifact (closed OQs and finished notes drop out). */
export function openIds(type, data, kinds) {
  if (type === "human-notes") {
    return (data ?? []).filter((n) => ["open", "mapped"].includes(n.status) && kinds.includes("HD")).map((n) => n.id);
  }
  const closedOq = new Set(
    (data?.open_questions ?? []).filter((q) => ["answered", "defaulted"].includes(q.status)).map((q) => q.id),
  );
  const text = typeof data === "string" ? data : JSON.stringify(data ?? {});
  return extractIds(text, kinds).filter((id) => !closedOq.has(id));
}

/**
 * ID coverage: every open ID of the tracked kinds found in a stage's inputs must appear in its outputs.
 * Returns failures in gate format. Inputs and outputs are artifact-type refs from stage.yaml.
 */
export function idCoverage(ctx, { inputs = [], outputs = [], kinds = TRACKED_KINDS }) {
  const collect = (refs) => {
    const ids = new Set();
    for (const ref of refs) {
      for (const type of parseArtifactRef(ref).names) {
        if (ARTIFACT_TYPES[type].external) continue;
        for (const item of ctx.all(type)) for (const id of openIds(type, item.data, kinds)) ids.add(id);
      }
    }
    return ids;
  };
  const upstream = collect(inputs);
  const outputText = outputs
    .flatMap((ref) => parseArtifactRef(ref).names)
    .flatMap((type) => ctx.all(type).map((item) => (typeof item.data === "string" ? item.data : JSON.stringify(item.data))))
    .join("\n");
  const present = new Set(extractIds(outputText, kinds));
  return [...upstream]
    .filter((id) => !present.has(id))
    .map((id) => ({ check: "id-coverage", rule: "tracked-id-dropped", message: `${id} from the stage inputs is missing in its outputs` }));
}

