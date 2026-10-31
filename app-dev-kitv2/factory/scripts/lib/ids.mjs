// The one definition of every factory ID kind. Schemas repeat these patterns; the consistency check
// (scripts/check-factory-consistency.mjs) fails when a schema pattern drifts from this table.
export const ID_KINDS = {
  FEAT: { pattern: "FEAT-\\d{3}", width: 3, meaning: "feature" },
  SRC: { pattern: "SRC-\\d{3,}", width: 3, meaning: "normalised source paragraph" },
  REQ: { pattern: "REQ-\\d{4}", width: 4, meaning: "requirement" },
  AC: { pattern: "AC-\\d{4}", width: 4, meaning: "acceptance criterion" },
  STORY: { pattern: "STORY-\\d{4}", width: 4, meaning: "user story" },
  TASK: { pattern: "TASK-\\d{3}", width: 3, meaning: "task" },
  TEST: { pattern: "TEST-\\d{4}", width: 4, meaning: "planned test case" },
  OQ: { pattern: "OQ-\\d+", width: 1, meaning: "open question" },
  ADR: { pattern: "ADR-\\d{3}", width: 3, meaning: "architecture decision" },
  HD: { pattern: "HD-\\d+", width: 1, meaning: "human note" },
  DEF: { pattern: "DEF-\\d{3}", width: 3, meaning: "QA defect" },
  RV: { pattern: "RV-\\d+", width: 1, meaning: "review finding" },
};

/** Kinds that must survive every hand-off while open (see Suggestions/07, ID coverage). */
export const TRACKED_KINDS = ["SRC", "REQ", "AC", "OQ", "ADR", "HD"];

export const idRegex = (kind) => new RegExp(`^${ID_KINDS[kind].pattern}$`);

const ANY_ID = new RegExp(`\\b(?:${Object.values(ID_KINDS).map((k) => k.pattern).join("|")})\\b`, "g");

export function kindOf(id) {
  return Object.keys(ID_KINDS).find((kind) => idRegex(kind).test(id)) ?? null;
}

export function isId(id, kind) {
  return typeof id === "string" && idRegex(kind).test(id);
}

/** Every ID mentioned anywhere in a text, de-duplicated, in order of first appearance. */
export function extractIds(text, kinds) {
  const found = [...new Set(String(text).match(ANY_ID) ?? [])];
  return kinds ? found.filter((id) => kinds.includes(kindOf(id))) : found;
}

export function formatId(kind, n) {
  return `${kind}-${String(n).padStart(ID_KINDS[kind].width, "0")}`;
}

/** Returns the next ID of a kind and bumps the counter in `counters` (state.next_ids). */
export function nextId(counters, kind) {
  const n = counters[kind] ?? 1;
  counters[kind] = n + 1;
  return formatId(kind, n);
}

/** Moves a counter past an ID that an agent wrote, so engine-issued IDs never collide with it. */
export function observeId(counters, id) {
  const kind = kindOf(id);
  if (!kind) return;
  const n = Number.parseInt(id.split("-")[1], 10);
  if ((counters[kind] ?? 1) <= n) counters[kind] = n + 1;
}
