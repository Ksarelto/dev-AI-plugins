import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compiledSchemas = new Map();

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

let allPassed = true;

const marketplacePath = join(root, ".cursor-plugin", "marketplace.json");
const marketplaceSchema = join(root, "schemas", "marketplace.schema.json");
const pluginSchema = join(root, "schemas", "plugin.schema.json");

allPassed = validate(marketplaceSchema, marketplacePath, "marketplace.json") && allPassed;

const marketplace = loadJson(marketplacePath);

for (const entry of marketplace.plugins) {
  const sourcePath = join(root, entry.source);

  if (!existsSync(sourcePath)) {
    console.error(`FAIL: source path does not exist: ${entry.source}`);
    allPassed = false;
    continue;
  }

  const pluginJsonPath = join(sourcePath, ".cursor-plugin", "plugin.json");
  if (!existsSync(pluginJsonPath)) {
    console.error(`FAIL: missing plugin.json for ${entry.name} at ${entry.source}/.cursor-plugin/plugin.json`);
    allPassed = false;
    continue;
  }

  allPassed = validate(pluginSchema, pluginJsonPath, `${entry.name}/plugin.json`) && allPassed;

  const pluginManifest = loadJson(pluginJsonPath);
  if (pluginManifest.name !== entry.name) {
    console.error(
      `FAIL: name mismatch for ${entry.source}: marketplace="${entry.name}", plugin.json="${pluginManifest.name}"`
    );
    allPassed = false;
  }
}

if (allPassed) {
  console.log("\nAll validations passed.");
  process.exit(0);
} else {
  console.error("\nValidation failed.");
  process.exit(1);
}
