import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE } from "./helpers.mjs";

const schemas = await import(`${ENGINE}/scripts/lib/schemas.mjs`);
const ids = await import(`${ENGINE}/scripts/lib/ids.mjs`);
const core = await import(`${ENGINE}/scripts/lib/core.mjs`);

test("every schema compiles", () => {
  for (const name of schemas.schemaNames()) assert.ok(Array.isArray(schemas.validate(name, {})), name);
});

test("schema ID patterns match the ID table in ids.mjs", () => {
  const allowed = new Set(Object.values(ids.ID_KINDS).map((k) => k.pattern));
  let checked = 0;
  for (const file of readdirSync(join(ENGINE, "schemas")).filter((f) => f.endsWith(".schema.json"))) {
    const text = readFileSync(join(ENGINE, "schemas", file), "utf8");
    for (const [, body] of text.matchAll(/"pattern": "\^(?:\(\?:)?([^"]+?)\)?\$"/g)) {
      for (const part of body.split("|")) {
        if (!/^[A-Z]+-\\\\d/.test(part)) continue; // ID kinds are PREFIX-\d…; GATE-[A-Z] is not one
        assert.ok(allowed.has(part.replaceAll("\\\\", "\\")), `${file}: ${part} is not an ID kind in ids.mjs`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 20, `only ${checked} ID patterns checked — the scan is broken`);
});

test("artifact types name existing schemas and parse their refs", () => {
  const names = new Set(schemas.schemaNames());
  for (const [type, def] of Object.entries(schemas.ARTIFACT_TYPES)) {
    if (def.schema) assert.ok(names.has(def.schema), `${type} → ${def.schema}`);
  }
  assert.deepEqual(schemas.parseArtifactRef("prd|delta-spec?"), { names: ["prd", "delta-spec"], optional: true });
  assert.throws(() => schemas.parseArtifactRef("nope"), /unknown artifact type/);
});

test("paths map back to artifact types", () => {
  assert.equal(schemas.typeOfPath("features/FEAT-001-x/04-plan/tasks.yaml"), "tasks");
  assert.equal(schemas.typeOfPath("context/index.yaml"), "source-index");
  assert.equal(schemas.typeOfPath("features/FEAT-001-x/unknown.txt"), null);
});

test("IDs: format, extract, counters", () => {
  const counters = {};
  assert.equal(ids.nextId(counters, "REQ"), "REQ-0001");
  assert.equal(ids.nextId(counters, "REQ"), "REQ-0002");
  ids.observeId(counters, "REQ-0040");
  assert.equal(ids.nextId(counters, "REQ"), "REQ-0041");
  assert.deepEqual(ids.extractIds("REQ-0412, AC-0901 and REQ-0412; HD-3", ["REQ", "HD"]), ["REQ-0412", "HD-3"]);
  assert.equal(ids.kindOf("TASK-007"), "TASK");
  assert.equal(ids.kindOf("TASK-07"), null);
});

test("semver ranges for pack requirements", () => {
  assert.ok(core.satisfiesRange("0.1.4", "^0.1"));
  assert.ok(!core.satisfiesRange("0.2.0", "^0.1"));
  assert.ok(core.satisfiesRange("1.3.0", "^1.2"));
  assert.ok(!core.satisfiesRange("2.0.0", "^1.2"));
});
