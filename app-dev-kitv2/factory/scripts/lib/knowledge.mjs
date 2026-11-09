// Stack knowledge per dispatch (Suggestions/05, 07): which stack-pack skills an agent loads, which
// rule files it reads and which golden files it matches. Everything comes from the stack's stack.yaml,
// so a role pack never names another plugin's files itself.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFrontMatter, toPosix } from "./core.mjs";

const list = (v) => (v == null ? [] : [v].flat()).filter(Boolean);
const uniq = (xs) => [...new Set(xs)];

/** The SKILL.md files of a stack pack's own skills ("frontend-dev-kit:testing" or "testing"); a skill of another plugin is not resolved here. */
export function skillFiles(stackPack, names) {
  if (!stackPack?.root) return [];
  return uniq(list(names))
    .filter((n) => !String(n).includes(":") || String(n).split(":")[0] === stackPack.name || String(n).split(":")[0] === stackPack.stack?.name)
    .map((n) => toPosix(join(stackPack.root, "skills", String(n).split(":").pop(), "SKILL.md")));
}

/**
 * Knowledge for one task dispatch: the test skill (not in green), the task type's skills, the "*" and
 * task-type rules and the task type's golden files. Paths are absolute posix paths into the stack kit.
 */
export function taskKnowledge(stackPack, taskType, phase) {
  const stack = stackPack?.stack;
  if (!stack) return { skills: [], skill_files: [], rules: [], golden: [] };
  const abs = (p) => toPosix(join(stackPack.root, p));
  const skills = uniq([...(phase === "green" ? [] : list(stack.skills?.test)), ...list(stack.skills?.[taskType])]);
  return {
    skills,
    skill_files: skillFiles(stackPack, skills), // forced loads: the context estimate counts their size
    rules: uniq([...list(stack.rules?.["*"]), ...list(stack.rules?.[taskType])]).map(abs),
    golden: uniq(list(stack.golden_files?.[taskType])).map(abs),
  };
}

const bareSkill = (name) => String(name).split(":").pop();

/**
 * The procedure skills this dispatch must load before it writes. Most agents force every `skills:`
 * name. Two agents name alternatives: the requirements analyst writes a PRD or a delta-spec, and the
 * planner writes the test plan only on requirements-lite. `guided-interview` stays on the agent file
 * and is loaded when the analyst asks; it is not a blocking preflight.
 */
function selectedProcedureNames(agent, names, stageId, mode) {
  if (agent === "requirements-analyst") {
    const skill = stageId === "requirements" && mode === "greenfield" ? "prd-authoring" : "delta-spec";
    return names.filter((n) => bareSkill(n) === skill);
  }
  if (agent === "planner") {
    const keep = new Set(["task-decomposition", ...(stageId === "requirements-lite" ? ["test-planning"] : [])]);
    return names.filter((n) => keep.has(bareSkill(n)));
  }
  return names;
}

/**
 * Procedure skills named on the agent file (`skills:`). They are forced loads, the same as a task
 * type's stack skills: the pack lists them in skills_required and the guard refuses a write until
 * they are loaded. Stack stage_skills stay reference knowledge and are not added here.
 * `stageId` and `mode` select the one authoring skill a requirements or planning dispatch uses.
 */
export function procedureKnowledge(pack, agent, { stageId, mode } = {}) {
  if (!pack?.root || !agent) return { skills: [], skill_files: [] };
  const file = join(pack.root, "agents", `${agent}.md`);
  if (!existsSync(file)) return { skills: [], skill_files: [] };
  const names = selectedProcedureNames(agent, [readFrontMatter(file).data.skills].flat().filter(Boolean).map(String), stageId, mode);
  return {
    skills: names.map((n) => (n.includes(":") ? n : `${pack.name}:${n}`)),
    skill_files: names.map((n) => toPosix(join(pack.root, "skills", n.split(":").pop(), "SKILL.md"))),
  };
}

/**
 * Knowledge for a stage agent (reviewer, architect, QA, …): the skills each enabled role's stack names
 * for that agent in stage_skills, plus every rule file that stack maps (its whole convention set) when
 * it names any. Grouped per role so a full-stack feature tells the reviewer which rules belong where.
 */
export function stageKnowledge(stackPacks, agent) {
  return stackPacks
    .filter(({ pack }) => list(pack?.stack?.stage_skills?.[agent]).length)
    .map(({ role, pack }) => ({
      role,
      stack: pack.stack.name,
      skills: list(pack.stack.stage_skills[agent]),
      skill_files: skillFiles(pack, pack.stack.stage_skills[agent]),
      rules: uniq(Object.values(pack.stack.rules ?? {}).flat()).map((p) => toPosix(join(pack.root, p))),
    }));
}

/**
 * The required skills a list of loaded names does not cover. A name matches as written, without its
 * plugin prefix, or as an inlined digest: `inline:<name>@<hash>` (hosts that cannot give an agent the Skill tool).
 */
export function missingSkills(required = [], loaded = []) {
  const have = loaded.map(String);
  return required.filter((req) => {
    const bare = req.split(":").pop();
    return !have.some((h) => h === req || h === bare || h.startsWith(`inline:${req}@`) || h.startsWith(`inline:${bare}@`));
  });
}
