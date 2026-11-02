// S0 Intake, deterministic half: new files in .factory/inbox/ get a normalised copy in which every
// requirement-bearing paragraph carries a source ID (SRC-###). Text is split mechanically here;
// images, PDFs and other files get a placeholder that the intake-normaliser agent fills in.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { UsageError, factoryPaths, listFiles, now, readYaml, sha, writeAtomic, writeYaml } from "./core.mjs";
import { loadConfig, profileFor, profileStages } from "./config.mjs";
import { nextId } from "./ids.mjs";
import { validate } from "./schemas.mjs";
import { appendEvent, createFeature, loadAppState, saveAppState, withLock } from "./state.mjs";

const TEXT = new Set([".md", ".markdown", ".txt", ".eml", ".csv", ".yaml", ".yml", ".json", ".feature"]);
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|java|kt|go|rb|cs|php)$/;
const CHANGE_WORDS = /\b(change|changes|modify|instead of|currently|no longer|replace|update the existing|existing (screen|page|feature|flow)|fix|bug)\b/i;

export function kindOf(file) {
  const ext = extname(file).toLowerCase();
  if (TEXT.has(ext)) return "text";
  if (IMAGE.has(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  return "other";
}

/** Splits text into paragraphs; list items become their own paragraph so each gets its own ID. */
export function paragraphs(text) {
  const out = [];
  const body = text.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "");
  // Code fences stay whole even when they contain blank lines.
  const blocks = [];
  let fence = null;
  for (const block of body.split(/\n\s*\n/)) {
    if (fence !== null) {
      fence += `\n\n${block}`;
      if ((block.match(/```/g) ?? []).length % 2 === 1) {
        blocks.push(fence);
        fence = null;
      }
    } else if ((block.match(/```/g) ?? []).length % 2 === 1) fence = block;
    else blocks.push(block);
  }
  if (fence !== null) blocks.push(fence);
  for (let block of blocks.map((b) => b.trim()).filter(Boolean)) {
    if (block.startsWith("```")) {
      out.push(block);
      continue;
    }
    // A heading with text directly under it: the heading stays a heading, the text gets its own ID.
    const heading = /^(#{1,6}\s.*)\n([\s\S]+)$/.exec(block);
    if (heading) {
      out.push(heading[1]);
      block = heading[2].trim();
    }
    if (/^#{1,6}\s/.test(block)) {
      out.push(block);
      continue;
    }
    const lines = block.split("\n");
    const isList = lines.every((l) => /^\s*([-*+]|\d+[.)])\s+/.test(l) || /^\s{2,}\S/.test(l));
    if (isList) {
      let item = null;
      for (const line of lines) {
        if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
          if (item) out.push(item);
          item = line.trim();
        } else item = `${item ?? ""} ${line.trim()}`;
      }
      if (item) out.push(item);
    } else out.push(block);
  }
  return out;
}

/** Writes the tagged copy of one text source; returns the IDs it assigned. */
export function normaliseText(text, counters, title) {
  const ids = [];
  const lines = [`# ${title}`, ""];
  for (const p of paragraphs(text)) {
    if (/^#{1,6}\s/.test(p)) {
      lines.push(p, "");
      continue;
    }
    const id = nextId(counters, "SRC");
    ids.push(id);
    lines.push(`[${id}] ${p}`, "");
  }
  return { ids, text: lines.join("\n") };
}

export function detectMode(projectDir, requestText) {
  const paths = factoryPaths(projectDir);
  const code = listFiles(projectDir).filter((f) => !f.startsWith(".factory/") && CODE.test(f));
  if (!existsSync(join(paths.root, "app-profile.yaml")) && code.length === 0) {
    return { mode: "greenfield", reason: "no source files and no app profile yet" };
  }
  if (CHANGE_WORDS.test(requestText)) return { mode: "change-request", reason: "the request talks about changing existing behaviour" };
  return { mode: "brownfield-extend", reason: `existing app (${code.length} source files); the request adds capabilities` };
}

const safeName = (file) => file.replace(/[^A-Za-z0-9._-]+/g, "_");

/** The active feature, if it can still take new sources into its spec. */
function stillSpecifying(paths, app) {
  const fid = app.active_feature;
  const f = fid && app.features[fid];
  if (!f || ["done", "aborted"].includes(f.status)) return null;
  const file = join(paths.root, f.dir, "state.json");
  const stages = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).stages ?? {} : {};
  return ["requirements", "requirements-lite"].some((id) => stages[id]?.status === "passed") ? null : fid;
}

export function intake(projectDir, { text, title, mode, tier, newFeature = false, interview = false } = {}) {
  return withLock(projectDir, () => {
    const paths = factoryPaths(projectDir);
    const app = loadAppState(projectDir);
    if (text) writeAtomic(join(paths.inbox, `request-${now().replace(/[:.]/g, "-")}.md`), `${text.trim()}\n`);

    const indexFile = join(paths.context, "index.yaml");
    const index = readYaml(indexFile, { sources: [] });
    const known = new Set(index.sources.map((s) => s.sha256));
    const added = [];
    let requestText = "";
    for (const rel of listFiles(paths.inbox)) {
      const abs = join(paths.inbox, rel);
      // Hidden files (.keep, .DS_Store) and empty files are not customer input.
      if (rel.split("/").some((part) => part.startsWith(".")) || statSync(abs).size === 0) continue;
      const raw = readFileSync(abs);
      const hash = sha(raw.toString("utf8").replace(/\r\n/g, "\n"));
      if (known.has(hash)) continue;
      const kind = kindOf(rel);
      // An edited file is a new revision: earlier IDs stay valid citations in their own normalised file.
      const earlier = index.sources.filter((s) => s.file === `inbox/${rel}`);
      const revisions = earlier.length;
      for (const s of earlier) s.superseded = true; // a spec accounts for the latest revision only
      const normalised = `context/normalised/${safeName(rel)}${revisions ? `.r${revisions + 1}` : ""}.md`;
      let ids = [];
      let normalisedSha = null;
      if (kind === "text") {
        const result = normaliseText(raw.toString("utf8"), app.next_ids, rel);
        ids = result.ids;
        requestText += `\n${raw.toString("utf8")}`;
        writeAtomic(join(paths.root, normalised), result.text);
        normalisedSha = sha(result.text); // the engine's tagging; gate-intake detects later edits
      } else {
        writeAtomic(
          join(paths.root, normalised),
          `# ${rel}\n\n<!-- ${kind}, ${statSync(abs).size} bytes: the intake-normaliser describes this source and tags each paragraph with a new SRC id -->\n`,
        );
      }
      index.sources.push({ file: `inbox/${rel}`, normalised, sha256: hash, kind, ids, ...(normalisedSha ? { normalised_sha: normalisedSha } : {}) });
      known.add(hash);
      added.push({ file: rel, kind, ids: ids.length });
    }
    const open = Object.entries(app.features).filter(([, f]) => !["done", "aborted"].includes(f.status));
    if (!added.length && !interview && !newFeature && !open.length) {
      throw new UsageError("the inbox has no new files — add requirements to .factory/inbox/, pass --text, or use --interview");
    }
    let feature = null;
    let detected = null;
    if (!open.length || newFeature) {
      const config = loadConfig(projectDir);
      detected = mode ? { mode, reason: "set by --mode" } : detectMode(projectDir, requestText);
      const profile = profileFor(config, { mode: detected.mode, tier });
      const name = title ?? /^#\s+(.+)$/m.exec(requestText)?.[1] ?? requestText.trim().split(/\s+/).slice(0, 6).join(" ") ?? "New feature";
      if (app.mode === "unknown") app.mode = detected.mode;
      const f = createFeature(projectDir, app, { title: name || "New feature", mode: detected.mode, profile, tier: tier ?? "standard", stages: profileStages(config, profile) });
      feature = f.state.feature;
      appendEvent(projectDir, { type: "feature", feature, mode: detected.mode, profile });
    }
    // New sources belong to the feature they were added for: its spec must account for each of them.
    // Added while a feature is open, they go to it only while it has not passed requirements; otherwise
    // they wait (unassigned) for the next `intake --new`, which also takes over an aborted feature's.
    const fresh = index.sources.slice(index.sources.length - added.length);
    const owner = feature ?? stillSpecifying(paths, app);
    for (const s of fresh) {
      if (owner) s.feature = owner;
      else s.unassigned = true;
    }
    if (feature) {
      for (const s of index.sources) {
        if (s.unassigned || (s.feature && app.features[s.feature]?.status === "aborted")) {
          s.feature = feature;
          delete s.unassigned;
        }
      }
    }
    const errors = validate("source-index", index);
    if (errors.length) throw new Error(`source index would be invalid: ${errors.join("; ")}`);
    writeYaml(indexFile, index);
    saveAppState(projectDir, app);
    appendEvent(projectDir, { type: "intake", feature: feature ?? undefined, sources: added.length });
    return {
      added,
      feature: feature ?? open[0]?.[0] ?? null,
      created: Boolean(feature),
      mode: detected?.mode ?? null,
      mode_reason: detected?.reason ?? null,
      note: feature ? null : `new sources were added to the app context; ${open.map(([id]) => id).join(", ")} is still open — pass --new to start another feature`,
      next: "/factory:run",
    };
  });
}
