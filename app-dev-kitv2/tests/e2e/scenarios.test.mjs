// Runs every mocked end-to-end scenario through the real engine (see harness.mjs).
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runScenario } from "./harness.mjs";

const SCENARIOS = join(fileURLToPath(new URL(".", import.meta.url)), "..", "scenarios");

for (const name of readdirSync(SCENARIOS).filter((n) => existsSync(join(SCENARIOS, n, "scenario.yaml")))) {
  test(`scenario ${name}`, async () => {
    const run = await runScenario(join(SCENARIOS, name));
    const failed = run.checks.filter((c) => !c.pass).map((c) => `${c.check}: ${c.detail}`);
    assert.deepEqual(failed, [], `${name} failed checks`);
  });
}
