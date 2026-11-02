// Finds installed packs and loads their manifests. Sources, highest priority first:
//   1. config `packs:` (explicit paths — Cursor, CI, --plugin-dir testing)
//   2. FACTORY_PACK_PATHS (path-delimited list)
//   3. .factory/.registry/<pack>.json, written by each pack's SessionStart hook
//   4. a scan: sibling plugins in the plugin cache, or the marketplace that contains the engine
import { existsSync, readdirSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { ENGINE_ROOT, factoryPaths, readJson, readYaml, writeJson, now } from "./core.mjs";

export function readPack(root) {
  const manifestPath = join(root, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return null;
  const plugin = readJson(manifestPath);
  const pack = {
    name: plugin.name,
    version: plugin.version ?? "0.0.0",
    root,
    stages: {},
    role: null,
    stack: null,
    adapter: null,
    agents: listNames(join(root, "agents"), (f) => f.endsWith(".md"), (f) => f.slice(0, -3)),
    skills: listNames(join(root, "skills"), (f) => existsSync(join(root, "skills", f, "SKILL.md"))),
  };
  const stagesDir = join(root, "stages");
  for (const id of listNames(stagesDir, (f) => existsSync(join(stagesDir, f, "stage.yaml")))) {
    pack.stages[id] = { ...readYaml(join(stagesDir, id, "stage.yaml")), pack: pack.name };
  }
  for (const kind of ["role", "stack", "adapter"]) {
    const file = join(root, `${kind}.yaml`);
    if (existsSync(file)) pack[kind] = readYaml(file);
  }
  return pack;
}

function listNames(dir, keep, map = (f) => f) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(keep).map(map).sort();
}

/** Plugin roots next to the engine: cache/<marketplace>/<plugin>/<version>/ or a marketplace checkout. */
export function scanCandidates(engineRoot = ENGINE_ROOT) {
  const roots = new Set();
  // Installed layout: <cache>/<marketplace>/<plugin>/<version>/
  const pluginsDir = dirname(dirname(engineRoot));
  if (existsSync(pluginsDir) && /^\d+\.\d+/.test(engineRoot.split(/[\\/]/).pop())) {
    for (const plugin of readdirSync(pluginsDir)) {
      const dir = join(pluginsDir, plugin);
      if (!statSync(dir).isDirectory()) continue;
      const versions = readdirSync(dir).filter((v) => existsSync(join(dir, v, ".claude-plugin", "plugin.json")));
      versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (versions.length) roots.add(join(dir, versions.at(-1)));
    }
  }
  // Marketplace checkout (dev mode, or ~/.claude/plugins/marketplaces/<name>/): walk up to the manifest.
  let dir = engineRoot;
  for (let i = 0; i < 4; i++) {
    dir = dirname(dir);
    const market = join(dir, ".claude-plugin", "marketplace.json");
    if (!existsSync(market)) continue;
    for (const entry of readJson(market).plugins ?? []) roots.add(resolve(dir, entry.source));
    break;
  }
  return [...roots];
}

export function resolvePacks(projectDir, config = {}) {
  const paths = factoryPaths(projectDir);
  const packs = {};
  const sources = {};
  const warnings = [];
  const add = (root, source) => {
    const abs = isAbsolute(root) ? root : resolve(projectDir, root);
    if (!existsSync(abs)) {
      warnings.push(`${source}: pack path does not exist: ${root}`);
      return;
    }
    const pack = readPack(abs);
    if (!pack) {
      warnings.push(`${source}: no .claude-plugin/plugin.json under ${root}`);
      return;
    }
    if (packs[pack.name]) return;
    packs[pack.name] = pack;
    sources[pack.name] = source;
  };

  for (const root of Object.values(config.packs ?? {})) add(root, "config");
  for (const root of (process.env.FACTORY_PACK_PATHS ?? "").split(delimiter).filter(Boolean)) add(root, "env");

  if (existsSync(paths.registry)) {
    const entries = readdirSync(paths.registry)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson(join(paths.registry, f)));
    const latest = entries.reduce((acc, e) => (e.ts > (acc?.ts ?? "") ? e : acc), null)?.session_id;
    for (const entry of entries) {
      // Entries from an older session belong to packs that did not start this session (disabled or
      // uninstalled). Ignore them; an explicit config path or the scan can still provide the pack.
      if (latest && entry.session_id !== latest && entry.session_id !== "init") {
        warnings.push(`registry: ${entry.name} was not loaded in the latest session — ignored`);
        continue;
      }
      add(entry.root, "registry");
    }
  }

  if (!process.env.FACTORY_NO_SCAN) for (const root of scanCandidates()) add(root, "scan");
  add(ENGINE_ROOT, "engine");
  return { packs, sources, warnings };
}

/** Records a pack root in the project registry (used by the SessionStart hook and doctor --register). */
export function registerPack(projectDir, root, sessionId = "manual") {
  const pack = readPack(root);
  if (!pack) throw new Error(`not a plugin root: ${root}`);
  const entry = { name: pack.name, version: pack.version, root, session_id: sessionId, ts: now() };
  writeJson(join(factoryPaths(projectDir).registry, `${pack.name}.json`), entry);
  return entry;
}

/** All stage manifests provided by the resolved packs, keyed by stage id. */
export function stageIndex(packs) {
  const index = {};
  const duplicates = [];
  for (const pack of Object.values(packs)) {
    for (const [id, stage] of Object.entries(pack.stages)) {
      if (index[id]) duplicates.push(`${id}: provided by ${index[id].pack} and ${pack.name}`);
      else index[id] = stage;
    }
  }
  return { index, duplicates };
}
