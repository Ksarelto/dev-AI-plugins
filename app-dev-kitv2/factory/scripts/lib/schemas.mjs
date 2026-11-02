// JSON-schema validation and the artifact-type registry (schemas/artifact-types.yaml).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Ajv, addFormats } from "../vendor/deps.bundle.mjs";
import { ENGINE_ROOT, listFiles, matchesAny, readFrontMatter, readJson, readText, readYaml, YAML } from "./core.mjs";

const SCHEMA_DIR = join(ENGINE_ROOT, "schemas");
let ajv;
const compiled = new Map();

function validator(name) {
  if (!ajv) {
    ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
  }
  if (!compiled.has(name)) {
    const file = join(SCHEMA_DIR, `${name}.schema.json`);
    if (!existsSync(file)) throw new Error(`unknown schema: ${name}`);
    compiled.set(name, ajv.compile(readJson(file)));
  }
  return compiled.get(name);
}

export function schemaNames() {
  return readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".schema.json"))
    .map((f) => f.slice(0, -".schema.json".length));
}

/** Returns a list of "path: message" strings; empty means valid. */
export function validate(name, data) {
  const check = validator(name);
  if (check(data)) return [];
  return check.errors.map((e) => `${e.instancePath || "/"}: ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(", ")})` : ""}`);
}

export const ARTIFACT_TYPES = readYaml(join(SCHEMA_DIR, "artifact-types.yaml"));

/** Parses `a|b?` into { names: ["a","b"], optional: true }. */
export function parseArtifactRef(ref) {
  const optional = ref.endsWith("?");
  const names = ref.replace(/\?$/, "").split("|");
  for (const n of names) if (!ARTIFACT_TYPES[n]) throw new Error(`unknown artifact type: ${n}`);
  return { names, optional };
}

/** Base directory an artifact type lives in, given the paths of the app and the feature. */
export function artifactBase(type, { factoryRoot, featureDir, projectDir }) {
  const scope = ARTIFACT_TYPES[type].scope;
  if (scope === "feature") return featureDir;
  if (scope === "project") return projectDir;
  return factoryRoot;
}

/** Existing files of an artifact type, as absolute paths. */
export function artifactFiles(type, dirs) {
  const def = ARTIFACT_TYPES[type];
  const base = artifactBase(type, dirs);
  if (!base) return [];
  if (def.scope === "project") {
    // Project-scope types (acceptance tests, docs) are listed only when their path is specific.
    if (def.path === "**") return [];
    if (!/[*?]/.test(def.path)) return existsSync(join(base, def.path)) ? [join(base, def.path)] : [];
    return listFiles(base).filter((f) => !f.startsWith(".factory/") && matchesAny(f, [def.path])).map((f) => join(base, f));
  }
  if (!/[*?]/.test(def.path)) return existsSync(join(base, def.path)) ? [join(base, def.path)] : [];
  return listFiles(base)
    .filter((f) => matchesAny(f, [def.path]))
    .map((f) => join(base, f));
}

/** Path pattern (absolute) an artifact type may be written to — used for write allowlists. */
export function artifactGlob(type, dirs) {
  return join(artifactBase(type, dirs), ARTIFACT_TYPES[type].path);
}

/** Loads an artifact as data (YAML/JSON/front matter) or text. */
export function loadArtifact(type, file) {
  const format = ARTIFACT_TYPES[type].format;
  if (format === "yaml") return readYaml(file);
  if (format === "json") return readJson(file);
  if (format === "frontmatter") return readFrontMatter(file).data;
  return readText(file);
}

/** Finds which artifact type a .factory-relative path belongs to (for the PostToolUse validator). */
export function typeOfPath(relToFactory) {
  const featureRel = relToFactory.replace(/^features\/[^/]+\//, "");
  const isFeature = featureRel !== relToFactory;
  for (const [type, def] of Object.entries(ARTIFACT_TYPES)) {
    if (def.external || def.scope === "project") continue;
    const candidate = def.scope === "feature" ? (isFeature ? featureRel : null) : relToFactory;
    if (candidate && matchesAny(candidate, [def.path])) return type;
  }
  return null;
}

/** Validates one artifact file against its schema; returns messages (empty = valid or no schema). */
export function validateArtifactFile(type, file) {
  const def = ARTIFACT_TYPES[type];
  if (!def.schema) return [];
  let data;
  try {
    data = loadArtifact(type, file);
  } catch (error) {
    return [`cannot parse ${def.format}: ${error.message}`];
  }
  return validate(def.schema, data);
}

export { YAML };
