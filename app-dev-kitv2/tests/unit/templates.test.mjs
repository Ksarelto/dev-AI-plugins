// The factory-analysis templates are what agents imitate; each one must pass its own schema and
// carry IDs in the formats the engine checks.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, TEMPLATES } from "./helpers.mjs";

const { validate } = await import(`${ENGINE}/scripts/lib/schemas.mjs`);
const { readFrontMatter, readYaml } = await import(`${ENGINE}/scripts/lib/core.mjs`);
const SCHEMA = {
  "fa-prd.md": "prd", "fa-delta-spec.yaml": "delta-spec", "fa-completeness.yaml": "completeness", "fa-stories.yaml": "stories", "fa-tasks.yaml": "tasks",
  "fa-test-plan.yaml": "test-plan", "fa-coverage.yaml": "coverage", "fa-component-map.md": "component-map",
  "fa-adr-example.md": "adr", "fa-app-profile.yaml": "app-profile", "fa-capability-map.yaml": "capability-map",
  "fa-feature-ledger.yaml": "feature-ledger",
};
const UNSCHEMED = new Set(["fa-api-contract.yaml", "fa-ux-notes.md"]);

test("every template validates against its schema", () => {
  for (const file of readdirSync(TEMPLATES)) {
    if (UNSCHEMED.has(file)) continue;
    assert.ok(SCHEMA[file], `${file} has no schema mapping — add it here`);
    const data = file.endsWith(".md") ? readFrontMatter(join(TEMPLATES, file)).data : readYaml(join(TEMPLATES, file));
    assert.deepEqual(validate(SCHEMA[file], data), [], file);
  }
});
