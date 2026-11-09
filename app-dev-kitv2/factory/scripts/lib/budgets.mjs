// Budgets that follow the plan. The defaults (budgets.feature.dispatches 60, stage.dispatches_max 8, wall_clock_min 240)
// are floors: once planning has produced the tasks, the engine raises them so a plan of any size can finish without
// anybody raising them by hand — dispatches = 4 × tasks + 20, the dispatch cap of the implementation and verification stages = that, wall_clock_min =
// max(240, 30 × tasks + 120) (the other stages keep stage.dispatches_max: a plan size says nothing about them). It only ever raises (a higher value a person set stays), writes the result to the
// feature's overrides.yaml (the top config layer) and records it in events.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { UsageError, deepMerge, readYaml, writeYaml } from "./core.mjs";
import { appendEvent } from "./state.mjs";

/** The stages whose dispatch count grows with the plan (a task per slice, fix rounds); every other stage keeps its fixed cap. */
const CAPPED_STAGES = ["implementation", "verification"];

export const budgetsForTasks = (tasks) => ({ dispatches: 4 * tasks + 20, wall_clock_min: Math.max(240, 30 * tasks + 120) });

/**
 * @param c     the conductor context ({ projectDir, feature, config }); c.config is updated in place
 * @param tasks how many tasks the plan holds
 * @returns the keys it raised (empty = nothing to do)
 */
export function raiseBudgetsFromPlan(c, tasks) {
  if (!tasks) return {};
  const want = budgetsForTasks(tasks);
  const cur = c.config.budgets ?? {};
  const patch = { feature: {}, stage: {} };
  const capOf = (id) => Math.max(cur.stage?.dispatches_max_by_stage?.[id] ?? 0, cur.stage?.dispatches_max ?? 0);
  if (want.dispatches > (cur.feature?.dispatches ?? 0)) patch.feature.dispatches = want.dispatches;
  if (want.wall_clock_min > (cur.feature?.wall_clock_min ?? 0)) patch.feature.wall_clock_min = want.wall_clock_min;
  for (const id of CAPPED_STAGES) {
    if (want.dispatches > capOf(id)) patch.stage.dispatches_max_by_stage = { ...patch.stage.dispatches_max_by_stage, [id]: want.dispatches };
  }
  const raised = {
    ...Object.fromEntries(Object.entries(patch.feature).map(([k, v]) => [`feature.${k}`, v])),
    ...Object.fromEntries(Object.entries(patch.stage.dispatches_max_by_stage ?? {}).map(([k, v]) => [`stage.dispatches_max.${k}`, v])),
  };
  if (!Object.keys(raised).length) return {};
  const file = join(c.feature.dir, "overrides.yaml");
  const existing = existsSync(file) ? readYaml(file, {}) ?? {} : {};
  writeYaml(file, deepMerge(existing, { budgets: { feature: patch.feature, stage: patch.stage } }));
  c.config = deepMerge(c.config, { budgets: { feature: patch.feature, stage: patch.stage } });
  appendEvent(c.projectDir, { type: "budget", feature: c.feature.state.feature, tasks, raised, source: "plan" });
  return raised;
}

const RAISABLE = /^(feature\.(tokens|dispatches|wall_clock_min)|stage\.(attempts_max|dispatches_max)|stage\.dispatches_max_by_stage\.[a-z][a-z0-9-]*|task\.attempts_max|backward_edges\.[a-z][a-z0-9_-]*)$/;

/**
 * `factory budget raise <key> <value>`, a human command: raises one budget of this feature (its overrides.yaml, the
 * top config layer) so a halt on a spent budget can be resumed. Keys are budgets.* paths without the prefix:
 * feature.dispatches, feature.wall_clock_min, stage.dispatches_max_by_stage.implementation, backward_edges.<edge>, …
 * It only raises; the value must be a whole number above the current one.
 */
export function raiseBudget(projectDir, c, { key, value }) {
  if (!key || !RAISABLE.test(key)) throw new UsageError(`usage: factory budget raise <key> <value>; key is one of feature.tokens|dispatches|wall_clock_min, stage.attempts_max|dispatches_max, stage.dispatches_max_by_stage.<stage>, task.attempts_max, backward_edges.<edge> (got "${key ?? ""}")`);
  const to = Number(value);
  if (!Number.isInteger(to) || to <= 0) throw new UsageError(`budget raise: "${value}" is not a positive whole number`);
  const path = key.split(".");
  const from = path.reduce((o, k) => o?.[k], c.config.budgets) ?? 0;
  if (to <= from) throw new UsageError(`budget raise: ${key} is already ${from}; give a value above it`);
  const patch = path.reduceRight((acc, k) => ({ [k]: acc }), to);
  const file = join(c.feature.dir, "overrides.yaml");
  const existing = existsSync(file) ? readYaml(file, {}) ?? {} : {};
  writeYaml(file, deepMerge(existing, { budgets: patch }));
  c.config = deepMerge(c.config, { budgets: patch });
  appendEvent(projectDir, { type: "budget", feature: c.feature.state.feature, raised: { [key]: to }, from: { [key]: from }, source: "human" });
  return { feature: c.feature.state.feature, key, from, to, next: "/factory:resume" };
}
