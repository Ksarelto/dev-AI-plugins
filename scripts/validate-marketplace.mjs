import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
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

function checkComponentPaths(sourcePath, manifest, label, pluginName) {
  let ok = true;

  for (const field of ["skills", "agents", "rules", "commands"]) {
    for (const rel of asPaths(manifest[field])) {
      const abs = join(sourcePath, rel);
      if (!existsSync(abs)) {
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

if (allPassed) {
  console.log("\nAll validations passed.");
  process.exit(0);
} else {
  console.error("\nValidation failed.");
  process.exit(1);
}
