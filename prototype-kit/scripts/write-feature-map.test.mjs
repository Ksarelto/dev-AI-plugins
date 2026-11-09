import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./write-feature-map.mjs", import.meta.url));

function run(dir) {
  return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
}

function prototype(dir, pages, title = "Acme Coupons") {
  writeFileSync(join(dir, "prototype.json"), JSON.stringify({ title, assembly_pages: pages.map((id) => ({ id, title: id })) }));
}

test("a missing map becomes one entry from the title and the page ids", () => {
  const dir = mkdtempSync(join(tmpdir(), "feature-map-"));
  try {
    prototype(dir, ["coupon-list", "coupon-form"]);
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wrote .+\nslug: acme-coupons\npages: coupon-list, coupon-form/);
    assert.equal(readFileSync(join(dir, "features.yaml"), "utf8"), "features:\n  - slug: acme-coupons\n    pages: [coupon-list, coupon-form]\n    intent: Acme Coupons\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("one entry refreshes pages and keeps slug, states, and intent", () => {
  const dir = mkdtempSync(join(tmpdir(), "feature-map-"));
  try {
    prototype(dir, ["home", "list"]);
    const before = "features:\n  - slug: keep-me\n    pages:\n      - old\n    states: [empty]\n    intent: Keep this.\n";
    writeFileSync(join(dir, "features.yaml"), before);
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /refreshed pages/);
    assert.equal(readFileSync(join(dir, "features.yaml"), "utf8"), "features:\n  - slug: keep-me\n    pages: [home, list]\n    states: [empty]\n    intent: Keep this.\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("several entries are printed and left unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "feature-map-"));
  try {
    prototype(dir, ["home"]);
    const before = "features:\n  - slug: acme\n    pages: [coupon-list, coupon-form]\n  - slug: disable-reason\n    pages: [coupon-list]\n";
    writeFileSync(join(dir, "features.yaml"), before);
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /unchanged/);
    assert.match(result.stdout, /- acme: coupon-list, coupon-form/);
    assert.match(result.stdout, /- disable-reason: coupon-list/);
    assert.equal(readFileSync(join(dir, "features.yaml"), "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no assembly pages and an unreadable map do not overwrite the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "feature-map-"));
  try {
    prototype(dir, []);
    writeFileSync(join(dir, "features.yaml"), "keep\n");
    const empty = run(dir);
    assert.equal(empty.status, 0, empty.stderr);
    assert.match(empty.stdout, /unchanged/);
    assert.equal(readFileSync(join(dir, "features.yaml"), "utf8"), "keep\n");

    prototype(dir, ["home"]);
    writeFileSync(join(dir, "features.yaml"), "features: [\n");
    const bad = run(dir);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /features list/);
    assert.equal(readFileSync(join(dir, "features.yaml"), "utf8"), "features: [\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
