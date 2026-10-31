import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, FIXTURE_PACK, cli, makeFeature, makeProject } from "./helpers.mjs";

const { resolvePacks, registerPack, scanCandidates } = await import(`${ENGINE}/scripts/lib/registry.mjs`);
const { explainConfig, loadConfig } = await import(`${ENGINE}/scripts/lib/config.mjs`);

test("packs come from config first, then the registry; entries from an older session are ignored", () => {
  const dir = makeProject();
  let r = resolvePacks(dir, loadConfig(dir));
  assert.equal(r.sources["fixture-stages"], "config");
  const plain = makeProject();
  writeFileSync(join(plain, ".factory", "factory.config.yaml"), "version: 1\n");
  registerPack(plain, FIXTURE_PACK, "old-session");
  registerPack(plain, ENGINE, "new-session");
  r = resolvePacks(plain, loadConfig(plain));
  assert.equal(r.packs["fixture-stages"], undefined, "a pack that did not start this session is not used");
  assert.ok(r.warnings.some((w) => /fixture-stages was not loaded in the latest session — ignored/.test(w)));
  registerPack(plain, FIXTURE_PACK, "new-session");
  assert.equal(resolvePacks(plain, loadConfig(plain)).sources["fixture-stages"], "registry");
});

test("FACTORY_PACK_PATHS adds packs for Cursor and CI", () => {
  const plain = makeProject();
  writeFileSync(join(plain, ".factory", "factory.config.yaml"), "version: 1\n");
  process.env.FACTORY_PACK_PATHS = FIXTURE_PACK;
  try {
    assert.equal(resolvePacks(plain, {}).sources["fixture-stages"], "env");
  } finally {
    delete process.env.FACTORY_PACK_PATHS;
  }
});

test("the scan finds the marketplace that contains the engine (dev layout)", () => {
  const roots = scanCandidates(ENGINE);
  assert.ok(roots.some((r) => r.endsWith("frontend-dev-kit")), "stack kits are found next to the engine");
});

test("config explain reports the layer that set each key; feature overrides win", () => {
  const dir = makeProject("budgets: { feature: { tokens: 1000 } }");
  const featureDir = makeFeature(dir);
  let e = explainConfig(dir, "budgets.feature.tokens");
  assert.equal(e.value, 1000);
  assert.equal(e.set_by["budgets.feature.tokens"], "project");
  assert.equal(explainConfig(dir, "budgets.feature.dispatches").set_by["budgets.feature.dispatches"], "defaults");
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, "overrides.yaml"), "budgets: { feature: { tokens: 5000 } }\n");
  e = explainConfig(dir, "budgets.feature.tokens", featureDir);
  assert.equal(e.value, 5000);
  assert.equal(e.set_by["budgets.feature.tokens"], "feature");
});

test("CLI: usage errors exit 2; unknown commands print help", () => {
  const dir = makeProject();
  assert.equal(cli(dir, ["feature", "new"]).code, 2);
  assert.equal(cli(dir, ["nope"]).code, 2);
  assert.equal(cli(dir, ["step"]).code, 2, "no feature yet");
  const r = cli(dir, ["feature", "new", "--title", "Coupons", "--mode", "change-request"]);
  assert.equal(r.code, 0);
  assert.equal(r.json.feature, "FEAT-001");
  assert.equal(cli(dir, ["step"]).json.action, "dispatch");
});
