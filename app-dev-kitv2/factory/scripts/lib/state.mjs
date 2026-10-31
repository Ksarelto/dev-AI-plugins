// App and feature state: the only files the stage machine reads to decide anything.
// All writes go through withLock (one writer at a time, also across track runners) and writeJson (atomic).
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { UsageError, factoryPaths, now, readJson, writeJson } from "./core.mjs";
import { nextId } from "./ids.mjs";
import { validate } from "./schemas.mjs";

// A lock is stale only when its holder process is gone: a live holder may legitimately run long.

export function withLock(projectDir, fn) {
  const lock = join(factoryPaths(projectDir).root, ".lock");
  mkdirSync(dirname(lock), { recursive: true });
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const fd = openSync(lock, "wx");
      writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
      closeSync(fd);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (lockIsStale(lock)) {
        try {
          unlinkSync(lock);
        } catch {
          // Another process removed it first.
        }
        continue;
      }
      if (Date.now() > deadline) throw new Error(`state lock busy: ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  const release = () => {
    try {
      unlinkSync(lock);
    } catch {
      // Already gone.
    }
  };
  let result;
  try {
    result = fn();
  } catch (error) {
    release();
    throw error;
  }
  // Async callbacks keep the lock until their promise settles (record() awaits gates inside it).
  if (result && typeof result.then === "function") return result.finally(release);
  release();
  return result;
}

function lockIsStale(lock) {
  try {
    const { pid } = JSON.parse(readFileSync(lock, "utf8"));
    process.kill(pid, 0); // throws ESRCH when the holder is gone
    return false;
  } catch (error) {
    return error.code === "ESRCH" || error instanceof SyntaxError;
  }
}

export function loadAppState(projectDir) {
  const path = factoryPaths(projectDir).state;
  if (!existsSync(path)) throw new UsageError("no .factory/state.json — run /factory:init first");
  return readJson(path);
}

export function saveAppState(projectDir, state) {
  assertValid("app-state", state);
  writeJson(factoryPaths(projectDir).state, state);
}

export function featureDir(projectDir, app, featureId) {
  const entry = app.features[featureId];
  if (!entry) throw new UsageError(`unknown feature ${featureId}`);
  return join(factoryPaths(projectDir).root, entry.dir);
}

/** Resolves the feature to act on: explicit id, else the active feature, else the only open one. */
export function pickFeature(app, featureId) {
  if (featureId) return featureId;
  if (app.active_feature) return app.active_feature;
  const open = Object.entries(app.features).filter(([, f]) => !["done", "aborted"].includes(f.status));
  // Kanban pull order: the oldest open feature. Split features depend on earlier ones, never later.
  if (open.length) return open[0][0];
  const all = Object.keys(app.features);
  if (all.length) return all.at(-1); // the last feature, so `step` can report it done
  throw new UsageError("no feature yet — run /factory:intake");
}

export function loadFeature(projectDir, app, featureId) {
  const dir = featureDir(projectDir, app, featureId);
  return { dir, state: readJson(join(dir, "state.json")) };
}

export function saveFeature(projectDir, app, feature) {
  feature.state.updated_at = now();
  assertValid("feature-state", feature.state);
  writeJson(join(feature.dir, "state.json"), feature.state);
  const entry = app.features[feature.state.feature];
  entry.status = feature.state.status;
  entry.stage = feature.state.stage;
  if (["done", "aborted"].includes(entry.status) && app.active_feature === feature.state.feature) app.active_feature = null;
}

/** Wall-clock budget counts working time only: time spent waiting for a human is paused. */
export function pauseClock(state) {
  state.budgets.paused_since ??= now();
}

export function resumeClock(state) {
  if (!state.budgets.paused_since) return;
  state.budgets.paused_ms = (state.budgets.paused_ms ?? 0) + (Date.now() - Date.parse(state.budgets.paused_since));
  state.budgets.paused_since = null;
}

export function createFeature(projectDir, app, { title, slug, mode, profile, tier = "standard", stages }) {
  const id = nextId(app.next_ids, "FEAT");
  const safeSlug = (slug ?? title ?? "feature")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const dir = `features/${id}-${safeSlug}`;
  const state = {
    feature: id,
    slug: safeSlug,
    title: title ?? safeSlug,
    mode,
    profile,
    tier,
    status: "active",
    stage: stages[0],
    stages: Object.fromEntries(stages.map((s) => [s, { status: "pending", attempts: 0, rung: 0 }])),
    pending: [],
    awaiting_human: null,
    gates: {},
    tasks: {},
    budgets: { tokens: 0, dispatches: 0, regressions: 0, edges: {}, started_at: now(), paused_ms: 0, paused_since: null },
    digest: null,
    index_sha: null,
    branch: null,
    halts: [],
    created_at: now(),
    updated_at: now(),
  };
  app.features[id] = { slug: safeSlug, status: "active", stage: stages[0], dir };
  app.active_feature = id;
  const feature = { dir: join(factoryPaths(projectDir).root, dir), state };
  mkdirSync(feature.dir, { recursive: true });
  saveFeature(projectDir, app, feature);
  return feature;
}

export function appendEvent(projectDir, event) {
  const line = { ts: now(), ...event };
  const errors = validate("event", line);
  if (errors.length) throw new Error(`invalid event: ${errors.join("; ")}`);
  const path = factoryPaths(projectDir).events;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(line)}\n`);
  return line;
}

export function readEvents(projectDir, { feature, limit } = {}) {
  const path = factoryPaths(projectDir).events;
  if (!existsSync(path)) return [];
  const events = readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => !feature || e.feature === feature);
  return limit ? events.slice(-limit) : events;
}

/** Active dispatches for this project, read by the hooks to scope writes and reads. */
export function activeDispatches(projectDir) {
  const dir = factoryPaths(projectDir).active;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(join(dir, f)));
}

/** File name for a dispatch id (ids contain "/"). Also used by the hooks for read counters. */
export const activeName = (dispatchId) => dispatchId.replaceAll("/", ".");

export function setActive(projectDir, dispatch) {
  writeJson(join(factoryPaths(projectDir).active, `${activeName(dispatch.id)}.json`), dispatch);
}

export function clearActive(projectDir, dispatchId) {
  for (const ext of [".json", ".reads"]) {
    const file = join(factoryPaths(projectDir).active, `${activeName(dispatchId)}${ext}`);
    if (existsSync(file)) unlinkSync(file);
  }
}

function assertValid(schema, data) {
  const errors = validate(schema, data);
  if (errors.length) throw new Error(`${schema} would become invalid: ${errors.join("; ")}`);
}
