// The living app prototype: trigger, snapshot, designer → parallel per-screen fan-out, selective
// retries, the revision cap, revert/abort restore, and gate-proto's static QA — on tiny HTML strings.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML, conductor, envelope, makeFeature, makeProject, putArtifact } from "./helpers.mjs";

const { gateContext, runGate } = await import(`${ENGINE}/scripts/lib/gatekeeper.mjs`);
const ROOT = join(TESTS, "..", "..");
const V2 = (p) => join(ROOT, "app-dev-kitv2", p);
const featureState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const put = (base, rel, text) => {
  mkdirSync(dirname(join(base, rel)), { recursive: true });
  writeFileSync(join(base, rel), text);
};

const STATES = ["empty", "applied", "invalid", "loading"];
const page = (id, { states = STATES, extra = "" } = {}) =>
  `<!doctype html><html><head><title>${id}</title><link rel="stylesheet" href="../css/base.css"></head><body>` +
  `<nav aria-label="Main"><a href="../index.html">Home</a></nav><main>${states.map((s) => `<section data-state="${s}"></section>`).join("")}${extra}` +
  `<div class="dev-panel" aria-hidden="true"></div></main><script src="../js/app.js"></script></body></html>\n`;

/** Shared files and screens.yaml as the designer leaves them. */
function designerWrites(dir, screens, { tokens = ":root { --primary: #0a66c2; }\n" } = {}) {
  const p = join(dir, ".factory", "prototype");
  put(p, "screens.yaml", YAML.stringify({ layout: "sidebar", screens }));
  put(p, "index.html", `<nav aria-label="Main">${screens.filter((s) => !["removed", "placeholder"].includes(s.status)).map((s) => `<a href="pages/${s.id}.html">${s.title}</a>`).join("")}</nav>\n`);
  put(p, "js/navigation.js", `export const PAGES = [${screens.map((s) => `{ id: '${s.id}' }`).join(", ")}];\n`);
  for (const f of ["js/app.js", "js/data.js", "css/base.css"]) put(p, f, "/* shared */\n");
  put(p, "css/tokens.css", tokens);
  put(p, "css/components.css", "a:focus-visible { outline: 2px solid; }\n");
}
const report = (featureDir, extra = {}) =>
  put(featureDir, "02b-prototype/prototype-report.yaml", YAML.stringify({ feature: "FEAT-001", design_authority: "neutral", screens: [{ name: "Checkout summary", file: "pages/checkout-summary.html", stories: ["STORY-0001"] }], spec_delta: [], ...extra }));
const screenNote = (featureDir, id, stories) => put(featureDir, `02b-prototype/screens/${id}.yaml`, YAML.stringify({ screen: id, stories, states: STATES }));
const SCREENS = [
  { id: "checkout-summary", title: "Checkout summary", surface: "CheckoutSummary", stories: ["STORY-0001"], features: ["FEAT-001"], states: STATES, status: "added" },
  { id: "cart", title: "Cart", stories: ["STORY-0002"], features: ["FEAT-001"], states: ["loading"], status: "added" },
];

function setup(extra = "") {
  const dir = makeProject(
    [
      `packs: { factory-analysis: "${V2("factory-analysis")}", factory-role-frontend: "${V2("factory-role-frontend")}" }`,
      "roles: { frontend: { enabled: true, pack: factory-role-frontend } }",
      "pipeline: { profiles: { test: [prototype, requirements] }, stages: { prototype: { pack: factory-analysis } } }",
      extra,
    ].join("\n"),
  );
  const featureDir = makeFeature(dir, { stages: ["prototype", "requirements"] });
  putArtifact(featureDir, "stories.yaml", "02-stories/stories.yaml");
  putArtifact(featureDir, "ux-notes.md", "02-stories/ux-notes.md");
  return { dir, featureDir };
}
async function gate(env, screen) {
  const c = conductor.load(env.dir);
  return runGate("proto", gateContext({ projectDir: env.dir, app: c.app, feature: c.feature, config: c.config, screen }), { useCache: false });
}
const rules = (r, warn = false) => r.failures.filter((f) => Boolean(f.warn) === warn).map((f) => f.rule);

test("trigger: any UI surface runs the designer first and snapshots the prototype; prototype.enabled: false skips it", () => {
  const env = setup();
  put(join(env.dir, ".factory", "prototype"), "pages/home.html", "<p>before</p>\n");
  const d = conductor.step(env.dir).dispatches[0];
  assert.equal(d.agent, "prototype-designer");
  assert.ok(existsSync(join(env.featureDir, "02b-prototype/before/prototype/pages/home.html")), "snapshot taken at entry");
  assert.match(readFileSync(join(env.dir, d.pack), "utf8"), /You go first/);
  const off = setup("prototype: { enabled: false }");
  assert.equal(conductor.step(off.dir).dispatches[0].stage, "requirements");
  assert.equal(featureState(off.featureDir).stages.prototype.status, "skipped");
});

test("gate-proto: a complete increment passes; QA failures, untrue status and missing traces are caught", async () => {
  const env = setup();
  designerWrites(env.dir, SCREENS.slice(0, 1));
  put(join(env.dir, ".factory", "prototype"), "pages/checkout-summary.html", page("checkout-summary"));
  screenNote(env.featureDir, "checkout-summary", ["STORY-0001"]);
  report(env.featureDir);
  let r = await gate(env);
  assert.deepEqual(rules(r), [], JSON.stringify(r.failures));
  put(join(env.dir, ".factory", "prototype"), "pages/checkout-summary.html", page("checkout-summary", { states: ["empty"], extra: '<style>p{}</style><a href="ghost.html">x</a><form><input></form>' }));
  put(join(env.dir, ".factory", "prototype"), "pages/stray.html", page("stray"));
  r = await gate(env);
  for (const rule of ["state-missing", "inline-style", "dead-link", "status-untrue"]) assert.ok(rules(r).includes(rule), `${rule}: ${rules(r)}`);
  assert.ok(rules(r, true).includes("form-unchecked"));
  assert.deepEqual(rules(await gate(env, "checkout-summary")).filter((x) => ["status-untrue", "dead-link"].includes(x)), [], "a screen's own exit check skips app-wide checks");
});

test("gate-proto: binding values must reach tokens.css unless listed as deviations; stories need screens and states", async () => {
  const env = setup();
  designerWrites(env.dir, [{ ...SCREENS[0], states: ["empty"] }], { tokens: ":root { --primary: #123456; }\n" });
  put(join(env.dir, ".factory", "prototype"), "pages/checkout-summary.html", page("checkout-summary", { states: ["empty"] }));
  screenNote(env.featureDir, "checkout-summary", ["STORY-0001"]);
  report(env.featureDir, { design_authority: "provided", binding: [{ attribute: "primary colour", value: "#0a66c2", source: "inbox/brand.md:3", token: "--primary" }] });
  let r = rules(await gate(env));
  assert.ok(r.includes("binding-not-applied") && r.includes("state-not-on-screen"), r.join());
  report(env.featureDir, { design_authority: "provided", binding: [{ attribute: "primary colour", value: "#0a66c2", source: "inbox/brand.md:3", token: "--primary" }], deviations: [{ attribute: "primary colour", token: "--primary", reason: "fails 4.5:1 contrast on white" }] });
  r = rules(await gate(env));
  assert.ok(!r.includes("binding-not-applied"), "a listed deviation is accepted");
});

test("fan-out: the designer, then one parallel dispatch per added screen with its own id and the batch's write scope", async () => {
  const env = setup();
  let s = conductor.step(env.dir);
  designerWrites(env.dir, SCREENS);
  report(env.featureDir, { screens: [{ name: "Checkout summary", file: "pages/checkout-summary.html", stories: ["STORY-0001"] }, { name: "Cart", file: "pages/cart.html", stories: ["STORY-0002"] }] });
  let r = await conductor.record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(r.action, "continue", JSON.stringify(r));
  s = conductor.step(env.dir);
  assert.deepEqual(s.dispatches.map((d) => [d.agent, d.phase, d.screen]), [["prototyper", "screen", "checkout-summary"], ["prototyper", "screen", "cart"]]);
  assert.notEqual(s.dispatches[0].id, s.dispatches[1].id);
  const front = YAML.parse(readFileSync(join(env.dir, s.dispatches[0].pack), "utf8").split("---")[1]);
  assert.ok(front.write_allow.includes(".factory/prototype/pages/cart.html") && !front.write_allow.some((w) => w.includes("css")), JSON.stringify(front.write_allow));
  assert.match(readFileSync(join(env.dir, s.dispatches[0].pack), "utf8"), /gate proto [^\n]*--screen checkout-summary/);
  assert.equal(featureState(env.featureDir).stages.prototype.dispatches, 1, "screens do not use the stage dispatch budget");
  put(join(env.dir, ".factory", "prototype"), "pages/checkout-summary.html", page("checkout-summary"));
  screenNote(env.featureDir, "checkout-summary", ["STORY-0001"]);
  put(join(env.dir, ".factory", "prototype"), "pages/cart.html", page("cart", { states: [] }));
  screenNote(env.featureDir, "cart", ["STORY-0002"]);
  r = await conductor.record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(r.action, "continue");
  r = await conductor.record(env.dir, { dispatchId: s.dispatches[1].id, envelopeText: envelope(s.dispatches[1].id) });
  assert.equal(r.verdict, "retry", "cart lacks its loading state");
  s = conductor.step(env.dir);
  assert.deepEqual(s.dispatches.map((d) => d.screen), ["cart"], "only the failing screen is re-dispatched");
  put(join(env.dir, ".factory", "prototype"), "pages/cart.html", page("cart", { states: ["loading"] }));
  r = await conductor.record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  assert.equal(r.verdict, "advance", JSON.stringify(r.gate?.failures));
  assert.equal(conductor.step(env.dir).gate, "GATE-P");
});

test("GATE-P rejects stop at budgets.prototype.revisions_max; revert restores the snapshot; abort restores it too", async () => {
  const env = setup("budgets: { prototype: { revisions_max: 1 } }");
  put(join(env.dir, ".factory", "prototype"), "pages/home.html", "<p>before</p>\n");
  const s = conductor.step(env.dir);
  const st = featureState(env.featureDir);
  Object.assign(st, { status: "awaiting_human", awaiting_human: { gate: "GATE-P", stage: "prototype", since: "x" }, pending: [] });
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(st));
  conductor.reject(env.dir, { reason: "Make the discount line red" });
  assert.equal(featureState(env.featureDir).stages.prototype.revisions, 1);
  const again = featureState(env.featureDir);
  Object.assign(again, { status: "awaiting_human", awaiting_human: { gate: "GATE-P", stage: "prototype", since: "x" }, pending: [] });
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(again));
  conductor.reject(env.dir, { reason: "Still wrong" });
  assert.equal(featureState(env.featureDir).status, "blocked");
  put(join(env.dir, ".factory", "prototype"), "pages/home.html", "<p>after</p>\n");
  const unblocked = featureState(env.featureDir);
  Object.assign(unblocked, { status: "active" });
  writeFileSync(join(env.featureDir, "state.json"), JSON.stringify(unblocked));
  conductor.revertPrototype(env.dir, {});
  assert.equal(readFileSync(join(env.dir, ".factory/prototype/pages/home.html"), "utf8"), "<p>before</p>\n");
  assert.equal(featureState(env.featureDir).stages.prototype.status, "pending");
  assert.ok(s);
  const other = setup();
  conductor.step(other.dir);
  put(join(other.dir, ".factory", "prototype"), "pages/new.html", "<p>new</p>\n");
  const out = conductor.abort(other.dir, { reason: "not needed" });
  assert.equal(out.prototype.restored, true);
  assert.ok(!existsSync(join(other.dir, ".factory/prototype")), "there was no prototype before this feature");
  rmSync(other.dir, { recursive: true, force: true });
});

test("a screen note asking for classes fails gate-proto on the shared CSS, so the designer revises it", async () => {
  const env = setup();
  designerWrites(env.dir, SCREENS.slice(0, 1));
  put(join(env.dir, ".factory", "prototype"), "pages/checkout-summary.html", page("checkout-summary"));
  put(env.featureDir, "02b-prototype/screens/checkout-summary.yaml", YAML.stringify({ screen: "checkout-summary", stories: ["STORY-0001"], states: STATES, needs_classes: ["discount-line"] }));
  report(env.featureDir);
  const r = await gate(env);
  const f = r.failures.find((x) => x.rule === "needs-classes");
  assert.ok(f && f.file.endsWith("02b-prototype/screens/checkout-summary.yaml"), JSON.stringify(r.failures));
  assert.equal((await gate(env, "checkout-summary")).failures.some((x) => x.rule === "needs-classes"), false, "the screen's own check does not fail on it");
});

test("through the real flow: GATE-P rejects hit the cap and block; /factory:proto --revert restores and unblocks", async () => {
  const env = setup("budgets: { prototype: { revisions_max: 1 } }\ncontext: { digest: engine }");
  put(join(env.dir, ".factory", "prototype"), "pages/home.html", page("home", { states: [] }));
  const build = async () => {
    let s = conductor.step(env.dir);
    designerWrites(env.dir, SCREENS.slice(0, 1).map((x) => ({ ...x })).concat([{ id: "home", title: "Home", status: "unchanged", states: [] }]));
    report(env.featureDir);
    await conductor.record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
    s = conductor.step(env.dir);
    put(join(env.dir, ".factory", "prototype"), "pages/checkout-summary.html", page("checkout-summary"));
    screenNote(env.featureDir, "checkout-summary", ["STORY-0001"]);
    return conductor.record(env.dir, { dispatchId: s.dispatches[0].id, envelopeText: envelope(s.dispatches[0].id) });
  };
  const first = await build();
  assert.equal(first.verdict, "advance", JSON.stringify(first.gate?.failures));
  assert.equal(conductor.step(env.dir).gate, "GATE-P");
  conductor.reject(env.dir, { reason: "Show the discount above the total" });
  assert.equal((await build()).verdict, "advance");
  conductor.reject(env.dir, { reason: "Still not right" });
  assert.equal(featureState(env.featureDir).status, "blocked");
  const out = conductor.revertPrototype(env.dir, {});
  assert.equal(out.restored, true);
  const st = featureState(env.featureDir);
  assert.equal(st.status, "active");
  assert.deepEqual([st.stages.prototype.status, st.stages.prototype.revisions], ["pending", 0]);
  assert.ok(!existsSync(join(env.dir, ".factory/prototype/pages/checkout-summary.html")));
  assert.equal(readFileSync(join(env.dir, ".factory/prototype/pages/home.html"), "utf8"), page("home", { states: [] }));
  assert.equal(conductor.step(env.dir).dispatches[0].agent, "prototype-designer", "the stage runs again from a fresh snapshot");
});
