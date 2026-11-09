// gate-intake (S0): every requirement-bearing paragraph has a source ID, the engine-tagged text is
// unchanged, and the coverage checklist is honest: "covered" cites sources, a gap says why, and the
// essentials (intake.essential_topics) cannot be waved through — no source there is a blocker gap,
// which sends the run to the guided interview. A ## Users or ## Goals heading with no paragraph
// under it is a blocker gap, and a covered citation for that topic has to sit under the heading.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { YAML, readText, sha } from "../lib/core.mjs";
import { isUntaggedHint } from "../lib/intake.mjs";
import { isId } from "../lib/ids.mjs";
import { validate } from "../lib/schemas.mjs";

export const inputs = ["source-index", "normalised-sources", "coverage", "human-notes"];

/** Blank-line separated blocks, with a code fence kept whole like the engine's tagging does. */
function blocks(text) {
  const out = [];
  let fence = null;
  for (const block of text.split(/\n\s*\n/)) {
    const odd = (block.match(/```/g) ?? []).length % 2 === 1;
    if (fence !== null) {
      fence += `\n\n${block}`;
      if (odd) (out.push(fence), (fence = null));
    } else if (odd) fence = block;
    else out.push(block);
  }
  if (fence !== null) out.push(fence);
  return out.map((b) => b.trim()).filter(Boolean);
}

const TEMPLATE_HEADINGS = new Map([["users", "users"], ["goals", "goals"]]);

/** SRC ids that sit under a ## Users or ## Goals heading. A heading that is absent is not in the map. */
function headingSources(text) {
  const found = new Map();
  let active = null;
  for (const block of blocks(text)) {
    const lines = block.split("\n");
    let start = 0;
    const heading = /^(#{1,6})\s+(\S.*?)\s*$/.exec(lines[0] ?? "");
    if (heading) {
      active = TEMPLATE_HEADINGS.get(heading[2].trim().toLowerCase()) ?? null;
      if (active && !found.has(active)) found.set(active, new Set());
      start = 1;
    }
    if (!active) continue;
    const body = lines.slice(start).join("\n").trim();
    const match = /^\[(SRC-\d{3,})\]\s+\S/.exec(body);
    if (match) found.get(active).add(match[1]);
  }
  return found;
}

export function run(ctx) {
  const failures = [];
  const index = ctx.load("source-index");
  if (!index) return [{ check: "source-index", message: "context/index.yaml is missing — run the intake normaliser" }];
  for (const e of validate("source-index", index.data)) failures.push({ check: "source-index", rule: "schema", file: index.rel, message: e });

  const seen = new Map();
  const headingIds = new Map();
  for (const source of index.data.sources ?? []) {
    const file = join(ctx.paths.root, source.normalised);
    if (!existsSync(file)) {
      failures.push({ check: "normalised", rule: "missing-file", file: source.normalised, message: `normalised file for ${source.file} is missing` });
      continue;
    }
    const text = readText(file);
    for (const [topic, ids] of headingSources(text)) {
      const set = headingIds.get(topic) ?? new Set();
      for (const id of ids) set.add(id);
      headingIds.set(topic, set);
    }
    // The engine tagged text sources itself; the normaliser describes only images, PDFs and the like.
    if (source.normalised_sha && sha(text) !== source.normalised_sha) {
      failures.push({ check: "normalised", rule: "edited-source", file: source.normalised, message: `${source.normalised} was changed after the engine tagged it — customer text must stay as received` });
    }
    const tagged = [];
    for (let paragraph of blocks(text)) {
      if (paragraph.startsWith("#")) {
        paragraph = paragraph.split("\n").slice(1).join("\n").trim(); // text under a heading still needs an ID
        if (!paragraph) continue;
      }
      if (paragraph.startsWith("<!--")) {
        failures.push({ check: "normalised", rule: "placeholder", file: source.normalised, message: `${source.file} (${source.kind}) is not described yet` });
        continue;
      }
      // A blockquote or an authority: line is a template hint, not a source paragraph.
      if (isUntaggedHint(paragraph)) continue;
      const match = /^\[(SRC-\d{3,})\]\s+\S/.exec(paragraph);
      if (!match) {
        failures.push({ check: "normalised", rule: "untagged-paragraph", file: source.normalised, message: `paragraph without a source ID: "${paragraph.slice(0, 60)}"` });
        continue;
      }
      tagged.push(match[1]);
    }
    for (const id of tagged) {
      if (seen.has(id)) failures.push({ check: "normalised", rule: "duplicate-id", file: source.normalised, message: `${id} also used in ${seen.get(id)}` });
      seen.set(id, source.normalised);
    }
    const listed = new Set(source.ids ?? []);
    for (const id of tagged) if (!listed.has(id)) failures.push({ check: "source-index", rule: "unlisted-id", file: index.rel, message: `${id} is not listed for ${source.file}` });
    for (const id of listed) if (!tagged.includes(id) || !isId(id, "SRC")) failures.push({ check: "source-index", rule: "phantom-id", file: index.rel, message: `${id} is listed but not in ${source.normalised}` });
  }

  // Coverage is app-wide; interview answers (HD notes) may come from any feature.
  const notes = new Set(
    Object.values(ctx.app?.features ?? {}).flatMap((f) => {
      const file = join(ctx.paths.root, f.dir, "human-notes.yaml");
      return existsSync(file) ? (YAML.parse(readText(file)) ?? []).map((n) => n.id) : [];
    }),
  );
  const coverage = ctx.load("coverage");
  if (!coverage) {
    failures.push({ check: "coverage", message: "context/coverage.yaml is missing" });
    return failures;
  }
  for (const e of validate("coverage", coverage.data)) failures.push({ check: "coverage", rule: "schema", file: coverage.rel, message: e });
  const topics = coverage.data.topics ?? {};
  for (const topic of ctx.config.intake?.coverage_topics ?? []) {
    if (!topics[topic]) failures.push({ check: "coverage", rule: "topic-missing", file: coverage.rel, message: `topic "${topic}" not assessed` });
  }
  // A patch is a small change to an app whose users and goals are known; only bigger work must state them.
  const essential = ctx.state?.tier === "patch" ? [] : ctx.config.intake?.essential_topics ?? ["users", "goals"];
  for (const [topic, value] of Object.entries(topics)) {
    if (value.status === "covered" && !value.sources?.length) {
      failures.push({ check: "coverage", rule: "covered-without-source", file: coverage.rel, message: `"${topic}" is marked covered but cites no SRC or HD` });
    }
    if (["gap", "not_applicable"].includes(value.status) && !value.note?.trim()) {
      failures.push({ check: "coverage", rule: "gap-without-note", file: coverage.rel, message: `"${topic}" is ${value.status} — say what is missing or why it does not apply` });
    }
    if (essential.includes(topic) && value.status !== "covered" && value.status !== "blocker_gap") {
      failures.push({ check: "coverage", rule: "essential-gap", file: coverage.rel, message: `"${topic}" is essential: cite a source, or mark it blocker_gap and ask the human` });
    }
    if (value.status === "blocker_gap") {
      failures.push({ check: "coverage", rule: "blocker-gap", file: coverage.rel, message: `blocker gap on "${topic}" — ask the human (return needs_clarification with questions)` });
    }
    for (const id of value.sources ?? []) {
      if (!seen.has(id) && !notes.has(id)) failures.push({ check: "coverage", rule: "unknown-source", file: coverage.rel, message: `${topic} cites unknown ${id}` });
    }
  }
  for (const [topic, ids] of headingIds) {
    const value = topics[topic];
    if (ids.size === 0 && value?.status !== "blocker_gap") {
      failures.push({ check: "coverage", rule: "heading-empty", file: coverage.rel, message: `"${topic}" has a heading and no source paragraph under it — mark it blocker_gap` });
    }
    if (value?.status === "covered") {
      const outside = (value.sources ?? []).filter((id) => !ids.has(id));
      if (outside.length) failures.push({ check: "coverage", rule: "heading-source", file: coverage.rel, message: `"${topic}" is covered by ${outside.join(", ")}, which is not under its heading` });
    }
  }
  return failures;
}
