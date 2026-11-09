// Plan lint: mechanical scope fixes the engine makes itself, so a plan never reaches a builder with a
// scope gap that a convention implies. Data-driven: role.yaml `component_files` says which files a
// new unit needs (frontend: a component's styles.ts, index.ts and tests/<name>.test.tsx).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { YAML, matchesAny, readText, writeAtomic } from "./core.mjs";

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GLOB_CHARS = /[*?{}[\]]/;

/** True for a path that is a glob rather than one file. */
export const isGlob = (entry) => GLOB_CHARS.test(entry);

/** The primary template ("{name}/{name}.tsx") as a regex: the first {name} captures, later ones repeat it. */
function primaryRegex(template) {
  let first = true;
  const body = template
    .split(/(\{name\})/)
    .map((part) => (part === "{name}" ? (first ? ((first = false), "(?<name>[^/]+)") : "\\k<name>") : escape(part)))
    .join("");
  return new RegExp(`^(?<prefix>.*/)?${body}$`);
}

/**
 * Files a convention requires for the NEW units in a task's files_expected, minus those already listed
 * (`all: true`: every companion the convention implies, listed or not — what the size limit does not count).
 */
export function conventionFiles(componentFiles, task, projectDir, { all = false } = {}) {
  if (!componentFiles?.primary || !componentFiles.companions?.length) return [];
  if (componentFiles.task_types && !componentFiles.task_types.includes(task.type)) return [];
  const re = primaryRegex(componentFiles.primary);
  const have = new Set(task.files_expected);
  const out = [];
  for (const file of task.files_expected) {
    if (TEST_FILE.test(file)) continue;
    const m = re.exec(file);
    if (!m || existsSync(join(projectDir, file))) continue; // only a unit this task creates
    for (const companion of componentFiles.companions) {
      const path = `${m.groups.prefix ?? ""}${companion.replaceAll("{name}", m.groups.name)}`;
      if (all ? !out.includes(path) : !have.has(path)) {
        have.add(path);
        out.push(path);
      }
    }
  }
  return out;
}

/**
 * Adds the convention files to every pending task (tasks.yaml is rewritten in place, comments kept;
 * `data` is updated too). Returns [{ task, files }] for the gate output.
 */
export function lintPlan(ctx, tasksFile, data) {
  const added = [];
  const doc = YAML.parseDocument(readText(tasksFile));
  data.tasks.forEach((task, i) => {
    const started = ctx.state?.tasks?.[task.id] && ctx.state.tasks[task.id].status !== "pending";
    const role = ctx.packs?.[ctx.config.roles?.[task.role]?.pack]?.role;
    const files = started ? [] : conventionFiles(role?.component_files, task, ctx.projectDir);
    if (!files.length) return;
    const seq = doc.getIn(["tasks", i, "files_expected"], true);
    for (const f of files) seq?.add?.(f);
    task.files_expected.push(...files);
    added.push({ task: task.id, files });
  });
  if (added.length) writeAtomic(tasksFile, doc.toString());
  return added;
}

/** Whether a glob or file written by a task stays inside its role's owns_paths. */
export const insideOwnsPaths = (entry, ownsPaths) => matchesAny(entry, ownsPaths);
