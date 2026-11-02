// Stack knowledge per dispatch (Suggestions/05, 07): which stack-pack skills an agent loads, which
// rule files it reads and which golden files it matches. Everything comes from the stack's stack.yaml,
// so a role pack never names another plugin's files itself.
import { join } from "node:path";
import { toPosix } from "./core.mjs";

const list = (v) => (v == null ? [] : [v].flat()).filter(Boolean);
const uniq = (xs) => [...new Set(xs)];

/**
 * Knowledge for one task dispatch: the test skill (not in green), the task type's skills, the "*" and
 * task-type rules and the task type's golden files. Paths are absolute posix paths into the stack kit.
 */
export function taskKnowledge(stackPack, taskType, phase) {
  const stack = stackPack?.stack;
  if (!stack) return { skills: [], rules: [], golden: [] };
  const abs = (p) => toPosix(join(stackPack.root, p));
  return {
    skills: uniq([...(phase === "green" ? [] : list(stack.skills?.test)), ...list(stack.skills?.[taskType])]),
    rules: uniq([...list(stack.rules?.["*"]), ...list(stack.rules?.[taskType])]).map(abs),
    golden: uniq(list(stack.golden_files?.[taskType])).map(abs),
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
      rules: uniq(Object.values(pack.stack.rules ?? {}).flat()).map((p) => toPosix(join(pack.root, p))),
    }));
}
