// Frontend role checks and audits: the ported convention and duplicate checks (task mode and findings
// mode), the bundle budget, the axe audit's skip path, and {config.*} audit arguments.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ENGINE, TESTS, YAML } from "./helpers.mjs";

const ROOT = join(TESTS, "..", "..");
const SCRIPTS = join(ROOT, "app-dev-kitv2", "factory-role-frontend", "scripts");
const { runAudits } = await import(`${ENGINE}/scripts/lib/audits.mjs`);
const run = (script, args, cwd) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: "utf8" });
function app(files) {
  const dir = mkdtempSync(join(tmpdir(), "fe-audit-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

test("fe-conventions: task mode fails on the rules a builder breaks; findings mode reports them as P2; unused-export waits for verification", () => {
  const dir = app({
    "src/features/coupon/ui/coupon-field/coupon-field.tsx": "export const CouponField = () => <div className=\"p-2\" onClick={() => apply()}>Apply coupon.</div>\n",
    "src/features/coupon/index.ts": "export { CouponField } from './ui/coupon-field/coupon-field'\nexport const unused = 1\n",
  });
  const task = run("fe-conventions.mjs", ["--project", dir, "--task-type", "component", "--notes", "-", "--files", "src/features/coupon/ui/coupon-field/coupon-field.tsx", "src/features/coupon/index.ts"], dir);
  assert.equal(task.status, 1, task.stdout + task.stderr);
  for (const rule of ["inline-class", "inline-handler", "hardcoded-copy", "missing-test"]) assert.match(task.stdout, new RegExp(`error  ${rule}`), rule);
  assert.doesNotMatch(task.stdout, /unused-export/, "a later task may import it");
  const audit = run("fe-conventions.mjs", ["--findings", "src/features/coupon/ui/coupon-field/coupon-field.tsx"], dir);
  assert.equal(audit.status, 0);
  const hits = JSON.parse(audit.stdout);
  assert.ok(hits.some((h) => h.rule === "inline-class" && h.severity === "P2" && h.line === 1), audit.stdout);
});

// Prettier output (printWidth 80, no config) of a component whose arrow bodies, initializers and return value
// break across lines: the checker must not ask for anything Prettier removes again.
const PRETTIER_FORMATTED = `import type { ReactElement } from 'react'

const wide = (list: number[], extra: number) =>
  list.map((item) => item + extra + extra + extra + extra + extra + extra + extra + extra + extra)

export const pick = (flag: boolean) =>
  flag
    ? someVeryLongConditionResultNumberOne
    : someVeryLongConditionResultNumberTwoXX

const value =
  someCondition &&
  anotherCondition &&
  yetAnotherCondition &&
  theLastConditionInTheChain1234

const message =
  \`hello \${someVeryLongVariableName} and \${anotherVeryLongVariableName} and \${third}\`
    .trim()
    .toUpperCase()

export const Card = ({ title }: { title: string }): ReactElement => (
  <div>
    <h1>{title}</h1>
  </div>
)

export function check() {
  return (
    someCondition &&
    anotherCondition &&
    yetAnotherCondition &&
    theLastConditionInTheChain1234 &&
    more
  )
}
`;

test("fe-conventions: Prettier-formatted code passes (multi-line arrow bodies, initializers and returns); only a block that merely returns is flagged", () => {
  const dir = app({
    "src/features/x/ui/c/c.tsx": PRETTIER_FORMATTED,
    "src/features/x/ui/c/tests/c.test.tsx": "import { Card } from '../c'\n\nit('renders', () => {\n  expect(Card).toBeDefined()\n})\n",
  });
  const ok = run("fe-conventions.mjs", ["--project", dir, "--task-type", "component", "--notes", "-", "--files", "src/features/x/ui/c/c.tsx"], dir);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.doesNotMatch(ok.stdout, /arrow-body|wrapped-expr/);
  const bad = app({ "src/features/x/ui/c/c.tsx": "export const f = (a: number) => {\n  return a + 1\n}\n", "src/features/x/ui/c/tests/c.test.tsx": "it('x', () => {})\n" });
  assert.match(run("fe-conventions.mjs", ["--project", bad, "--task-type", "component", "--notes", "-", "--files", "src/features/x/ui/c/c.tsx"], bad).stdout, /arrow-body/);
  // JSX that continues on the next line without parentheses is not what Prettier prints either.
  const jsx = app({ "src/features/x/ui/c/c.tsx": "export const A = () =>\n  <div>\n    <b />\n  </div>\n", "src/features/x/ui/c/tests/c.test.tsx": "it('x', () => {})\n" });
  assert.match(run("fe-conventions.mjs", ["--project", jsx, "--task-type", "component", "--notes", "-", "--files", "src/features/x/ui/c/c.tsx"], jsx).stdout, /arrow-body/);
});

test("fe-duplicates: a body copied from shared is flagged in task and findings mode; the self-check passes", () => {
  const body = "export function formatSize(bytes) {\n  const kb = 1024\n  const mb = kb * 1024\n  const gb = mb * 1024\n  if (bytes > gb) return 'gb'\n  if (bytes > mb) return 'mb'\n  return 'kb'\n}\n";
  const dir = app({ "src/shared/lib/format.ts": body, "src/features/files/lib/format.ts": body });
  const task = run("fe-duplicates.mjs", ["--project", dir, "--task-type", "fix", "--notes", "-", "--files", "src/features/files/lib/format.ts"], dir);
  assert.equal(task.status, 1);
  assert.match(task.stdout, /duplicate-body: same body as src\/shared\/lib\/format\.ts:1 — import it/);
  const hits = JSON.parse(run("fe-duplicates.mjs", ["--findings", "src/features/files/lib/format.ts"], dir).stdout);
  assert.equal(hits[0].rule, "duplicate-body");
  assert.equal(run("fe-duplicates.mjs", ["--self-check"], dir).status, 0);
});

test("audit-bundle: a chunk over the gzip budget is P2; no build is P3", () => {
  const big = Array.from({ length: 4000 }, (_, i) => `export const v${i} = ${Math.random()};`).join("\n");
  const dir = app({ "dist/assets/index.js": big, "dist/assets/small.js": "export const a = 1;\n" });
  const hits = JSON.parse(run("audit-bundle.mjs", ["--dist", "dist", "--max-kb", "10"], dir).stdout);
  assert.deepEqual(hits.map((h) => [h.rule, h.severity, h.file]), [["bundle-chunk", "P2", "dist/assets/index.js"]]);
  assert.deepEqual(JSON.parse(run("audit-bundle.mjs", ["--dist", "nope", "--max-kb", "10"], dir).stdout).map((h) => h.severity), ["P3"]);
});

test("audit-axe: without a build, Playwright or axe-core it reports one P3 skip and installs nothing", () => {
  const dir = app({ "package.json": "{}\n" });
  const hits = JSON.parse(run("audit-axe.mjs", ["--dist", "dist", "--routes", '["/"]', "--critical-max", "0"], dir).stdout);
  assert.deepEqual(hits.map((h) => [h.rule, h.severity]), [["axe-skipped", "P3"]]);
  writeFileSync(join(dir, "index.html"), "<main></main>");
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist", "index.html"), "<main></main>");
  assert.match(JSON.parse(run("audit-axe.mjs", ["--dist", "dist"], dir).stdout)[0].claim, /Playwright is not installed|axe-core is not installed|browser could not start/);
});

test("role audits receive {config.*} values from the merged config", () => {
  const dir = app({ "src/x.ts": "export const x = 1;\n", "dist/assets/index.js": "x".repeat(50000) });
  const pack = { root: join(ROOT, "app-dev-kitv2", "factory-role-frontend"), role: { gates: { audits: [{ name: "bundle", node: "scripts/audit-bundle.mjs", args: ["--dist", "dist", "--max-kb", "{config.quality.bundle_kb_max}"] }] } } };
  const c = { projectDir: dir, config: { roles: { frontend: { enabled: true, pack: "fe" } }, quality: { bundle_kb_max: 0.01 } }, packs: { fe: pack } };
  const findings = runAudits(c, ["src/x.ts"], () => null);
  assert.deepEqual(findings.map((f) => [f.agent, f.severity]), [["frontend:bundle", "P2"]], JSON.stringify(findings));
  assert.ok(YAML);
});

test("roles.<role>.checks_off turns a role audit off by name", () => {
  const dir = app({ "src/x.ts": "export const x = 1;\n", "dist/assets/index.js": "x".repeat(50000) });
  const pack = { root: join(ROOT, "app-dev-kitv2", "factory-role-frontend"), role: { gates: { audits: [{ name: "bundle", node: "scripts/audit-bundle.mjs", args: ["--dist", "dist", "--max-kb", "0.01"] }] } } };
  const c = { projectDir: dir, config: { roles: { frontend: { enabled: true, pack: "fe", checks_off: ["bundle"] } } }, packs: { fe: pack } };
  assert.deepEqual(runAudits(c, ["src/x.ts"], () => null), []);
});
