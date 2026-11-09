// Human notes (HD-*): every instruction a human gives — at a gate or with /factory:note — is stored
// before anything acts on it, so compaction can never lose it (Suggestions/07).
import { join } from "node:path";
import { now, readYaml, writeYaml } from "./core.mjs";
import { isId, kindOf, nextId } from "./ids.mjs";
import { validate } from "./schemas.mjs";

const notesPath = (featureDir) => join(featureDir, "human-notes.yaml");

export function readNotes(featureDir) {
  return readYaml(notesPath(featureDir), []);
}

// A note is `product` (it changes what is built: planned, mapped, carried) or `process` (it steers the
// run: budget raises, "stop asking", "keep going"). A process note is recorded as done at once: it never
// reaches a pack, never becomes a fix item and no gate waits for it to be mapped.
// The patterns are deliberately narrow: a product note that merely shares words with the factory's controls
// ("raise the token limit of the chat completion", "bump the attempts limit of the login form", "stop asking
// for the password on every login") must stay a product note. When in doubt it is product, and a human who
// means a process note says so with --kind process. A note given at a gate is never classified at all.
const RAISE = "(?:raise|increase|bump|extend|lift|double|up)";
const PROCESS_NOTE = [
  // The factory's own budget, named as the factory's: "raise the factory budget", "increase the dispatch budget",
  // "bump the run's wall clock", "raise the budget to 120 dispatches".
  new RegExp(`\\b${RAISE}\\b[^.\\n]{0,40}\\b(?:factory|pipeline|run|dispatch(?:es)?|wall[- ]?clock)(?:'s)?\\s+(?:budgets?|limits?|caps?|time)\\b`, "i"),
  new RegExp(`\\b${RAISE}\\b[^.\\n]{0,30}\\bwall[- ]?clock\\b`, "i"),
  new RegExp(`^(?:please\\s+)?${RAISE}\\s+(?:the\\s+|all\\s+|our\\s+)?budgets?$`, "i"),
  new RegExp(`\\b${RAISE}\\b[^.\\n]{0,30}\\bbudgets?\\b[^.\\n]{0,30}\\b(?:of|for)\\s+the\\s+(?:factory|pipeline|run)\\b`, "i"),
  new RegExp(`\\b${RAISE}\\b[^.\\n]{0,30}\\bbudgets?\\b[^.\\n]{0,20}\\b\\d+\\s+dispatch(?:es)?\\b`, "i"),
  /^(?:please\s+)?(?:give|allow|grant)\s+(?:it|the factory|the run|us)\s+more\s+(?:dispatch(?:es)?|time|wall[- ]?clock)\s*$/i,
  /^(?:please\s+)?more\s+(?:dispatch(?:es)?|wall[- ]?clock)(?:\s+(?:please|now))?$/i,
  // "stop asking" with the agent as the object: no product noun after it ("stop asking for the password" is a product note).
  /^(?:please\s+)?(?:stop|quit|don'?t|do not|never)\s+(?:ask(?:ing)?|prompt(?:ing)?|interrupt(?:ing)?)(?:\s+(?:me|us|the human|the user))?(?:\s+(?:any|more|so many|further))?(?:\s+(?:questions?|clarifications?))?(?:\s+(?:now|anymore|any more|again|please))?$/i,
  /^(?:please\s+)?no more (?:questions|asking|prompts|interruptions)$/i,
  /^(?:please\s+)?(?:keep going|carry on|go ahead and continue|continue without (?:asking|stopping)|run autonomously|continue|proceed|go on)(?:\s+(?:please|now))?$/i,
];
const FILLER = /^(ok(ay)?|thanks?|thank you|please|yes|sure|great|good|now|just|and|so)$/i;
// "Keep going, but the panel must close on Escape": one product clause makes the whole note a product note.
const CLAUSE_SPLIT = /[.;!?\n]+|,|\s+(?:but|and|then|also|so|while|because)\s+/i;

/**
 * The kind of a note: an explicit one wins. Without one it is `process` only when EVERY clause of the note is
 * a process instruction (raise a factory budget, stop asking, keep going); one product clause, or anything
 * unrecognised, makes it `product`.
 */
export function classifyNote(text, kind) {
  if (kind === "product" || kind === "process") return kind;
  const clauses = String(text).split(CLAUSE_SPLIT).map((c) => c.trim()).filter((c) => c && !FILLER.test(c));
  return clauses.length && clauses.every((c) => PROCESS_NOTE.some((re) => re.test(c))) ? "process" : "product";
}

export const isProcessNote = (n) => n?.kind === "process";

export function addNote(app, featureDir, { text, at, by = process.env.USER ?? "human", kind }) {
  const notes = readNotes(featureDir);
  const noteKind = classifyNote(text, kind);
  const note = { id: nextId(app.next_ids, "HD"), at, by, ts: now(), text, status: noteKind === "process" ? "done" : "open", mapped_to: [], kind: noteKind };
  notes.push(note);
  const errors = validate("human-notes", notes);
  if (errors.length) throw new Error(`human note rejected: ${errors.join("; ")}`);
  writeYaml(notesPath(featureDir), notes);
  return note;
}

export const openNotes = (featureDir) => readNotes(featureDir).filter((n) => n.status === "open" && !isProcessNote(n));

const sameText = (text) => String(text).toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The notes a context pack carries: never declined or process ones, identical texts once (the first ID
 * names the rest). With `scope` (the IDs of a task: itself, its ACs and REQs, its slice's tasks) only
 * notes mapped to one of them, plus open product notes nobody has mapped yet.
 */
export function notesForPack(notes, scope = null) {
  const seen = new Map();
  const out = [];
  for (const n of notes) {
    if (n.status === "declined" || isProcessNote(n)) continue;
    if (scope && (n.status === "done" || !(n.status === "open" || (n.mapped_to ?? []).some((id) => scope.has(id))))) continue;
    const key = sameText(n.text);
    if (seen.has(key)) {
      seen.get(key).also.push(n.id);
      continue;
    }
    const entry = { ...n, also: [] };
    seen.set(key, entry);
    out.push(entry);
  }
  return out;
}

/**
 * Applies `notes_mapped` from an envelope: a note becomes `mapped` only when every target ID exists
 * in the feature's artifacts. Returns { applied, ignored } for the event log.
 */
export function applyMappings(featureDir, maps = [], existingIds = new Set()) {
  if (!maps.length) return { applied: [], ignored: [] };
  const notes = readNotes(featureDir);
  const applied = [];
  const ignored = [];
  for (const map of maps) {
    const note = notes.find((n) => n.id === map.id);
    const unknown = map.to.filter((id) => !existingIds.has(id));
    if (!note || unknown.length || ["done", "declined"].includes(note.status)) {
      ignored.push({ ...map, why: !note ? "no such note" : unknown.length ? `unknown targets ${unknown.join(", ")}` : `note is ${note.status}` });
      continue;
    }
    note.status = "mapped";
    note.mapped_to = [...new Set([...note.mapped_to, ...map.to])];
    applied.push(map.id);
  }
  if (applied.length) writeYaml(notesPath(featureDir), notes);
  return { applied, ignored };
}

/** Human-only transitions: decline a note (with a reason) or mark it done. */
export function setNoteStatus(featureDir, id, status, reason) {
  const notes = readNotes(featureDir);
  const note = notes.find((n) => n.id === id);
  if (!note) throw new Error(`no note ${id}`);
  note.status = status;
  if (reason) note.reason = reason;
  writeYaml(notesPath(featureDir), notes);
  return note;
}

/**
 * Rewrites task (or other ID) references in the notes' mappings: `TASK-005=TASK-019` for notes left
 * pointing at a task that was split or replaced. Engine-side (the notes file is engine-owned).
 * Returns { changed: [note ids], pairs }.
 */
export function remapNotes(featureDir, pairs) {
  const map = new Map();
  for (const pair of pairs) {
    const [from, to, ...extra] = String(pair).split("=");
    if (!from || !to || extra.length || !kindOf(from) || kindOf(from) !== kindOf(to) || !isId(from, kindOf(from)) || !isId(to, kindOf(to))) {
      throw new Error(`bad remap "${pair}": use OLD=NEW with two IDs of one kind, e.g. TASK-005=TASK-019`);
    }
    map.set(from, to);
  }
  const notes = readNotes(featureDir);
  const changed = [];
  for (const note of notes) {
    const next = [...new Set((note.mapped_to ?? []).map((id) => map.get(id) ?? id))];
    if (next.join() !== (note.mapped_to ?? []).join()) {
      note.mapped_to = next;
      changed.push(note.id);
    }
  }
  if (changed.length) {
    const errors = validate("human-notes", notes);
    if (errors.length) throw new Error(`remap rejected: ${errors.join("; ")}`);
    writeYaml(notesPath(featureDir), notes);
  }
  return { changed, pairs: [...map].map(([a, b]) => `${a}=${b}`) };
}
