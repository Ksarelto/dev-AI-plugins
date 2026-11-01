// Mocked end-to-end harness: runs a scenario through the REAL engine (step → dispatch → record,
// gates, Loop Warden, hooks' write rules) with scripted agents instead of models.
//
//   node app-dev-kitv2/tests/e2e/harness.mjs <scenario-dir> [--keep]
//
// Scenario layout (see scenarios/gt04-coupons):
//   scenario.yaml           title, intake options, config overrides, expectations
//   repo/                   the application the factory works on (copied into a temp git repo), or
//   repo_from: <fixture>    in scenario.yaml: a fixture app under tests/fixtures/ (node_modules is linked,
//                           so the real stack — tests, typecheck, lint, build — runs in the gates)
//   repos: [{ from, to }]   several apps in one project (e.g. web/ and api/): `from` is a fixture under
//                           tests/fixtures/ or a folder at the repo root (backend-boilerplate)
//   inbox/                  customer input (copied into .factory/inbox/)
//   answers.yaml            human answers, in order, for every ask_human
//   agents/[<FEAT>/]<stage>/<agent>/a<n>/envelope.yaml + files/{feature,factory,project}/…
//                           what the scripted agent writes on attempt n, and its envelope
//                           (a feature-specific folder wins over the shared one)
// A curator with no scripted folder writes an automatic digest listing every open tracked ID.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.FACTORY_NO_SCAN = "1"; // only the packs this harness configures
// Mocked runs never call a model: the real stack's eval suites skip without these keys.
for (const key of ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[key];
const HERE = dirname(fileURLToPath(import.meta.url));
const FAMILY = join(HERE, "..", "..");
const ENGINE = join(FAMILY, "factory");
const lib = (name) => import(join(ENGINE, "scripts", "lib", `${name}.mjs`));
const { YAML, deepMerge, readText, toPosix } = await lib("core");
const conductor = await lib("conductor");
const { init } = await lib("doctor");
const { intake } = await lib("intake");
const state = await lib("state");
const { loadConfig } = await lib("config");
const { extractIds, TRACKED_KINDS } = await lib("ids");
const { openIds } = await lib("gatekeeper");
const { ARTIFACT_TYPES, artifactFiles, loadArtifact } = await lib("schemas");
const guard = await import(join(ENGINE, "hooks", "guard.mjs"));

const PACKS = readdirSync(FAMILY)
  .filter((n) => existsSync(join(FAMILY, n, ".claude-plugin", "plugin.json")))
  .map((n) => join(FAMILY, n));
const ROOT = join(FAMILY, "..");

function listTree(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listTree(p, base) : [toPosix(relative(base, p))];
  });
}

/** Writes one scripted agent's files through the real write and post-write hooks. */
function playAgent(project, featureDir, dispatch, attemptDir, schemaErrors) {
  const denied = [];
  const roots = { feature: featureDir, factory: join(project, ".factory"), project };
  for (const [kind, root] of Object.entries(roots)) {
    for (const rel of listTree(join(attemptDir, "files", kind))) {
      const target = join(root, rel);
      const input = { tool_name: "Write", agent_type: dispatch.agent, tool_input: { file_path: target } };
      const reason = guard.decideWrite(input, project, state.activeDispatches(project), loadConfig(project));
      if (reason) {
        denied.push({ agent: dispatch.agent, file: toPosix(relative(project, target)), reason });
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(attemptDir, "files", kind, rel), target);
      const invalid = guard.postWrite(input, project);
      if (invalid) schemaErrors.push(invalid);
    }
  }
  return denied;
}

/** The automatic curator: one line per open tracked ID found in the feature's artifacts. */
function autoDigest(project, featureDir) {
  const dirs = { factoryRoot: join(project, ".factory"), featureDir, projectDir: project };
  const ids = new Set();
  for (const type of Object.keys(ARTIFACT_TYPES).filter((t) => ARTIFACT_TYPES[t].scope === "feature" && t !== "digest")) {
    for (const file of artifactFiles(type, dirs)) for (const id of openIds(type, loadArtifact(type, file), TRACKED_KINDS.filter((k) => k !== "SRC"))) ids.add(id);
  }
  writeFileSync(join(featureDir, "digest.md"), `# Digest (scripted curator)\n\n${[...ids].map((id) => `- ${id}`).join("\n")}\n`);
}

/** Traceability across the analysis artifacts: SRC/HD → REQ → AC → story, task and test. */
export function traceReport(project, featureDir) {
  const dirs = { factoryRoot: join(project, ".factory"), featureDir, projectDir: project };
  const load = (type) => artifactFiles(type, dirs).map((f) => loadArtifact(type, f))[0];
  const spec = load("prd") ?? load("delta-spec");
  const reqs = spec?.requirements ?? [...(spec?.added ?? []), ...(spec?.modified ?? [])];
  const sources = new Set((load("source-index")?.sources ?? []).flatMap((s) => s.ids));
  for (const n of load("human-notes") ?? []) sources.add(n.id);
  const acs = reqs.flatMap((r) => r.acs.map((a) => a.id));
  const inStories = new Set((load("stories")?.stories ?? []).flatMap((s) => s.acs.map((a) => a.id)));
  const inTasks = new Set((load("tasks")?.tasks ?? []).flatMap((t) => t.satisfies));
  const inTests = new Set((load("test-plan")?.cases ?? []).map((c) => c.ac));
  const gaps = [];
  for (const r of reqs) for (const s of r.sources) if (!sources.has(s)) gaps.push(`${r.id} cites unknown ${s}`);
  for (const ac of acs) {
    if (!inStories.has(ac)) gaps.push(`${ac} has no story`);
    if (!inTasks.has(ac)) gaps.push(`${ac} has no task`);
    if (!inTests.has(ac)) gaps.push(`${ac} has no planned test`);
  }
  return { requirements: reqs.length, acceptance_criteria: acs.length, gaps };
}

export async function runScenario(scenarioDir, { keep = false, log = () => {} } = {}) {
  const scenario = YAML.parse(readText(join(scenarioDir, "scenario.yaml")));
  const answers = YAML.parse(readText(join(scenarioDir, "answers.yaml"))) ?? [];
  const project = mkdtempSync(join(tmpdir(), `factory-e2e-${scenario.id}-`));
  const run = { scenario: scenario.id, dispatches: [], batches: [], verdicts: [], denied: [], gates: [], halts: [], schemaErrors: [] };
  try {
    const repos = scenario.repos ?? (scenario.repo_from ? [{ from: scenario.repo_from, to: "." }] : []);
    for (const { from, to } of repos) {
      const fixture = existsSync(join(FAMILY, "tests", "fixtures", from)) ? join(FAMILY, "tests", "fixtures", from) : join(ROOT, from);
      if (!existsSync(join(fixture, "node_modules"))) throw new Error(`${from} has no node_modules — run: npm run setup:factory-fixtures`);
      const target = join(project, to);
      const skip = new Set(["node_modules", "dist", "coverage", ".env"].map((n) => join(fixture, n)));
      cpSync(fixture, target, { recursive: true, filter: (src) => !skip.has(src) });
      symlinkSync(join(fixture, "node_modules"), join(target, "node_modules"), "dir");
    }
    if (!repos.length) cpSync(join(scenarioDir, "repo"), project, { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: project });
    execFileSync("git", ["config", "user.email", "factory-e2e@example.invalid"], { cwd: project });
    execFileSync("git", ["config", "user.name", "Factory E2E"], { cwd: project });
    // A real project has history: the app as copied is the baseline the feature's diff is taken against.
    writeFileSync(join(project, ".git", "info", "exclude"), "node_modules\n");
    execFileSync("git", ["add", "-A"], { cwd: project });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "baseline"], { cwd: project });
    init(project, { mode: scenario.mode ?? "unknown" });
    const packs = [...PACKS, ...(scenario.stack_kits ?? []).map((k) => join(ROOT, k))];
    const config = deepMerge({ version: 1, project: { name: scenario.id }, packs: Object.fromEntries(packs.map((p) => [p.split(/[\\/]/).pop(), p])) }, scenario.config ?? {});
    writeFileSync(join(project, ".factory", "factory.config.yaml"), YAML.stringify(config));
    cpSync(join(scenarioDir, "inbox"), join(project, ".factory", "inbox"), { recursive: true });
    const intook = intake(project, scenario.intake ?? {});
    log(`intake: ${intook.added.length} source(s), ${intook.feature} (${intook.mode}: ${intook.mode_reason})`);
    run.mode = intook.mode;

    for (let i = 0; i < (scenario.max_steps ?? 60); i++) {
      const s = conductor.step(project, {});
      if (s.action === "dispatch") {
        const app = state.loadAppState(project);
        const featureDir = join(project, ".factory", app.features[s.feature].dir);
        run.batches.push(s.dispatches.map((d) => d.task ?? d.agent));
        for (const d of s.dispatches) {
          const attempt = Number(d.id.split("/a").pop());
          const stageKey = d.phase === "digest" ? "digest" : d.task ? join(d.stage, `${d.task}.${d.phase}`) : d.stage;
          const specific = join(scenarioDir, "agents", s.feature, stageKey, d.agent, `a${attempt}`);
          const attemptDir = existsSync(specific) ? specific : join(scenarioDir, "agents", stageKey, d.agent, `a${attempt}`);
          run.dispatches.push({ id: d.id, agent: d.agent, model: d.model, phase: d.phase });
          let extra = {};
          if (existsSync(attemptDir)) {
            run.denied.push(...playAgent(project, featureDir, d, attemptDir, run.schemaErrors));
            if (existsSync(join(attemptDir, "envelope.yaml"))) extra = YAML.parse(readText(join(attemptDir, "envelope.yaml"))) ?? {};
          } else if (d.agent === "curator") {
            autoDigest(project, featureDir);
          } else {
            throw new Error(`scenario has no script for ${d.id} (expected ${relative(scenarioDir, attemptDir)})`);
          }
          const envelope = { pack_id: d.id, status: "done", artifacts_written: [], summary: `scripted ${d.agent}`, ...extra };
          const r = await conductor.record(project, { dispatchId: d.id, envelopeText: JSON.stringify(envelope), tokens: extra.tokens ?? 1000 });
          if (r.verdict) run.verdicts.push({ feature: s.feature, stage: d.stage, ...(d.task ? { task: d.task } : {}), verdict: r.verdict, reason: r.reason });
          log(`${d.id} [${d.model}] → ${r.verdict ?? r.action}`);
          for (const f of r.gate && !r.gate.pass ? r.gate.failures : []) log(`    gate ${r.gate.gate}: [${f.rule ?? f.check}] ${f.message}`);
        }
      } else if (s.action === "scaffold") {
        const r = conductor.scaffold(project, {});
        log(`scaffold → ${r.action}${r.reason ? `: ${r.reason}` : ""}`);
        if (r.action === "halt") {
          run.final = r;
          break;
        }
      } else if (s.action === "ask_human") {
        const answer = answers.shift();
        if (!answer) throw new Error(`no scripted answer for ${s.gate} at ${s.stage}`);
        if (answer.gate !== s.gate) throw new Error(`expected an answer for ${s.gate}, the script has ${answer.gate}`);
        run.gates.push({ gate: s.gate, stage: s.stage, review: s.review, questions: s.questions });
        if (answer.reject) conductor.reject(project, { gate: s.gate, reason: answer.reject, by: "scenario" });
        else conductor.approve(project, { gate: s.gate, notes: typeof answer.approve === "string" ? answer.approve : undefined, by: "scenario" });
        log(`${s.gate} (${s.stage}) → ${answer.reject ? "reject" : "approve"}`);
      } else {
        run.final = s;
        log(`${s.action}${s.reason ? `: ${s.reason}` : ""}`);
        break;
      }
    }

    const app = state.loadAppState(project);
    const fid = Object.keys(app.features)[0];
    const featureDir = join(project, ".factory", app.features[fid].dir);
    run.feature = JSON.parse(readFileSync(join(featureDir, "state.json"), "utf8"));
    const notesFile = join(featureDir, "human-notes.yaml");
    run.notes = existsSync(notesFile) ? (YAML.parse(readText(notesFile)) ?? []) : [];
    run.traces = Object.fromEntries(Object.entries(app.features).map(([id, f]) => [id, traceReport(project, join(project, ".factory", f.dir))]));
    run.trace = run.traces[fid];
    run.app = app;
    run.children = Object.fromEntries(
      Object.entries(app.features).slice(1).map(([id, f]) => [id, JSON.parse(readFileSync(join(project, ".factory", f.dir, "state.json"), "utf8"))]),
    );
    run.unanswered = answers.length;
    const shipFile = join(featureDir, "08-delivery", "ship.json");
    run.ship = existsSync(shipFile) ? JSON.parse(readFileSync(shipFile, "utf8")) : null;
    run.gitLog = run.ship ? execFileSync("git", ["log", "--format=%s%n%b---", run.ship.branch], { cwd: project, encoding: "utf8" }) : "";
    const ledgerFile = join(project, ".factory", "ledger", "feature-ledger.yaml");
    run.ledger = existsSync(ledgerFile) ? YAML.parse(readText(ledgerFile)).features : [];
    run.files = (path) => {
      const file = path.startsWith("feature:") ? join(featureDir, path.slice(8)) : join(project, path);
      return existsSync(file) ? readText(file) : null;
    };
    run.checks = check(run, scenario.expect ?? {});
    run.pass = run.checks.every((c) => c.pass);
    run.project = keep ? project : null;
    return run;
  } finally {
    if (!keep) rmSync(project, { recursive: true, force: true });
  }
}

/** Compares a run with scenario.expect; returns [{ check, pass, detail }]. */
function check(run, expect) {
  const out = [];
  const add = (name, pass, detail) => out.push({ check: name, pass: Boolean(pass), detail });
  if (expect.final_action) add("final action", run.final?.action === expect.final_action, `${run.final?.action}: ${run.final?.reason ?? ""}`);
  if (expect.final_status) add("feature status", run.feature.status === expect.final_status, run.feature.status);
  if (expect.dispatches_max) add("dispatch budget", run.dispatches.length <= expect.dispatches_max, `${run.dispatches.length} dispatches`);
  if (expect.verdicts) {
    // Exact: an unexpected extra retry is a regression, not noise.
    const fmt = (v) => `${v.feature ? `${v.feature}/` : ""}${v.stage}${v.task ? `:${v.task}` : ""}:${v.verdict}`;
    const want = expect.verdicts.map((v) => fmt({ ...v, feature: v.feature ?? run.verdicts[0]?.feature }));
    add("verdict sequence (exact)", JSON.stringify(run.verdicts.map(fmt)) === JSON.stringify(want), run.verdicts.map(fmt).join(" "));
  }
  add("scripted outputs pass their schemas", run.schemaErrors.length === 0, run.schemaErrors.join(" | ").slice(0, 300) || "ok");
  for (const [agent, model] of Object.entries(expect.models ?? {})) {
    const used = [...new Set(run.dispatches.filter((d) => d.agent === agent).map((d) => d.model))];
    add(`model ${agent}`, used.length && used.every((m) => m === model), used.join(",") || "never dispatched");
  }
  if (expect.denied_writes) {
    const got = run.denied.map((d) => `${d.agent}:${d.file}`).sort();
    const want = expect.denied_writes.map((d) => `${d.agent}:${d.file}`).sort();
    add("denied writes", JSON.stringify(got) === JSON.stringify(want), got.join(", ") || "none");
  }
  for (const [id, status] of Object.entries(expect.notes ?? {})) {
    const note = run.notes.find((n) => n.id === id);
    add(`note ${id}`, note?.status === status, `${note?.status ?? "missing"} → ${note?.mapped_to?.join(",") ?? ""}`);
  }
  if (expect.trace) {
    const scope = expect.trace === "stories" ? (g) => /no story|cites unknown/.test(g) : () => true;
    for (const [id, t] of Object.entries(run.traces)) {
      const gaps = t.gaps.filter(scope);
      add(`trace ${id}`, gaps.length === 0, gaps.join("; ") || `${t.requirements} REQ, ${t.acceptance_criteria} AC`);
    }
  }
  if (expect.gates) add("human gates", JSON.stringify(run.gates.map((g) => g.gate)) === JSON.stringify(expect.gates), run.gates.map((g) => g.gate).join(" "));
  if (expect.features) add("features created", Object.keys(run.app.features).length === expect.features, Object.keys(run.app.features).join(", "));
  for (const [id, deps] of Object.entries(expect.split_depends_on ?? {})) {
    add(`${id} depends on`, JSON.stringify(run.children[id]?.depends_on ?? []) === JSON.stringify(deps), JSON.stringify(run.children[id]?.depends_on ?? null));
  }
  if (expect.ship) {
    add("shipped commits", run.ship?.commits.length === expect.ship.commits, `${run.ship?.commits.length ?? 0} on ${run.ship?.branch ?? "no branch"}`);
    for (const trailer of expect.ship.trailers ?? []) add(`commit trailer ${trailer}`, run.gitLog.includes(trailer), trailer);
    if (expect.ship.dry_run) add("PR dry run recorded", run.ship?.pr.dry_run && run.ship.pr.commands.some((c) => c.includes("pr")), JSON.stringify(run.ship?.pr.commands?.at(-1)?.slice(0, 4)));
  }
  if (expect.ledger) {
    const entry = run.ledger.find((f) => f.id === run.feature.feature);
    add("ledger entry", entry?.status === expect.ledger, `${entry?.status ?? "missing"} v${entry?.version ?? "?"}`);
  }
  for (const batch of expect.parallel ?? []) {
    add(`parallel ${batch.join(" + ")}`, run.batches.some((b) => JSON.stringify(b) === JSON.stringify(batch)), run.batches.filter((b) => b.length > 1).map((b) => b.join("+")).join(" ") || "no parallel batch");
  }
  // A late constraint must reach every artifact on its way to the PR: { "<path or feature:path>": "<regex>" }.
  for (const [path, pattern] of Object.entries(expect.files_contain ?? {})) {
    const text = run.files(path);
    add(`${path} ~ /${pattern}/`, text !== null && new RegExp(pattern).test(text), text === null ? "missing" : "ok");
  }
  add("all scripted answers used", run.unanswered === 0, `${run.unanswered} left`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? "");
  if (!existsSync(join(dir, "scenario.yaml"))) {
    console.error("usage: node harness.mjs <scenario-dir> [--keep]");
    process.exit(2);
  }
  const run = await runScenario(dir, { keep: process.argv.includes("--keep"), log: (m) => console.log(`  ${m}`) });
  console.log(`\n${run.scenario}: ${run.pass ? "PASS" : "FAIL"}`);
  for (const c of run.checks) console.log(`  ${c.pass ? "✓" : "✗"} ${c.check} — ${c.detail}`);
  if (run.project) console.log(`  project kept at ${run.project}`);
  process.exit(run.pass ? 0 : 1);
}
