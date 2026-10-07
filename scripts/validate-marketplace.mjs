import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compiledSchemas = new Map();

const MANIFEST_DIRS = [
  { id: "claude", dir: ".claude-plugin", label: "Claude" },
  { id: "cursor", dir: ".cursor-plugin", label: "Cursor" },
];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function getValidator(schemaPath) {
  if (!compiledSchemas.has(schemaPath)) {
    const schema = loadJson(schemaPath);
    compiledSchemas.set(schemaPath, ajv.compile(schema));
  }
  return compiledSchemas.get(schemaPath);
}

function validate(schemaPath, dataPath, label) {
  const data = loadJson(dataPath);
  const { $schema, ...dataWithoutSchema } = data;
  const validateFn = getValidator(schemaPath);
  const valid = validateFn(dataWithoutSchema);

  if (!valid) {
    console.error(`FAIL: ${label}`);
    for (const err of validateFn.errors) {
      console.error(`  ${err.instancePath || "/"}: ${err.message}`);
    }
    return false;
  }

  console.log(`OK: ${label}`);
  return true;
}

function pluginKey(entry) {
  return `${entry.name}\0${entry.source}`;
}

function asPaths(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pathExists(abs) {
  if (!abs.includes("*")) return existsSync(abs);
  const dir = join(abs, "..");
  const pattern = basename(abs).replace(/\./g, "\\.").replace(/\*/g, ".*");
  const re = new RegExp(`^${pattern}$`);
  try {
    return readdirSync(dir).some((f) => re.test(f));
  } catch {
    return false;
  }
}

function checkComponentPaths(sourcePath, manifest, label, pluginName) {
  let ok = true;

  for (const field of ["skills", "agents", "rules", "commands"]) {
    for (const rel of asPaths(manifest[field])) {
      const abs = join(sourcePath, rel);
      if (!pathExists(abs)) {
        console.error(`FAIL: [${label}] ${pluginName} ${field} path missing: ${rel}`);
        ok = false;
        continue;
      }
      if (field !== "skills") continue;
      try {
        if (!statSync(abs).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!existsSync(join(abs, entry.name, "SKILL.md"))) {
          console.error(
            `FAIL: [${label}] ${pluginName} skill directory has no SKILL.md: ${rel}${entry.name}/`
          );
          ok = false;
        }
      }
    }
  }

  if (typeof manifest.mcpServers === "string") {
    const abs = join(sourcePath, manifest.mcpServers);
    if (!existsSync(abs)) {
      console.error(`FAIL: [${label}] ${pluginName} mcpServers path missing: ${manifest.mcpServers}`);
      ok = false;
    }
  }

  return ok;
}

// --- Agent read budgets -----------------------------------------------------
// An agent's spawn cost is its own body plus every reference it is told to read. Two things used to
// rot silently here: a renamed reference leaving a dangling read, and a spoke being handed a file
// whose own text says spokes must not load it. Both are mechanical, so check them.

const DISCLAIM_RE = /spokes?\s+do\s+not\s+load\s+this\s+file/i;
// `mdc` before `md` — alternation is left-biased, so the shorter branch would otherwise win and
// report every `.mdc` rule as a missing `.md`.
const REF_RE = /`[^`\n]*?((?:references|rules|templates|fixtures)\/[A-Za-z0-9._-]+\.(?:mdc|md|yaml))[^`\n]*?`/g;
// spec-synthesizer is the high-water mark at ~1650 (schema + templates + fixture). The ceiling sits
// just above it so a spoke regaining a few big references still trips, without failing on a state
// we have accepted and recorded in Optimization.md.
const HARD_CEILING = 1800;

function indexKitFiles(dir, out = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) indexKitFiles(abs, out);
    else if (!out.has(entry.name)) out.set(entry.name, abs);
  }
  return out;
}

// Agents legitimately name files in a companion plugin (feature-dev-kit workers load
// frontend-dev-kit rules and skills), so resolve against every plugin, not just the owning kit.
let globalIndex = null;
function resolveRef(name, kitIndex) {
  if (kitIndex.has(name)) return kitIndex.get(name);
  if (!globalIndex) globalIndex = indexKitFiles(root);
  return globalIndex.get(name) ?? null;
}

const lineCache = new Map();
function lineCount(abs) {
  if (!lineCache.has(abs)) lineCache.set(abs, readFileSync(abs, "utf8").split("\n").length);
  return lineCache.get(abs);
}

function checkAgentReadBudgets(plugins) {
  let ok = true;
  const rows = [];

  for (const entry of plugins) {
    const kitRoot = join(root, entry.source);
    const agentsDir = join(kitRoot, "agents");
    if (!existsSync(agentsDir)) continue;

    const byName = indexKitFiles(kitRoot);

    for (const file of readdirSync(agentsDir)) {
      if (!file.endsWith(".md")) continue;
      const agentAbs = join(agentsDir, file);
      const body = readFileSync(agentAbs, "utf8");
      const agentName = basename(file, ".md");
      const isHub = /orchestrator/.test(agentName);

      const seen = new Set();
      let refLines = 0;

      for (const m of body.matchAll(REF_RE)) {
        const rel = m[1];
        const name = basename(rel);
        if (seen.has(name)) continue;
        seen.add(name);

        // "do not open `x.md`" names a file to avoid, not one to load. Counting it would inflate the
        // budget and flag the very instruction that keeps the budget down.
        const lineStart = body.lastIndexOf("\n", m.index) + 1;
        if (/do not (?:open|read|load)[^.]*$/i.test(body.slice(lineStart, m.index))) continue;

        const target = resolveRef(name, byName);
        if (!target) {
          console.error(`FAIL: [read-budget] ${entry.name}/${agentName} names a missing file: ${rel}`);
          ok = false;
          continue;
        }

        refLines += lineCount(target);

        if (!isHub && DISCLAIM_RE.test(readFileSync(target, "utf8"))) {
          console.error(
            `FAIL: [read-budget] ${entry.name}/${agentName} is told to read ${name}, but that file says spokes must not load it`
          );
          ok = false;
        }
      }

      const total = lineCount(agentAbs) + refLines;
      rows.push({ agent: `${entry.name}/${agentName}`, body: lineCount(agentAbs), refs: refLines, total });

      if (total > HARD_CEILING) {
        console.error(
          `FAIL: [read-budget] ${entry.name}/${agentName} reads ${total} lines on every spawn (ceiling ${HARD_CEILING})`
        );
        ok = false;
      }
    }
  }

  if (rows.length) {
    rows.sort((a, b) => b.total - a.total);
    console.log("\nAgent fixed read budget (body + mandatory references), highest first:");
    for (const r of rows.slice(0, 12)) {
      console.log(`  ${String(r.total).padStart(5)} = ${String(r.body).padStart(4)} body + ${String(r.refs).padStart(4)} refs  ${r.agent}`);
    }
    console.log(`  … ${rows.length} agents total`);
  }

  return ok;
}

function validateMarketplace(manifestDir, label, marketplaceSchema, pluginSchema) {
  let passed = true;
  const marketplacePath = join(root, manifestDir, "marketplace.json");

  if (!existsSync(marketplacePath)) {
    console.error(`FAIL: missing ${manifestDir}/marketplace.json`);
    return { passed: false, plugins: [] };
  }

  passed = validate(marketplaceSchema, marketplacePath, `${manifestDir}/marketplace.json`) && passed;

  const marketplace = loadJson(marketplacePath);

  for (const entry of marketplace.plugins) {
    const sourcePath = join(root, entry.source);

    if (!existsSync(sourcePath)) {
      console.error(`FAIL: [${label}] source path does not exist: ${entry.source}`);
      passed = false;
      continue;
    }

    for (const { dir, label: harnessLabel } of MANIFEST_DIRS) {
      const pluginJsonPath = join(sourcePath, dir, "plugin.json");
      if (!existsSync(pluginJsonPath)) {
        console.error(
          `FAIL: [${label}] missing ${harnessLabel} plugin.json for ${entry.name} at ${entry.source}/${dir}/plugin.json`
        );
        passed = false;
        continue;
      }

      passed =
        validate(pluginSchema, pluginJsonPath, `${entry.name}/${dir}/plugin.json`) && passed;

      const pluginManifest = loadJson(pluginJsonPath);
      if (pluginManifest.name !== entry.name) {
        console.error(
          `FAIL: [${label}] name mismatch for ${entry.source}/${dir}: marketplace="${entry.name}", plugin.json="${pluginManifest.name}"`
        );
        passed = false;
      }

      // Path checks once per plugin.json (Claude marketplace pass only) to avoid duplicate lines.
      if (label === "Claude") {
        passed = checkComponentPaths(sourcePath, pluginManifest, harnessLabel, entry.name) && passed;
      }
    }
  }

  return { passed, plugins: marketplace.plugins };
}

const marketplaceSchema = join(root, "schemas", "marketplace.schema.json");
const pluginSchema = join(root, "schemas", "plugin.schema.json");

let allPassed = true;
const results = [];

for (const { dir, label } of MANIFEST_DIRS) {
  const result = validateMarketplace(dir, label, marketplaceSchema, pluginSchema);
  allPassed = result.passed && allPassed;
  results.push({ label, dir, plugins: result.plugins });
}

if (results.length === 2 && results[0].plugins.length && results[1].plugins.length) {
  const [a, b] = results;
  const setA = new Set(a.plugins.map(pluginKey));
  const setB = new Set(b.plugins.map(pluginKey));

  for (const key of setA) {
    if (!setB.has(key)) {
      const [name, source] = key.split("\0");
      console.error(
        `FAIL: plugin in ${a.dir} but missing from ${b.dir}: name="${name}", source="${source}"`
      );
      allPassed = false;
    }
  }
  for (const key of setB) {
    if (!setA.has(key)) {
      const [name, source] = key.split("\0");
      console.error(
        `FAIL: plugin in ${b.dir} but missing from ${a.dir}: name="${name}", source="${source}"`
      );
      allPassed = false;
    }
  }

  if (setA.size === setB.size && [...setA].every((k) => setB.has(k))) {
    console.log("OK: Claude and Cursor marketplace plugin lists match");
  }
}

if (results[0]?.plugins.length) {
  allPassed = checkAgentReadBudgets(results[0].plugins) && allPassed;
}

if (allPassed) {
  console.log("\nAll validations passed.");
  process.exit(0);
} else {
  console.error("\nValidation failed.");
  process.exit(1);
}
