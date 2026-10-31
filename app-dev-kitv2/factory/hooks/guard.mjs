// Factory enforcement hooks (Suggestions/09). One entry point, dispatched by the event argument:
//   session-start · pre-write · pre-read · pre-bash · post-write · subagent-stop
// hooks.json short-circuits outside factory projects, so this only runs where .factory/state.json exists.
// Rules apply to subagents the Conductor dispatched (matched by agent_type); a bug here fails open and
// is logged to .factory/logs/hooks.log rather than blocking the session.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_ROOT, matchesAny, toPosix } from "../scripts/lib/core.mjs";
import { loadConfig } from "../scripts/lib/config.mjs";
import { activeDispatches, activeName } from "../scripts/lib/state.mjs";
import { typeOfPath, validateArtifactFile } from "../scripts/lib/schemas.mjs";
import { brief, briefMarkdown } from "../scripts/lib/brief.mjs";
import { checkEnvelope, parseEnvelope } from "../scripts/lib/conductor.mjs";
import { registerPack } from "../scripts/lib/registry.mjs";

/** Files only the engine CLI writes. Agents and the main session must go through `factory …`. */
export const ENGINE_OWNED = [
  ".factory/state.json",
  ".factory/events.jsonl",
  ".factory/.active/**",
  ".factory/.registry/**",
  ".factory/features/*/state.json",
  ".factory/features/*/gate-cache.json",
  ".factory/features/*/gate-log.jsonl",
  ".factory/features/*/human-notes.yaml",
  ".factory/features/*/envelopes/**",
  ".factory/features/*/packs/**",
];
const FREE_READS = [".factory/features/*/packs/**", ".factory/features/*/digest.md", ".factory/features/*/human-notes.yaml"];
const BASH_DENY = [
  [/\bgit\s+push\b[^\n]*(--force\b|\s-f\b|--force-with-lease\b)/, "force-push is human-only"],
  [/\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b(\s+-\S+)*\s+[^-\s]/, "installing packages needs an approved dependency task"],
  [/\b(curl|wget)\s+https?:/, "network calls are not allowed from a dispatched agent"],
  [/\brm\s+-rf?\s+(\/|~|\.factory\b)/, "destructive delete"],
];

const out = (obj) => process.stdout.write(JSON.stringify(obj));
const deny = (event, reason) =>
  out({ hookSpecificOutput: { hookEventName: event, permissionDecision: "deny", permissionDecisionReason: reason } });

/**
 * The active dispatches a tool call may belong to (several when the same agent type runs for two
 * features). Empty for the main session or a subagent the factory did not dispatch.
 */
export function dispatchesFor(input, actives) {
  const type = input.agent_type;
  if (!type) return [];
  return actives.filter((d) => d.subagent_type === type || d.agent === type || d.subagent_type.endsWith(`:${type}`));
}

export function relPath(project, file) {
  if (!file) return null;
  return toPosix(isAbsolute(file) ? relative(project, file) : file);
}

export function decideWrite(input, project, actives, config) {
  const file = relPath(project, input.tool_input?.file_path ?? input.tool_input?.notebook_path);
  if (!file || file.startsWith("..")) return null;
  if (matchesAny(file, ENGINE_OWNED)) return `${file} is engine-owned; change it through the factory CLI (factory note/approve/record …)`;
  const candidates = dispatchesFor(input, actives);
  if (!candidates.length) return null;
  if (matchesAny(file, config.policy?.protected_paths ?? [])) return `${file} is a protected path (policy.protected_paths)`;
  const allowedBy = candidates.find((d) => matchesAny(file, d.write_allow ?? []) && !matchesAny(file, d.write_deny ?? []));
  if (allowedBy) return null;
  const d = candidates[0];
  if (matchesAny(file, d.write_deny ?? [])) return `${file} is read-only for ${d.agent} in this phase (e.g. red tests locked for the builder)`;
  return `${file} is outside your pack's write allowlist (${(d.write_allow ?? []).join(", ")}). If you really need it, return status "needs_scope_change" naming the file.`;
}

export function decideRead(input, project, actives) {
  const [d] = dispatchesFor(input, actives);
  if (!d) return null;
  const tool = input.tool_name;
  const target = relPath(project, input.tool_input?.file_path ?? input.tool_input?.path);
  if (tool !== "Read" && (!target || target === "" || target === ".")) {
    return `unscoped ${tool} is blocked — pass a path from your pack (T2) or a folder it names`;
  }
  if (target && matchesAny(target, d.read_deny ?? [])) return `${target} is not readable for ${d.agent} (black-box role)`;
  if (tool === "Read" && target && !matchesAny(target, FREE_READS)) {
    const counter = join(project, ".factory", ".active", `${activeName(d.id)}.reads`);
    const used = existsSync(counter) ? Number(readFileSync(counter, "utf8")) || 0 : 0;
    if (used >= (d.read_budget ?? Infinity)) {
      return `read budget used up (${used}). Finish with what you have, or return "needs_scope_change" naming the files you need.`;
    }
    mkdirSync(join(project, ".factory", ".active"), { recursive: true });
    writeFileSync(counter, String(used + 1));
  }
  return null;
}

/** Engine commands that move the pipeline: the Conductor and the human run them, never a dispatched agent. */
const CONTROL = new Set(["approve", "reject", "note", "override", "replay", "diagnose", "split", "abort", "comments", "ship", "init", "record", "step", "feature", "intake", "scaffold"]);
const READERS = new Set(["cat", "head", "tail", "less", "more", "nl", "od", "xxd", "strings", "sed", "awk", "grep", "rg", "egrep"]);
const SCRIPTED = new Set(["sed", "awk", "grep", "rg", "egrep"]); // their first plain argument is a pattern, not a file
const SCRATCH = /^(\/dev\/(null|stdout|stderr)|\/tmp\/|\/private\/tmp\/|\/var\/folders\/)/;
const OPS = ["&&", "||", ">>", ";", "|", "&", "(", ")", ">", "<"];

/** Words and operators of a command line; quotes respected, here-doc bodies dropped (they are data). */
function tokenize(cmd) {
  const text = cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, " $3")
    .replace(/\d*>&\d+/g, " ")
    .replace(/&>/g, " > ");
  const tokens = [];
  let word = null;
  let quote = null;
  const flush = () => {
    if (word !== null) tokens.push({ word });
    word = null;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      else word += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      word ??= "";
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (op && !(op === ">" && /^\d$/.test(word ?? "x"))) {
      flush();
      tokens.push({ op });
      i += op.length - 1;
      continue;
    }
    if (op === ">") word = null; // 2> — a file-descriptor redirect
    if (op === ">") {
      tokens.push({ op });
      continue;
    }
    word = (word ?? "") + ch;
  }
  flush();
  return tokens;
}

/** Files a shell command writes and reads (absolute, resolved from cwd and any `cd`), and factory control use. */
export function shellTargets(cmd, cwd = process.cwd()) {
  const writes = [];
  const reads = [];
  let control = null;
  let dir = cwd;
  const at = (f) => resolve(dir, f);
  const segments = [[]];
  for (const t of tokenize(cmd)) {
    if (t.op && !["<", ">", ">>"].includes(t.op)) segments.push([]);
    else segments.at(-1).push(t);
  }
  for (const seg of segments) {
    const words = [];
    for (let i = 0; i < seg.length; i++) {
      const t = seg[i];
      if (t.op === ">" || t.op === ">>") {
        const target = seg[i + 1]?.word;
        if (target && !target.startsWith("=")) writes.push(at(target));
        i++;
      } else if (t.op === "<") {
        if (seg[i + 1]?.word) reads.push(at(seg[i + 1].word));
        i++;
      } else words.push(t.word);
    }
    const [bin, ...rest] = words;
    if (!bin) continue;
    const plain = rest.filter((x) => !x.startsWith("-"));
    const factory = words.findIndex((w) => /(^|\/)factory(\.mjs)?$/.test(w));
    if (factory !== -1) control ??= words.slice(factory + 1).find((w) => CONTROL.has(w)) ?? null;
    if (bin === "cd") dir = resolve(dir, plain[0] ?? ".");
    else if (bin === "tee") writes.push(...plain.map(at));
    else if (["cp", "install", "ln"].includes(bin) && plain.length > 1) {
      writes.push(at(plain.at(-1)));
      reads.push(...plain.slice(0, -1).map(at));
    } else if (bin === "mv") writes.push(...plain.map(at)); // the source disappears too
    else if (["rm", "touch", "truncate", "unlink"].includes(bin)) writes.push(...plain.map(at));
    else if (bin === "git" && ["rm", "mv"].includes(plain[0])) writes.push(...plain.slice(1).map(at));
    else if ((bin === "sed" || bin === "perl") && rest.some((x) => /^-\w*i/.test(x))) writes.push(at(plain.at(-1)));
    if (READERS.has(bin)) reads.push(...plain.slice(SCRIPTED.has(bin) && !rest.includes("-e") ? 1 : 0).map(at));
  }
  const keep = (f) => !SCRATCH.test(f);
  return { writes: writes.filter(keep), reads: reads.filter(keep), control };
}

/**
 * The shell guard for dispatched agents. Best effort: a shell is a full language, so the hard
 * guarantees stay in the gates (red-test lock, commit plan); this stops the easy and the accidental.
 */
export function decideBash(input, actives, project = process.cwd(), config = {}) {
  const cmd = input.tool_input?.command ?? "";
  for (const [re, why] of BASH_DENY.slice(0, 1)) if (re.test(cmd)) return why;
  const [d] = dispatchesFor(input, actives);
  if (!d) return null;
  for (const [re, why] of BASH_DENY) if (re.test(cmd)) return why;
  const { writes, reads, control } = shellTargets(cmd, resolve(project, input.cwd ?? "."));
  if (control) return `factory ${control} is for the Conductor and the human; run only your exit check (factory gate …) and factory state`;
  for (const file of writes) {
    const why = decideWrite({ ...input, tool_name: "Write", tool_input: { file_path: file } }, project, actives, config);
    if (why) return `shell write to ${why}`;
  }
  for (const file of reads) {
    const target = relPath(project, file);
    if (target && !target.startsWith("..") && matchesAny(target, d.read_deny ?? [])) return `${target} is not readable for ${d.agent} (black-box role)`;
  }
  return null;
}

export function postWrite(input, project) {
  const file = relPath(project, input.tool_input?.file_path);
  if (!file?.startsWith(".factory/")) return null;
  const type = typeOfPath(file.slice(".factory/".length));
  if (!type) return null;
  const errors = validateArtifactFile(type, join(project, file));
  return errors.length ? `${file} does not match the ${type} schema:\n- ${errors.slice(0, 15).join("\n- ")}` : null;
}

export function subagentStop(input, actives, maxWords) {
  const candidates = dispatchesFor(input, actives);
  if (!candidates.length || input.stop_hook_active) return null;
  let envelope;
  try {
    envelope = parseEnvelope(input.last_assistant_message ?? "");
  } catch (error) {
    return `End your reply with the JSON envelope from your pack (pack_id ${candidates.map((d) => `"${d.id}"`).join(" or ")}): ${error.message}`;
  }
  const d = candidates.find((x) => x.id === envelope?.pack_id) ?? candidates[0];
  const errors = checkEnvelope(envelope, { packId: d.id, maxWords });
  return errors.length ? `Your envelope is invalid — fix it and reply again:\n- ${errors.join("\n- ")}` : null;
}

function sessionStart(input, project) {
  registerPack(project, ENGINE_ROOT, input.session_id ?? "session");
  const data = brief(project);
  if (!data.features.length && input.source !== "compact") return;
  out({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: briefMarkdown(data) } });
}

async function main() {
  const event = process.argv[2];
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const project = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const actives = activeDispatches(project);
  let reason;
  switch (event) {
    case "session-start":
      return sessionStart(input, project);
    case "pre-write":
      reason = decideWrite(input, project, actives, loadConfig(project));
      return reason && deny("PreToolUse", reason);
    case "pre-read":
      reason = decideRead(input, project, actives);
      return reason && deny("PreToolUse", reason);
    case "pre-bash":
      reason = decideBash(input, actives, project, loadConfig(project));
      return reason && deny("PreToolUse", reason);
    case "post-write":
      reason = postWrite(input, project);
      return reason && out({ decision: "block", reason });
    case "subagent-stop":
      reason = subagentStop(input, actives, loadConfig(project).context?.return_summary_max_words);
      return reason && out({ decision: "block", reason });
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    await main();
  } catch (error) {
    try {
      const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      mkdirSync(join(project, ".factory", "logs"), { recursive: true });
      appendFileSync(join(project, ".factory", "logs", "hooks.log"), `${new Date().toISOString()} ${process.argv[2]} ${error.stack}\n`);
    } catch {
      // Nothing more we can do; fail open.
    }
  }
}
