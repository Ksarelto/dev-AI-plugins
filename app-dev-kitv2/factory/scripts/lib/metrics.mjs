// The metrics report (Suggestions/12): derived only from events.jsonl, so it can be recomputed for any
// project and compared across pack releases. Rates are null when there is nothing to measure.
import { readEvents } from "./state.mjs";

const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : null);

export function metrics(projectDir, { feature } = {}) {
  const events = readEvents(projectDir, { feature });
  const verdicts = events.filter((e) => e.type === "verdict");
  const unitKey = (e) => `${e.feature}|${e.stage}|${e.task ?? ""}|${e.phase ?? ""}`;

  // First-pass gate rate: a unit (stage, or task phase) whose first verdict is "advance". A task phase
  // has one agent; a stage's gate judges all its agents together, so stages are reported as stages.
  const firsts = new Map();
  for (const v of verdicts) if (v.agent && !firsts.has(unitKey(v))) firsts.set(unitKey(v), v);
  const byAgent = {};
  for (const v of firsts.values()) {
    const a = (byAgent[v.task ? v.agent : `stage ${v.stage}`] ??= { units: 0, first_pass: 0 });
    a.units += 1;
    if (v.verdict === "advance") a.first_pass += 1;
  }
  for (const a of Object.values(byAgent)) a.rate = rate(a.first_pass, a.units);

  // Escalation: the highest rung each unit reached before it advanced.
  const maxRung = new Map();
  for (const v of verdicts) maxRung.set(unitKey(v), Math.max(maxRung.get(unitKey(v)) ?? 0, v.rung ?? 0));
  const advanced = [...new Set(verdicts.filter((v) => v.verdict === "advance").map(unitKey))];
  const redFirsts = [...firsts.values()].filter((v) => v.phase === "red");
  const tasks = new Set(verdicts.filter((v) => v.task).map((v) => `${v.feature}|${v.task}`));
  const dispatches = events.filter((e) => e.type === "dispatch");
  const human = events.filter((e) => e.type === "human");
  const gates = {};
  for (const h of human) {
    const g = (gates[h.gate] ??= { approved: 0, rejected: 0 });
    g[h.result] += 1;
  }
  const byModel = {};
  for (const d of dispatches) byModel[d.model ?? "none"] = (byModel[d.model ?? "none"] ?? 0) + 1;
  const tokens = events.filter((e) => e.type === "envelope").reduce((sum, e) => sum + (e.tokens ?? 0), 0);

  const features = {};
  for (const e of events.filter((x) => x.feature)) {
    const f = (features[e.feature] ??= { started: e.ts, done: null, dispatches: 0, tokens: 0, backward_edges: 0, halts: 0 });
    if (e.type === "dispatch") f.dispatches += 1;
    if (e.type === "envelope") f.tokens += e.tokens ?? 0;
    if (e.type === "advance" && e.backward) f.backward_edges += 1;
    if (e.type === "halt") f.halts += 1;
    if (e.type === "advance" && e.to === "done") f.done = e.ts;
  }
  for (const f of Object.values(features)) f.lead_time_min = f.done ? Math.round((Date.parse(f.done) - Date.parse(f.started)) / 60000) : null;

  return {
    events: events.length,
    first_pass_rates: byAgent,
    resolved_at_rung_le_1: rate(advanced.filter((k) => (maxRung.get(k) ?? 0) <= 1).length, advanced.length),
    repeat_fingerprint_escalations: verdicts.filter((v) => /same failure fingerprint/.test(v.reason ?? "")).length,
    red_phase_validity: rate(redFirsts.filter((v) => v.verdict === "advance").length, redFirsts.length),
    test_dispute_rate: rate(verdicts.filter((v) => /test dispute/.test(v.reason ?? "")).length, tasks.size),
    context_degraded_rate: rate(dispatches.filter((d) => d.context_degraded).length, dispatches.length),
    human_gates: gates,
    dispatches_by_model: byModel,
    tokens,
    features,
  };
}

/** The same report as a short Markdown table for humans (factory metrics --md). */
export function metricsMarkdown(m) {
  const pct = (r) => (r === null ? "–" : `${Math.round(r * 100)}%`);
  const rows = [
    ["Resolved at rung ≤ 1", pct(m.resolved_at_rung_le_1), "> 80%"],
    ["Red-phase validity", pct(m.red_phase_validity), "> 90%"],
    ["test_dispute rate", pct(m.test_dispute_rate), "< 5%"],
    ["context_degraded rate", pct(m.context_degraded_rate), "< 10%"],
    ["Repeat-fingerprint escalations", String(m.repeat_fingerprint_escalations), "trending down"],
  ];
  const agents = Object.entries(m.first_pass_rates).sort(([a], [b]) => a.localeCompare(b));
  return [
    "| Metric | Value | Target |", "|---|---|---|", ...rows.map((r) => `| ${r.join(" | ")} |`), "",
    "| Task agent / stage | First-pass gate rate | Units |", "|---|---|---|", ...agents.map(([a, v]) => `| ${a} | ${pct(v.rate)} | ${v.units} |`), "",
    `Human gates: ${Object.entries(m.human_gates).map(([g, v]) => `${g} ${v.approved}✓ ${v.rejected}✗`).join(", ") || "none"} · dispatches by model: ${Object.entries(m.dispatches_by_model).map(([k, v]) => `${k} ${v}`).join(", ")} · tokens: ${m.tokens}`,
  ].join("\n");
}
