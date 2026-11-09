// gate-spec (S1): the PRD or delta-spec is schema-valid, IDs are unique and traceable to a source,
// every source paragraph of the feature is used or set aside with a reason, acceptance criteria and
// non-functional requirements are measurable, a PRD states performance, accessibility and security
// NFRs, no template placeholder is left, every open question has a default (blocker and major ones
// are answered), a delta-spec accounts for removals and only touches files that exist, and — in the
// requirements stage — completeness.yaml scores at least quality.completeness_min.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFrontMatter, readText, readYaml } from "../lib/core.mjs";
import { droppedNumbers, scoreCompleteness } from "../lib/completeness.mjs";
import { plainText } from "../lib/ids.mjs";
import { validate } from "../lib/schemas.mjs";

export const inputs = ["prd", "delta-spec", "completeness", "source-index", "normalised-sources", "human-notes"];
const REQUIRED_NFR = ["performance", "accessibility", "security"];
// A measure: a quoted value, a comparison with a number, a currency amount, a percentage, or a number
// with a unit. Currency codes are upper case on purpose ("17 and" is not "17 EUR").
const MEASURE = [
  /"[^"]+"|(?<![A-Za-z])'[^']+'(?![A-Za-z])|[<>]=?\s*\d|[€$£¥]\s?\d|\d[\d.,]*\s?[€$£¥%]|\d[\d.,]*\s?[A-Z]{3}(?![A-Za-z])/,
  /\b(at (most|least)|within|no more than|less than|more than|under|over|up to|exactly)\s+[\d$€£¥]|\d[\d.,]*\s?(ms|s|sec|seconds?|min|minutes?|h|hours?|days?|px|em|rem|kb|mb|gb|items?|rows?|results?|requests?|users?|times|chars?|characters?|digits?|decimals?|lines?|steps?)(?![a-z])/i,
  // A named, versioned standard is a measure too: WCAG 2.2 AA, OWASP ASVS L2, ISO 27001, RFC 9457.
  /\b(WCAG\s*\d(\.\d)?\s*A{1,3}|OWASP\s+ASVS\s+L?\d|ISO\s*\d{3,5}|RFC\s*\d{3,5}|PCI[-\s]DSS)\b/i,
];
const measured = (text) => MEASURE.some((re) => re.test(plainText(text)));

/** Sources cited by the other features' specs (prd.md front matter or delta-spec.yaml). */
function siblingCitations(ctx) {
  const out = [];
  for (const [fid, f] of Object.entries(ctx.app?.features ?? {})) {
    if (fid === ctx.state.feature) continue;
    const dir = join(ctx.paths.root, f.dir, "01-requirements");
    const data = existsSync(join(dir, "prd.md")) ? readFrontMatter(join(dir, "prd.md")).data : existsSync(join(dir, "delta-spec.yaml")) ? readYaml(join(dir, "delta-spec.yaml")) : null;
    const reqs = data?.requirements ?? [...(data?.added ?? []), ...(data?.modified ?? [])];
    out.push(...reqs.flatMap((r) => r.sources ?? []));
  }
  return out;
}

export function run(ctx) {
  const spec = ctx.spec();
  if (!spec) return [{ check: "spec", message: "neither 01-requirements/prd.md nor delta-spec.yaml exists" }];
  const failures = [];
  const fail = (check, rule, message) => failures.push({ check, rule, file: spec.rel, message });

  for (const e of validate(spec.kind, spec.data)) fail("schema", spec.kind, e);
  if (failures.length) return failures;
  if (spec.data.feature !== ctx.state.feature) fail("spec", "feature-id", `feature is ${spec.data.feature}, expected ${ctx.state.feature}`);

  const sources = ctx.load("source-index")?.data.sources ?? [];
  const known = new Set(sources.flatMap((s) => s.ids ?? []));
  for (const note of ctx.load("human-notes")?.data ?? []) known.add(note.id);

  const seen = new Set();
  const unique = (id) => {
    if (seen.has(id)) fail("ids", "duplicate", `${id} is defined twice`);
    seen.add(id);
  };
  // Vague words are matched as phrases ("user friendly", "as expected"); an AC that uses one passes
  // only with a real measure: a quoted value, a number with a unit, or a comparison with a number.
  const norm = (t) => ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const vague = (ctx.config.quality?.vague_terms ?? []).map((t) => norm(t));
  for (const req of spec.reqs) {
    unique(req.id);
    if (!req.sources?.length) fail("trace", "no-source", `${req.id} cites no SRC or HD`);
    for (const src of req.sources ?? []) if (!known.has(src)) fail("trace", "unknown-source", `${req.id} cites ${src}, which does not exist`);
    for (const ac of req.acs) {
      unique(ac.id);
      // Quoted and backticked text is a label or a value, not a claim: "Quick add" is a button name.
      const claim = plainText(ac.text).replace(/"[^"]*"|`[^`]*`/g, " ");
      const hit = vague.find((term) => norm(claim).includes(term));
      if (hit && !measured(ac.text)) fail("measurable", "vague-ac", `${ac.id} uses "${hit.trim()}" with no measure (a quoted value, a number with a unit, or a comparison)`);
    }
  }
  // Every source paragraph added for this feature is cited by a requirement or set aside with a reason.
  const cited = new Set([
    ...spec.reqs.flatMap((r) => r.sources ?? []),
    ...(spec.data.removed ?? []).flatMap((r) => r.sources ?? []),
    ...(spec.data.sources_not_used ?? []).map((s) => s.id),
    ...siblingCitations(ctx), // after a backlog split, another feature's spec may own a paragraph
  ]);
  for (const id of sources.filter((s) => s.feature === ctx.state.feature && !s.superseded).flatMap((s) => s.ids ?? [])) {
    if (!cited.has(id)) fail("trace", "source-dropped", `${id} is neither cited by a requirement nor listed in sources_not_used with a reason`);
  }
  for (const n of spec.data.non_functional ?? []) {
    unique(n.id);
    for (const src of n.sources ?? []) if (!known.has(src)) fail("trace", "unknown-source", `${n.id} cites ${src}, which does not exist`);
    const hit = vague.find((term) => norm(plainText(n.text).replace(/"[^"]*"|`[^`]*`/g, " ")).includes(term));
    if (hit && !measured(n.text)) fail("measurable", "vague-nfr", `${n.id} uses "${hit.trim()}" with no measure (a number with a unit, a standard such as WCAG 2.2 AA, or a comparison)`);
  }
  if (spec.kind === "prd") {
    const have = new Set((spec.data.non_functional ?? []).map((n) => n.category));
    for (const cat of REQUIRED_NFR.filter((c) => !have.has(c))) fail("nfr", "nfr-missing", `the PRD states no ${cat} requirement (non_functional with category: ${cat})`);
  }
  // Template slots left in the contract (the YAML data, not the prose, which may quote i18n syntax).
  const slot = /\{\{\s*[A-Za-z_][\w.-]*\s*\}\}|⟨[^⟩]*⟩/.exec(JSON.stringify(spec.data));
  if (slot) fail("spec", "placeholder", `a template placeholder is left in ${spec.rel}: ${slot[0]}`);
  for (const q of spec.data.open_questions ?? []) {
    unique(q.id);
    const status = q.status ?? "open";
    if (status !== "answered" && !q.default) fail("questions", "no-default", `${q.id} has no default — say what happens if nobody answers`);
    if (["blocker", "major"].includes(q.severity) && status === "open") fail("questions", `${q.severity}-open`, `${q.id} is a ${q.severity} question without an answer or an accepted default`);
  }

  // A PRD backlog must place every requirement exactly once and name only real dependencies.
  const backlog = spec.data.backlog ?? [];
  if (spec.kind === "prd" && backlog.length) {
    const placed = backlog.flatMap((b) => b.requirements);
    const titles = new Set(backlog.map((b) => b.title));
    for (const r of spec.reqs) {
      const n = placed.filter((id) => id === r.id).length;
      if (n !== 1) fail("backlog", n ? "duplicate-placement" : "unplaced", `${r.id} is in ${n} backlog entries (expected 1)`);
    }
    const known = new Set(spec.reqs.map((r) => r.id));
    for (const b of backlog) {
      if (!b.requirements.length) fail("backlog", "empty-entry", `backlog entry "${b.title}" has no requirements`);
      for (const id of b.requirements) if (!known.has(id)) fail("backlog", "unknown-req", `backlog entry "${b.title}" names ${id}, which is not a requirement`);
      for (const t of b.depends_on ?? []) if (!titles.has(t)) fail("backlog", "unknown-dependency", `backlog entry "${b.title}" depends on "${t}", which is not an entry`);
      if ((b.depends_on ?? []).includes(b.title)) fail("backlog", "self-dependency", `backlog entry "${b.title}" depends on itself`);
    }
  }

  if (spec.kind === "delta-spec") {
    for (const m of spec.data.modified ?? []) {
      for (const path of m.affected ?? []) {
        if (!existsSync(join(ctx.projectDir, path))) fail("delta", "phantom-file", `${m.id} affects ${path}, which does not exist`);
      }
    }
    for (const r of spec.data.removed ?? []) unique(r.id);
  }
  failures.push(...sourceConflicts(ctx));
  failures.push(...completeness(ctx, spec, sources));
  return failures;
}

/**
 * Contradictions between the feature's sources (completeness.yaml `conflicts`, written by the requirements
 * analyst after diffing every normalised source). An open one fails here with rule unresolved-conflict;
 * the Conductor turns that into exactly one CLARIFY listing all of them (conflictRound), proposing the
 * user's own brief as the winner. A resolved one must say how.
 */
export function sourceConflicts(ctx) {
  if (!(ctx.stage?.outputs ?? []).includes("completeness")) return [];
  const file = ctx.load("completeness");
  const list = file && !validate("completeness", file.data).length ? file.data.conflicts ?? [] : [];
  const out = [];
  for (const c of list) {
    if (c.status === "open") out.push({ check: "conflicts", rule: "unresolved-conflict", file: file.rel, message: `sources contradict each other on "${c.topic}": ${c.claims.map((x) => `${x.source} says "${x.claim}"`).join(" vs ")} — proposed winner: ${c.default_winner}` });
    else if (!c.resolution) out.push({ check: "conflicts", rule: "no-resolution", file: file.rel, message: `the conflict "${c.topic}" is resolved but names no resolution` });
  }
  return out;
}

/** Completeness is scored where the stage produces completeness.yaml (requirements; never the patch tier). */
function completeness(ctx, spec, sources) {
  const min = ctx.config.quality?.completeness_min ?? 85;
  if (!min || !(ctx.stage?.outputs ?? []).includes("completeness")) return [];
  const file = ctx.load("completeness");
  const rel = file?.rel ?? "01-requirements/completeness.yaml";
  if (!file) return [{ check: "completeness", rule: "missing", file: rel, message: "01-requirements/completeness.yaml is missing — credit each of the 10 categories with evidence IDs" }];
  const invalid = validate("completeness", file.data);
  if (invalid.length) return invalid.map((e) => ({ check: "schema", rule: "completeness", file: rel, message: e }));
  const ids = new Set([
    ...spec.reqs.flatMap((r) => [r.id, ...r.acs.map((a) => a.id)]),
    ...(spec.data.open_questions ?? []).map((q) => q.id),
    ...(spec.data.non_functional ?? []).map((n) => n.id),
  ]);
  const result = scoreCompleteness(file.data, ids, answeredQuestions(spec));
  const out = result.unknown.map((u) => ({ check: "completeness", rule: "unknown-evidence", file: rel, message: `evidence ${u} is not an ID the spec defines` }));
  if (result.score < min) {
    const gaps = result.gaps.map((g) => `${g.category} (${g.credit})${g.gap ? `: ${g.gap}` : ""}`).join("; ");
    out.push({ check: "completeness", rule: "below-threshold", file: rel, count: 1, message: `completeness ${result.score}/100 is below ${min} — ${gaps}` });
  }
  for (const g of result.gaps.filter((x) => !x.question)) out.push({ check: "completeness", rule: "no-question", file: rel, message: `${g.category} is ${g.credit} but names no question that would close the gap` });
  // Fidelity: a number the feature's sources state should reach a requirement, AC or NFR.
  const texts = [];
  for (const src of sources.filter((x) => x.feature === ctx.state.feature && !x.superseded && x.normalised)) {
    const path = join(ctx.paths.root, src.normalised);
    if (!existsSync(path)) continue;
    for (const m of readText(path).matchAll(/\[(SRC-\d{3,})\]\s*([^\n]+)/g)) texts.push([m[1], m[2]]);
  }
  const notUsed = new Set((spec.data.sources_not_used ?? []).map((x) => x.id));
  for (const d of droppedNumbers(texts.filter(([id]) => !notUsed.has(id)), JSON.stringify(spec.data))) {
    out.push({ check: "completeness", rule: "number-dropped", file: spec.rel, warn: true, message: `${d} is stated in the source but in no requirement, AC or NFR` });
  }
  return out;
}

/** The score and gaps for the human's GATE-A view and the clarification round (no failures). */
export function completenessSummary(ctx) {
  const spec = ctx.spec();
  const file = ctx.load("completeness");
  if (!spec || !file || validate("completeness", file.data).length) return null;
  const ids = new Set([...spec.reqs.flatMap((r) => [r.id, ...r.acs.map((a) => a.id)]), ...(spec.data.open_questions ?? []).map((q) => q.id), ...(spec.data.non_functional ?? []).map((n) => n.id)]);
  return scoreCompleteness(file.data, ids, answeredQuestions(spec));
}

const answeredQuestions = (spec) => new Set((spec.data.open_questions ?? []).filter((q) => q.status === "answered").map((q) => q.id));
