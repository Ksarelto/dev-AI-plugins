// Style pass, once, before verification's precheck. ESLint --fix rewrites the feature change set,
// then typecheck, lint and the style audits confirm. A slice gate does not run these.
import { relative } from "node:path";
import { featureChanges } from "../lib/delivery.mjs";
import { runAudits } from "../lib/audits.mjs";
import { toPosix } from "../lib/core.mjs";
import { enabledStacks } from "../lib/testrun.mjs";
import { isAcceptanceTest } from "../lib/vitest-report.mjs";
import { inPool, resolveStack, runStackCommandAsync } from "../lib/stackexec.mjs";

export const inputs = ["change-set"];

const LINTABLE = /\.[cm]?[jt]sx?$/;
const STYLE_AUDITS = new Set(["conventions", "duplicates", "raw-colours", "i18n"]);
const PATH_IN_LINE = /([A-Za-z0-9_@./-]+\.[cm]?[jt]sx?)(?::\d+|\(\d+|,|\s|$)/;

function relLog(projectDir, log) {
  if (!log) return null;
  const rel = toPosix(relative(projectDir, log));
  return rel.startsWith("..") ? log : rel;
}

function firstLine(text) {
  return String(text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

function filesIn(text) {
  const found = [];
  for (const line of String(text ?? "").split("\n")) {
    const m = PATH_IN_LINE.exec(line.trim());
    if (m) found.push(m[1].replace(/^\.\//, ""));
  }
  return [...new Set(found)];
}

export async function run(ctx) {
  const tree = featureChanges(ctx.projectDir, ctx.state?.baseline ?? {});
  const listed = ctx.load("change-set")?.data;
  const changed = tree?.changed ?? listed?.changed ?? (listed?.tasks ?? []).flatMap((t) => t.files ?? []);
  const failures = [];
  const stacks = enabledStacks(ctx, resolveStack);
  const jobs = stacks.map((stack) => async () => {
    const lintable = changed.filter((f) => LINTABLE.test(f) && !f.startsWith(".factory/"));
    const out = [];
    if (lintable.length && stack.stack.commands?.lint_fix) {
      const fixed = await runStackCommandAsync(stack, "lint_fix", { vars: { files: lintable }, logName: `${ctx.state?.feature ?? "feature"}-style-lint-fix` });
      if (fixed.code === -1 || /ENOENT|timed out/.test(fixed.tail ?? "")) {
        out.push({ check: "lint", rule: "lint-fix-failed", role: stack.role, log: relLog(ctx.projectDir, fixed.log), message: firstLine(fixed.tail) || "eslint --fix did not run" });
      }
    }
    for (const name of ["typecheck", "lint"]) {
      const r = await runStackCommandAsync(stack, name, { logName: `${ctx.state?.feature ?? "feature"}-style-${name}` });
      if (r.skipped || r.ok) continue;
      const paths = filesIn(r.tail);
      const log = relLog(ctx.projectDir, r.log);
      const line = firstLine(r.tail) || `${name} exited with ${r.code}`;
      // Acceptance tests are still red until the fix loop wires the page. Gate checks judges them.
      const product = paths.filter((f) => !isAcceptanceTest(f));
      if (!paths.length) out.push({ check: name, rule: `${name}-failed`, role: stack.role, log, message: line });
      else if (product.length) for (const file of product.slice(0, 30)) out.push({ check: name, rule: `${name}-failed`, role: stack.role, file, log, message: line });
    }
    return out;
  });
  const ran = await inPool(jobs, ctx.config.quality?.gate_concurrency ?? 4);
  failures.push(...ran.flat());
  const blocking = ctx.config.quality?.task_audit_blocking ?? ["P0", "P1", "P2"];
  const findings = runAudits(ctx, changed, () => null, { only: (a) => STYLE_AUDITS.has(a.name) });
  for (const f of findings) {
    const rule = String(f.agent).split(":").pop();
    const blocks = blocking.includes(f.severity);
    failures.push({
      check: "audit", rule, ...(f.file ? { file: f.file } : {}), ...(blocks ? {} : { warn: true }),
      role: String(f.agent).split(":")[0],
      message: `${f.severity} ${f.claim}${f.line ? ` at line ${f.line}` : ""}`,
    });
  }
  return failures;
}
