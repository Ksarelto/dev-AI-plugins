// Acceptance waivers: a human accepts one failing acceptance test (or a whole acceptance file) for this feature.
// The file is written only by `factory acceptance waive`; it is the one way a failing acceptance test passes
// gate-checks, and every waived test is listed in the verification review and the digest.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { UsageError, now, readYaml, toPosix, writeYaml } from "./core.mjs";
import { validate } from "./schemas.mjs";

/** The git identity of whoever runs the command (user.name, else user.email), or undefined. */
export function gitUser(projectDir) {
  for (const key of ["user.name", "user.email"]) {
    const r = spawnSync("git", ["config", key], { cwd: projectDir, encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return undefined;
}

export const waiverFile = (featureDir) => join(featureDir, "acceptance-waiver.yaml");

export function readWaivers(featureDir) {
  const file = waiverFile(featureDir);
  return existsSync(file) ? readYaml(file, { entries: [] }).entries ?? [] : [];
}

/** "path" or "path::test name" → { file, name|null }. */
export function parseWaiverTarget(test) {
  const at = String(test).indexOf("::");
  const file = toPosix(at === -1 ? String(test) : String(test).slice(0, at)).trim();
  return { file, name: at === -1 ? null : String(test).slice(at + 2).trim() };
}

/** Is a failing test (file, test name) covered by an entry? A path-only entry covers every test of the file. */
export function isWaived(entries, file, name) {
  return entries.some((e) => {
    const t = parseWaiverTarget(e.test);
    return t.file === file && (t.name === null || (name !== undefined && t.name === name));
  });
}

/** Appends a waiver entry; `files` are the feature's acceptance files, so a typo cannot waive nothing silently. */
export function addWaiver(featureDir, { test, reason, by, files }) {
  const target = parseWaiverTarget(test);
  if (!target.file || !reason || typeof reason !== "string") throw new UsageError('usage: factory acceptance waive <test file or file::test name> --reason "..."');
  if (!files.includes(target.file)) throw new UsageError(`${target.file} is not one of this feature's acceptance test files (${files.join(", ") || "none"})`);
  const entries = readWaivers(featureDir);
  const entry = { test: target.name ? `${target.file}::${target.name}` : target.file, reason: reason.trim(), approved_by: by ?? process.env.USER ?? "human", approved_at: now() };
  const next = [...entries.filter((e) => e.test !== entry.test), entry];
  const errors = validate("acceptance-waiver", { entries: next });
  if (errors.length) throw new UsageError(`waiver would be invalid: ${errors.join("; ")}`);
  writeYaml(waiverFile(featureDir), { entries: next });
  return entry;
}
