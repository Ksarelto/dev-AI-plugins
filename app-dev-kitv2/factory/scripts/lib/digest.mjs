// The feature digest, written by the engine (context.digest: engine, the default): every open tracked
// ID with a one-line meaning, in the curator's layout, built from the artifacts themselves — so it can
// never drop an ID and costs no dispatch. Meanings shrink until the digest fits digest_max_words.
import { join } from "node:path";
import { factoryPaths, writeAtomic } from "./core.mjs";
import { artifactFiles, loadArtifact } from "./schemas.mjs";

const words = (text, n) => {
  const w = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return n <= 0 || !w.length ? "" : w.length > n ? `${w.slice(0, n).join(" ")} …` : w.join(" ");
};
const line = (id, text, n) => (words(text, n) ? `${id} — ${words(text, n)}` : id);

export function engineDigest(c, after) {
  const s = c.feature.state;
  const dirs = { factoryRoot: factoryPaths(c.projectDir).root, featureDir: c.feature.dir, projectDir: c.projectDir };
  const load = (type) => artifactFiles(type, dirs).map((f) => loadArtifact(type, f));
  const [prd] = load("prd");
  const [delta] = load("delta-spec");
  const spec = prd ?? delta;
  const reqs = prd ? prd.requirements ?? [] : [...(delta?.added ?? []), ...(delta?.modified ?? [])];
  const questions = (spec?.open_questions ?? []).filter((q) => !["answered", "defaulted"].includes(q.status));
  const adrs = load("adr").filter((a) => a?.data?.id ?? a?.id);
  const notes = (load("human-notes")[0] ?? []).filter((n) => ["open", "mapped"].includes(n.status));
  const tasks = load("tasks")[0]?.tasks ?? [];
  const max = c.config.context?.digest_max_words ?? 600;

  const render = (n) => {
    const out = [
      `# ${s.feature} — digest after ${after}`,
      `Mode: ${s.mode ?? "?"} · Stage passed: ${after} · Next: ${s.stage}`,
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
