// Shared helpers for the factory control-plane tests: temp projects wired to the fixture stage pack,
// fixture artifacts, and a scripted "agent" that writes files and returns an envelope.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.FACTORY_NO_SCAN = "1";
process.env.FACTORY_ORG_CONFIG = "/nonexistent/org.yaml";

export const TESTS = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ENGINE = join(TESTS, "..", "factory");
export const CLI = join(ENGINE, "scripts", "factory.mjs");
export const GUARD = join(ENGINE, "hooks", "guard.mjs");
export const FIXTURE_PACK = join(TESTS, "fixtures", "packs", "fixture-stages");
export const ARTIFACTS = join(TESTS, "fixtures", "artifacts");
/** The factory-analysis templates are the worked GT-04 example; tests use them as fixtures. */
export const TEMPLATES = join(TESTS, "..", "factory-analysis", "templates");
const fixturePath = (name) => (existsSync(join(ARTIFACTS, name)) ? join(ARTIFACTS, name) : join(TEMPLATES, `fa-${name}`));

const lib = (name) => import(join(ENGINE, "scripts", "lib", `${name}.mjs`));
export const { init } = await lib("doctor");
export const conductor = await lib("conductor");
export const state = await lib("state");
export const { YAML, deepMerge } = await lib("core");

const projects = [];
process.on("exit", () => {
  for (const p of projects) rmSync(p, { recursive: true, force: true });
});

/** A temp project with .factory/ initialised and the fixture pack configured. */
export function makeProject(extraConfig = "") {
  const dir = mkdtempSync(join(tmpdir(), "factory-test-"));
  projects.push(dir);
  init(dir, { mode: "change-request" });
  const base = {
    version: 1,
    project: { name: "test" },
    packs: { "fixture-stages": FIXTURE_PACK },
    roles: { frontend: { enabled: true, owns_paths: ["src/**"] } },
    pipeline: { profile: "test", profiles: { test: ["requirements", "stories", "planning"] } },
    // The flow tests script the curator's dispatch; the engine digest has its own tests.
    context: { digest: "curator" },
  };
  const config = deepMerge(base, YAML.parse(extraConfig) ?? {});
  writeFileSync(join(dir, ".factory", "factory.config.yaml"), YAML.stringify(config));
  mkdirSync(join(dir, "src", "entities", "order", "model"), { recursive: true });
  writeFileSync(join(dir, "src", "entities", "order", "model", "total.ts"), "export const total = 0;\n");
  return dir;
}

/** Creates FEAT-001 in the project and returns its directory. */
export function makeFeature(dir, { mode = "change-request", stages = ["requirements", "stories", "planning"] } = {}) {
  return state.withLock(dir, () => {
    const app = state.loadAppState(dir);
    const f = state.createFeature(dir, app, { title: "Coupons at checkout", mode, profile: "test", stages });
    state.saveAppState(dir, app);
    return f.dir;
  });
}

/** Copies a fixture artifact into the feature (or app) folder, optionally transforming its text. */
export function putArtifact(featureDir, name, target, transform = (s) => s) {
  const text = transform(readFileSync(fixturePath(name), "utf8"));
  const dest = join(featureDir, target);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text);
  return dest;
}

export function putIntake(projectDir) {
  const ctx = join(projectDir, ".factory", "context");
  mkdirSync(join(ctx, "normalised"), { recursive: true });
  cpSync(join(ARTIFACTS, "normalised", "brief.md"), join(ctx, "normalised", "brief.md"));
  cpSync(join(ARTIFACTS, "source-index.yaml"), join(ctx, "index.yaml"));
  cpSync(fixturePath("coverage.yaml"), join(ctx, "coverage.yaml"));
}

export const envelope = (packId, extra = {}) => JSON.stringify({ pack_id: packId, status: "done", artifacts_written: [], summary: "ok", ...extra });

/** Runs the CLI; returns { code, json }. */
export function cli(projectDir, args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args, "--project", projectDir], { input, encoding: "utf8", env: { ...process.env } });
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = { raw: r.stdout, stderr: r.stderr };
  }
  return { code: r.status, json };
}

/** Runs a guard hook event with a stdin payload; returns parsed stdout or null. */
export function hook(projectDir, event, payload) {
  const r = spawnSync(process.execPath, [GUARD, event], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

export const readYamlFile = (path) => YAML.parse(readFileSync(path, "utf8"));

// ---- task loop on a fake stack (tests/fixtures/fake-stack.mjs replays .fake/<command>.json) ----
const ROOT = join(TESTS, "..", "..");
const FAKE = join(TESTS, "fixtures", "fake-stack.mjs");

/** A Vitest JSON report: { "<abs file>": [[name, status, message?]] | "load-error" }. */
export const report = (files) => ({
  numPassedTests: 0, numFailedTests: 0,
  testResults: Object.entries(files).map(([name, tests]) =>
    tests === "load-error"
      ? { name, status: "failed", message: "Error: Failed to resolve import './nope'", assertionResults: [] }
      : { name, status: tests.some((t) => t[1] === "failed") ? "failed" : "passed", assertionResults: tests.map(([fullName, status, msg]) => ({ fullName, status, failureMessages: msg ? [msg] : [] })) },
  ),
});

/** A project at the implementation stage with the template plan, the frontend role and a fake stack. */
export function loopSetup(extra = "") {
  const dir = makeProject(
    [
      `packs: { factory-role-frontend: "${join(ROOT, "app-dev-kitv2", "factory-role-frontend")}", frontend-dev-kit: "${join(ROOT, "frontend-dev-kit")}", factory-analysis: "${join(ROOT, "app-dev-kitv2", "factory-analysis")}" }`,
      `roles: { frontend: { enabled: true, pack: factory-role-frontend, stack: frontend-dev-kit, owns_paths: ["src/**"], stack_overrides: { commands: { typecheck: [node, "${FAKE}", typecheck], lint: [node, "${FAKE}", lint], architecture_check: [node, "${FAKE}", arch], build: [node, "${FAKE}", build], test: [node, "${FAKE}", test, "{report}"] } } } }`,
      "pipeline: { profiles: { test: [planning, implementation] }, stages: { planning: { pack: factory-analysis } } }",
      extra,
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["implementation"] });
  putIntake(dir);
  putArtifact(featureDir, "delta-spec.yaml", "01-requirements/delta-spec.yaml");
  putArtifact(featureDir, "tasks.yaml", "04-plan/tasks.yaml");
  putArtifact(featureDir, "test-plan.yaml", "04-plan/test-plan.yaml");
  mkdirSync(join(dir, ".fake"), { recursive: true });
  const fake = (command, body) => writeFileSync(join(dir, ".fake", `${command}.json`), JSON.stringify(body));
  return { dir, featureDir, fake };
}

