// `factory doctor`: proves the installed set fits together before anything runs.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_ROOT, factoryPaths, readJson, satisfiesRange, now, writeJson, writeYaml } from "./core.mjs";
import { enabledRoles, loadConfig } from "./config.mjs";
import { gateNames } from "./gatekeeper.mjs";
import { pathsOverlap, rolePath } from "./tasks.mjs";
import { readPack, registerPack, resolvePacks, scanCandidates, stageIndex } from "./registry.mjs";
import { ARTIFACT_TYPES, parseArtifactRef, validate } from "./schemas.mjs";
import { ENGINE_PACK, MODELS, resolveAgents, resolveStage } from "./conductor.mjs";
import { appendEvent } from "./state.mjs";

export function doctor(projectDir, { register } = {}) {
  const errors = [];
  const warnings = [];
  const paths = factoryPaths(projectDir);
  if (register) registerPack(projectDir, register);
  if (!existsSync(paths.root)) return { ok: false, errors: ["no .factory/ — run /factory:init"], warnings, packs: {} };

  const config = loadConfig(projectDir);
  for (const e of validate("config", config)) errors.push(`config: ${e}`);
  const { packs, sources, warnings: regWarnings } = resolvePacks(projectDir, config);
  warnings.push(...regWarnings);
  const engineVersion = packs[ENGINE_PACK]?.version ?? readJson(join(ENGINE_ROOT, ".claude-plugin", "plugin.json")).version;

  for (const pack of Object.values(packs)) {
    const checks = [...Object.values(pack.stages).map((m) => ["stage", m]), ...["role", "stack", "adapter"].filter((k) => pack[k]).map((k) => [k, pack[k]])];
    for (const [kind, manifest] of checks) {
      const { pack: _p, ...data } = manifest;
      for (const e of validate(kind, data)) errors.push(`${pack.name} ${kind}${kind === "stage" ? ` ${manifest.id}` : ""}: ${e}`);
      const range = data.requires?.factory;
      if (range && !satisfiesRange(engineVersion, range)) errors.push(`${pack.name} requires factory ${range}, installed ${engineVersion}`);
    }
  }
  for (const dup of stageIndex(packs).duplicates) {
    const id = dup.split(":")[0];
    if (!config.pipeline?.stages?.[id]?.pack) warnings.push(`stage ${dup} — set pipeline.stages.${id}.pack to choose`);
  }

  const c = { config, packs };
  const gates = new Set(gateNames());
  const active = config.pipeline?.profile ?? "standard";
  for (const [profile, stages] of Object.entries(config.pipeline?.profiles ?? {})) {
    const report = profile === active ? errors : warnings;
    const produced = new Set(Object.keys(ARTIFACT_TYPES).filter((t) => ARTIFACT_TYPES[t].external || ARTIFACT_TYPES[t].producer === "engine"));
    for (const id of stages) {
      const stage = resolveStage(c, id);
      if (!stage) {
        report.push(`profile ${profile}: stage "${id}" is not provided by any installed pack`);
        continue;
      }
      for (const g of [stage.gate].flat().filter(Boolean)) if (!gates.has(g)) report.push(`stage ${id}: unknown gate "${g}"`);
      for (const [type, agent] of Object.entries(stage.owners ?? {})) {
        if (!(stage.outputs ?? []).some((ref) => ref.replace(/\?$/, "").split("|").includes(type))) report.push(`stage ${id}: owners names "${type}", which is not an output`);
        // An owner may come from a role slot (role:architect → ai-architect), whether or not that role is enabled.
        const fromSlot = (a) => a.startsWith("role:") && Object.values(c.packs).some((p) => p.role?.agents?.[a.slice(5)] === agent);
        if (!(stage.agents ?? []).some((a) => a === agent || a.endsWith(`:${agent}`) || fromSlot(a))) report.push(`stage ${id}: owner "${agent}" is not one of the stage's agents`);
      }
      const goto = /^(?:goto|fix):(.+)$/.exec(stage.on_fail ?? "")?.[1] ?? /^fix:(.+)$/.exec(stage.on_reject ?? "")?.[1];
      if (goto && stages.indexOf(goto) === -1) report.push(`stage ${id}: on_fail target "${goto}" is not in profile ${profile}`);
      if (goto && stages.indexOf(goto) > stages.indexOf(id)) report.push(`stage ${id}: on_fail must point backwards, "${goto}" comes later`);
      if (stage.kind !== "task_loop") {
        for (const t of resolveAgents(c, stage)) {
          if (!t.pack) report.push(`stage ${id}: agent pack for "${t.subagent_type}" is not installed`);
          else if (!t.pack.agents.includes(t.agent)) report.push(`stage ${id}: ${t.pack.name} has no agent "${t.agent}"`);
          else if (!MODELS.includes(t.model)) report.push(`stage ${id}: ${t.subagent_type} declares model "${t.model}"; use ${MODELS.join(", ")}`);
        }
        if (!stage.agents?.length) report.push(`stage ${id}: kind "${stage.kind}" lists no agents`);
      }
      for (const ref of stage.inputs ?? []) {
        let parsed;
        try {
          parsed = parseArtifactRef(ref);
        } catch (e) {
          report.push(`stage ${id}: ${e.message}`);
          continue;
        }
        if (!parsed.optional && !parsed.names.some((n) => produced.has(n))) {
          report.push(`profile ${profile}: stage ${id} needs "${ref}" but no earlier stage produces it`);
        }
      }
      for (const ref of stage.outputs ?? []) {
        try {
          for (const n of parseArtifactRef(ref).names) produced.add(n);
        } catch (e) {
          report.push(`stage ${id}: ${e.message}`);
        }
      }
    }
  }

  for (const role of enabledRoles(config)) {
    const pack = packs[role.pack];
    if (!pack?.role) {
      errors.push(`role ${role.name}: pack "${role.pack}" with role.yaml is not installed`);
      continue;
    }
    for (const [slot, agent] of Object.entries(pack.role.agents)) {
      const named = typeof agent === "string" ? [agent] : Array.isArray(agent) ? agent : Object.values(agent);
      for (const a of named) if (!pack.agents.includes(a)) errors.push(`role ${role.name}: ${slot} agent "${a}" missing in ${pack.name}`);
    }
    for (const type of Object.keys(pack.role.agents.builders ?? {})) {
      if (!pack.role.task_types.includes(type)) errors.push(`role ${role.name}: builders names "${type}", which is not in task_types`);
    }
    for (const check of pack.role.gates.checks ?? []) {
      if (check.node && !existsSync(join(pack.root, check.node))) errors.push(`role ${role.name}: check ${check.name} script ${check.node} is missing in ${pack.name}`);
      if (check.command && packs[role.stack]?.stack && !packs[role.stack].stack.commands?.[check.command] && !role.stack_overrides?.commands?.[check.command]) {
        errors.push(`role ${role.name}: check ${check.name} needs the stack command "${check.command}", which ${role.stack} does not define`);
      }
    }
    const stack = packs[role.stack];
    if (!stack?.stack) errors.push(`role ${role.name}: stack pack "${role.stack}" with stack.yaml is not installed`);
    if (role.path && !existsSync(join(projectDir, role.path))) errors.push(`role ${role.name}: its folder roles.${role.name}.path "${role.path}" does not exist (set path: "." for a role at the project root)`);
  }
  const roles = enabledRoles(config);
  for (let i = 0; i < roles.length; i++) {
    for (const other of roles.slice(i + 1)) {
      const [a, b] = [rolePath(config, roles[i].name), rolePath(config, other.name)];
      if (pathsOverlap(a, b)) warnings.push(`roles ${roles[i].name} and ${other.name} share the folder "${a || "."}"${a !== b ? ` / "${b || "."}"` : ""}: their tasks run one at a time (give each role its own roles.<role>.path to run tracks in parallel)`);
    }
  }
  const adapter = config.delivery?.adapter;
  if (adapter && !packs[adapter]?.adapter) warnings.push(`delivery adapter "${adapter}" is not installed (needed at the delivery stage)`);

  const relevant = Object.values(packs).filter((p) => p.name === ENGINE_PACK || Object.keys(p.stages).length || p.role || p.stack || p.adapter);
  const packList = Object.fromEntries(relevant.map((p) => [p.name, { version: p.version, source: sources[p.name], root: p.root }]));
  return { ok: errors.length === 0, errors, warnings, packs: packList };
}

const GITIGNORE = ["packs/", "envelopes/", ".registry/", ".active/", "logs/", "features/*/snapshots/", "features/*/acceptance-lock/", ".lock", "gate-cache.json", "*.tmp", ""].join("\n");

export function init(projectDir, { mode = "unknown", name, roles } = {}) {
  const paths = factoryPaths(projectDir);
  if (existsSync(paths.state)) return { created: false, note: ".factory/ already initialised", root: paths.root };
  for (const dir of [paths.root, paths.inbox, paths.context, paths.features]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(paths.root, ".gitignore"), GITIGNORE);
  if (!existsSync(paths.config)) {
    const project = { version: 1, project: { name: name ?? projectDir.split(/[\\/]/).pop() } };
    if (roles) {
      const wanted = roles.split(",").map((r) => r.trim());
      project.roles = Object.fromEntries(["frontend", "backend", "ai-agent"].map((r) => [r, { enabled: wanted.includes(r) }]));
    }
    writeYaml(paths.config, project);
  }
  writeJson(paths.state, { version: 1, mode, next_ids: {}, features: {}, active_feature: null, initialized_at: now() });
  appendEvent(projectDir, { type: "init", mode });
  const registered = [];
  for (const root of [ENGINE_ROOT, ...(process.env.FACTORY_NO_SCAN ? [] : scanCandidates())]) {
    const pack = readPack(root);
    const isFactoryPack = pack && (pack.name === ENGINE_PACK || Object.keys(pack.stages).length || pack.role || pack.stack || pack.adapter);
    if (isFactoryPack) registered.push(registerPack(projectDir, root, "init").name);
  }
  return { created: true, root: paths.root, registered, next: "Put requirements in .factory/inbox/ and run /factory:intake" };
}
