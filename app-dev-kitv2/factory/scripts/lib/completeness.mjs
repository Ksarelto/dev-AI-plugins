// Spec completeness (ported from spec-dev-kit score-completeness.mjs): the requirements analyst judges
// one credit per category in completeness.yaml; this module does the arithmetic and the fidelity
// checks, so the score is the same every time for the same files.
import { plainText } from "./ids.mjs";

/** Category → weight (sums to 100). The order is the order questions are asked in. */
export const CATEGORIES = {
  error_states: 15,
  permissions_roles: 15,
  edge_cases: 12,
  non_functional: 12,
  backward_compatibility: 8,
  undo_rollback: 8,
  notifications: 8,
  data_lifecycle: 8,
  observability: 7,
  localization_accessibility: 7,
};

/**
 * Scores credits against the IDs the spec defines. Full credit backed only by OQ evidence that is not
 * answered (questions proceeding on a default are assumptions) counts as partial; an answered OQ is a
 * decision and counts. n/a without a reason counts as none.
 * Returns { score, categories: {key: {credit, awarded, weight}}, gaps: [{category, credit, gap, question, recommended}], unknown: [ids] }.
 */
export function scoreCompleteness(credits, specIds, answered = new Set()) {
  const out = { categories: {}, gaps: [], unknown: [] };
  let awarded = 0;
  let applicable = 0;
  for (const [key, weight] of Object.entries(CATEGORIES)) {
    const c = credits?.categories?.[key] ?? {};
    const evidence = c.evidence ?? [];
    out.unknown.push(...evidence.filter((id) => !specIds.has(id)).map((id) => `${key}: ${id}`));
    let credit = ["full", "partial", "none", "n/a"].includes(c.credit) ? c.credit : "none";
    if (credit === "full" && (!evidence.length || evidence.every((id) => id.startsWith("OQ-") && !answered.has(id)))) credit = "partial";
    if (credit === "n/a" && !c.reason) credit = "none";
    const points = credit === "full" ? weight : credit === "partial" ? Math.floor(weight / 2) : 0;
    out.categories[key] = { credit, awarded: points, weight };
    if (credit === "n/a") continue;
    awarded += points;
    applicable += weight;
    if (credit !== "full") out.gaps.push({ category: key, credit, gap: c.gap ?? "", question: c.question ?? "", recommended: c.recommended ?? "" });
  }
  out.score = applicable ? Math.round((100 * awarded) / applicable) : 0;
  return out;
}

const NUMBER = /(?<![\w.])(\d+(?:[.,]\d+)?)\s*(%|ms|s|sec|seconds?|min|minutes?|h|hours?|days?|weeks?|months?|years?|items?|times|mb|kb|gb|characters?|chars?|attempts?|users?|rows?|eur|usd|€|\$)(?![a-z])/gi;

/** Numbers with a unit that a cited source states but no requirement, AC or NFR repeats. */
export function droppedNumbers(sourceTexts, specText) {
  const spec = plainText(specText).toLowerCase();
  const missing = [];
  for (const [id, text] of sourceTexts) {
    for (const m of plainText(text).matchAll(NUMBER)) {
      const n = m[1].replace(",", ".");
      if (!new RegExp(`(^|[^0-9.])${n.replace(".", "[.,]")}([^0-9]|$)`).test(spec)) missing.push(`${id}: "${m[0].trim()}"`);
    }
  }
  return [...new Set(missing)];
}
