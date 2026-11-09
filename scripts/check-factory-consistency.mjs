// Consistency and duplication check for the app-dev-kitv2 plugin family (and the stack kits it uses).
//   node scripts/check-factory-consistency.mjs          human-readable report, exit 1 on errors
//   node scripts/check-factory-consistency.mjs --json   machine-readable
// The second half of the consistency step is a fresh-context reviewer subagent; this script is the
// deterministic part that runs on every change.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { findForkedLoads } from "./forked-skills.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const family = join(root, "app-dev-kitv2");
const STACK_KITS = ["frontend-dev-kit", "node-backend-dev-kit", "node-agent-dev-kit"];
const LIMITS = { skill: 150, rule: 40, agent: 120 };

// Model policy (Suggestions/05 "Model tiering" + the approved plan). Every v2 agent must be listed.
const MODEL_POLICY = {
  opus: ["requirements-analyst", "solution-architect", "planner", "reviewer", "ai-architect", "diagnostician"],
  sonnet: ["codebase-analyst", "story-writer", "contract-steward", "test-strategist", "acceptance-test-author", "qa-engineer",
    "fe-test-author", "fe-builder", "be-test-author", "be-builder", "migration-author",
    "ai-builder", "ai-rag-builder", "eval-author", "ai-test-author", "release-manager"],
  haiku: ["intake-normaliser", "curator", "tech-writer"],
};
// Names from the design that are implemented in later phases or deliberately different.
const ALLOW = YAML.parse(readFileSync(join(family, "consistency-allowlist.yaml"), "utf8"));

const errors = [];
const warnings = [];
const info = [];
const rel = (p) => relative(root, p);

function walk(dir, keep = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "vendor", "cursor-agents"].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}

function frontMatter(file) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(readFileSync(file, "utf8"));
  if (!m) return { data: null, body: readFileSync(file, "utf8") };
  try {
    return { data: YAML.parse(m[1]) ?? {}, body: m[2] };
  } catch (e) {
    errors.push(`${rel(file)}: front matter is not valid YAML (${e.message.split("\n")[0]})`);
    return { data: {}, body: m[2] };
  }
}

const plugins = readdirSync(family)
  .map((name) => join(family, name))
  .filter((dir) => existsSync(join(dir, ".claude-plugin", "plugin.json")))
  .map((dir) => {
    const manifest = JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8"));
    const agents = walk(join(dir, "agents"), (f) => f.endsWith(".md")).map((f) => ({ file: f, name: basename(f, ".md"), ...frontMatter(f) }));
    const skills = existsSync(join(dir, "skills"))
      ? readdirSync(join(dir, "skills"))
          .filter((s) => existsSync(join(dir, "skills", s, "SKILL.md")))
          .map((s) => ({ file: join(dir, "skills", s, "SKILL.md"), name: s, ...frontMatter(join(dir, "skills", s, "SKILL.md")) }))
      : [];
    const stages = existsSync(join(dir, "stages"))
      ? readdirSync(join(dir, "stages")).map((id) => ({ id, file: join(dir, "stages", id, "stage.yaml"), data: YAML.parse(readFileSync(join(dir, "stages", id, "stage.yaml"), "utf8")) }))
      : [];
    const role = existsSync(join(dir, "role.yaml")) ? YAML.parse(readFileSync(join(dir, "role.yaml"), "utf8")) : null;
    return { dir, name: manifest.name, manifest, agents, skills, stages, role };
  });
const byName = Object.fromEntries(plugins.map((p) => [p.name, p]));
const stackSkillNames = Object.fromEntries(STACK_KITS.map((name) => {
  const dir = join(root, name, "skills");
  const names = existsSync(dir) ? readdirSync(dir).filter((s) => existsSync(join(dir, s, "SKILL.md"))) : [];
  return [name, new Set(names)];
}));
const allAgents = plugins.flatMap((p) => p.agents.map((a) => ({ ...a, plugin: p.name })));
const allSkills = plugins.flatMap((p) => p.skills.map((s) => ({ ...s, plugin: p.name })));

// 0. A forked skill (context: fork) is never one a dispatched agent is told to load --------------
for (const h of findForkedLoads(root)) {
  errors.push(`${h.file}:${h.line}: names the forked skill ${h.skill} (context: fork runs as a separate agent outside the dispatch's write scope); name the stack's non-forked skill instead (frontend-dev-kit:react-feature)`);
}

// 1. Line limits and front matter intent -------------------------------------------------------
for (const s of allSkills) {
  const lines = readFileSync(s.file, "utf8").split("\n").length;
  if (lines >= LIMITS.skill) errors.push(`${rel(s.file)}: ${lines} lines (SKILL.md must stay under ${LIMITS.skill})`);
  if (s.data?.name !== s.name) errors.push(`${rel(s.file)}: name "${s.data?.name}" must equal the folder name "${s.name}"`);
  const entry = s.data?.["disable-model-invocation"] === true;
  const procedure = s.data?.["user-invocable"] === false;
  if (entry === procedure) errors.push(`${rel(s.file)}: set exactly one of disable-model-invocation: true (entry) or user-invocable: false (procedure)`);
  if (s.data?.context === "fork" && (/\bAgent\b/.test(String(s.data["allowed-tools"])) || /dispatch(es)? .*agents?|Agent call/i.test(s.body))) {
    errors.push(`${rel(s.file)}: context: fork on a skill that dispatches agents — dispatching belongs to the Conductor`);
  }
}
for (const a of allAgents) {
  const lines = readFileSync(a.file, "utf8").split("\n").length;
  if (lines > LIMITS.agent) errors.push(`${rel(a.file)}: ${lines} lines (agents ≤ ${LIMITS.agent})`);
  if (a.data?.name !== a.name) errors.push(`${rel(a.file)}: name "${a.data?.name}" must equal the file name`);
  // An explicit `tools:` allowlist hides the Skill tool, yet every dispatch pack tells the agent to
  // load its stack skills with it — without "Skill" the agent runs without the kit's rules.
  const toolList = String(a.data?.tools ?? "").replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean);
  if (toolList.length && !toolList.includes("Skill")) errors.push(`${rel(a.file)}: tools: lacks "Skill", so the agent cannot load the stack skills its pack names`);
  const tier = Object.keys(MODEL_POLICY).find((t) => MODEL_POLICY[t].includes(a.name));
  if (!tier) errors.push(`${rel(a.file)}: "${a.name}" is not in the model policy table — add it deliberately`);
  else if (a.data?.model !== tier) errors.push(`${rel(a.file)}: model ${a.data?.model}, policy says ${tier}`);
  // Every agent documents its fixed model: a "## Model" section whose first bold word is that model.
  const modelSection = /^## Model\s*\n+\*\*(\w+)\*\*/m.exec(readFileSync(a.file, "utf8"));
  if (!modelSection) errors.push(`${rel(a.file)}: no "## Model" section starting with **${a.data?.model}** (why this tier, what it is sized for, escalation, Cursor id)`);
  else if (modelSection[1] !== a.data?.model) errors.push(`${rel(a.file)}: "## Model" says ${modelSection[1]}, frontmatter says ${a.data?.model}`);
  const own = new Set(byName[a.plugin].skills.map((s) => s.name));
  for (const skill of a.data?.skills ?? []) {
    const name = String(skill);
    if (name.includes(":")) {
      const [plugin, bare] = name.split(":");
      if (!stackSkillNames[plugin]?.has(bare)) errors.push(`${rel(a.file)}: preloads "${name}", which ${plugin || "that plugin"} does not ship`);
      continue;
    }
    if (!own.has(name)) errors.push(`${rel(a.file)}: preloads skill "${name}", which ${a.plugin} does not ship`);
  }
  for (const skill of a.data?.skills ?? []) {
    if (String(skill).includes(":")) continue;
    const s = byName[a.plugin].skills.find((x) => x.name === skill);
    if (s?.data?.["disable-model-invocation"] === true) errors.push(`${rel(a.file)}: preloads "${skill}", but disable-model-invocation stops preloading`);
  }
}
// A procedure skill (preloaded by an agent) says which agent and model run it, right under its title.
for (const s of allSkills.filter((x) => x.data?.["user-invocable"] === false)) {
  if (!/^# .+\n+Runs on: \S/m.test(readFileSync(s.file, "utf8"))) errors.push(`${rel(s.file)}: no "Runs on: <agent> (<model>) — …" line under the title`);
}
for (const f of plugins.flatMap((p) => walk(join(p.dir, "rules"), (x) => x.endsWith(".mdc")))) {
  const lines = readFileSync(f, "utf8").split("\n").length;
  if (lines > LIMITS.rule) errors.push(`${rel(f)}: ${lines} lines (rules ≤ ${LIMITS.rule})`);
}

// 2. Every agent is wired somewhere, every wired agent exists ----------------------------------
const engineCode = walk(join(family, "factory", "scripts"), (f) => f.endsWith(".mjs")).map((f) => readFileSync(f, "utf8")).join("\n");
const wired = new Set();
for (const p of plugins) {
  for (const st of p.stages) {
    for (const ref of st.data.agents ?? []) {
      if (ref.startsWith("role:")) continue;
      const [pk, ag] = ref.includes(":") ? ref.split(":") : [p.name, ref];
      wired.add(`${pk}:${ag}`);
      if (!byName[pk]?.agents.some((a) => a.name === ag)) errors.push(`${rel(st.file)}: agent "${ref}" does not exist`);
    }
  }
  if (p.role) {
    // A slot names one agent, a list, or a map (builders: task type → agent).
    for (const ag of Object.values(p.role.agents ?? {}).flatMap((v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.values(v) : v))) {
      wired.add(`${p.name}:${ag}`);
      if (!p.agents.some((a) => a.name === ag)) errors.push(`${p.name}/role.yaml: agent "${ag}" does not exist`);
    }
  }
}
for (const a of allAgents) {
  const engineUse = a.plugin === "factory" && engineCode.includes(`"${a.name}"`);
  if (!wired.has(`${a.plugin}:${a.name}`) && !engineUse) errors.push(`${rel(a.file)}: no stage.yaml, role.yaml or engine code dispatches "${a.name}"`);
}

// 3. Schemas and artifact types are all used ---------------------------------------------------
const schemaDir = join(family, "factory", "schemas");
const types = YAML.parse(readFileSync(join(schemaDir, "artifact-types.yaml"), "utf8"));
const typeSchemas = new Set(Object.values(types).map((t) => t.schema).filter(Boolean));
for (const f of readdirSync(schemaDir).filter((x) => x.endsWith(".schema.json"))) {
  const name = f.replace(".schema.json", "");
  if (!typeSchemas.has(name) && !engineCode.includes(`"${name}"`)) errors.push(`${rel(join(schemaDir, f))}: schema is never used`);
}
const produced = new Set(Object.keys(types).filter((t) => types[t].external || types[t].producer === "engine"));
const consumed = new Set();
for (const st of plugins.flatMap((p) => p.stages)) {
  for (const ref of st.data.outputs ?? []) for (const t of ref.replace(/\?$/, "").split("|")) produced.add(t);
  for (const ref of st.data.inputs ?? []) for (const t of ref.replace(/\?$/, "").split("|")) consumed.add(t);
}
for (const t of consumed) {
  if (!types[t]) errors.push(`stage input "${t}" is not an artifact type`);
  else if (!produced.has(t) && !(ALLOW.pending_artifact_types ?? []).includes(t)) {
    errors.push(`artifact type "${t}" is consumed by a stage but no stage produces it`);
  }
}
for (const t of Object.keys(types)) {
  if (!produced.has(t) && !consumed.has(t) && !(ALLOW.pending_artifact_types ?? []).includes(t)) {
    warnings.push(`artifact type "${t}" is neither produced nor consumed by an installed stage yet`);
  }
}

// 4. File names that the repo's read-budget scan resolves by basename must be unique -----------
const repoFiles = walk(root, () => true).filter((f) => !f.includes(`${join("app-dev-kitv2", "tests")}`));
const counts = new Map();
for (const f of repoFiles) counts.set(basename(f), (counts.get(basename(f)) ?? 0) + 1);
for (const f of walk(family, (x) => /[\\/](references|templates|fixtures)[\\/]/.test(x) && !x.includes(`${join("app-dev-kitv2", "tests")}`))) {
  if (counts.get(basename(f)) > 1) errors.push(`${rel(f)}: file name "${basename(f)}" exists elsewhere in the repo; the read-budget scan resolves by name`);
}

// 5. Duplication: exact files and near-duplicate paragraphs ------------------------------------
const GENERATED = /[\\/](hooks[\\/](register\.mjs|(cursor-)?hooks\.json))$/;
const corpus = [
  ...walk(family, (f) => /\.(md|mdc|yaml|mjs|json)$/.test(f) && !f.includes(`${join("app-dev-kitv2", "tests")}`) && !GENERATED.test(f)),
  ...STACK_KITS.flatMap((k) => walk(join(root, k), (f) => /\.(md|mdc)$/.test(f))),
];
const hashes = new Map();
for (const f of corpus) {
  const h = createHash("sha1").update(readFileSync(f)).digest("hex");
  if (hashes.has(h) && !f.endsWith("plugin.json")) errors.push(`exact duplicate: ${rel(f)} = ${rel(hashes.get(h))}`);
  hashes.set(h, f);
}
const STOP = new Set("the a an and or of to in on for is are be it its this that with as by at from not no do does you your".split(" "));
const words = (t) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
const shingles = (ws) => new Set(ws.slice(0, -4).map((_, i) => ws.slice(i, i + 5).join(" ")));
const paragraphs = [];
for (const f of corpus.filter((x) => /\.(md|mdc)$/.test(x))) {
  for (const p of readFileSync(f, "utf8").split(/\n\s*\n/)) {
    const ws = words(p);
    if (ws.length >= 30) paragraphs.push({ f, text: p.slice(0, 60).replace(/\s+/g, " "), sh: shingles(ws), v2: f.startsWith(family) });
  }
}
for (let i = 0; i < paragraphs.length; i++) {
  for (let j = i + 1; j < paragraphs.length; j++) {
    const a = paragraphs[i];
    const b = paragraphs[j];
    if (!a.v2 && !b.v2) continue; // stack kits among themselves are not this check's business
    let inter = 0;
    for (const s of a.sh) if (b.sh.has(s)) inter++;
    const jac = inter / (a.sh.size + b.sh.size - inter || 1);
    if (jac > 0.6) errors.push(`near-duplicate paragraph (${Math.round(jac * 100)}%): ${rel(a.f)} "${a.text}…" ≈ ${rel(b.f)}`);
  }
}

// 6. Overlapping descriptions (the eval runner's tokenizer idea) -------------------------------
const items = [...allSkills.map((s) => ({ kind: "skill", ...s })), ...allAgents.map((a) => ({ kind: "agent", ...a }))];
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const A = new Set(words(items[i].data?.description ?? ""));
    const B = new Set(words(items[j].data?.description ?? ""));
    const inter = [...A].filter((w) => B.has(w)).length;
    const overlap = inter / Math.min(A.size || 1, B.size || 1);
    if (overlap > 0.7) errors.push(`overlapping descriptions (${Math.round(overlap * 100)}%): ${items[i].kind} ${items[i].name} ↔ ${items[j].kind} ${items[j].name}`);
  }
}

// 7. Stack manifests point at things that exist ------------------------------------------------
for (const kit of STACK_KITS) {
  const file = join(root, kit, "stack.yaml");
  if (!existsSync(file)) {
    errors.push(`${kit}/stack.yaml is missing`);
    continue;
  }
  const stack = YAML.parse(readFileSync(file, "utf8"));
  const skillExists = (ref) => {
    const [k, s] = String(ref).split(":");
    return existsSync(join(root, k, "skills", s ?? "", "SKILL.md"));
  };
  // A `context: fork` skill runs as a separate agent that the dispatch's write scope does not bind.
  const forked = (ref) => {
    const [k, s] = String(ref).split(":");
    const f = join(root, k, "skills", s ?? "", "SKILL.md");
    return existsSync(f) && /^---\n[\s\S]*?^context:\s*fork\s*$[\s\S]*?^---/m.test(readFileSync(f, "utf8"));
  };
  for (const [type, refs] of Object.entries(stack.skills ?? {})) {
    for (const ref of [refs].flat()) {
      if (!skillExists(ref)) errors.push(`${kit}/stack.yaml: task type "${type}" → ${ref} does not exist`);
      else if (forked(ref)) errors.push(`${kit}/stack.yaml: task type "${type}" → ${ref} has context: fork (a forked skill may edit outside the dispatch's scope)`);
    }
  }
  for (const [type, paths] of Object.entries(stack.golden_files ?? {})) {
    for (const path of [paths].flat()) if (!existsSync(join(root, kit, path))) errors.push(`${kit}/stack.yaml: golden file for "${type}" (${path}) does not exist`);
  }
  for (const [type, paths] of Object.entries(stack.rules ?? {})) {
    for (const path of [paths].flat()) if (!existsSync(join(root, kit, path))) errors.push(`${kit}/stack.yaml: rule for "${type}" (${path}) does not exist`);
  }
  const agentNames = new Set(allAgents.map((a) => a.name));
  for (const [agent, refs] of Object.entries(stack.stage_skills ?? {})) {
    if (!agentNames.has(agent)) errors.push(`${kit}/stack.yaml: stage_skills names "${agent}", which no factory pack ships`);
    for (const ref of [refs].flat()) {
      if (!skillExists(ref)) errors.push(`${kit}/stack.yaml: stage_skills for "${agent}" → ${ref} does not exist`);
      else if (forked(ref)) errors.push(`${kit}/stack.yaml: stage_skills for "${agent}" → ${ref} has context: fork (a forked skill may edit outside the dispatch's scope)`);
    }
  }
}

// 7b. Prose does not quote a per-type file cap that role.yaml contradicts ----------------------------
// A role's caps live in role.yaml budgets.task_limits (default 12): "within four files" in an agent or skill
// goes stale; point at role.yaml instead. A quoted "N files" cap must equal one of the role's caps.
const WORD_NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
for (const p of plugins.filter((x) => x.role)) {
  const caps = new Set([12, ...Object.values(p.role.budgets?.task_limits ?? {}).map((v) => v.files_max).filter(Boolean)]);
  const docs = [...p.agents.map((a) => a.file), ...p.skills.map((x) => x.file), ...walk(join(p.dir, "skills"), (f) => f.endsWith(".md") && f.includes("/references/"))];
  for (const file of docs) {
    for (const m of readFileSync(file, "utf8").matchAll(/\b(?:within|at most|up to|max(?:imum)?(?: of)?|keeps? [^.\n]{0,30} at)\s+\(?(\w+)\s+files\b|\((\w+) at most\)/gi)) {
      const n = Number(m[1] ?? m[2]) || WORD_NUMBER[String(m[1] ?? m[2]).toLowerCase()];
      if (n && !caps.has(n)) errors.push(`${rel(file)}: says "${m[0]}" but ${p.name}/role.yaml caps are ${[...caps].join("/")}; point at role.yaml budgets.task_limits instead of quoting a number`);
    }
  }
}

// 8. Engine paths used by skills resolve -------------------------------------------------------
for (const s of allSkills) {
  for (const [, path] of s.body.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([^"`\s)]+)/g)) {
    if (!existsSync(join(dirname(s.file), path))) errors.push(`${rel(s.file)}: \${CLAUDE_SKILL_DIR}/${path} does not exist`);
  }
  for (const [, link] of s.body.matchAll(/\]\((?!https?:)([^)#\s]+)\)/g)) {
    if (!existsSync(join(dirname(s.file), link))) errors.push(`${rel(s.file)}: link ${link} does not exist`);
  }
}

// 9. Drift against the design (Suggestions/) — informational until each phase lands -----------
const implementedAgents = new Set(allAgents.map((a) => a.name));
for (const name of Object.values(MODEL_POLICY).flat()) {
  if (!implementedAgents.has(name) && !(ALLOW.later_phase_agents ?? []).includes(name)) {
    errors.push(`designed agent "${name}" is neither implemented nor scheduled in consistency-allowlist.yaml`);
  } else if (!implementedAgents.has(name)) info.push(`agent ${name}: scheduled for a later phase`);
}
const commands = new Set(plugins.find((p) => p.name === "factory")?.skills.filter((s) => s.data?.["disable-model-invocation"]).map((s) => s.name));
const design = join(root, "Suggestions", "03-sdlc-pipeline.md");
const suggested = existsSync(design) ? [...readFileSync(design, "utf8").matchAll(/`\/factory:([a-z-]+)/g)].map((m) => m[1]) : [];
if (!existsSync(design)) warnings.push("Suggestions/03-sdlc-pipeline.md is missing, so the design-drift check was skipped");
for (const c of new Set(suggested)) {
  if (!commands.has(c) && !(ALLOW.later_phase_commands ?? []).includes(c)) errors.push(`/factory:${c} from Suggestions/03 is neither implemented nor scheduled`);
  else if (!commands.has(c)) info.push(`/factory:${c}: scheduled for a later phase`);
}
for (const d of ALLOW.deviations ?? []) info.push(`deviation: ${d}`);

const report = { ok: errors.length === 0, errors, warnings, info };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  for (const e of errors) console.error(`ERROR  ${e}`);
  for (const w of warnings) console.warn(`WARN   ${w}`);
  for (const i of info) console.log(`INFO   ${i}`);
  console.log(`\n${plugins.length} plugin(s), ${allAgents.length} agents, ${allSkills.length} skills · ${errors.length} error(s), ${warnings.length} warning(s)`);
}
process.exitCode = errors.length ? 1 : 0;
