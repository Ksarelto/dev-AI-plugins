// Human notes (HD-*): every instruction a human gives — at a gate or with /factory:note — is stored
// before anything acts on it, so compaction can never lose it (Suggestions/07).
import { join } from "node:path";
import { now, readYaml, writeYaml } from "./core.mjs";
import { nextId } from "./ids.mjs";
import { validate } from "./schemas.mjs";

const notesPath = (featureDir) => join(featureDir, "human-notes.yaml");

export function readNotes(featureDir) {
  return readYaml(notesPath(featureDir), []);
}

export function addNote(app, featureDir, { text, at, by = process.env.USER ?? "human" }) {
  const notes = readNotes(featureDir);
  const note = { id: nextId(app.next_ids, "HD"), at, by, ts: now(), text, status: "open", mapped_to: [] };
  notes.push(note);
  const errors = validate("human-notes", notes);
  if (errors.length) throw new Error(`human note rejected: ${errors.join("; ")}`);
  writeYaml(notesPath(featureDir), notes);
  return note;
}

export const openNotes = (featureDir) => readNotes(featureDir).filter((n) => n.status === "open");

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
