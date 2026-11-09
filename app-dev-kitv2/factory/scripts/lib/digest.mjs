// The feature digest, written by the engine (context.digest: engine, the default): every open tracked
// ID with a one-line meaning, in the curator's layout, built from the artifacts themselves — so it can
// never drop an ID and costs no dispatch. Meanings shrink until the digest fits digest_max_words.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { factoryPaths, readText, writeAtomic } from "./core.mjs";
import { profileStages } from "./config.mjs";
import { artifactFiles, loadArtifact } from "./schemas.mjs";
import { readWaivers } from "./waivers.mjs";

// What the digest summarises; an artifact of these written after the digest makes it stale.
// (Human notes are inlined into packs separately, so a note never makes the digest stale.)
const DIGEST_SOURCES = ["prd", "delta-spec", "open-questions", "stories", "component-map", "adr", "api-contract", "tasks", "test-plan"];

/**
 * The digest text when it still describes the feature, else null. Stale means: a source artifact is
 * newer than digest.md, or the digest was written before the build began and the build has started
 * (its Plan section lists task statuses that have moved on).
 */
export function freshDigest(projectDir, featureObj, config, stageId) {
  const file = join(featureObj.dir, "digest.md");
  if (!existsSync(file)) return null;
  const text = readText(file).trim();
  const after = /digest after (\S+)/.exec(text.split("\n")[0] ?? "")?.[1];
  let profile = [];
  try {
    profile = profileStages(config, featureObj.state.profile);
  } catch {
    // An unknown profile: the age check below decides alone.
  }
  const impl = profile.indexOf("implementation");
  if (after && impl !== -1 && profile.indexOf(after) < impl && impl <= profile.indexOf(stageId)) return null;
  const written = statSync(file).mtimeMs;
  const dirs = { factoryRoot: factoryPaths(projectDir).root, featureDir: featureObj.dir, projectDir };
  const newer = DIGEST_SOURCES.some((type) => artifactFiles(type, dirs).some((f) => statSync(f).mtimeMs > written));
  return newer ? null : text;
}

const words = (text, n) => {
  const w = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return n <= 0 || !w.length ? "" : w.length > n ? `${w.slice(0, n).join(" ")} …` : w.join(" ");
};
const line = (id, text, n) => (words(text, n) ? `${id} — ${words(text, n)}` : id);

export function engineDigest(c, after) {
  const s = c.feature.state;
  // Written while the feature is still on the stage that just passed (often waiting for GATE-A).
  // Next is the following profile stage, not s.stage.
  let next = s.stage;
  try {
    const profile = profileStages(c.config, s.profile);
    const i = profile.indexOf(after);
    next = i === -1 ? s.stage : i === profile.length - 1 ? "done" : profile[i + 1];
  } catch {
    // An unknown profile: keep the stage pointer.
  }
  const dirs = { factoryRoot: factoryPaths(c.projectDir).root, featureDir: c.feature.dir, projectDir: c.projectDir };
  const load = (type) => artifactFiles(type, dirs).map((f) => loadArtifact(type, f));
  const [prd] = load("prd");
  const [delta] = load("delta-spec");
  const spec = prd ?? delta;
  const reqs = prd ? prd.requirements ?? [] : [...(delta?.added ?? []), ...(delta?.modified ?? [])];
  const questions = (spec?.open_questions ?? []).filter((q) => !["answered", "defaulted"].includes(q.status));
  const adrs = load("adr").filter((a) => a?.data?.id ?? a?.id);
  const notes = (load("human-notes")[0] ?? []).filter((n) => ["open", "mapped"].includes(n.status) && n.kind !== "process");
  const tasks = load("tasks")[0]?.tasks ?? [];
  const waived = readWaivers(c.feature.dir);
  const max = c.config.context?.digest_max_words ?? 600;

  const render = (n) => {
    const out = [
      `# ${s.feature} — digest after ${after}`,
      `Mode: ${s.mode ?? "?"} · Stage passed: ${after} · Next: ${next}`,
      "",
      "## Scope",
      words(spec?.summary, n * 5) || "(no summary in the spec)",
      "",
      "## Requirements and acceptance criteria",
      ...reqs.flatMap((r) => [`- ${line(r.id, r.text, n)}`, ...(r.acs ?? []).map((a) => `  - ${line(a.id, a.text, n)}`)]),
    ];
    if (delta?.removed?.length) out.push("", "## Removed", ...delta.removed.map((r) => `- ${line(r.id, r.reason ?? r.text, n)}`));
    if (adrs.length) out.push("", "## Decisions", ...adrs.map((a) => `- ${line(a.data?.id ?? a.id, a.data?.title ?? a.title, n)}`));
    if (questions.length) out.push("", "## Open questions", ...questions.map((q) => `- ${line(`${q.id} (${q.severity}${q.default ? `, default "${words(q.default, n)}"` : ""})`, q.text, n)}`));
    if (notes.length) out.push("", "## Human notes", ...notes.map((x) => `- ${line(`${x.id}${x.mapped_to?.length ? ` → ${x.mapped_to.join(", ")}` : " (open)"}`, x.text, n)}`));
    if (tasks.length) out.push("", "## Plan", ...tasks.map((t) => `- ${line(`${t.id} (${t.role}, ${t.type}, ${s.tasks?.[t.id]?.status ?? "pending"})`, `${t.title}${t.satisfies?.length ? ` [${t.satisfies.join(", ")}]` : ""}`, n)}`));
    if (waived.length) out.push("", "## Waived acceptance tests (a human accepted these as failing)", ...waived.map((w) => `- ${line(w.test, `${w.reason} (${w.approved_by})`, n)}`));
    return `${out.join("\n")}\n`;
  };
  let text = render(12);
  for (const n of [8, 4, 0]) {
    if (text.split(/\s+/).filter(Boolean).length <= max) break;
    text = render(n);
  }
  writeAtomic(join(c.feature.dir, "digest.md"), text);
  return text;
}
