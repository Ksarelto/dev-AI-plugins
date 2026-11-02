import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINE, FIXTURE_PACK, cli, makeProject } from "./helpers.mjs";

const { doctor } = await import(`${ENGINE}/scripts/lib/doctor.mjs`);

/** A writable copy of the fixture pack, so a test can break one manifest. */
function packCopy(edit) {
  const dir = join(mkdtempSync(join(tmpdir(), "factory-pack-")), "fixture-stages");
  cpSync(FIXTURE_PACK, dir, { recursive: true });
  edit?.(dir);
  return dir;
}

test("a consistent setup is healthy (roles off, fixture stages)", () => {
  const dir = makeProject("roles: { frontend: { enabled: false } }");
  const r = doctor(dir);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.packs["fixture-stages"].source, "config");
  assert.equal(r.packs.factory.source, "registry", "init registers the engine");
});

test("the active profile naming an unknown stage is an error; other profiles only warn", () => {
  const dir = makeProject("roles: { frontend: { enabled: false } }\npipeline: { profiles: { test: [requirements, nope] } }");
  const r = doctor(dir);
  assert.ok(r.errors.some((e) => /stage "nope" is not provided/.test(e)));
  assert.ok(r.warnings.some((w) => /profile standard: stage "intake"/.test(w)));
});

test("unknown gate, missing agent, unproduced input and version mismatch are errors", () => {
  const pack = packCopy((p) => {
    writeFileSync(join(p, "stages/stories/stage.yaml"), "id: stories\ntitle: x\nkind: agents\nagents: [ghost]\ninputs: [api-contract]\noutputs: [stories]\ngate: nope\nrequires: { factory: \"^9.0\" }\n");
  });
  const dir = makeProject(`roles: { frontend: { enabled: false } }\npacks: { fixture-stages: "${pack}" }`);
  const errors = doctor(dir).errors.join("\n");
  assert.match(errors, /unknown gate "nope"/);
  assert.match(errors, /has no agent "ghost"/);
  assert.match(errors, /needs "api-contract" but no earlier stage produces it/);
  assert.match(errors, /requires factory \^9\.0/);
});

test("an invalid manifest is reported with the schema message", () => {
  const pack = packCopy((p) => writeFileSync(join(p, "stages/stories/stage.yaml"), "id: stories\nkind: magic\n"));
  const dir = makeProject(`roles: { frontend: { enabled: false } }\npacks: { fixture-stages: "${pack}" }`);
  assert.ok(doctor(dir).errors.some((e) => /fixture-stages stage stories: .*kind/.test(e)));
});

test("an enabled role without its role pack and stack pack is an error", () => {
  const r = doctor(makeProject());
  assert.ok(r.errors.some((e) => /role frontend: pack "factory-role-frontend" with role.yaml is not installed/.test(e)));
});

test("on_fail must point backwards inside the profile", () => {
  const dir = makeProject("roles: { frontend: { enabled: false } }\npipeline: { stages: { requirements: { on_fail: 'goto:planning' } } }");
  assert.ok(doctor(dir).errors.some((e) => /on_fail must point backwards/.test(e)));
});

test("CLI: doctor exits 1 on errors and 0 when healthy; no .factory exits 1 with a hint", () => {
  assert.equal(cli(makeProject("roles: { frontend: { enabled: false } }"), ["doctor"]).code, 0);
  assert.equal(cli(makeProject(), ["doctor"]).code, 1);
  const empty = mkdtempSync(join(tmpdir(), "factory-empty-"));
  const r = cli(empty, ["doctor"]);
  assert.equal(r.code, 1);
  assert.match(r.json.errors[0], /factory:init/);
});
