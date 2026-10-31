#!/usr/bin/env node
// factory — the engine CLI. Every command prints one JSON document on stdout.
// Exit codes: 0 ok · 1 check failed (gate, doctor, envelope) · 2 usage or setup error.
// Project dir: --project <dir>, else $FACTORY_PROJECT_DIR, else $CLAUDE_PROJECT_DIR, else cwd.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { UsageError, readYaml } from "./lib/core.mjs";
import { explainConfig, loadConfig, profileFor, profileStages } from "./lib/config.mjs";
import { abort, approve, checkEnvelope, diagnose, load, note, parseEnvelope, record, reject, replay, resolveStage, setOverride, split, step } from "./lib/conductor.mjs";
import { buildIndex } from "./lib/cartographer.mjs";
import { resolvePacks } from "./lib/registry.mjs";
import { doctor, init } from "./lib/doctor.mjs";
import { resolveStack } from "./lib/stackexec.mjs";
import { intake } from "./lib/intake.mjs";
import { brief, briefMarkdown } from "./lib/brief.mjs";
import { gateContext, idCoverage, runGate } from "./lib/gatekeeper.mjs";
import { setNoteStatus } from "./lib/notes.mjs";
import { appendEvent, createFeature, loadAppState, readEvents, saveAppState, withLock } from "./lib/state.mjs";

const HELP = `factory <command> [options]
  init [--mode M] [--name N] [--roles frontend,backend]   create .factory/
  doctor [--register <plugin-root>]                       check installed packs and config
  config explain [key]                                    merged value + which layer set it
  intake [--text "…"] [--interview] [--new] [--title T] [--mode M] [--tier patch]
                                                          normalise new inbox files; start a feature
  feature new --title T --mode M [--profile P] [--tier T] start a feature without intake
  state [--brief] [--markdown]                            feature state (brief: what the next step needs)
  status                                                  all features, one line each
  step                                                    next action: dispatch | ask_human | halt | done
  record [--dispatch ID] [--file F | stdin] [--tokens N]  persist an envelope, run gate + warden
  gate <name> [--task ID]                                 run one gate now
  idcov --stage S                                         tracked-ID coverage of a stage
  envelope check [--file F | stdin] [--pack-id ID]        validate an envelope
  approve [GATE] [--notes "..."] · reject [GATE] --reason "..."
  note "<text>" · note decline HD-n --reason "..." · note done HD-n   human instructions (HD-*)
  override <stage> force|skip|clear                       force or skip an optional stage
  replay <stage> --with "<feedback>"                      re-run an earlier stage with feedback
  diagnose --stage S | --task T                           jump a stage or task to escalation rung 3
  split TASK-NNN                                          escalation rung 4: the planner splits the task
  index                                                   rebuild the component inventory (Cartographer)
  abort --reason "..."                                    stop the feature for good
  events [--limit N]
Common: --project <dir> --feature FEAT-NNN`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

const readInput = (args) => (args.file ? readFileSync(resolve(args.file), "utf8") : readFileSync(0, "utf8"));

async function main(argv) {
  const args = parseArgs(argv);
  const [cmd, sub] = args._;
  const project = resolve(args.project ?? process.env.FACTORY_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const feature = args.feature;

  switch (cmd) {
    case "init":
      return { out: init(project, { mode: args.mode, name: args.name, roles: args.roles }) };
    case "doctor": {
      const out = doctor(project, { register: args.register && resolve(args.register) });
      return { out, code: out.ok ? 0 : 1 };
    }
    case "config":
      if (sub !== "explain") throw new UsageError("usage: factory config explain [key]");
      return { out: explainConfig(project, args._[2]) };
    case "intake":
      return {
        out: intake(project, {
          text: typeof args.text === "string" ? args.text : undefined,
          title: typeof args.title === "string" ? args.title : undefined,
          mode: typeof args.mode === "string" ? args.mode : undefined,
          tier: typeof args.tier === "string" ? args.tier : undefined,
          newFeature: Boolean(args.new),
          interview: Boolean(args.interview),
        }),
      };
    case "feature": {
      if (sub !== "new" || !args.title || !args.mode) throw new UsageError("usage: factory feature new --title T --mode greenfield|brownfield-extend|change-request");
      return {
        out: withLock(project, () => {
          const app = loadAppState(project);
          const config = loadConfig(project);
          const profile = args.profile ?? profileFor(config, { mode: args.mode, tier: args.tier });
          if (app.mode === "unknown") app.mode = args.mode;
          const f = createFeature(project, app, { title: args.title, slug: args.slug, mode: args.mode, profile, tier: args.tier, stages: profileStages(config, profile) });
          saveAppState(project, app);
          appendEvent(project, { type: "feature", feature: f.state.feature, mode: args.mode, profile });
          return { feature: f.state.feature, dir: f.dir, profile, stages: Object.keys(f.state.stages) };
        }),
      };
    }
    case "state": {
      const data = brief(project, feature);
      if (args.markdown) return { text: briefMarkdown(data) };
      if (args.brief) return { out: data };
      const c = load(project, feature);
      return { out: c.feature.state };
    }
    case "status": {
      const app = loadAppState(project);
      return { out: { mode: app.mode, active_feature: app.active_feature, features: app.features } };
    }
    case "step":
      return { out: step(project, { feature }) };
    case "record": {
      const out = await record(project, { dispatchId: args.dispatch, envelopeText: readInput(args), tokens: args.tokens, feature });
      return { out, code: out.action === "redispatch" ? 1 : 0 };
    }
    case "gate": {
      if (!sub) throw new UsageError("usage: factory gate <name>");
      const c = load(project, feature);
      const task = args.task ? readTask(c, args.task) : undefined;
      const ctx = gateContext({ projectDir: project, app: c.app, feature: c.feature, config: c.config, task, stack: task ? resolveStack(c, task.role) : undefined });
      const results = [];
      for (const name of sub.split(",")) results.push(await runGate(name, ctx, { useCache: !args["no-cache"] }));
      const out = results.length === 1 ? results[0] : { gate: sub, pass: results.every((r) => r.pass), results };
      return { out, code: out.pass ? 0 : 1 };
    }
    case "idcov": {
      const c = load(project, feature);
      const stage = resolveStage(c, args.stage ?? c.feature.state.stage);
      if (!stage) throw new UsageError(`unknown stage ${args.stage}`);
      const ctx = gateContext({ projectDir: project, app: c.app, feature: c.feature, config: c.config, stage });
      const missing = idCoverage(ctx, { inputs: stage.inputs, outputs: stage.outputs, kinds: stage.tracked_ids ?? [] });
      return { out: { stage: stage.id, missing }, code: missing.length ? 1 : 0 };
    }
    case "envelope": {
      if (sub !== "check") throw new UsageError("usage: factory envelope check [--file F] [--pack-id ID]");
      const errors = checkEnvelope(parseEnvelope(readInput(args)), { packId: args["pack-id"] });
      return { out: { valid: !errors.length, errors }, code: errors.length ? 1 : 0 };
    }
    case "approve":
      return { out: approve(project, { gate: sub, notes: typeof args.notes === "string" ? args.notes : undefined, feature, by: args.by }) };
    case "reject":
      return { out: reject(project, { gate: sub, reason: args.reason, feature, by: args.by }) };
    case "note": {
      if (sub === "decline" || sub === "done") {
        const id = args._[2];
        if (!id || (sub === "decline" && typeof args.reason !== "string")) throw new UsageError('usage: factory note decline HD-n --reason "..." | factory note done HD-n');
        return {
          out: withLock(project, () => {
            const c = load(project, feature);
            const n = setNoteStatus(c.feature.dir, id, sub === "decline" ? "declined" : "done", args.reason);
            appendEvent(project, { type: "note", feature: c.fid, note: id, status: n.status });
            return { feature: c.fid, note: n };
          }),
        };
      }
      const text = args._.slice(1).join(" ");
      if (!text) throw new UsageError('usage: factory note "<text>"');
      return { out: note(project, { text, feature, by: args.by }) };
    }
    case "override": {
      const value = args._[2];
      if (!sub || !["force", "skip", "clear"].includes(value)) throw new UsageError("usage: factory override <stage> force|skip|clear");
      return { out: setOverride(project, { feature, stage: sub, value: value === "clear" ? undefined : value }) };
    }
    case "replay":
      return { out: replay(project, { feature, stage: sub ?? args.stage, feedback: typeof args.with === "string" ? args.with : undefined }) };
    case "diagnose":
      if (!(sub ?? args.stage ?? args.task)) throw new UsageError("usage: factory diagnose --stage <stage> | --task TASK-NNN");
      return { out: diagnose(project, { feature, stage: sub ?? args.stage, task: typeof args.task === "string" ? args.task : undefined }) };
    case "split":
      if (!sub) throw new UsageError("usage: factory split TASK-NNN");
      return { out: split(project, { feature, task: sub }) };
    case "index": {
      const config = loadConfig(project);
      return { out: buildIndex(project, config, resolvePacks(project, config).packs) };
    }
    case "abort":
      return { out: abort(project, { feature, reason: typeof args.reason === "string" ? args.reason : undefined }) };
    case "events":
      return { out: readEvents(project, { feature, limit: Number(args.limit) || 50 }) };
    case undefined:
    case "help":
      return { text: HELP };
    default:
      throw new UsageError(`unknown command "${cmd}"\n${HELP}`);
  }
}

function readTask(c, id) {
  const task = readYaml(`${c.feature.dir}/04-plan/tasks.yaml`, { tasks: [] }).tasks?.find((t) => t.id === id);
  if (!task) throw new UsageError(`task ${id} not found in tasks.yaml`);
  return task;
}

try {
  const { out, text, code = 0 } = await main(process.argv.slice(2));
  process.stdout.write(text !== undefined ? `${text}\n` : `${JSON.stringify(out, null, 2)}\n`);
  process.exitCode = code;
} catch (error) {
  const usage = error instanceof UsageError;
  process.stdout.write(`${JSON.stringify({ error: error.message, ...(usage ? {} : { stack: error.stack?.split("\n").slice(1, 4) }) })}\n`);
  process.exitCode = 2;
}

