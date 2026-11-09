// Context Broker: materialises one context pack per dispatch (Suggestions/07). A pack lists paths,
// never payloads; only T1 items marked [READ] are mandatory reads. Over-budget packs drop optional
// sections (large optional inputs first, golden files last) and are stamped context_degraded.
//
// Layout, stable first: what is the same for every dispatch of a role and task type (stack lines,
// skills, rules, the on-demand rule, the input paths, golden files) comes first, the unique part (the
// mission, the task's slice of the plan, the notes mapped to it, feedback) comes last. That keeps a
// shared prefix across dispatches, and the unique task is the last thing an agent reads.
//
// A task dispatch (d.slim) gets its own slice inlined by the Conductor in the mission; the whole feature
// artifacts are listed as "read only if needed" and are not part of the estimate.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { ENGINE_ROOT, YAML, readText, toPosix, writeAtomic } from "./core.mjs";
import { ARTIFACT_TYPES, artifactFiles, artifactGlob, parseArtifactRef, validate } from "./schemas.mjs";
import { freshDigest } from "./digest.mjs";
import { notesForPack } from "./notes.mjs";

const tokensOf = (bytes) => Math.ceil(bytes / 4);
const fileTokens = (file) => (existsSync(file) ? tokensOf(statSync(file).size) : 0);

/** Pairs each required skill with its SKILL.md and a short hash the Cursor agent copies into skills_loaded. */
function skillRecords(skills, files) {
  const byBare = new Map();
  for (const f of files ?? []) {
    const m = String(f).match(/\/skills\/([^/]+)\/SKILL\.md$/);
    if (m) byBare.set(m[1], toPosix(f));
  }
  const out = [];
  for (const name of skills) {
    const path = byBare.get(String(name).split(":").pop());
    if (!path) continue;
    const hash = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12) : "missing";
    out.push({ name: String(name), path, hash });
  }
  return out;
}

/**
 * @param d { id, feature, stageId, stage, agent, subagent_type, model, attempt, rung, role, task,
 *            phase, extraWrites[], extraReads[], feedback, instruction, mission,
 *            binding [{ label, path|url }] (binding design inputs: the referenced mockup, its screenshots and source — the agent opens them),
 *            inline [{ label, text }] (text the dispatch must have in full, e.g. a screen's conformance checklist),
 *            slim (task dispatch: the whole artifacts are optional reads), noteScope (IDs of the task and its slice),
 *            knowledge: { skills[], rules[], golden[] } (task), stageKnowledge: [{ role, stack, skills[], rules[] }] }
 */
export function buildPack(projectDir, featureObj, config, d) {
  const s = featureObj.state;
  const rel = (abs) => toPosix(relative(projectDir, abs));
  const dirs = { factoryRoot: join(projectDir, ".factory"), featureDir: featureObj.dir, projectDir };
  const contextRole = d.stage?.context_role ?? "analysis_roles";
  // No context.budgets.<role>, or a non-positive one: do not trim the pack. A positive value still drops optional inputs.
  const rawBudget = config.context?.budgets?.[contextRole];
  const limited = typeof rawBudget === "number" && rawBudget > 0;
  const budget = limited ? rawBudget : Number.POSITIVE_INFINITY;
  const readMax = config.context?.read_allowlist_max?.[contextRole] ?? 12;

  // Files only the engine writes (review.md from findings, the change set) are never an agent's to write.
  const notMine = new Set([...(d.notMine ?? []), ...Object.keys(ARTIFACT_TYPES).filter((t) => ARTIFACT_TYPES[t].engine_writes)]);
  const writeAllow = [
    ...(d.stage?.outputs ?? []).flatMap((ref) => parseArtifactRef(ref).names.filter((t) => !notMine.has(t)).map((t) => rel(artifactGlob(t, dirs)))),
    ...(d.stage?.writes ?? []),
    ...(d.extraWrites ?? []),
  ];

  // The fresh digest and the human notes that concern this dispatch are inlined: a Read turn each costs
  // more. A task dispatch gets no digest (its slice is in the mission); notes are filtered to its scope.
  const mandatory = [];
  const digestText = d.task ? null : freshDigest(projectDir, featureObj, config, d.stageId);
  const digest = join(featureObj.dir, "digest.md");
  const notesFile = join(featureObj.dir, "human-notes.yaml");
  const notes = notesForPack(existsSync(notesFile) ? YAML.parse(readText(notesFile)) ?? [] : [], d.noteScope ? new Set(d.noteScope) : null);
  const extraReads = d.extraReads ?? []; // unique to this dispatch (a root-cause file): in the task part
  mandatory.push(...extraReads);
  // A task's stack rules are mandatory reads: the gates check what they say.
  for (const rule of d.knowledge?.rules ?? []) mandatory.push({ label: "Rule", path: rule });
  const stageRules = (d.stageKnowledge ?? []).flatMap((k) => k.rules);

  const inputs = [];
  for (const ref of d.stage?.inputs ?? []) {
    const { names, optional } = parseArtifactRef(ref);
    // "a|b" means one of them: list the ones that exist, and call it missing only when none does.
    const found = names
      .filter((type) => !(ARTIFACT_TYPES[type].scope === "project" && ARTIFACT_TYPES[type].path === "**"))
      .map((type) => ({ type, paths: artifactFiles(type, dirs).map(rel) }));
    const present = found.filter((f) => f.paths.length);
    if (present.length) inputs.push(...present.map((f) => ({ ...f, missing: false, optional })));
    else if (found.length && !optional) inputs.push({ type: found.map((f) => f.type).join("|"), paths: [], missing: true, optional });
  }
  const skillsRequired = [...new Set([...(d.knowledge?.skills ?? []), ...(d.procedure?.skills ?? [])])];
  const skillFilesListed = skillRecords(skillsRequired, [...(d.knowledge?.skill_files ?? []), ...(d.procedure?.skill_files ?? []), ...(d.stageKnowledge ?? []).flatMap((k) => k.skill_files ?? [])]);
  const skillHow = "load each with the Skill tool before you start; in Cursor, open the skill by name";
  const scratchEnvelope = `.factory/scratch/${String(d.id).replaceAll("/", ".")}.json`;

  const engineCli = toPosix(join(ENGINE_ROOT, "scripts", "factory.mjs"));
  const gateCmd = d.gate && d.stage?.exit_check !== false
    ? `node ${engineCli} gate ${[d.gate].flat().join(",")} --project ${toPosix(projectDir)} --feature ${s.feature}${d.gateTask ? ` --task ${d.gateTask.id}` : ""}${d.gateScreen ? ` --screen ${d.gateScreen}` : ""}`
    : null;
  const outputs = (d.stage?.outputs ?? []).map((ref) =>
    parseArtifactRef(ref).names.every((t) => ARTIFACT_TYPES[t].engine_writes)
      ? `  - ${ref}: written by the engine from your envelope (findings) — do not write it`
      : `  - ${ref}: ${parseArtifactRef(ref).names.map((t) => rel(artifactGlob(t, dirs))).join(" | ")}`,
  );

  const absOf = (p) => (isAbsolute(p) ? p : join(projectDir, p));
  const sizeOf = (i) => i.paths.reduce((n, p) => n + fileTokens(absOf(p)), 0);
  // A task dispatch lists every feature artifact as "read only if needed": its slice is in the mission.
  const optionalReads = d.slim ? inputs.filter((i) => !i.missing) : [];
  let counted = d.slim ? inputs.filter((i) => i.missing) : inputs;
  let golden = d.knowledge?.golden ?? [];

  const render = () => {
    const lines = [];
    // ---- stable part: the same for every dispatch of this role and task type ----
    lines.push("Section order: T1, T4, T2 are the stable rules and paths; T0 (the mission), the notes and T3 (feedback) come last — read to the end before you start.", "", "## T1 — Orientation (read these first)");
    if (d.stacks?.length) lines.push(...d.stacks.map((l) => `Stack · ${l}`));
    if (skillsRequired.length) {
      lines.push(
        `Skills preflight (blocking — do this first, before you write or edit anything): call the Skill tool once for each of: ${skillsRequired.join(", ")}. Your first write is refused until all are loaded.`,
        `If the Skill tool is missing or a skill will not load, stop: return status "blocked" with open question "skills unavailable: <names>". List what you loaded in the envelope as "skills_loaded": [names].`,
      );
      if (skillFilesListed.length) {
        lines.push(
          "Cursor has no Skill tool. Do not return blocked only because it is missing. Read each file and list these tokens exactly in skills_loaded:",
          ...skillFilesListed.map((r) => `  - inline:${r.name}@${r.hash}  ${r.path}`),
          `On Cursor, also write the same envelope JSON (no markdown fence) to ${scratchEnvelope} before you return.`,
        );
      }
    }
    if (d.knowledge?.skills?.length) lines.push(`Stack skills (${skillHow}): ${d.knowledge.skills.join(", ")}`);
    for (const k of d.stageKnowledge ?? []) {
      lines.push(`Stack knowledge for ${k.role} (${k.stack}) — skills (${skillHow}; use them as reference knowledge and keep to your own procedure: none of their fixes, sub-agents or questions): ${k.skills.join(", ")}`);
      if (k.rules.length) lines.push("  Rules of that stack (read the ones the work in front of you touches):", ...k.rules.map((r) => `  - ${r}`));
    }
    if (d.planRules?.length) lines.push("Plan rules (gate-plan checks every one):", ...d.planRules.map((l) => `  - ${l}`));
    for (const m of mandatory.filter((x) => !extraReads.includes(x))) lines.push(`${m.label}: ${m.path} [READ]`);
    if (digestText) lines.push(`Feature digest (${rel(digest)}), inline — open the full artifacts in T2 for detail:`, "", digestText, "");
    lines.push("", "## T4 — On demand");
    lines.push(`Up to ${readMax} additional reads, each reachable from the files above. Unscoped Grep/Glob is blocked.`);
    lines.push("", d.slim ? "## T2 — Optional reads (read only if needed; the slice of the plan you need is in T0)" : "## T2 — Inputs (paths only — read what you need)");
    const listed = d.slim ? optionalReads.concat(counted) : counted;
    if (!listed.length) lines.push("(no upstream artifacts)");
    for (const i of listed) lines.push(`- ${i.type}: ${i.missing ? "(missing — report it in the envelope)" : i.paths.join(", ")}`);
    if (golden.length) lines.push(`Golden files (match these):`, ...golden.map((g) => `  - ${g}`));

    // ---- unique part: this dispatch's task ----
    lines.push("", "## T0 — Mission");
    lines.push(`Feature ${s.feature} "${s.title}" · mode ${s.mode} · stage ${d.stageId}${d.stage?.title ? ` (${d.stage.title})` : ""} · attempt ${d.attempt}${d.task ? ` · task ${d.task.id}` : ""}${d.phase && d.phase !== "stage" ? ` · phase ${d.phase}` : ""}`);
    if (d.mission) lines.push(d.mission);
    for (const m of extraReads) lines.push(`${m.label}: ${m.path} [READ]`);
    // Binding inputs are listed here, in the part that is unique to the dispatch: images are opened with Read.
    if (d.binding?.length) {
      lines.push("Binding inputs (the customer's reference; read-only, outside your write allowlist; images: open them with Read):");
      for (const b of d.binding) lines.push(b.path || b.url ? `  - ${b.label}: ${b.path ?? b.url}` : `  - ${b.label}`);
    }
    for (const i of d.inline ?? []) lines.push("", `### ${i.label}`, i.text.trimEnd(), "");
    if (d.openNotes?.length) {
      lines.push(`Open human notes: ${d.openNotes.join(", ")} (human-notes.yaml). The stage gate fails unless each one is either mapped — envelope "notes_mapped": [{ "id": "HD-n", "to": [REQ/AC/TASK/OQ/ADR IDs in your outputs that now carry it] }] — or mentioned by ID in your outputs where it applies.`);
    }
    if (notes.length) {
      lines.push(`Human notes${d.noteScope ? " for this task" : ""} (${rel(notesFile)}):`, ...notes.map((n) => `  - ${n.id}${n.also.length ? ` (also ${n.also.join(", ")})` : ""} (${n.status}${n.mapped_to?.length ? ` → ${n.mapped_to.join(", ")}` : ""}): ${String(n.text).replace(/\s+/g, " ")}`));
    }
    if (outputs.length) lines.push("Produce:", ...outputs);
    lines.push("You may write only:", ...writeAllow.map((w) => `  - ${w}`));
    if (gateCmd) {
      lines.push(`Exit check (run it before you return): ${gateCmd}`);
      if (d.laterOwned?.length) lines.push(`  Agents after you write ${d.laterOwned.join(", ")}; failures about those files are expected now.`);
    }
    if (d.nextIds?.length) lines.push(`Next free IDs (use these for anything new; never reuse an ID): ${d.nextIds.join(", ")}`);
    lines.push(`Return: end your reply with one \`\`\`json block — the envelope (schema ${toPosix(join(ENGINE_ROOT, "schemas", "envelope.schema.json"))}) with the required fields "pack_id": "${d.id}", "status" (done | failed | blocked | needs_scope_change | needs_clarification), "artifacts_written" (the files you wrote, [] if none) and "summary" of at most ${config.context?.return_summary_max_words ?? 200} words.`);
    if (d.feedback) {
      lines.push("", "## T3 — Attempt feedback");
      lines.push(d.feedback);
      if (d.instruction) lines.push(`Instruction: ${d.instruction}`);
    }
    return lines.join("\n");
  };

  let body = render();
  // What the agent is likely to read: the pack, the mandatory reads and every counted input (an upper bound).
  // The optional reads of a task dispatch are not counted: the slice it needs is already in the pack.
  // The skills the agent is forced to load (Skills preflight) are read in full before it writes: their size counts too.
  const skillTokens = [...(d.knowledge?.skill_files ?? []), ...(d.procedure?.skill_files ?? []), ...(d.stageKnowledge ?? []).flatMap((k) => k.skill_files ?? [])].reduce((n, f) => n + fileTokens(f), 0);
  const estimate = (text) => tokensOf(Buffer.byteLength(text)) + skillTokens + mandatory.reduce((n, m) => n + fileTokens(absOf(m.path)), 0) + counted.reduce((n, i) => n + sizeOf(i), 0);
  let degraded = false;
  // Over budget: first the largest optional input, then the golden files — they are the last to go.
  // An unlimited budget (no positive context.budgets.<role>) never enters this loop.
  while (limited && estimate(body) > budget) {
    const drop = counted.filter((i) => i.optional && !i.missing && i.paths.length).sort((a, b) => sizeOf(b) - sizeOf(a))[0];
    if (drop) counted = counted.filter((i) => i !== drop);
    else if (golden.length) golden = [];
    else break;
    body = render();
    degraded = true;
  }
  if (limited && estimate(body) > budget) degraded = true;

  const front = {
    pack_id: d.id,
    feature: s.feature,
    stage: d.stageId,
    ...(d.task ? { task: d.task.id } : {}),
    ...(d.phase ? { phase: d.phase } : {}),
    agent: d.agent,
    subagent_type: d.subagent_type,
    ...(d.role ? { role: d.role } : {}),
    model: d.model,
    attempt: d.attempt,
    rung: d.rung ?? 0,
    budget_tokens: limited ? budget : 0,
    estimated_tokens: estimate(body),
    read_allowlist_max: readMax,
    write_allow: writeAllow,
    ...(skillsRequired.length ? { skills_required: skillsRequired } : {}),
    ...(skillFilesListed.length ? { skill_files: skillFilesListed } : {}),
    read_deny: d.readDeny ?? [],
    write_deny: d.writeDeny ?? [],
    // Golden files and stage rules are listed too: reading them must not use up the T4 allowance.
    listed_reads: mandatory.length + (d.binding?.filter((b) => b.path).length ?? 0) + inputs.reduce((n, i) => n + i.paths.length, 0) + (d.knowledge?.golden?.length ?? 0) + stageRules.length,
    index_sha: s.index_sha ?? null,
    context_degraded: degraded,
  };
  const invalid = validate("pack", front);
  if (invalid.length) throw new Error(`pack ${d.id} would be invalid: ${invalid.join("; ")}`);
  const file = join(featureObj.dir, "packs", `${d.id.split("/").slice(1).join(".")}.pack.md`);
  writeAtomic(file, `---\n${YAML.stringify(front, { lineWidth: 0 })}---\n\n${body}\n`);
  return { file, rel: rel(file), front };
}
