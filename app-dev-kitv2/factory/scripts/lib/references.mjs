// Mockup references (S0 intake, Phase 6a): the customer's brief may point at a clickable mockup — a
// folder or .html file on this machine, or a URL. They are recorded in .factory/context/index.yaml as
//   references: [{ kind: mockup, path | url, entry?, run?, source?, feature?, status? }]
// and are BINDING design inputs once `status` is confirmed (absent = confirmed): the guard lets
// dispatched agents read (never write) the
// declared paths, even outside the project. Auto-detection in the brief only ever PROPOSES a reference
// (status: proposed): a folder OUTSIDE the project that holds an HTML entry, a URL, or the kit folder
// `prototype/` when `prototype/prototype.json` exists. Any other in-project path named in prose stays
// ignored. The Conductor asks one CLARIFY before a proposal becomes binding. `factory reference add`
// by the human is confirmed at once.
// `feature` scopes a reference to one feature (the one the brief belongs to / the active one when added).
// `run` is the serve command the mockup's README documents; it is recorded for people and QA and is
// never executed by the engine (the engine serves a folder itself, in-process).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { UsageError, YAML, factoryPaths, matchesAny, readJson, readYaml, toPosix, writeYaml } from "./core.mjs";
import { loadConfig } from "./config.mjs";
import { validate } from "./schemas.mjs";

const KEYWORDS = /\b(mock-?ups?|prototypes?|clickable|wireframes?|figma|design(?:s|ed)?|concept|ui kit)\b/i;
const RUN = /(python3?\s+-m\s+http\.server[^\n`]*|npx\s+(?:-y\s+)?(?:serve|http-server|vite)[^\n`]*|npm\s+(?:run\s+)?(?:start|dev)[^\n`]*)/i;

export const refKey = (r) => r.path ?? r.url;
/** Two references are the same when they name the same path or URL for the same feature (another feature may reuse a mockup). */
const dedupKey = (r) => `${r.feature ?? ""}\0${refKey(r)}`;

const clean = (t) => t.replace(/^[`'"(<\[]+/, "").replace(/[`'")>\],;:.!?]+$/, "");

/** The mockup's own README/CLAUDE.md may say how to serve it. */
function documentedRun(dir) {
  for (const name of ["README.md", "readme.md", "CLAUDE.md"]) {
    const file = join(dir, name);
    if (!existsSync(file)) continue;
    const hit = RUN.exec(readFileSync(file, "utf8").slice(0, 20000));
    if (hit) return hit[1].trim();
  }
  return undefined;
}

const isInside = (root, abs) => abs === root || abs.startsWith(`${root}/`);
const hasHtml = (dir) => {
  try {
    return readdirSync(dir).some((n) => /\.html?$/i.test(n));
  } catch {
    return false;
  }
};

/** The fixed folder a glob starts with ("src/features/**" -> "src/features"; "**" -> ""). */
const globBase = (glob) => {
  const prefix = toPosix(String(glob)).split(/[*?[{]/)[0];
  return prefix === "" || prefix.endsWith("/") ? prefix.replace(/\/$/, "") : prefix.slice(0, Math.max(prefix.lastIndexOf("/"), 0));
};

/** The role-owned source globs of the project (every configured role, enabled or not). */
function sourceGlobs(projectDir) {
  try {
    return Object.values(loadConfig(projectDir).roles ?? {}).flatMap((r) => [...(r?.owns_paths ?? [])]);
  } catch {
    return [];
  }
}

/** Whether a path inside the project lies in, or contains, a role's source folders (a reference there would be write-denied for the builders). */
function overlapsSource(rel, globs) {
  return globs.some((g) => {
    const base = globBase(g);
    return !base || rel === base || rel.startsWith(`${base}/`) || base.startsWith(`${rel}/`) || matchesAny(rel, [g]) || matchesAny(`${rel}/x`, [g]);
  });
}

/**
 * A folder or .html file as a reference. A FILE reference is the file itself (path = the file); at import its
 * folder is read for sibling assets, but only the file is write-protected. `auto` (free text in a brief): only a
 * path OUTSIDE the project and not an ancestor of it, that is an .html file or a folder with an HTML entry; a
 * project folder named in prose ("keep the design of src/widgets") is never a mockup. A human-added reference
 * (`factory reference add`) may lie inside the project (a ./mockup folder), but never be the project folder or one
 * of its parents, nor lie in or contain a role's source folders unless `allowInside` (--allow-inside) says so: the
 * guard denies writes under every reference, so such a root would lock the builders out of src/.
 */
function pathReference(token, projectDir, { auto = false, allowInside = false } = {}) {
  const expanded = token.startsWith("~/") ? join(homedir(), token.slice(2)) : token;
  const root = resolve(projectDir);
  const abs = resolve(root, expanded);
  if (!existsSync(abs)) return null;
  const inFactory = toPosix(relative(root, abs)).startsWith(".factory");
  if (inFactory || abs === homedir() || abs === "/") return null;
  if (abs === root || isInside(abs, root)) {
    if (auto) return null;
    throw new UsageError(`${token} is the project folder or one of its parents: a reference is read-only for the agents, so it would lock them out of the project. Name the mockup's own folder or .html file`);
  }
  if (auto && isInside(root, abs)) return null;
  const stat = statSync(abs);
  if (stat.isFile() && !/\.html?$/i.test(abs)) return null;
  if (!auto && isInside(root, abs) && !allowInside && overlapsSource(toPosix(relative(root, abs)), sourceGlobs(projectDir))) {
    throw new UsageError(`${token} lies in (or contains) a role's source folders: a reference is read-only for the agents. Move the mockup out of src/, or pass --allow-inside if it really is an in-project mockup folder`);
  }
  const dir = stat.isDirectory() ? abs : dirname(abs);
  if (auto && stat.isDirectory() && !hasHtml(dir)) return null;
  // Inside the project the path stays relative, so the index is portable.
  const rel = relative(root, abs);
  const path = rel.startsWith("..") || isAbsolute(rel) ? abs : toPosix(rel);
  const entry = stat.isFile() ? basename(abs) : existsSync(join(dir, "index.html")) ? "index.html" : readdirSync(dir).find((n) => /\.html?$/i.test(n));
  const run = documentedRun(dir);
  return { kind: "mockup", path, ...(entry ? { entry } : {}), ...(run ? { run } : {}) };
}

/** The same slug createFeature stores, so a features.yaml entry can match the feature title. */
export const titleSlug = (title) => String(title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const isStringList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x && !/[\\/]/.test(x));
const isPrototypePath = (p) => {
  const norm = toPosix(String(p ?? "")).replace(/\/+$/, "");
  return norm === "prototype" || norm.endsWith("/prototype");
};

/**
 * prototype/features.yaml, when the kit (or a person) wrote one. A missing file is `{ entries: null }`.
 * An invalid file is `{ entries: null, warning }` — intake reports it and still succeeds.
 */
export function readPrototypeMap(projectDir) {
  const file = join(projectDir, "prototype", "features.yaml");
  if (!existsSync(file)) return { entries: null, warning: null };
  let data;
  try {
    data = YAML.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { entries: null, warning: `prototype/features.yaml is not valid YAML (${error.message.split("\n")[0]})` };
  }
  if (!Array.isArray(data?.features)) return { entries: null, warning: "prototype/features.yaml must have a features list" };
  const entries = [];
  for (const item of data.features) {
    if (!item || typeof item.slug !== "string" || !item.slug || !isStringList(item.pages)) {
      return { entries: null, warning: "prototype/features.yaml entries need a slug and a pages list of ids" };
    }
    if (item.states !== undefined && !isStringList(item.states)) return { entries: null, warning: `prototype/features.yaml entry "${item.slug}" has an invalid states list` };
    if (item.intent !== undefined && typeof item.intent !== "string") return { entries: null, warning: `prototype/features.yaml entry "${item.slug}" has an invalid intent` };
    entries.push({ slug: item.slug, pages: item.pages, ...(item.states ? { states: item.states } : {}), ...(item.intent ? { intent: item.intent } : {}) });
  }
  return { entries, warning: null };
}

/** The entry for this feature: the only one, or the one whose slug matches the title. */
export function matchPrototypeEntry(entries, title) {
  if (!entries?.length) return null;
  if (entries.length === 1) return entries[0];
  const slug = titleSlug(title);
  return slug ? entries.find((e) => e.slug === slug) ?? null : null;
}

/** Copy pages, states and intent onto a prototype/ reference. Other paths are unchanged. */
export function withPageMap(ref, entries, title) {
  if (!ref?.path || !isPrototypePath(ref.path)) return ref;
  const entry = matchPrototypeEntry(entries, title);
  if (!entry) return ref;
  return { ...ref, pages: entry.pages, ...(entry.states ? { states: entry.states } : {}), ...(entry.intent ? { intent: entry.intent } : {}) };
}

/** The kit folder, proposed even though it is inside the project. A path that overlaps owns_paths is not proposed. */
function inRepoPrototype(projectDir) {
  if (!existsSync(join(projectDir, "prototype", "prototype.json"))) return null;
  if (overlapsSource("prototype", sourceGlobs(projectDir))) return null;
  try {
    const ref = pathReference("prototype", projectDir, { auto: false });
    return ref ? { ...ref, status: "proposed" } : null;
  } catch {
    return null;
  }
}

/** Title of a feature, for matching prototype/features.yaml. */
export function featureTitle(projectDir, featureId) {
  if (!featureId) return null;
  try {
    const app = readJson(join(factoryPaths(projectDir).root, "state.json"));
    const rel = app.features?.[featureId]?.dir;
    if (!rel) return null;
    return readJson(join(factoryPaths(projectDir).root, rel, "state.json")).title ?? null;
  } catch {
    return null;
  }
}

/**
 * Mockup references PROPOSED by free text: local folders (with an HTML entry) or .html files that exist
 * outside the project, and http(s) URLs, on a line (or the one before it) that calls them a mockup,
 * prototype, design, wireframe or Figma file. Also the in-repo `prototype/` folder when the kit has
 * been initialised. A single-entry features.yaml is attached here; several entries wait for the feature title.
 */
export function detectReferences(text, projectDir) {
  const found = new Map();
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  lines.forEach((line, i) => {
    const near = `${lines[i - 1] ?? ""}\n${line}`;
    // A URL counts when the words just before it (back to the previous URL) call it a mockup/design.
    let from = 0;
    for (const m of line.matchAll(/https?:\/\/[^\s<>`'")\]]+/g)) {
      const url = m[0].replace(/[.,;:!?]+$/, "");
      const before = line.slice(Math.max(from, m.index - 80), m.index);
      from = m.index + m[0].length;
      if (KEYWORDS.test(before) || (!before.trim() && KEYWORDS.test(near)) || /figma\.com/i.test(url)) found.set(url, { kind: "mockup", url, status: "proposed" });
    }
    if (!KEYWORDS.test(near)) return;
    const scrubbed = line.replace(/https?:\/\/\S+/g, " ");
    const tokens = [...scrubbed.matchAll(/[`"'(]([^`"')]+)[`"')]/g)].map((m) => m[1]).concat(scrubbed.split(/\s+/));
    for (const raw of tokens) {
      const token = clean(raw.trim());
      if (!token || !(/^(~\/|\/|\.{1,2}\/)/.test(token) || token.includes("/") || /\.html?$/i.test(token))) continue;
      const ref = pathReference(token, projectDir, { auto: true });
      if (ref) found.set(ref.path, { ...ref, status: "proposed" });
    }
  });
  const local = inRepoPrototype(projectDir);
  if (local && ![...found.values()].some((r) => r.path === local.path)) {
    const { entries } = readPrototypeMap(projectDir);
    const mapped = withPageMap(local, entries, null);
    found.set(mapped.path, mapped);
  }
  return [...found.values()];
}

const indexFile = (projectDir) => join(factoryPaths(projectDir).context, "index.yaml");

export const isConfirmed = (r) => (r.status ?? "confirmed") === "confirmed";

/** The feature a feature folder belongs to (its state.json), or null. */
export function featureOfDir(featureDir) {
  try {
    return readJson(join(featureDir, "state.json")).feature ?? null;
  } catch {
    return null;
  }
}

/**
 * References of the index. By default only confirmed ones (the binding inputs); `status: "all"` or
 * "proposed" for the rest. With `feature`, only the references of that feature (one with no feature
 * recorded — written before scoping — belongs to every feature).
 */
export function readReferences(projectDir, { feature, status = "confirmed" } = {}) {
  const index = readYaml(indexFile(projectDir), null);
  const all = Array.isArray(index?.references) ? index.references : [];
  // A reference found while no feature could take it (`unassigned`) belongs to the next feature, never to the open ones.
  return all.filter((r) => (status === "all" || (status === "proposed" ? r.status === "proposed" : isConfirmed(r))) && (!feature || (!r.unassigned && (!r.feature || r.feature === feature))));
}

/**
 * Confirms (or, with `accept: false`, rejects: kept in the index so a rescan does not propose it again) a feature's
 * proposed references; returns them. `accept` may be a function (reference) => boolean to decide each one.
 */
export function resolveProposed(projectDir, feature, { accept = true } = {}) {
  const index = readYaml(indexFile(projectDir), null);
  if (!Array.isArray(index?.references)) return [];
  const mine = index.references.filter((r) => r.status === "proposed" && !r.unassigned && (!r.feature || r.feature === feature));
  if (!mine.length) return [];
  for (const r of mine) r.status = (typeof accept === "function" ? accept(r) : accept) ? "confirmed" : "rejected";
  writeYaml(indexFile(projectDir), index);
  return mine;
}

/** Adds references to an index object (deduplicated by feature and path or URL); returns the ones that were new. */
export function mergeReferences(index, refs, source) {
  const have = new Set((index.references ?? []).map(dedupKey));
  const added = [];
  for (const r of refs) {
    if (have.has(dedupKey(r))) continue;
    have.add(dedupKey(r));
    added.push({ ...r, ...(source ? { source } : {}) });
  }
  if (added.length) index.references = [...(index.references ?? []), ...added];
  return added;
}

/** The same, written to context/index.yaml. */
export function registerReferences(projectDir, refs, source) {
  const index = readYaml(indexFile(projectDir), { sources: [] });
  const added = mergeReferences(index, refs, source);
  if (!added.length) return [];
  const errors = validate("source-index", index);
  if (errors.length) throw new Error(`source index would be invalid: ${errors.join("; ")}`);
  writeYaml(indexFile(projectDir), index);
  return added;
}

/** Rescans the normalised copies (an agent may have described a mockup in an image or PDF source). */
export function scanNormalised(projectDir) {
  const index = readYaml(indexFile(projectDir), { sources: [] });
  const added = [];
  for (const s of index.sources ?? []) {
    const file = join(factoryPaths(projectDir).root, s.normalised);
    if (s.superseded || !existsSync(file)) continue;
    const refs = detectReferences(readFileSync(file, "utf8"), projectDir).map((r) => ({ ...r, ...(s.feature ? { feature: s.feature } : s.unassigned ? { unassigned: true } : {}) }));
    added.push(...mergeReferences(index, refs, s.file));
  }
  if (added.length) writeYaml(indexFile(projectDir), index);
  return added;
}

/** `factory reference add <path|url> [--feature FEAT-NNN] [--allow-inside]`: the human names a mockup; it is binding at once. */
export function addReference(projectDir, target, { feature, allowInside = false } = {}) {
  if (!target) throw new UsageError("usage: factory reference add <path-or-url> [--feature FEAT-NNN] [--allow-inside]");
  const ref = /^https?:\/\//i.test(target) ? { kind: "mockup", url: target } : pathReference(target, projectDir, { allowInside });
  if (!ref) throw new UsageError(`${target} is not a folder or .html file that exists`);
  // A reference added without --feature belongs to the feature that is active now.
  const owner = feature ?? activeFeature(projectDir);
  const { entries } = readPrototypeMap(projectDir);
  const title = featureTitle(projectDir, owner);
  const scoped = withPageMap({ ...ref, status: "confirmed", ...(owner ? { feature: owner } : {}) }, entries, title);
  const index = readYaml(indexFile(projectDir), { sources: [] });
  const known = (index.references ?? []).find((r) => dedupKey(r) === dedupKey(scoped)) ?? (index.references ?? []).find((r) => r.unassigned && refKey(r) === refKey(scoped));
  if (known && known.status !== "confirmed" && known.status !== undefined) {
    // The brief only proposed it: the human has now confirmed it (and says which feature it belongs to).
    const mapped = withPageMap(known, entries, title);
    if (mapped.pages) known.pages = mapped.pages;
    if (mapped.states) known.states = mapped.states;
    if (mapped.intent) known.intent = mapped.intent;
    known.status = "confirmed";
    if (known.unassigned) {
      delete known.unassigned;
      if (owner) known.feature = owner;
    }
    writeYaml(indexFile(projectDir), index);
    return { added: [known], references: readReferences(projectDir, { status: "all" }) };
  }
  const added = registerReferences(projectDir, [scoped], "factory reference add");
  return { added, references: readReferences(projectDir, { status: "all" }) };
}

function activeFeature(projectDir) {
  try {
    const app = readJson(join(factoryPaths(projectDir).root, "state.json"));
    return app.active_feature ?? null;
  } catch {
    return null;
  }
}

/** Absolute directories the guard lets agents read (never write). */
export function referenceRoots(projectDir) {
  const file = indexFile(projectDir);
  if (!existsSync(file) || !readFileSync(file, "utf8").includes("references:")) return [];
  return readReferences(projectDir).filter((r) => r.path).map((r) => resolve(projectDir, r.path));
}

export function isUnderReference(projectDir, absPath, roots = referenceRoots(projectDir)) {
  const abs = resolve(absPath);
  return roots.some((root) => abs === root || abs.startsWith(`${root}/`));
}

/** Absolute directory a Glob/Grep call looks at: its path, else the fixed prefix of an absolute pattern. */
export function searchRoot(input, projectDir) {
  const ti = input.tool_input ?? {};
  const direct = ti.file_path ?? ti.path;
  if (direct) return resolve(projectDir, direct);
  const pattern = ti.pattern;
  if (typeof pattern === "string" && isAbsolute(pattern)) return resolve(pattern.split(/[*?[{]/)[0]);
  return null;
}
