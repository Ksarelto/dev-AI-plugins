// Context Broker: materialises one context pack per dispatch (Suggestions/07). A pack lists paths,
// never payloads; only T1 items marked [READ] are mandatory reads. Over-budget packs drop optional
// sections first and are stamped context_degraded.
import { existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ENGINE_ROOT, YAML, toPosix, writeAtomic } from "./core.mjs";
import { ARTIFACT_TYPES, artifactFiles, artifactGlob, parseArtifactRef, validate } from "./schemas.mjs";

const tokensOf = (bytes) => Math.ceil(bytes / 4);
const fileTokens = (file) => (existsSync(file) ? tokensOf(statSync(file).size) : 0);

/**
 * @param d { id, feature, stageId, stage, agent, subagent_type, model, attempt, rung, role, task,
 *            phase, extraWrites[], extraReads[], feedback, instruction, mission }
 */
export function buildPack(projectDir, featureObj, config, d) {
  const s = featureObj.state;
  const rel = (abs) => toPosix(relative(projectDir, abs));
  const dirs = { factoryRoot: join(projectDir, ".factory"), featureDir: featureObj.dir, projectDir };
  const contextRole = d.stage?.context_role ?? "analysis_roles";
  const budget = config.context?.budgets?.[contextRole] ?? 45000;
  const readMax = config.context?.read_allowlist_max?.[contextRole] ?? 12;

  const writeAllow = [
    ...(d.stage?.outputs ?? []).flatMap((ref) => parseArtifactRef(ref).names.map((t) => rel(artifactGlob(t, dirs)))),
    ...(d.stage?.writes ?? []),
    ...(d.extraWrites ?? []),
  ];

  const mandatory = [];
  const digest = join(featureObj.dir, "digest.md");
  if (existsSync(digest)) mandatory.push({ label: "Feature digest", path: rel(digest) });
  const notesFile = join(featureObj.dir, "human-notes.yaml");
  if (existsSync(notesFile)) mandatory.push({ label: "Human notes (HD-*)", path: rel(notesFile) });
  for (const extra of d.extraReads ?? []) mandatory.push(extra);

  const inputs = [];
  for (const ref of d.stage?.inputs ?? []) {
    const { names, optional } = parseArtifactRef(ref);
    for (const type of names) {
      if (ARTIFACT_TYPES[type].scope === "project") continue;
      const files = artifactFiles(type, dirs);
      if (!files.length && optional) continue;
      inputs.push({ type, paths: files.map(rel), missing: !files.length });
    }
  }
  const optionalSections = [{ name: "golden", lines: (d.golden ?? []).map((g) => `  - ${g}`) }];

  const engineCli = toPosix(join(ENGINE_ROOT, "scripts", "factory.mjs"));
  const gateCmd = d.gate
    ? `node ${engineCli} gate ${d.gate} --project ${toPosix(projectDir)} --feature ${s.feature}${d.task ? ` --task ${d.task.id}` : ""}`
    : null;
  const outputs = (d.stage?.outputs ?? []).map((ref) => `  - ${ref}: ${parseArtifactRef(ref).names.map((t) => rel(artifactGlob(t, dirs))).join(" | ")}`);

  const render = (sections) => {
    const lines = [];
    lines.push("## T0 — Mission");
    lines.push(`Feature ${s.feature} "${s.title}" · mode ${s.mode} · stage ${d.stageId}${d.stage?.title ? ` (${d.stage.title})` : ""} · attempt ${d.attempt}${d.task ? ` · task ${d.task.id}` : ""}${d.phase && d.phase !== "stage" ? ` · phase ${d.phase}` : ""}`);
    if (d.mission) lines.push(d.mission);
    if (d.openNotes?.length) {
      lines.push(`Open human notes: ${d.openNotes.join(", ")}. Address each one your stage can, and list it in the envelope's "notes_mapped" ({ "id": "HD-n", "to": [the REQ/AC/TASK/OQ/ADR IDs that now carry it] }).`);
    }
    if (outputs.length) lines.push("Produce:", ...outputs);
    lines.push("You may write only:", ...writeAllow.map((w) => `  - ${w}`));
    if (gateCmd) lines.push(`Exit check (run it before you return): ${gateCmd}`);
    lines.push(`Return: end your reply with one \`\`\`json block — the envelope (schema ${toPosix(join(ENGINE_ROOT, "schemas", "envelope.schema.json"))}) with "pack_id": "${d.id}" and a summary of at most ${config.context?.return_summary_max_words ?? 200} words.`);
    lines.push("", "## T1 — Orientation (read these first)");
    if (mandatory.length) for (const m of mandatory) lines.push(`${m.label}: ${m.path} [READ]`);
    else lines.push("(nothing yet — this is the first stage of the feature)");
    lines.push("", "## T2 — Inputs (paths only — read what you need)");
    if (!inputs.length) lines.push("(no upstream artifacts)");
    for (const i of inputs) lines.push(`- ${i.type}: ${i.missing ? "(missing — report it in the envelope)" : i.paths.join(", ")}`);
    for (const sec of sections) if (sec.lines.length) lines.push(`Golden files (match these):`, ...sec.lines);
    if (d.feedback) {
      lines.push("", "## T3 — Attempt feedback");
      lines.push(d.feedback);
      if (d.instruction) lines.push(`Instruction: ${d.instruction}`);
    }
    lines.push("", "## T4 — On demand");
    lines.push(`Up to ${readMax} additional reads, each reachable from the files above. Unscoped Grep/Glob is blocked.`);
    return lines.join("\n");
  };

  let sections = optionalSections;
  let body = render(sections);
  const estimate = (text) => tokensOf(Buffer.byteLength(text)) + mandatory.reduce((n, m) => n + fileTokens(join(projectDir, m.path)), 0);
  let degraded = false;
  while (estimate(body) > budget && sections.some((sec) => sec.lines.length)) {
    sections = sections.map((sec, i) => (i === sections.findIndex((x) => x.lines.length) ? { ...sec, lines: [] } : sec));
    body = render(sections);
    degraded = true;
  }
  if (estimate(body) > budget) degraded = true;

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
    budget_tokens: budget,
    estimated_tokens: estimate(body),
    read_allowlist_max: readMax,
    write_allow: writeAllow,
    read_deny: d.readDeny ?? [],
    write_deny: d.writeDeny ?? [],
    listed_reads: mandatory.length + inputs.reduce((n, i) => n + i.paths.length, 0),
    index_sha: s.index_sha ?? null,
    context_degraded: degraded,
  };
  const invalid = validate("pack", front);
  if (invalid.length) throw new Error(`pack ${d.id} would be invalid: ${invalid.join("; ")}`);
  const file = join(featureObj.dir, "packs", `${d.id.split("/").slice(1).join(".")}.pack.md`);
  writeAtomic(file, `---\n${YAML.stringify(front, { lineWidth: 0 })}---\n\n${body}\n`);
  return { file, rel: rel(file), front };
}
