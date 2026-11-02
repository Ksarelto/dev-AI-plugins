// gate-proto (S2.5): the living app prototype in .factory/prototype/ holds this feature's screens.
// - screens.yaml, prototype-report.yaml and every built screen's note are schema-valid;
// - screens.yaml says truthfully which pages this feature added, changed and removed (compared with
//   the snapshot taken when the stage started);
// - every story with a UX surface has a screen, every screen belongs to a story, and every story's
//   UX states are states of its screen;
// - the static QA passes: shared files, links, binding tokens, states, dev-panel, landmarks, no
//   inline style or script (warnings for the rest).
// With ctx.screen (a screen writer's exit check) only that screen's page checks run.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pageChanges, prototypeQa, readScreens } from "../lib/prototype.mjs";
import { validate } from "../lib/schemas.mjs";

export const inputs = ["prototype-report", "prototype-screen-notes", "app-prototype", "stories"];

const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export function run(ctx) {
  const failures = [];
  const fail = (check, rule, file, message, warn = false) => failures.push({ check, rule, file, message, ...(warn ? { warn: true } : {}) });
  const screensRel = ".factory/prototype/screens.yaml";
  const screens = readScreens(ctx.projectDir);
  if (!screens) return [{ check: "prototype", rule: "no-screens", file: screensRel, message: "screens.yaml is missing — the prototype-designer writes it first" }];
  for (const e of validate("prototype-screens", screens)) fail("schema", "prototype-screens", screensRel, e);
  const report = ctx.load("prototype-report");
  if (!ctx.screen) {
    if (!report) fail("prototype", "no-report", "02b-prototype/prototype-report.yaml", "02b-prototype/prototype-report.yaml is missing");
    else for (const e of validate("prototype-report", report.data)) fail("schema", "prototype-report", report.rel, e);
  }
  if (failures.length) return failures;

  const byId = new Map(screens.screens.map((s) => [s.id, s]));
  const built = screens.screens.filter((s) => ["added", "changed"].includes(s.status) && (!ctx.screen || s.id === ctx.screen));
  for (const s of built) {
    const note = ctx.all("prototype-screen-notes").find((n) => n.data?.screen === s.id);
    if (!note) fail("prototype", "no-screen-note", `02b-prototype/screens/${s.id}.yaml`, `${s.id}: the prototyper's note 02b-prototype/screens/${s.id}.yaml is missing`);
    else for (const e of validate("prototype-screen-note", note.data)) fail("schema", "prototype-screen-note", note.rel, e);
    // A class the shared CSS lacks is the designer's to add (a shared failure: the designer re-runs).
    if (note?.data?.needs_classes?.length && !ctx.screen) {
      fail("prototype", "needs-classes", note.rel, `${s.id} needs classes the shared CSS does not define: ${note.data.needs_classes.join(", ")} — the designer adds them to css/components.css, then the screen is rebuilt (its new note drops needs_classes)`);
    }
  }

  if (!ctx.screen) {
    const all = ctx.load("stories")?.data.stories ?? [];
    const known = new Set(all.map((s) => s.id));
    const changes = pageChanges(ctx.projectDir, ctx.feature.dir);
    for (const id of changes.added) if (byId.get(id)?.status !== "added") fail("prototype", "status-untrue", screensRel, `pages/${id}.html is new in this feature, but screens.yaml says ${byId.get(id)?.status ?? "nothing"} for ${id}`);
    for (const id of changes.changed) if (byId.get(id)?.status !== "changed") fail("prototype", "status-untrue", screensRel, `pages/${id}.html changed in this feature, but screens.yaml says ${byId.get(id)?.status ?? "nothing"} for ${id}`);
    for (const id of changes.removed) if (byId.has(id) && byId.get(id).status !== "removed") fail("prototype", "status-untrue", screensRel, `pages/${id}.html was removed, but screens.yaml says ${byId.get(id).status} for ${id}`);
    for (const s of screens.screens.filter((x) => x.status === "changed" && !changes.changed.includes(x.id) && !changes.added.includes(x.id))) {
      fail("prototype", "unchanged-marked-changed", screensRel, `${s.id} is marked changed, but its page is identical to the one before this feature`, true);
    }
    // Stories ↔ screens: every UX story has a screen of this feature; a built screen belongs to a story.
    const shown = new Set(built.flatMap((s) => s.stories ?? []));
    for (const s of built) {
      if (!(s.stories ?? []).some((id) => known.has(id))) fail("trace", "screen-without-story", screensRel, `${s.id} is built in this feature but belongs to none of its stories`);
    }
    for (const story of all.filter((x) => x.ux?.surfaces?.length)) {
      if (!shown.has(story.id)) fail("trace", "story-without-screen", screensRel, `${story.id} has UX surfaces (${story.ux.surfaces.join(", ")}) but no added or changed screen lists it`);
      for (const surface of story.ux.surfaces) {
        const screen = screens.screens.find((x) => x.id === kebab(surface) || kebab(x.surface ?? "") === kebab(surface));
        if (!screen) { fail("trace", "surface-without-screen", screensRel, `${story.id}: surface "${surface}" has no screen (id ${kebab(surface)} or surface: ${surface})`); continue; }
        for (const state of (story.ux.states ?? []).map(kebab)) if (!(screen.states ?? []).includes(state)) fail("trace", "state-not-on-screen", screensRel, `${story.id}: state "${state}" of ${surface} is not a state of screen ${screen.id}`);
      }
    }
    for (const r of report.data.screens) {
      const id = r.file.replace(/^pages\/|\.html$/g, "");
      if (!byId.has(id)) fail("prototype", "report-unknown-screen", report.rel, `${r.name}: ${r.file} is not a screen in screens.yaml`);
      else if (!existsSync(join(ctx.projectDir, ".factory", "prototype", r.file)) && byId.get(id).status !== "removed") fail("prototype", "missing-page", report.rel, `${r.name}: ${r.file} does not exist`);
    }
  }
  failures.push(...prototypeQa(ctx.projectDir, { screens, report: report?.data, only: ctx.screen }));
  return failures;
}

/** Spec deltas of the increment: the designer's report plus every screen note (for GATE-P). */
export function prototypeDeltas(ctx) {
  return [...(ctx.load("prototype-report")?.data.spec_delta ?? []), ...ctx.all("prototype-screen-notes").flatMap((n) => n.data?.spec_delta ?? [])];
}
