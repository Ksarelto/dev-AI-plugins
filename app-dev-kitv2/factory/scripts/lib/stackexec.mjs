// Stack executor: runs a stack.yaml command (typecheck, lint, test, …) for a role in the project.
// Commands name package scripts ({script, args}), package binaries ({exec, args}) or raw argv; the
// package manager and a Node version satisfying the stack's range are resolved here, once.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { deepMerge, factoryPaths, satisfiesRange } from "./core.mjs";

/** The stack a role builds with: the stack pack's stack.yaml merged with roles.<role>.stack_overrides. */
export function resolveStack(c, roleName) {
  const role = c.config.roles?.[roleName];
  if (!role) return { error: `role "${roleName}" is not configured` };
  const base = c.packs[role.stack]?.stack;
  if (!base) return { error: `stack pack "${role.stack}" for role ${roleName} is not installed` };
  const overrides = role.stack_overrides ?? {};
  const stack = deepMerge(base, overrides);
  // A command override replaces the whole command: {script} and {exec} must never mix.
  stack.commands = { ...base.commands, ...(overrides.commands ?? {}) };
  return { role: roleName, name: role.stack, stack, cwd: c.projectDir };
}

const expand = (arg, vars) => {
  if (arg === "{files}") return vars.files ?? [];
  return [arg.replaceAll("{report}", vars.report ?? "").replaceAll("{cwd}", vars.cwd ?? "")];
};

/** argv for one stack command, or null when the stack does not define it. */
export function buildArgv(stack, name, vars = {}) {
  const cmd = stack.commands?.[name];
  if (!cmd) return null;
  const pm = stack.package_manager ?? "npm";
  const args = (list) => (list ?? []).flatMap((a) => expand(a, vars));
  if (Array.isArray(cmd)) return args(cmd);
  if (cmd.script) {
    const extra = args(cmd.args);
    // npm needs `--` before arguments meant for the script; pnpm and yarn forward them as they are.
    return pm === "npm" ? ["npm", "run", cmd.script, ...(extra.length ? ["--", ...extra] : [])] : [pm, "run", cmd.script, ...extra];
  }
  if (cmd.exec) {
    const extra = args(cmd.args);
    if (pm === "npm") return ["npx", "--no-install", cmd.exec, ...extra];
    return pm === "pnpm" ? ["pnpm", "exec", cmd.exec, ...extra] : ["yarn", cmd.exec, ...extra];
  }
  return null;
}

/** A node binary directory satisfying the range: the current node, FACTORY_NODE_BIN, or an nvm install. */
export function nodeBinFor(range) {
  if (!range || satisfiesRange(process.versions.node, range)) return null;
  if (process.env.FACTORY_NODE_BIN) return process.env.FACTORY_NODE_BIN;
  const nvm = process.env.NVM_HOME ?? join(process.env.NVM_DIR ?? join(homedir(), ".nvm"), "versions", "node");
  if (!existsSync(nvm)) return null;
  const candidates = readdirSync(nvm)
    .filter((v) => satisfiesRange(v.replace(/^v/, ""), range))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!candidates.length) return null;
  const dir = join(nvm, candidates[0]);
  return existsSync(join(dir, "bin")) ? join(dir, "bin") : dir; // nvm-windows keeps node.exe at the top level
}

/**
 * Runs one stack command. Output goes to .factory/logs/<logName>.log, never to the caller in full.
 * @returns { ok, skipped?, code, argv, tail, log }
 */
export function runStackCommand(resolved, name, { vars = {}, logName, timeoutMs = 10 * 60_000 } = {}) {
  const argv = buildArgv(resolved.stack, name, { ...vars, cwd: resolved.cwd });
  if (!argv) return { ok: true, skipped: true, name };
  const logs = factoryPaths(resolved.cwd).logs;
  mkdirSync(logs, { recursive: true }); // reports and logs land here; create it before the command runs
  const nodeBin = nodeBinFor(resolved.stack.node_version);
  const env = { ...process.env, CI: "1", FORCE_COLOR: "0" };
  if (nodeBin) env.PATH = `${nodeBin}${delimiter}${env.PATH}`;
  // With shell: true (Windows, for pnpm.cmd/npm.cmd) Node joins argv unquoted; quote what needs it.
  const winArgs = (list) => list.map((a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a));
  const isWin = process.platform === "win32";
  const r = spawnSync(argv[0], isWin ? winArgs(argv.slice(1)) : argv.slice(1), {
    cwd: resolved.cwd,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    shell: isWin,
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? `\n${r.error.message}` : ""}`;
  const log = join(logs, `${logName ?? name}.log`);
  writeFileSync(log, `$ ${argv.join(" ")}\n${output}`);
  // Project-relative paths keep failure messages short and fingerprints stable across checkouts.
  // Longest first: /var/… is a suffix of /private/var/… on macOS.
  const prefixes = [...new Set([resolved.cwd, realpathSync(resolved.cwd)])]
    .flatMap((p) => [`${p}/`, `${p}\\`])
    .sort((x, y) => y.length - x.length);
  const tail = output
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !/^\s*>/.test(l) && !/ELIFECYCLE/.test(l))
    .slice(-15)
    .map((l) => prefixes.reduce((line, p) => line.replaceAll(p, ""), l))
    .join("\n");
  return { ok: r.status === 0, code: r.status ?? -1, argv, tail, log, name };
}
