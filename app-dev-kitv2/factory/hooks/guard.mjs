// Factory enforcement hooks (Suggestions/09). One entry point, dispatched by the event argument:
//   session-start · pre-write · pre-read · pre-bash · post-write · subagent-start · subagent-stop · stop
// hooks.json short-circuits outside factory projects, so this only runs where .factory/state.json exists.
// Rules apply to subagents the Conductor dispatched (matched by agent_type); a bug here fails open and
// is logged to .factory/logs/hooks.log rather than blocking the session.
// `--cursor` (hooks/cursor-hooks.json): Cursor's hook shapes are mapped onto the same rules. Its tool
// calls carry no agent type, so subagent-start records which conversation is which subagent.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_ROOT, factoryPaths, matchesAny, toPosix } from "../scripts/lib/core.mjs";
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

/** A path is unreadable only when every dispatch the call may belong to denies it. */
const readDenied = (candidates, target) => candidates.every((d) => matchesAny(target, d.read_deny ?? []));

export function decideRead(input, project, actives) {
  const candidates = dispatchesFor(input, actives);
  const [d] = candidates;
  if (!d) return null;
  const tool = input.tool_name;
  const target = relPath(project, input.tool_input?.file_path ?? input.tool_input?.path);
  if (tool !== "Read" && (!target || target === "" || target === ".")) {
    return `unscoped ${tool} is blocked — pass a path from your pack (T2) or a folder it names`;
  }
  if (target && readDenied(candidates, target)) return `${target} is not readable for ${d.agent} (black-box role)`;
  // With the Cursor union ("*") no single dispatch owns the read, so no budget is charged.
  if (tool === "Read" && target && input.agent_type !== "*" && !matchesAny(target, FREE_READS)) {
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

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const VALUED = new Set(["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "-F", "--form", "-o", "--output", "-O", "-u", "--user", "-A", "--user-agent", "-e", "--referer", "-w", "--write-out", "-T", "--upload-file", "-m", "--max-time", "--connect-timeout", "-b", "--cookie", "-c", "--cookie-jar", "--header", "-P", "--directory-prefix", "--post-data", "--method", "--body-data", "-t", "--tries", "-T", "--timeout"]);

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

function sessionStart(input, project, cursor) {
  if (cursor) cursorSessions(input, project);
  registerPack(project, ENGINE_ROOT, input.session_id ?? input.conversation_id ?? "session");
  const data = brief(project);
  if (!data.features.length && input.source !== "compact") return cursor && out({});
  const context = briefMarkdown(data);
  out(cursor ? { additional_context: context } : { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } });
}

// ---- Cursor ------------------------------------------------------------------------------------
const PERMISSION = new Set(["pre-write", "pre-read", "pre-grep", "pre-bash", "subagent-start"]);
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
 * the call belongs to: a subagent's own conversation id (recorded at subagent-start) names it exactly;
 * a chat that started a subagent or fired sessionStart is the Conductor or the human; any other call
 * while factory subagents run gets the union of their dispatches (a write is allowed if any allows
 * it, a read denied only if all deny it).
 */
export function fromCursor(event, input, project, actives) {
  const ti = input.tool_input ?? {};
  const x = { ...input, session_id: input.session_id ?? input.conversation_id };
  if (event === "pre-bash") Object.assign(x, { tool_name: "Bash", tool_input: { command: input.command ?? ti.command } });
  if (event === "pre-read") Object.assign(x, { tool_name: "Read", tool_input: { file_path: input.file_path ?? ti.file_path ?? ti.path } });
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
  const types = new Set(running.map((r) => r.type));
  const mine = actives.filter((d) => types.has(d.agent) || types.has(d.subagent_type));
  return { input: { ...x, agent_type: mine.length ? "*" : undefined }, actives: mine };
}

/** subagent-start records a marker; stop clears the turn's markers (subagent-stop: see main). */
function cursorRunning(event, input, project) {
  if (event === "subagent-start") {
    const name = input.subagent_id ?? `${input.subagent_type}-${Date.now()}-${process.pid}`;
    putMarker(project, name, { id: input.subagent_id ?? null, type: input.subagent_type, parent: input.parent_conversation_id ?? input.conversation_id ?? null, ts: new Date().toISOString() });
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
  let actives = activeDispatches(project);
  let input = raw;
  if (cursor) {
    if (["subagent-start", "stop"].includes(event)) cursorRunning(event, raw, project);
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
      reason = decideRead(input, project, actives);
      break;
    case "pre-grep":
      // Cursor's Grep path field is undocumented: without one, only read_deny on a known path applies.
      reason = input.tool_input?.path ? decideRead(input, project, actives) : null;
      break;
    case "pre-bash":
      reason = decideBash(input, actives, project, loadConfig(project));
      break;
    case "post-write":
      reason = postWrite(input, project);
      break;
    case "subagent-stop":
      // Cursor passes a summary, not always the whole reply: check an envelope only when one is there.
      if (!cursor || (raw.status === "completed" && (raw.loop_count ?? 0) < 2 && /```json|"pack_id"/.test(input.last_assistant_message))) {
        reason = subagentStop(input, actives, loadConfig(project).context?.return_summary_max_words);
      }
      // A subagent asked to fix its envelope keeps running, so it keeps its marker until then.
      if (cursor && !reason) {
        const done = stoppedMarker(raw, project);
        if (done) rmSync(done.file, { force: true });
      }
      break;
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
