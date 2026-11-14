// Side files (tests, stories, styles) and owned core files are repaired in place. The planner runs
// only when a failing file belongs to no task.
import { matchesAny } from "./core.mjs";

const SIDE_FILE = /(?:^|\/)(?:[^/]+\.(?:test|spec)\.[cm]?[jt]sx?|[^/]+\.stories\.tsx|styles\.ts|[^/]+\.css|[^/]+\.scss)$|(?:^|\/)02-stories\//;

export const isSideFile = (file) => {
  const p = String(file ?? "").replaceAll("\\", "/");
  if (/\.acceptance\.test\.[cm]?[jt]sx?$/.test(p)) return false;
  return SIDE_FILE.test(p);
};

export function taskOwnsFile(task, file) {
  const f = String(file ?? "").replaceAll("\\", "/");
  if (!f || !task) return false;
  if ((task.files_expected ?? []).includes(f)) return true;
  return matchesAny(f, task.write_scope ?? []);
}

/** @returns {{ kind: "side"|"core"|"unowned", files: string[], core: string[], side: string[] }} */
export function classifyFailures(items) {
  const files = [...new Set((items ?? []).map((i) => i.file).filter(Boolean).map((f) => String(f).replaceAll("\\", "/")))];
  const side = files.filter(isSideFile);
  const core = files.filter((f) => !isSideFile(f));
  if (!files.length) return { kind: "unowned", files, core, side };
  if (!core.length) return { kind: "side", files, core, side };
  return { kind: "core", files, core, side };
}

/** The task whose files_expected or write_scope contains the file, if any. */
export function owningTask(tasks, file) {
  return (tasks ?? []).find((t) => taskOwnsFile(t, file)) ?? null;
}
