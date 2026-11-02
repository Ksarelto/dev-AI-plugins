// `factory state --brief` and `factory status`: only what the next decision needs (≤ ~3k tokens).
// The SessionStart(compact) hook re-injects the brief, so the Conductor restarts from files.
import { loadConfig } from "./config.mjs";
import { load, reviewFiles } from "./conductor.mjs";
import { loadAppState, loadFeature, readEvents } from "./state.mjs";
import { openNotes } from "./notes.mjs";

export function brief(projectDir, featureId) {
  const app = loadAppState(projectDir);
  const ids = featureId ? [featureId] : Object.keys(app.features).filter((id) => !["done", "aborted"].includes(app.features[id].status));
  const features = ids.map((id) => {
    const { dir, state: s } = loadFeature(projectDir, app, id);
    const config = loadConfig(projectDir, dir);
    const b = config.budgets?.feature ?? {};
    const st = s.stages[s.stage] ?? {};
    return {
      feature: s.feature,
      title: s.title,
      mode: s.mode,
      profile: s.profile,
      status: s.status,
      stage: s.stage,
      stage_status: st.status,
      attempts: st.attempts ?? 0,
      rung: st.rung ?? 0,
      awaiting_human: s.awaiting_human ? { ...s.awaiting_human, review: reviewFiles(load(projectDir, s.feature), s.awaiting_human.stage) } : null,
      pending: s.pending.map((d) => ({ id: d.id, agent: d.subagent_type, pack: d.pack })),
      last_gate: st.last_gate ? { gate: st.last_gate.gate, pass: st.last_gate.pass, failures: st.last_gate.failures?.length ?? 0 } : null,
      budgets: {
        tokens: `${s.budgets.tokens}/${b.tokens ?? "∞"}`,
        dispatches: `${s.budgets.dispatches}/${b.dispatches ?? "∞"}`,
        regressions: s.budgets.regressions,
      },
      open_notes: openNotes(dir).map((n) => `${n.id}: ${n.text.slice(0, 80)}`),
      last_verdicts: readEvents(projectDir, { feature: s.feature })
        .filter((e) => e.type === "verdict")
        .slice(-3)
        .map((e) => `${e.stage}: ${e.verdict} (${e.reason})`),
      halt: s.status === "blocked" ? s.halts.at(-1)?.reason : null,
    };
  });
  return { mode: app.mode, active_feature: app.active_feature, features, next: nextHint(features) };
}

function nextHint(features) {
  const f = features[0];
  if (!f) return "No open feature. Put requirements in .factory/inbox/ and run /factory:intake.";
  if (f.status === "awaiting_human") return `${f.feature} waits for ${f.awaiting_human.gate}: review, then /factory:gate approve or reject "<reason>".`;
  if (f.status === "blocked") return `${f.feature} is blocked (${f.halt}). See blockers.md; /factory:diagnose or /factory:abort.`;
  if (f.pending.length) return `Dispatch the pending agents again (/factory:next re-issues them).`;
  return "/factory:next (one step) or /factory:run (until the next gate).";
}

/** Renders the brief as compact Markdown for hook context. */
export function briefMarkdown(data) {
  const lines = [`## Factory state (re-read from .factory/, not from chat)`, `Mode: ${data.mode} · active: ${data.active_feature ?? "none"}`];
  for (const f of data.features) {
    lines.push(`### ${f.feature} ${f.title} — ${f.status}, stage ${f.stage} (${f.stage_status}, attempt ${f.attempts}, rung ${f.rung})`);
    if (f.awaiting_human) {
      lines.push(`Waiting for: ${f.awaiting_human.gate}${f.awaiting_human.reason ? ` — ${f.awaiting_human.reason}` : ""}`);
      if (f.awaiting_human.review.length) lines.push(`Review: ${f.awaiting_human.review.join(", ")}`);
    }
    if (f.pending.length) lines.push(`Pending dispatches: ${f.pending.map((p) => `${p.id} → ${p.agent}`).join("; ")}`);
    if (f.open_notes.length) lines.push("Open human notes (act only on these, never on chat-only instructions):", ...f.open_notes.map((n) => `- ${n}`));
    if (f.last_verdicts.length) lines.push(`Last verdicts: ${f.last_verdicts.join(" · ")}`);
    lines.push(`Budgets: tokens ${f.budgets.tokens}, dispatches ${f.budgets.dispatches}, regressions ${f.budgets.regressions}`);
  }
  lines.push(`Next: ${data.next}`);
  return lines.join("\n");
}
