// Automatic sizing: which tier (patch | small | standard) a feature gets. Intake estimates it from the sources'
// words, requirement-like lines and screens; the requirements stage re-checks it from the real REQ/AC counts.
// An explicit --tier always wins and is never re-evaluated. The limits live in defaults.yaml pipeline.size_limits.
const PATCH_WORDS = /\b(fix|typo|bump|rename|tweak|adjust|label|wording|colou?r|copy|text|spacing|padding|margin)\b/i;
const SCREEN_WORDS = /\b(screen|page|view|dialog|modal|panel|drawer|sidebar|tab|wizard|dashboard|form|table)s?\b/gi;
// A change that ADDS or CREATES a surface (a panel, a page, a dialog…) or names a mockup is never a patch, whatever
// words it uses ("a side panel with a status label"): wording words only make a patch of a change to existing text.
const ADDS_UI = /\b(add(?:s|ing)?|new|creat(?:e|es|ing)|implement(?:s|ing)?|introduc(?:e|es|ing)|build(?:s|ing)?)\b[^.\n]{0,60}\b(screens?|pages?|views?|dialogs?|modals?|panels?|drawers?|sidebars?|tabs?|wizards?|dashboards?|forms?|tables?|sections?|widgets?|menus?|lists?|buttons?)\b/i;
const NAMES_MOCKUP = /\b(mock-?ups?|prototypes?|clickable|wireframes?|figma)\b/i;
const LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s+\S/;
const RULE_WORD = /\b(must|shall|should|needs? to|has to|required?)\b/i;

// The fallback when a config sets none: the same numbers as pipeline.size_limits in defaults.yaml (a test keeps them equal).
export const SIZE_LIMITS = { small: { words: 700, reqs: 6, acs: 18, screens: 3 }, patch: { words: 90, reqs: 2, acs: 6 } };

/** The numbers a tier is decided from. */
export function measure(text) {
  const lines = String(text ?? "").split("\n");
  const words = String(text ?? "").split(/\s+/).filter(Boolean).length;
  const reqLines = lines.filter((l) => LIST_LINE.test(l) || (RULE_WORD.test(l) && l.trim().length > 20)).length;
  const screens = new Set((String(text ?? "").match(SCREEN_WORDS) ?? []).map((w) => w.toLowerCase().replace(/s$/, ""))).size;
  return { words, reqs: reqLines, screens };
}

/**
 * @param text       every text source of the feature, joined
 * @param opts       { references (mockups the brief points at), sources (inbox files), limits, mode }
 * @returns { tier, reason, metrics }
 */
export function estimateSize(text, { references = 0, sources = 1, limits = SIZE_LIMITS, mode } = {}) {
  const m = measure(text);
  const small = { ...SIZE_LIMITS.small, ...(limits.small ?? {}) };
  const patch = { ...SIZE_LIMITS.patch, ...(limits.patch ?? {}) };
  const metrics = { ...m, references, sources };
  if (mode === "greenfield") return { tier: "standard", reason: "greenfield features always run the full profile", metrics };
  if (!m.words) return { tier: "standard", reason: "no text to size from", metrics };
  if (m.words <= patch.words && sources <= 1 && !references && m.reqs <= 2 && m.screens <= 1 && PATCH_WORDS.test(text) && !ADDS_UI.test(text) && !NAMES_MOCKUP.test(text)) {
    return { tier: "patch", reason: `${m.words} words in one source, a small wording/fix change`, metrics };
  }
  if (m.words <= small.words && m.reqs <= small.reqs && m.screens <= small.screens) {
    return { tier: "small", reason: `${m.words} words, ${m.reqs} requirement-like line(s), ${m.screens} screen word(s)`, metrics };
  }
  return { tier: "standard", reason: `${m.words} words, ${m.reqs} requirement-like line(s), ${m.screens} screen word(s) exceed the small limits`, metrics };
}

/** After requirements: the counts of the real spec decide between patch (when it was one), small and standard. */
export function sizeFromSpec({ reqs = 0, acs = 0 }, limits = SIZE_LIMITS, { from } = {}) {
  const patch = { ...SIZE_LIMITS.patch, ...(limits.patch ?? {}) };
  if (from === "patch" && reqs <= patch.reqs && acs <= patch.acs) {
    return { tier: "patch", reason: `${reqs} requirement(s) and ${acs} acceptance criteria stay within the patch limits (${patch.reqs}/${patch.acs})`, metrics: { reqs, acs } };
  }
  const small = { ...SIZE_LIMITS.small, ...(limits.small ?? {}) };
  const fits = reqs <= small.reqs && acs <= small.acs;
  return { tier: fits ? "small" : "standard", reason: `${reqs} requirement(s) and ${acs} acceptance criteria ${fits ? "fit" : "exceed"} the small limits (${small.reqs}/${small.acs})`, metrics: { reqs, acs } };
}
