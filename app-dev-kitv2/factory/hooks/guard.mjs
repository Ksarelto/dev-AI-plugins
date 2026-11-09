// Factory enforcement hooks (Suggestions/09). One entry point, dispatched by the event argument:
//   session-start · pre-write · pre-read · pre-bash · post-write · post-skill · subagent-start · subagent-stop · stop
// hooks.json short-circuits outside factory projects, so this only runs where .factory/state.json exists.
// Rules apply to subagents the Conductor dispatched (matched by agent_type); a bug here fails open and
// is logged to .factory/logs/hooks.log rather than blocking the session.
// `--cursor` (hooks/cursor-hooks.json): Cursor's hook shapes are mapped onto the same rules. Its tool
// calls carry no agent type, so subagent-start records which conversation is which subagent.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_ROOT, factoryPaths, matchesAny, toPosix } from "../scripts/lib/core.mjs";
import { loadConfig } from "../scripts/lib/config.mjs";
import { activeDispatches, activeName, loadAppState, loadFeature, savedEnvelopeFile, saveFeature, skillsLogFile, tokensCountedFile, withLock } from "../scripts/lib/state.mjs";
import { missingSkills } from "../scripts/lib/knowledge.mjs";
import { typeOfPath, validateArtifactFile } from "../scripts/lib/schemas.mjs";
import { brief, briefMarkdown } from "../scripts/lib/brief.mjs";
import { checkEnvelope, parseEnvelope } from "../scripts/lib/conductor.mjs";
import { registerPack } from "../scripts/lib/registry.mjs";
import { isUnderReference, referenceRoots, searchRoot } from "../scripts/lib/references.mjs";

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
  ".factory/features/*/acceptance-waiver.yaml",
  ".factory/features/*/envelopes/**",
  ".factory/features/*/packs/**",
  ".factory/features/*/skills-loaded/**",
];
/** Scratch space a dispatched agent may write (e.g. an envelope for `factory envelope check --file`). */
export const SCRATCH_WRITES = [".factory/scratch/**"];
const FREE_READS = [".factory/features/*/packs/**", ".factory/features/*/digest.md", ".factory/features/*/human-notes.yaml"];
const BASH_DENY = [
  [/\bgit\s+push\b[^\n]*(--force\b|\s-f\b|--force-with-lease\b)/, "force-push is human-only"],
  [/\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b(\s+-\S+)*\s+[^-\s]/, "installing packages needs an approved dependency task"],
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
  if (type === "*") return actives; // Cursor: a subagent is running but which one is unknown — the union
  // Hosts may report the bare agent name or "<plugin>:<agent>"; the plugin part can differ (marketplace prefix), the agent name does not.
  // The exact type wins: another plugin's agent of the same bare name is matched only when nothing matches exactly.
  const exact = actives.filter((d) => d.subagent_type === type || d.agent === type || d.subagent_type.endsWith(`:${type}`));
  if (exact.length) return exact;
  const bare = String(type).split(":").pop();
  return actives.filter((d) => d.agent === bare);
}

/** Skill names logged for a dispatch by the PostToolUse(Skill) hook. */
export function loadedSkills(project, d) {
  const file = skillsLogFile(project, d);
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : [];
}

/** A Read of a required skill's SKILL.md (Cursor has no Skill tool) counts as that skill being loaded. */
export function logSkillRead(project, input, actives) {
  const filePath = input.tool_input?.file_path ?? input.tool_input?.path;
  if (!filePath) return [];
  const abs = resolve(filePath);
  const logged = [];
  for (const d of dispatchesFor(input, actives)) {
    const hit = (d.skill_files ?? []).find((s) => resolve(s.path) === abs);
    if (!hit || !(d.skills_required ?? []).includes(hit.name)) continue;
    const file = skillsLogFile(project, d);
    mkdirSync(dirname(file), { recursive: true });
    const have = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
    if (!have.includes(hit.name)) appendFileSync(file, `${hit.name}\n`);
    logged.push(d.id);
  }
  return logged;
}

/** PostToolUse(Skill): records the skill the agent just loaded against every dispatch that requires skills. */
export function logSkill(input, project, actives) {
  const name = String(input.tool_input?.skill ?? input.tool_input?.name ?? "").trim();
  if (!name) return [];
  const logged = [];
  for (const d of dispatchesFor(input, actives).filter((x) => x.skills_required?.length && x.pack)) {
    const file = skillsLogFile(project, d);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${name}\n`);
    logged.push(d.id);
  }
  return logged;
}

export function relPath(project, file) {
  if (!file) return null;
  return toPosix(isAbsolute(file) ? relative(project, file) : file);
}

export function decideWrite(input, project, actives, config) {
  const file = relPath(project, input.tool_input?.file_path ?? input.tool_input?.notebook_path);
  const dispatched = dispatchesFor(input, actives).length > 0;
  // A confirmed reference (the customer's mockup) is read-only for dispatched agents, wherever it lives;
  // the main session (the human's own work) is not restricted.
  if (file && dispatched && isUnderReference(project, isAbsolute(file) ? file : join(project, file))) return `${file} is a declared reference (the customer's mockup): it can be read, never written`;
  if (!file) return null;
  if (file.startsWith("..") || isAbsolute(file)) {
    // Outside the project: only the main session may write there; a dispatched agent gets scratch space only.
    if (!dispatched) return null;
    const abs = resolve(project, input.tool_input?.file_path ?? input.tool_input?.notebook_path);
    const tmp = resolve(tmpdir());
    return SCRATCH.test(abs) || abs === tmp || abs.startsWith(`${tmp}/`) ? null : `${abs} is outside the project: a dispatched agent writes only inside it (or in the OS temp directory)`;
  }
  if (matchesAny(file, ENGINE_OWNED)) return `${file} is engine-owned; change it through the factory CLI (factory note/approve/record …)`;
  const candidates = dispatchesFor(input, actives);
  if (!candidates.length) return null;
  if (matchesAny(file, config.policy?.protected_paths ?? [])) return `${file} is a protected path (policy.protected_paths)`;
  if (matchesAny(file, SCRATCH_WRITES)) return null;
  const allowedBy = candidates.find((d) => matchesAny(file, d.write_allow ?? []) && !matchesAny(file, d.write_deny ?? []));
  if (allowedBy) {
    const required = allowedBy.skills_required ?? [];
    const missing = required.length ? missingSkills(required, allowedBy.pack ? loadedSkills(project, allowedBy) : []) : [];
    return missing.length ? `Load the required skills first: ${missing.join(", ")} (call the Skill tool for each; on Cursor, Read each skill file in the pack. If you cannot, return status "blocked" with open question "skills unavailable: ${missing.join(", ")}")` : null;
  }
  const d = candidates[0];
  if (matchesAny(file, d.write_deny ?? [])) return `${file} is read-only for ${d.agent} in this phase (e.g. red tests locked for the builder)`;
  return `${file} is outside your pack's write allowlist (${(d.write_allow ?? []).join(", ")}). If you really need it, return status "needs_scope_change" naming the file.`;
}

/** A path is unreadable only when every dispatch the call may belong to denies it. */
const readDenied = (candidates, target) => candidates.every((d) => matchesAny(target, d.read_deny ?? []));

export function decideRead(input, project, actives) {
  const candidates = dispatchesFor(input, actives);
  const [d] = candidates;
  if (!d) return null;
  const tool = input.tool_name;
  const target = relPath(project, input.tool_input?.file_path ?? input.tool_input?.path);
  // Declared references (the mockup) may be read and searched by every dispatched agent, whatever the
  // tool, and never use up the read budget.
  const looked = searchRoot(input, project);
  const inReference = Boolean(looked && isUnderReference(project, looked));
  if (tool !== "Read" && !inReference && (!target || target === "" || target === ".")) {
    return `unscoped ${tool} is blocked — pass a path from your pack (T2) or a folder it names`;
  }
  if (target && readDenied(candidates, target)) return `${target} is not readable for ${d.agent} (black-box role)`;
  if (inReference) return null;
  // With the Cursor union ("*") no single dispatch owns the read, so no budget is charged.
  // Files outside the project (the plugins' own skills, references and stack rules) are knowledge, not
  // project context: they never use up the read budget.
  if (tool === "Read" && target && !target.startsWith("..") && input.agent_type !== "*" && !matchesAny(target, FREE_READS)) {
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
const CONTROL = new Set(["resume", "approve", "reject", "note", "override", "replay", "diagnose", "split", "scope", "abort", "comments", "ship", "init", "record", "step", "feature", "intake", "scaffold", "accept-changes", "reference", "acceptance", "budget"]);
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

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const VALUED = new Set(["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "-F", "--form", "-o", "--output", "-O", "-u", "--user", "-A", "--user-agent", "-e", "--referer", "-w", "--write-out", "-T", "--upload-file", "-m", "--max-time", "--connect-timeout", "-b", "--cookie", "-c", "--cookie-jar", "--header", "-P", "--directory-prefix", "--post-data", "--method", "--body-data", "-t", "--tries", "-T", "--timeout"]);

/** A browser MCP navigation (Playwright, Chrome DevTools) by a dispatched agent stays on this machine. */
export function decideNavigate(input, actives) {
  if (!dispatchesFor(input, actives).length) return null;
  const raw = input.tool_input?.url;
  if (!raw) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[^:/]+:\d/.test(raw) ? raw : `http://${raw}`);
  } catch {
    return `browser navigation to "${raw}" is not allowed from a dispatched agent: not a URL on localhost`;
  }
  if (url.protocol === "file:" || (LOOPBACK.has(url.hostname.toLowerCase()) && !url.username && !url.password)) return null;
  return `browser navigation outside this machine is not allowed from a dispatched agent (${raw}); open the app you started on localhost`;
}

/** curl/wget targets that leave this machine (QA may drive the app it started on loopback only). */
export function outsideUrls(cmd) {
  const out = [];
  const segments = [[]];
  for (const t of tokenize(cmd)) {
    if (t.op && !["<", ">", ">>"].includes(t.op)) segments.push([]);
    else if (t.word !== undefined) segments.at(-1).push(t.word);
  }
  for (const [bin, ...args] of segments) {
    if (!/(^|\/)(curl|wget)$/.test(bin ?? "")) continue;
    for (let i = 0; i < args.length; i++) {
      if (VALUED.has(args[i])) {
        i++;
        continue;
      }
      if (args[i].startsWith("-")) continue;
      let url;
      try {
        url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(args[i]) ? args[i] : `http://${args[i]}`);
      } catch {
        continue;
      }
      if (url.username || url.password || !LOOPBACK.has(url.hostname.toLowerCase())) out.push(args[i]);
    }
  }
  return out;
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
  const candidates = dispatchesFor(input, actives);
  const [d] = candidates;
  if (!d) return null;
  for (const [re, why] of BASH_DENY) if (re.test(cmd)) return why;
  const away = outsideUrls(cmd);
  if (away.length) return `network calls outside this machine are not allowed from a dispatched agent (${away[0]}); only localhost`;
  const { writes, reads, control } = shellTargets(cmd, resolve(project, input.cwd ?? "."));
  if (control) return `factory ${control} is for the Conductor and the human; run only your exit check (factory gate …) and factory state`;
  for (const file of writes) {
    const why = decideWrite({ ...input, tool_name: "Write", tool_input: { file_path: file } }, project, actives, config);
    if (why) return `shell write to ${why}`;
  }
  for (const file of reads) {
    const target = relPath(project, file);
    if (target && !target.startsWith("..") && readDenied(candidates, target)) return `${target} is not readable for ${d.agent} (black-box role)`;
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

/** Parsed lines of a JSONL transcript (unreadable lines skipped). */
function transcriptEntries(file) {
  if (!file || !existsSync(file)) return [];
  const entries = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A half-written line: ignore it.
    }
  }
  return entries;
}

/** The agent's final reply: `last_assistant_message`, else the last assistant text in its transcript. */
export function finalMessage(input) {
  if (typeof input.last_assistant_message === "string" && input.last_assistant_message.trim()) return input.last_assistant_message;
  for (const file of [input.agent_transcript_path, input.transcript_path]) {
    for (const e of transcriptEntries(file).reverse()) {
      const msg = e.message;
      if (!msg || (e.type !== "assistant" && msg.role !== "assistant") || (file === input.transcript_path && file !== input.agent_transcript_path && e.isSidechain !== true)) continue;
      const text = typeof msg.content === "string" ? msg.content : (msg.content ?? []).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
      if (text.trim()) return text;
    }
  }
  return "";
}

const usageSum = (u) => ["input_tokens", "output_tokens", "cache_creation_input_tokens"].reduce((n, k) => n + (Number(u?.[k]) || 0), 0);

/**
 * Real token usage of a stopped subagent: a `usage` object (or total) in the payload, else the sum of
 * the usage of its assistant messages in the transcript (each message once — streaming repeats it —
 * cache reads left out). The main transcript is used only for its sidechain entries.
 */
export function tokenUsage(input) {
  const direct = input.usage ?? input.token_usage;
  if (direct && typeof direct === "object") return Number(direct.total_tokens) || usageSum(direct);
  if (Number(input.total_tokens) > 0) return Number(input.total_tokens);
  const own = input.agent_transcript_path;
  const file = own ?? input.transcript_path;
  const byId = new Map();
  let anon = 0;
  for (const e of transcriptEntries(file)) {
    const usage = e.message?.usage;
    if (!usage || (e.type !== "assistant" && e.message?.role !== "assistant")) continue;
    if (!own && (e.isSidechain !== true || (input.agent_id && e.agentId && e.agentId !== input.agent_id))) continue;
    byId.set(e.message.id ?? e.uuid ?? `anon-${anon++}`, usageSum(usage));
  }
  return [...byId.values()].reduce((n, v) => n + v, 0);
}

/**
 * Adds a stopped subagent's real usage to its feature's budgets.tokens (only the part not counted yet,
 * so a second stop of the same dispatch adds the difference). `factory record` then skips --tokens.
 * Returns { dispatch, added } or null.
 */
export function addTokens(project, input, actives, message = finalMessage(input)) {
  const candidates = dispatchesFor(input, actives);
  if (!candidates.length || input.agent_type === "*") return null;
  let packId = null;
  try {
    packId = parseEnvelope(message)?.pack_id ?? null;
  } catch {
    // No envelope yet: a single candidate is unambiguous.
  }
  const d = candidates.find((x) => x.id === packId) ?? (candidates.length === 1 ? candidates[0] : null);
  const total = tokenUsage(input);
  if (!d || !total) return null;
  // The marker is per agent run ("run|run total|all runs"): a redispatch under the same dispatch id is a new
  // run with a fresh transcript, so its usage is not netted against the earlier run's.
  const run = String(input.agent_id ?? input.agent_transcript_path ?? "");
  const marker = tokensCountedFile(project, d.id);
  const [markRun, markTotal, markAll] = existsSync(marker) ? readFileSync(marker, "utf8").split("|") : [];
  const legacy = markTotal === undefined;
  const before = markRun === undefined ? 0 : legacy ? Number(markRun) || 0 : markRun === run ? Number(markTotal) || 0 : 0;
  const all = markRun === undefined ? 0 : legacy ? Number(markRun) || 0 : Number(markAll) || 0;
  if (total <= before) return null;
  withLock(project, () => {
    const app = loadAppState(project);
    const feature = loadFeature(project, app, d.id.split("/")[0]);
    feature.state.budgets.tokens = (Number(feature.state.budgets.tokens) || 0) + (total - before);
    saveFeature(project, app, feature);
  });
  writeFileSync(marker, `${run}|${total}|${all + total - before}`);
  return { dispatch: d.id, added: total - before };
}

/**
 * Keeps a dispatched agent's valid envelope for `factory record --saved`; returns its file or null.
 * `why` collects the reason when nothing is saved (the hook logs it).
 */
export function saveEnvelope(project, input, actives, maxWords, why = [], message = finalMessage(input)) {
  // Cursor's union ("*") cannot tell which dispatch is speaking: an envelope could claim another's pack_id.
  if (input.agent_type === "*") return why.push("agent type unknown (Cursor union)"), null;
  const candidates = dispatchesFor(input, actives);
  if (!candidates.length) return why.push(`no active dispatch matches agent_type "${input.agent_type ?? ""}" (active: ${actives.map((d) => d.subagent_type).join(", ") || "none"})`), null;
  if (!message.trim()) return why.push("no last_assistant_message and no readable transcript"), null;
  let envelope;
  try {
    envelope = parseEnvelope(message);
  } catch (error) {
    return why.push(`reply has no JSON envelope (${error.message})`), null;
  }
  const d = candidates.find((x) => x.id === envelope?.pack_id);
  if (!d) return why.push(`envelope pack_id "${envelope?.pack_id}" is not one of ${candidates.map((x) => x.id).join(", ")}`), null;
  const errors = checkEnvelope(envelope, { packId: d.id, maxWords });
  if (errors.length) return why.push(`envelope invalid: ${errors.join("; ")}`), null;
  const file = savedEnvelopeFile(project, d.id);
  writeFileSync(`${file}.tmp`, JSON.stringify(envelope));
  renameSync(`${file}.tmp`, file);
  return file;
}

export function subagentStop(input, actives, maxWords) {
  const candidates = dispatchesFor(input, actives);
  if (!candidates.length || input.stop_hook_active) return null;
  let envelope;
  try {
    envelope = parseEnvelope(finalMessage(input));
  } catch (error) {
    return `End your reply with the JSON envelope from your pack (pack_id ${candidates.map((d) => `"${d.id}"`).join(" or ")}): ${error.message}`;
  }
  const d = candidates.find((x) => x.id === envelope?.pack_id) ?? candidates[0];
  const errors = checkEnvelope(envelope, { packId: d.id, maxWords });
  return errors.length ? `Your envelope is invalid — fix it and reply again:\n- ${errors.join("\n- ")}` : null;
}

function sessionStart(input, project, cursor) {
  if (cursor) cursorSessions(input, project);
  registerPack(project, ENGINE_ROOT, input.session_id ?? input.conversation_id ?? "session");
  const data = brief(project);
  if (!data.features.length && input.source !== "compact") return cursor && out({});
  const context = briefMarkdown(data);
  out(cursor ? { additional_context: context } : { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } });
}

// ---- Cursor ------------------------------------------------------------------------------------
const PERMISSION = new Set(["pre-write", "pre-read", "pre-grep", "pre-bash", "subagent-start", "task-start"]);
const RUNNING_TTL_MS = 6 * 3600_000; // a marker older than this is left over from a crash
const runningDir = (project) => join(factoryPaths(project).active, "cursor");
const safeName = (id) => String(id).replace(/[^\w.-]/g, "_");

function putMarker(project, name, entry) {
  const dir = runningDir(project);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${safeName(name)}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(entry));
  renameSync(`${file}.tmp`, file);
}

/** Cursor markers: running subagents { id, type, parent, ts } and the human's chats { main, id, ts }. */
export function cursorMarkers(project) {
  const dir = runningDir(project);
  if (!existsSync(dir)) return [];
  const markers = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    try {
      markers.push({ file: join(dir, f), ...JSON.parse(readFileSync(join(dir, f), "utf8")) });
    } catch {
      // Half-written or foreign file: ignore it.
    }
  }
  return markers.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

/** Subagents started and not yet stopped, minus leftovers: too old, or their dispatch is gone. */
export function runningSubagents(project, actives = activeDispatches(project)) {
  const live = new Set(actives.flatMap((d) => [d.agent, d.subagent_type]));
  return cursorMarkers(project).filter((m) => !m.main && live.has(m.type) && Date.now() - Date.parse(m.ts) < RUNNING_TTL_MS);
}

/** A chat that fired sessionStart is the human's (or the Conductor's), never a dispatched subagent. */
function cursorSessions(input, project) {
  const id = input.conversation_id ?? input.session_id;
  if (id) putMarker(project, `main-${id}`, { main: true, id, ts: new Date().toISOString() });
  for (const m of cursorMarkers(project)) {
    if (Date.now() - Date.parse(m.ts) > (m.main ? 7 * 24 : 6) * 3600_000) rmSync(m.file, { force: true });
  }
}

/**
 * Maps a Cursor hook payload onto the Claude Code fields the rules read, and works out which dispatch
 * the call belongs to. A subagent runs in its own conversation, which fires no sessionStart: the Task
 * call that starts it records a marker (its type and the parent's conversation), and the first unknown
 * conversation to act while exactly one marker is unbound is bound to it. A chat that fired sessionStart
 * or started a subagent is the human's or the Conductor's. Any other call while factory subagents run
 * gets the union of their dispatches (a write is allowed if any allows it, a read denied only if all do).
 */
export function fromCursor(event, input, project, actives) {
  const ti = input.tool_input ?? {};
  const x = { ...input, session_id: input.session_id ?? input.conversation_id };
  if (event === "pre-bash") Object.assign(x, { tool_name: "Bash", tool_input: { command: input.command ?? ti.command } });
  if (event === "pre-read") {
    const globPattern = input.glob_pattern ?? ti.glob_pattern ?? ti.globPattern;
    if (globPattern != null) {
      const dir = input.target_directory ?? ti.target_directory ?? ti.targetDirectory ?? "";
      Object.assign(x, { tool_name: "Glob", tool_input: { path: dir, file_path: dir, glob_pattern: globPattern } });
    } else Object.assign(x, { tool_name: "Read", tool_input: { file_path: input.file_path ?? ti.file_path ?? ti.path } });
  }
  if (event === "pre-grep") Object.assign(x, { tool_name: "Grep", tool_input: { path: ti.path ?? ti.file_path } });
  if (event === "pre-write" || event === "post-write") {
    Object.assign(x, { tool_name: "Write", tool_input: { file_path: input.file_path ?? ti.file_path ?? ti.path ?? ti.target_file ?? ti.filePath } });
  }
  if (event === "subagent-stop") return { input: { ...x, agent_type: input.subagent_type, last_assistant_message: input.summary ?? "" }, actives };
  const markers = cursorMarkers(project);
  const running = runningSubagents(project, actives);
  const own = running.find((r) => r.id && r.id === input.conversation_id);
  if (own) return { input: { ...x, agent_type: own.type }, actives };
  const conductor = markers.some((m) => (m.main && m.id === input.conversation_id) || (m.parent && m.parent === input.conversation_id));
  if (conductor || !running.length) return { input: { ...x, agent_type: undefined }, actives };
  const unbound = running.filter((r) => !r.id);
  if (unbound.length === 1 && input.conversation_id) {
    putMarker(project, basename(unbound[0].file, ".json"), { ...strip(unbound[0]), id: input.conversation_id });
    return { input: { ...x, agent_type: unbound[0].type }, actives };
  }
  const types = new Set(running.map((r) => r.type));
  const mine = actives.filter((d) => types.has(d.agent) || types.has(d.subagent_type));
  return { input: { ...x, agent_type: mine.length ? "*" : undefined }, actives: mine };
}

const strip = ({ file, ...m }) => m;

/** Output of a finished Task call: { status, agentId } (Cursor sends it as a JSON string). */
function taskOutput(input) {
  try {
    return typeof input.tool_output === "string" ? JSON.parse(input.tool_output) : input.tool_output ?? {};
  } catch {
    return {};
  }
}

/**
 * Subagent markers. task-start (preToolUse Task) and subagent-start (where Cursor fires it) record one;
 * task-end (postToolUse Task) removes it by the agentId Cursor reports; stop clears the turn's markers.
 */
function cursorRunning(event, input, project) {
  const now = new Date().toISOString();
  if (event === "task-start") {
    const type = input.tool_input?.subagent_type;
    if (type) putMarker(project, `task-${input.tool_use_id ?? `${Date.now()}-${process.pid}`}`, { id: null, type, parent: input.conversation_id ?? null, tool_use_id: input.tool_use_id ?? null, ts: now });
  } else if (event === "subagent-start") {
    const parent = input.parent_conversation_id ?? input.conversation_id ?? null;
    const open = cursorMarkers(project).find((m) => !m.main && !m.id && m.type === input.subagent_type && m.parent === parent);
    if (open) putMarker(project, basename(open.file, ".json"), { ...strip(open), id: input.subagent_id ?? null });
    else putMarker(project, input.subagent_id ?? `${input.subagent_type}-${Date.now()}-${process.pid}`, { id: input.subagent_id ?? null, type: input.subagent_type, parent, ts: now });
  } else if (event === "task-end") {
    const { agentId } = taskOutput(input);
    const mine = cursorMarkers(project).filter((m) => !m.main);
    const done = mine.find((m) => agentId && m.id === agentId) ?? mine.find((m) => m.tool_use_id && m.tool_use_id === input.tool_use_id);
    if (done) rmSync(done.file, { force: true });
  } else if (event === "stop") {
    // The agent's turn is over: nothing it started is still running.
    for (const r of cursorMarkers(project)) if (!r.main && (!r.parent || r.parent === input.conversation_id)) rmSync(r.file, { force: true });
  }
}

/** The marker of the subagent that stopped: by id when Cursor sends one, else the oldest of its type. */
function stoppedMarker(input, project) {
  const mine = cursorMarkers(project).filter((m) => !m.main && m.type === input.subagent_type);
  return mine.find((m) => m.id && (m.id === input.subagent_id || m.id === input.conversation_id)) ?? mine[0];
}

/** Writes the hook's answer in the harness's format; Cursor permission hooks always answer. */
function answer(event, reason, cursor) {
  if (!cursor) {
    if (!reason) return;
    if (PERMISSION.has(event)) return deny("PreToolUse", reason);
    return out({ decision: "block", reason });
  }
  if (PERMISSION.has(event)) return out(reason ? { permission: "deny", user_message: reason, agent_message: reason } : { permission: "allow" });
  if (event === "post-write") return out(reason ? { additional_context: reason } : {});
  if (event === "subagent-stop") return out(reason ? { followup_message: reason } : {});
  return out({});
}

async function main() {
  const event = process.argv[2];
  const cursor = process.argv.includes("--cursor");
  const raw = JSON.parse(readFileSync(0, "utf8") || "{}");
  const project = (cursor && process.env.CURSOR_PROJECT_DIR) || process.env.CLAUDE_PROJECT_DIR || raw.workspace_roots?.[0] || raw.cwd || process.cwd();
  // Opt-in diagnostics (touch .factory/hook-debug): what the harness really sends, field names only for big values.
  if (existsSync(join(project, ".factory", "hook-debug"))) {
    const brief = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v]));
    mkdirSync(join(project, ".factory", "logs"), { recursive: true });
    appendFileSync(join(project, ".factory", "logs", "hook-payloads.jsonl"), `${JSON.stringify({ ts: new Date().toISOString(), event, cursor, payload: brief })}\n`);
  }
  let actives = activeDispatches(project);
  let input = raw;
  if (cursor) {
    if (["subagent-start", "task-start", "task-end", "stop"].includes(event)) cursorRunning(event, raw, project);
    ({ input, actives } = fromCursor(event, raw, project, actives));
  }
  let reason = null;
  switch (event) {
    case "session-start":
      return sessionStart(input, project, cursor);
    case "pre-write":
      reason = decideWrite(input, project, actives, loadConfig(project));
      break;
    case "pre-read":
      if (cursor && input.tool_name === "Glob" && !input.tool_input?.path && dispatchesFor(input, actives).length) {
        reason = "unscoped Glob is blocked — pass a target_directory from your pack (T2) or a folder it names";
        break;
      }
      reason = decideRead(input, project, actives);
      if (cursor && !reason) logSkillRead(project, input, actives);
      break;
    case "pre-grep":
      if (!input.tool_input?.path && dispatchesFor(input, actives).length) reason = "unscoped Grep is blocked — pass a path from your pack (T2) or a folder it names";
      else reason = input.tool_input?.path ? decideRead(input, project, actives) : null;
      break;
    case "pre-bash":
      reason = decideBash(input, actives, project, loadConfig(project));
      break;
    case "pre-navigate":
      reason = decideNavigate(input, actives);
      break;
    case "post-write":
      reason = postWrite(input, project);
      break;
    case "post-skill":
      logSkill(input, project, actives);
      return;
    case "subagent-stop":
      // Cursor passes a summary, not always the whole reply: check an envelope only when one is there.
      if (!cursor || (raw.status === "completed" && (raw.loop_count ?? 0) < 2 && /```json|"pack_id"/.test(input.last_assistant_message))) {
        reason = subagentStop(input, actives, loadConfig(project).context?.return_summary_max_words);
      }
      {
        const message = finalMessage(input);
        const log = (line) => {
          try {
            mkdirSync(join(project, ".factory", "logs"), { recursive: true });
            appendFileSync(join(project, ".factory", "logs", "hooks.log"), `${new Date().toISOString()} subagent-stop ${line}\n`);
          } catch {
            // Logging is best effort.
          }
        };
        try {
          // Real usage first: the budget must not depend on the Conductor passing --tokens.
          if (!cursor || input.usage) addTokens(project, input, actives, message);
        } catch (error) {
          log(`tokens not counted: ${error.message}`);
        }
        if (!reason) {
          const why = [];
          const maxWords = loadConfig(project).context?.return_summary_max_words;
          try {
            let saved = saveEnvelope(project, input, actives, maxWords, why, message);
            const summaryHasEnvelope = /```json|"pack_id"/.test(input.last_assistant_message ?? "");
            if (!saved && cursor && !summaryHasEnvelope) {
              for (const d of dispatchesFor(input, actives)) {
                const scratch = join(project, ".factory", "scratch", `${activeName(d.id)}.json`);
                if (!existsSync(scratch)) continue;
                const fromScratch = [];
                saved = saveEnvelope(project, input, actives, maxWords, fromScratch, readFileSync(scratch, "utf8"));
                if (saved) break;
                why.push(...fromScratch);
              }
            }
            if (!saved && dispatchesFor(input, actives).length) log(`envelope not saved for ${input.agent_type ?? "?"}: ${why.join("; ")}`);
          } catch (error) {
            // Not saved: the Conductor passes the envelope on stdin instead.
            log(`envelope not saved: ${error.message}`);
          }
        }
      }
      // A subagent asked to fix its envelope keeps running, so it keeps its marker until then.
      if (cursor && !reason) {
        const done = stoppedMarker(raw, project);
        if (done) rmSync(done.file, { force: true });
      }
      break;
  }
  if (existsSync(join(project, ".factory", "hook-debug"))) {
    appendFileSync(join(project, ".factory", "logs", "hook-payloads.jsonl"), `${JSON.stringify({ ts: new Date().toISOString(), event, decision: { agent_type: input.agent_type ?? null, dispatches: actives.map((d) => d.id), reason } })}\n`);
  }
  return answer(event, reason, cursor);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    await main();
  } catch (error) {
    // Fail open; a Cursor permission hook must still answer, or Cursor blocks the action.
    if (process.argv.includes("--cursor") && PERMISSION.has(process.argv[2])) out({ permission: "allow" });
    try {
      const project = (process.argv.includes("--cursor") && process.env.CURSOR_PROJECT_DIR) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
      mkdirSync(join(project, ".factory", "logs"), { recursive: true });
      appendFileSync(join(project, ".factory", "logs", "hooks.log"), `${new Date().toISOString()} ${process.argv[2]} ${error.stack}\n`);
    } catch {
      // Nothing more we can do; fail open.
    }
  }
}
