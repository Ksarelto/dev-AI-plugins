// Role audits at verification (role.yaml gates.audits): mechanical checks of the change set — raw
// colours, untranslated text, OpenAPI drift — run by the engine instead of an auditor agent. Arguments
// may name {files}, a feature artifact ({api-contract}) or a config value ({config.quality.x}). Each is a
// node script from the role pack, run in the role's folder; it prints a JSON array of review findings
// { file?, line?, rule, severity, claim, evidence? } that join the reviewer's in review.md.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { enabledRoles } from "./config.mjs";
import { toPosix } from "./core.mjs";
import { rolePath } from "./tasks.mjs";

const SEVERITIES = new Set(["P0", "P1", "P2", "P3"]);
const TESTS = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * @param changed project-relative files the feature changed (the change set)
 * @param artifact (type) → absolute path of a feature artifact, or null; fills `{<type>}` in args
 * @param opts     { role, only } — limit to one role and to audits for which only(audit) is true (the per-task run)
 */
export function runAudits(c, changed, artifact, { role: onlyRole, only } = {}) {
  const findings = [];
  for (const role of enabledRoles(c.config).filter((r) => !onlyRole || r.name === onlyRole)) {
    const pack = c.packs[role.pack];
    const audits = pack?.role?.gates?.audits ?? [];
    if (!audits.length) continue;
    const dir = rolePath(c.config, role.name);
    const cwd = join(c.projectDir, dir);
    const mine = changed.filter((f) => (!dir || f.startsWith(`${dir}/`)) && !TESTS.test(f) && existsSync(join(c.projectDir, f)));
    const off = new Set(c.config.roles?.[role.name]?.checks_off ?? []);
    for (const audit of audits.filter((a) => !off.has(a.name) && (!only || only(a)))) {
      const files = mine.filter((f) => !audit.files || new RegExp(audit.files).test(f)).map((f) => toPosix(relative(cwd, join(c.projectDir, f))));
      let missing = null;
      const args = (audit.args ?? ["{files}"]).flatMap((a) => {
        if (a === "{files}") return files;
        // {config.quality.bundle_kb_max}: a value from the merged factory config (JSON for objects).
        const conf = /^\{config\.([\w.-]+)\}$/.exec(a);
        if (conf) {
          const v = conf[1].split(".").reduce((o, k) => o?.[k], c.config);
          return v == null ? [] : [typeof v === "object" ? JSON.stringify(v) : String(v)];
        }
        const m = /^\{([\w-]+)\}$/.exec(a);
        if (!m) return [a];
        const path = artifact(m[1]);
        if (!path) missing = m[1];
        return [path ?? ""];
      });
      // Nothing to look at: no matching files, or an artifact the audit needs does not exist.
      // An audit with a files pattern runs only when the change touches such a file (also bundle/axe).
      if (missing || ((audit.files || (audit.args ?? ["{files}"]).includes("{files}")) && !files.length)) continue;
      const r = spawnSync(process.execPath, [join(pack.root, audit.node), ...args], { cwd, encoding: "utf8", timeout: 120_000 });
      let hits;
      try {
        hits = JSON.parse(r.stdout);
      } catch {
        hits = null;
      }
      const at = (f) => (f ? toPosix(relative(c.projectDir, join(cwd, f))) : undefined);
      if (!Array.isArray(hits)) {
        findings.push({ lens: "audit", severity: "P3", agent: `${role.name}:${audit.name}`, claim: `audit ${audit.name} could not run: ${(r.stderr || r.error?.message || "no JSON output").trim().split("\n")[0]}` });
        continue;
      }
      for (const h of hits) {
        findings.push({
          lens: "audit", agent: `${role.name}:${audit.name}`, severity: SEVERITIES.has(h.severity) ? h.severity : "P2",
          ...(h.file ? { file: at(h.file) } : {}), ...(h.line ? { line: h.line } : {}),
          claim: h.claim ?? h.rule, ...(h.evidence ? { evidence: h.evidence } : {}),
        });
      }
    }
  }
  return findings;
}

/**
 * The cheap static audits a role marks `per_task: true` (raw colours, untranslated text), run in gate impl on the
 * files one task changed — so a violation is fixed by the builder that wrote it, not found at verification.
 * Blocking severities: quality.task_audit_blocking (default P0–P2); the rest are warnings. Returns gate failures.
 */
export function taskAuditFailures(ctx, files) {
  if (!ctx.task) return [];
  const blocking = ctx.config.quality?.task_audit_blocking ?? ["P0", "P1", "P2"];
  const findings = runAudits(ctx, files, () => null, { role: ctx.task.role, only: (a) => a.per_task === true });
  return findings.map((f) => ({
    check: "audit", rule: String(f.agent).split(":").pop(), ...(f.file ? { file: f.file } : {}), ...(blocking.includes(f.severity) ? {} : { warn: true }),
    message: `${f.severity} ${f.claim}${f.evidence ? ` (${f.evidence})` : ""}${f.line ? ` at line ${f.line}` : ""}`,
  }));
}
