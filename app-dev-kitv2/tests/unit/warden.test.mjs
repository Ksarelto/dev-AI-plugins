import assert from "node:assert/strict";
import { test } from "node:test";
import { ENGINE } from "./helpers.mjs";

const { decide, exhaustedBudgets } = await import(`${ENGINE}/scripts/lib/warden.mjs`);
const fail = (signal, fingerprint) => ({ pass: false, progress_signal: signal, fingerprint, failures: [] });
const fresh = { attempts: 1, rung: 0 };

test("a passing gate advances", () => {
  assert.equal(decide(fresh, { pass: true }).verdict, "advance");
});

test("first failure retries at rung 1 with validator feedback", () => {
  const v = decide(fresh, fail(4, "a"));
  assert.equal(v.verdict, "retry");
  assert.equal(v.rung, 1);
  assert.match(v.instruction, /Fix ONLY/);
});

test("rung 2 retries on the reasoning tier", () => {
  const v = decide({ attempts: 2, rung: 1, progress_signal: [4], fingerprints: ["a"] }, fail(2, "b"), { tiers: { reasoning: "opus" } });
  assert.equal(v.verdict, "retry");
  assert.equal(v.rung, 2);
  assert.equal(v.model, "opus");
});

test("same fingerprint twice in a row escalates to diagnosis (rung 3)", () => {
  const v = decide({ attempts: 2, rung: 1, progress_signal: [3], fingerprints: ["a"] }, fail(3, "a"));
  assert.equal(v.verdict, "diagnose");
  assert.equal(v.rung, 3);
});

test("no progress over two attempts never gets a third try at rung 1", () => {
  const v = decide({ attempts: 2, rung: 1, progress_signal: [4, 4], fingerprints: ["a", "b"] }, fail(4, "c"));
  assert.equal(v.verdict, "diagnose");
});

test("oscillating files escalate to diagnosis", () => {
  const unit = { attempts: 2, rung: 1, progress_signal: [5, 3], fingerprints: ["a", "b"], state_hashes: ["h1", "h2"] };
  assert.equal(decide(unit, fail(2, "c"), { stateHash: "h1" }).verdict, "diagnose");
});

test("attempts exhausted forces diagnosis", () => {
  assert.equal(decide({ attempts: 3, rung: 1, progress_signal: [9], fingerprints: ["a"] }, fail(1, "b"), { attemptsMax: 3 }).rung, 3);
});

test("a task failing after diagnosis is amended in place (not split); a stage is blocked", () => {
  const unit = { attempts: 4, rung: 3, progress_signal: [3, 2, 1], fingerprints: ["a", "b", "c"] };
  assert.equal(decide(unit, fail(1, "d"), { isTask: true }).verdict, "amend");
  assert.equal(decide(unit, fail(1, "d"), { isTask: false }).verdict, "block");
});

test("business errors never retry; clarification goes to the human", () => {
  assert.equal(decide(fresh, null, { envelope: { status: "failed", error: { type: "business" } } }).verdict, "block");
  assert.equal(decide(fresh, null, { envelope: { status: "needs_clarification" } }).verdict, "ask_human");
  assert.equal(decide(fresh, null, { envelope: { status: "failed", error: { type: "permission" } } }).verdict, "ask_human");
});

test("a transient failure gets exactly one retry", () => {
  const env = { envelope: { status: "failed", error: { type: "transient" } } };
  const first = decide(fresh, null, env);
  assert.equal(first.verdict, "retry");
  assert.equal(decide(first.unit, null, env).verdict, "block");
});

test("an exhausted feature budget blocks instead of retrying", () => {
  assert.equal(decide(fresh, fail(1, "a"), { budgetLeft: false }).verdict, "block");
  const used = { budgets: { tokens: 10, dispatches: 1, regressions: 0 } };
  assert.deepEqual(exhaustedBudgets(used, { budgets: { feature: { tokens: 5 } } }), ["tokens 10/5"]);
});
