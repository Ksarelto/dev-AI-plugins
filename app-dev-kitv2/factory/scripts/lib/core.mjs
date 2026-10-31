// Shared helpers for the factory engine: paths, file IO with atomic writes, hashing, globbing.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { YAML, picomatch } from "../vendor/deps.bundle.mjs";

export { YAML };
export const ENGINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FACTORY_DIR = ".factory";

/** Thrown for problems the user must fix (bad args, missing files). The CLI maps it to exit 2. */
export class UsageError extends Error {}

export function factoryPaths(projectDir) {
  const root = join(projectDir, FACTORY_DIR);
  return {
    project: projectDir,
    root,
    config: join(root, "factory.config.yaml"),
    state: join(root, "state.json"),
    events: join(root, "events.jsonl"),
    inbox: join(root, "inbox"),
    context: join(root, "context"),
    features: join(root, "features"),
    registry: join(root, ".registry"),
    active: join(root, ".active"),
    logs: join(root, "logs"),
  };
}

export function readText(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new UsageError(`missing file: ${path}`);
  }
  return JSON.parse(readText(path));
}

export function readYaml(path, fallback) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new UsageError(`missing file: ${path}`);
  }
  return YAML.parse(readText(path)) ?? {};
}

/** Splits `---\nyaml\n---\nbody` into { data, body }; data is {} when there is no front matter. */
export function readFrontMatter(path) {
  const text = readText(path);
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  return { data: YAML.parse(match[1]) ?? {}, body: match[2] };
}

/** Write via a temp file and rename, so a crash never leaves a half-written state file. */
export function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

export const writeJson = (path, value) => writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
export const writeYaml = (path, value) => writeAtomic(path, YAML.stringify(value, { lineWidth: 0 }));

export function sha(text, algo = "sha256") {
  return createHash(algo).update(text).digest("hex");
}

/** Hash of a file with line endings normalised, so CRLF checkouts hash the same. */
export function fileHash(path) {
  return existsSync(path) ? sha(readText(path)) : null;
}

export const toPosix = (p) => p.split(sep).join("/");

export function matchesAny(path, globs = []) {
  if (!globs.length) return false;
  return picomatch(globs, { dot: true })(toPosix(path));
}

/** Recursively lists files under dir as posix paths relative to base (skips node_modules and .git). */
export function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(toPosix(relative(base, full)));
  }
  return out.sort();
}

export const now = () => new Date().toISOString();

/** Deep merge where objects merge key by key and everything else (arrays included) replaces. */
export function deepMerge(base, over) {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over)) return structuredClone(over);
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = deepMerge(base[key], value);
  return out;
}

export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function getPath(obj, dotted) {
  return dotted.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** Minimal caret-range check for `requires: { factory: "^0.1" }` style constraints. */
export function satisfiesRange(version, range) {
  if (!range || range === "*") return true;
  const parse = (v) => v.replace(/^[\^~>=v ]+/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [ma, mi, pa] = parse(version);
  const [rma, rmi = 0, rpa = 0] = parse(range);
  const gte = ma > rma || (ma === rma && (mi > rmi || (mi === rmi && pa >= rpa)));
  if (range.startsWith("^")) return gte && (rma === 0 ? ma === 0 && mi === rmi : ma === rma);
  if (range.startsWith(">=")) return gte;
  return ma === rma && mi === rmi && pa === rpa;
}
