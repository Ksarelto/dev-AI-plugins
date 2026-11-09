// Loop Warden: decides what happens after a gate result. Deterministic — the Conductor never decides
// retries itself. Ladder (each rung used at most once):
//   0 initial · 1 retry with validator feedback · 2 retry on the reasoning tier with a hypothesis ·
//   3 diagnosis (diagnostician writes root-cause.md, then one more attempt) · 4 amend (tasks only, once per task: the planner
//   corrects the SAME task's scope or definition from the diagnosis; a split is the human's /factory:split) · 5 human
export const RUNG_INSTRUCTIONS = {
  1: "Fix ONLY the failures listed above. Do not refactor or touch other files.",
  2: "Earlier attempts failed. Before editing, state your hypothesis for the root cause in one sentence, then fix it.",
  3: "Read the diagnosis file listed in T1 first and apply its recommended fix. Do not repeat the approaches it lists as tried.",
};

/**
 * @param unit   stage or task state: { attempts, rung, progress_signal[], fingerprints[], state_hashes[] }
 * @param result normalised gate result (or null when the envelope itself decides)
 * @param opts   { envelope, attemptsMax, isTask, budgetLeft, stateHash }
 * @returns { verdict, rung, model?, instruction?, reason, unit } — `unit` is the updated state to persist
 */
export function decide(unit, result, { envelope, attemptsMax = 3, isTask = false, budgetLeft = true, stateHash, tiers } = {}) {
  const next = {
    ...unit,
    attempts: unit.attempts ?? 0,
    rung: unit.rung ?? 0,
    progress_signal: [...(unit.progress_signal ?? [])],
    fingerprints: [...(unit.fingerprints ?? [])],
    state_hashes: [...(unit.state_hashes ?? [])],
  };
  const out = (verdict, reason, extra = {}) => ({ verdict, reason, rung: next.rung, unit: next, ...extra });

  const error = envelope?.error;
  if (envelope?.status === "needs_clarification") return out("ask_human", "the agent needs clarification");
  if (envelope?.status === "needs_scope_change") return out("ask_human", "the agent asks for a scope change");
  if (error?.type === "business" || envelope?.status === "blocked") return out("block", `business error: ${error?.attempted ?? envelope?.summary ?? ""}`);
  if (error?.type === "permission") return out("ask_human", "the agent hit a permission problem");
  if (error?.type === "transient") {
    if ((unit.transient_retries ?? 0) >= 1) return out("block", "transient failure repeated");
    next.transient_retries = (unit.transient_retries ?? 0) + 1;
    return out("retry", "transient failure: one retry from the same pack");
  }

  if (result?.pass) return out("advance", "gate passed");
  if (!budgetLeft) return out("block", "feature budget exhausted");

  next.progress_signal.push(result?.progress_signal ?? 1);
  next.fingerprints.push(result?.fingerprint ?? "none");
  if (stateHash) next.state_hashes.push(stateHash);

  const sig = next.progress_signal;
  const fps = next.fingerprints;
  const hashes = next.state_hashes;
  let rung = next.rung + 1;
  let reason = "gate failed";
  if (fps.length >= 2 && fps.at(-1) === fps.at(-2)) {
    rung = Math.max(rung, 3);
    reason = "same failure fingerprint twice in a row";
  } else if (hashes.length >= 3 && hashes.at(-1) === hashes.at(-3)) {
    rung = Math.max(rung, 3);
    reason = "oscillation: files returned to an earlier state";
  } else if (sig.length >= 3 && sig.at(-1) >= sig.at(-2) && sig.at(-2) >= sig.at(-3)) {
    rung = Math.max(rung, 3);
    reason = "no progress over two attempts";
  }
  if (next.attempts >= attemptsMax && rung < 3) {
    rung = 3;
    reason = `attempts exhausted (${attemptsMax})`;
  }
  if (rung === 4 && !isTask) rung = 5; // stages cannot be amended
  // A task is amended once. After that amendment a further ladder exhaustion is the human's: another amendment would restart the
  // whole ladder (retry, diagnose, amend) on a plan that already failed twice, until the feature budget runs out.
  if (rung === 4 && isTask && (unit.amend_count ?? 0) >= 1) {
    rung = 5;
    reason = `${reason}; the task was already amended once and still fails — it needs a human decision (diagnose it by hand, widen its scope, replan or split it)`;
  }
  if (rung > 5) rung = 5;
  next.rung = rung;

  if (rung === 5) return out("block", `${reason}; escalation ladder exhausted`);
  if (rung === 4) return out("amend", `${reason}; diagnose, then amend the scope or definition of the same task`);
  if (rung === 3) return out("diagnose", reason, { instruction: RUNG_INSTRUCTIONS[3] });
  if (rung === 2) return out("retry", reason, { instruction: RUNG_INSTRUCTIONS[2], model: tiers?.reasoning ?? "opus" });
  return out("retry", reason, { instruction: RUNG_INSTRUCTIONS[1] });
}

/** Feature-level budgets: returns the list of exhausted budgets (empty = fine). */
export function exhaustedBudgets(state, config) {
  const b = config.budgets?.feature ?? {};
  const used = state.budgets ?? {};
  const out = [];
  if (b.tokens && used.tokens >= b.tokens) out.push(`tokens ${used.tokens}/${b.tokens}`);
  if (b.dispatches && used.dispatches >= b.dispatches) out.push(`dispatches ${used.dispatches}/${b.dispatches}`);
  if (b.wall_clock_min && used.started_at) {
    const pausedNow = used.paused_since ? Date.now() - Date.parse(used.paused_since) : 0;
    const minutes = (Date.now() - Date.parse(used.started_at) - (used.paused_ms ?? 0) - pausedNow) / 60000;
    if (minutes >= b.wall_clock_min) out.push(`wall clock ${Math.round(minutes)}/${b.wall_clock_min} min`);
  }
  const max = config.budgets?.backward_edges?.total_regressions_max;
  if (max && used.regressions > max) out.push(`regressions ${used.regressions}/${max}`);
  return out;
}
