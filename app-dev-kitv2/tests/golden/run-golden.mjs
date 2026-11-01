// Golden-ticket runner: the factory with REAL models, headless, in a throwaway project.
//
//   node app-dev-kitv2/tests/golden/run-golden.mjs <ticket-dir>                 print the plan, spend nothing
//   node app-dev-kitv2/tests/golden/run-golden.mjs <ticket-dir> --yes [--budget 10] [--keep]
//
// Each round runs `claude -p "/factory:run"` with only the app-dev-kitv2 plugins and the stack kits
// loaded (`--setting-sources project`, so your own plugins and hooks stay out), answers human gates
// from the ticket's answers.yaml, and stops at `stop_at` (a gate) or when the feature halts or ends.
// A ticket is a scenario folder (scenario.yaml, repo/, inbox/, answers.yaml) without scripted agents.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.FACTORY_NO_SCAN = "1";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const FAMILY = join(ROOT, "app-dev-kitv2");
const ENGINE = join(FAMILY, "factory");
const lib = (name) => import(join(ENGINE, "scripts", "lib", `${name}.mjs`));
const { YAML, deepMerge, readText } = await lib("core");
const conductor = await lib("conductor");
const { init } = await lib("doctor");
const { intake } = await lib("intake");
const state = await lib("state");
const { traceReport } = await import(join(FAMILY, "tests", "e2e", "harness.mjs"));

const args = process.argv.slice(2);
const ticketDir = resolve(args.find((a) => !a.startsWith("--")) ?? "");
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
if (!existsSync(join(ticketDir, "scenario.yaml"))) {
  console.error("usage: node run-golden.mjs <ticket-dir> [--yes] [--budget USD] [--keep]");
  process.exit(2);
}
const ticket = YAML.parse(readText(join(ticketDir, "scenario.yaml")));
const answers = YAML.parse(readText(join(ticketDir, "answers.yaml"))) ?? [];
const budget = Number(flag("budget", ticket.budget_usd ?? 10));
const plugins = [
  ...readdirSync(FAMILY).filter((n) => existsSync(join(FAMILY, n, ".claude-plugin", "plugin.json"))).map((n) => join(FAMILY, n)),
  ...(ticket.stack_kits ?? ["frontend-dev-kit"]).map((k) => join(ROOT, k)),
];

console.log(`Golden ticket ${ticket.id}: ${ticket.title}`);
console.log(`  stages: ${ticket.config.pipeline.profiles[Object.keys(ticket.config.pipeline.profiles)[0]].join(" → ")}; stop at ${ticket.stop_at ?? "end"}`);
console.log(`  plugins: ${plugins.map((p) => p.split(/[\\/]/).pop()).join(", ")}`);
console.log(`  conductor model: ${ticket.conductor_model ?? "sonnet"} (agents use their own tiers)`);
console.log(`  hard cap: $${budget} (claude --max-budget-usd, an estimate that can overshoot slightly)`);
if (ticket.estimate) console.log(`  expected: ${ticket.estimate}`);
if (!args.includes("--yes")) {
  console.log("\nNothing was run. Re-run with --yes to spend tokens.");
  process.exit(0);
}

const project = mkdtempSync(join(tmpdir(), `factory-golden-${ticket.id}-`));
const card = { ticket: ticket.id, started: new Date().toISOString(), rounds: [], cost_usd: 0, turns: 0, gates: [], errors: [] };
try {
  cpSync(join(ticketDir, "repo"), project, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: project });
  init(project, { mode: "unknown" });
  const config = deepMerge({ version: 1, project: { name: ticket.id }, packs: Object.fromEntries(plugins.map((p) => [p.split(/[\\/]/).pop(), p])) }, ticket.config ?? {});
  writeFileSync(join(project, ".factory", "factory.config.yaml"), YAML.stringify(config));
  cpSync(join(ticketDir, "inbox"), join(project, ".factory", "inbox"), { recursive: true });
  const intook = intake(project, ticket.intake ?? {});
  card.feature = intook.feature;
  card.mode = intook.mode;

  for (let round = 1; round <= (ticket.max_rounds ?? 6); round++) {
    const left = Math.max(0.5, budget - card.cost_usd);
    const cli = [
      "-p", "/factory:run",
      ...plugins.flatMap((p) => ["--plugin-dir", p]),
      "--setting-sources", "project",
      "--model", ticket.conductor_model ?? "sonnet",
      "--permission-mode", "acceptEdits",
      "--allowedTools", "Bash(node:*)", "Agent", "Read", "Write", "Edit", "Glob", "Grep",
      "--max-budget-usd", left.toFixed(2),
      "--max-turns", String(ticket.max_turns ?? 80),
      "--output-format", "json",
    ];
    const started = Date.now();
    const r = spawnSync("claude", cli, { cwd: project, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FACTORY_NO_SCAN: "1" } });
    let out = {};
    try {
      out = JSON.parse(r.stdout);
    } catch {
      card.errors.push(`round ${round}: no JSON from claude (exit ${r.status}): ${r.stderr.slice(0, 400)}`);
    }
    card.rounds.push({ round, seconds: Math.round((Date.now() - started) / 1000), cost_usd: out.total_cost_usd ?? null, turns: out.num_turns ?? null, is_error: out.is_error ?? null, result: String(out.result ?? "").slice(0, 600) });
    card.cost_usd += out.total_cost_usd ?? 0;
    card.turns += out.num_turns ?? 0;
    console.log(`round ${round}: $${(out.total_cost_usd ?? 0).toFixed(2)}, ${out.num_turns ?? "?"} turns, ${card.rounds.at(-1).seconds}s`);
    if (out.is_error || r.status !== 0) {
      // Authentication, budget or CLI errors do not get better by retrying; stop and report.
      card.errors.push(`round ${round}: claude reported an error: ${String(out.result ?? r.stderr).slice(0, 300)}`);
      break;
    }
    const before = card.lastState;
    card.lastState = JSON.stringify(conductor.load(project, card.feature).feature.state.stages);
    if (before && before === card.lastState) {
      card.errors.push(`round ${round}: no progress — the stage machine did not change`);
      break;
    }

    const s = await conductor.stepAsync(project, { feature: card.feature });
    if (s.action === "ask_human") {
      card.gates.push(s.gate);
      if (s.gate === ticket.stop_at) break;
      const answer = answers.find((a) => a.gate === s.gate && !a.used);
      if (!answer) {
        card.errors.push(`no scripted answer for ${s.gate}`);
        break;
      }
      answer.used = true;
      if (answer.reject) conductor.reject(project, { gate: s.gate, reason: answer.reject, by: "golden" });
      else conductor.approve(project, { gate: s.gate, notes: typeof answer.approve === "string" ? answer.approve : undefined, by: "golden" });
      continue;
    }
    if (s.action !== "dispatch") break; // halt, wait or done
    if (card.cost_usd >= budget) {
      card.errors.push("budget reached");
      break;
    }
  }

  const app = state.loadAppState(project);
  const featureDir = join(project, ".factory", app.features[card.feature].dir);
  const fs = JSON.parse(readFileSync(join(featureDir, "state.json"), "utf8"));
  const events = readText(join(project, ".factory", "events.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
  card.final = { status: fs.status, stage: fs.stage, awaiting: fs.awaiting_human?.gate ?? null, halts: fs.halts };
  card.dispatches = events.filter((e) => e.type === "dispatch").map((e) => `${e.stage}:${e.agent}:${e.model}`);
  card.verdicts = events.filter((e) => e.type === "verdict").map((e) => `${e.stage}:${e.verdict}`);
  card.denied_or_invalid = existsSync(join(project, ".factory", "logs", "hooks.log")) ? readText(join(project, ".factory", "logs", "hooks.log")).split("\n").length - 1 : 0;
  card.trace = traceReport(project, featureDir);
  const expect = ticket.expect ?? {};
  card.checks = [
    { check: `reached ${ticket.stop_at ?? "the end"}`, pass: ticket.stop_at ? card.final.awaiting === ticket.stop_at : card.final.status === "done" },
    { check: "within budget", pass: card.cost_usd <= budget * 1.1 },
    { check: "no harness errors", pass: card.errors.length === 0 },
    ...(expect.trace_requirements ? [{ check: "every requirement traces to a source", pass: !card.trace.gaps.some((g) => /cites unknown/.test(g)) }] : []),
    ...(expect.min_open_questions ? [{ check: `≥ ${expect.min_open_questions} open questions with defaults`, pass: countQuestions(featureDir) >= expect.min_open_questions }] : []),
  ];
  card.pass = card.checks.every((c) => c.pass);
  card.project = args.includes("--keep") ? project : null;
  delete card.lastState;
} finally {
  mkdirSync(join(ticketDir, "results"), { recursive: true });
  const file = join(ticketDir, "results", `${card.started.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(card, null, 2)}\n`);
  console.log(`\n${ticket.id}: ${card.pass ? "PASS" : "FAIL"} · $${card.cost_usd.toFixed(2)} · ${card.turns} turns`);
  for (const c of card.checks ?? []) console.log(`  ${c.pass ? "✓" : "✗"} ${c.check}`);
  for (const e of card.errors) console.log(`  ! ${e}`);
  console.log(`  scorecard: ${file}`);
  if (!args.includes("--keep")) rmSync(project, { recursive: true, force: true });
}

function countQuestions(featureDir) {
  for (const f of ["01-requirements/delta-spec.yaml", "01-requirements/prd.md"]) {
    const p = join(featureDir, f);
    if (!existsSync(p)) continue;
    const text = readText(p);
    const data = f.endsWith(".md") ? YAML.parse(/^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "{}") : YAML.parse(text);
    return (data.open_questions ?? []).filter((q) => q.default).length;
  }
  return 0;
}
