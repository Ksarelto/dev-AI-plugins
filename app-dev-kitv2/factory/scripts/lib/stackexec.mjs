// Stack executor: runs a stack.yaml command (typecheck, lint, test, …) for a role in the project.
// Commands name package scripts ({script, args}), package binaries ({exec, args}) or raw argv; the
// package manager and a Node version satisfying the stack's range are resolved here, once.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
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
  // A role in a sub-package (roles.<role>.path) runs its commands there; logs stay in the project's .factory.
  const cwd = role.path ? join(c.projectDir, role.path) : c.projectDir;
  if (role.path && !existsSync(cwd)) return { error: `role ${roleName}: its folder roles.${roleName}.path "${role.path}" does not exist (set path: "." for a role at the project root)` };
  return { role: roleName, name: role.stack, stack, cwd, projectDir: c.projectDir };
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
  const more = vars.extra ?? []; // engine-added arguments, e.g. the stack's test_scoped_args
  if (Array.isArray(cmd)) return [...args(cmd), ...more];
  if (cmd.script) {
    const extra = [...args(cmd.args), ...more];
    // npm needs `--` before arguments meant for the script; pnpm and yarn forward them as they are.
    return pm === "npm" ? ["npm", "run", cmd.script, ...(extra.length ? ["--", ...extra] : [])] : [pm, "run", cmd.script, ...extra];
  }
  if (cmd.exec) {
    const extra = [...args(cmd.args), ...more];
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

/** argv, environment and log path for one command; null argv when the stack does not define it. */
function prepare(resolved, name, { vars = {}, logName } = {}) {
  const argv = buildArgv(resolved.stack, name, { ...vars, cwd: resolved.cwd });
  if (!argv) return null;
  const logs = factoryPaths(resolved.projectDir ?? resolved.cwd).logs;
  mkdirSync(logs, { recursive: true }); // reports and logs land here; create it before the command runs
  const nodeBin = nodeBinFor(resolved.stack.node_version);
  // No colour: jest-dom and vitest wrap messages in ANSI codes that break the red gate's failure matching.
  const env = { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" };
  if (nodeBin) env.PATH = `${nodeBin}${delimiter}${env.PATH}`;
  // With shell: true (Windows, for pnpm.cmd/npm.cmd) Node joins argv unquoted; quote what needs it.
  const winArgs = (list) => list.map((a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a));
  const isWin = process.platform === "win32";
  return {
    argv,
    file: isWin ? winArgs([argv[0]])[0] : argv[0],
    args: isWin ? winArgs(argv.slice(1)) : argv.slice(1),
    options: { cwd: resolved.cwd, env, shell: isWin },
    log: join(logs, `${logName ?? name}.log`),
  };
}

/** Writes the log and returns { ok, code, argv, tail, log, name } with project-relative paths in the tail. */
function finish(resolved, name, p, status, output) {
  writeFileSync(p.log, `$ ${p.argv.join(" ")}\n${output}`);
  // Project-relative paths keep failure messages short and fingerprints stable across checkouts.
  // Longest first: /var/… is a suffix of /private/var/… on macOS.
  const base = resolved.projectDir ?? resolved.cwd;
  const prefixes = [...new Set([base, realpathSync(base)])]
    .flatMap((x) => [`${x}/`, `${x}\\`])
    .sort((x, y) => y.length - x.length);
  const tail = output
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !/^\s*>/.test(l) && !/ELIFECYCLE/.test(l))
    .slice(-15)
    .map((l) => prefixes.reduce((line, x) => line.replaceAll(x, ""), l))
    .join("\n");
  return { ok: status === 0, code: status ?? -1, argv: p.argv, tail, log: p.log, name };
}

/**
 * Runs one stack command. Output goes to .factory/logs/<logName>.log, never to the caller in full.
 * @returns { ok, skipped?, code, argv, tail, log }
 */
export function runStackCommand(resolved, name, { vars = {}, logName, timeoutMs = 10 * 60_000 } = {}) {
  const p = prepare(resolved, name, { vars, logName });
  if (!p) return { ok: true, skipped: true, name };
  const r = spawnSync(p.file, p.args, { ...p.options, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return finish(resolved, name, p, r.status, `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? `\n${r.error.message}` : ""}`);
}

/** runStackCommand without blocking, so a gate can run independent commands side by side. */
export function runStackCommandAsync(resolved, name, { vars = {}, logName, timeoutMs = 10 * 60_000 } = {}) {
  const p = prepare(resolved, name, { vars, logName });
  if (!p) return Promise.resolve({ ok: true, skipped: true, name });
  return new Promise((done) => {
    let output = "";
    let settled = false;
    const timers = [];
    // Its own process group (not on Windows), so a timeout ends npm → sh → eslint/vitest workers too.
    const group = process.platform !== "win32";
    const child = spawn(p.file, p.args, { ...p.options, detached: group });
    const kill = (signal) => {
      try {
        if (group) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // Already gone.
      }
    };
    const settle = (code) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      done(finish(resolved, name, p, code, output));
    };
    timers.push(
      setTimeout(() => {
        output += `\ntimed out after ${timeoutMs} ms`;
        kill("SIGTERM");
        timers.push(setTimeout(() => kill("SIGKILL"), 5_000));
      }, timeoutMs),
    );
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (output += b));
    child.on("error", (error) => {
      output += `\n${error.message}`;
      settle(-1);
    });
    // "close" waits for every process holding the pipes; a leftover grandchild must not hold the gate.
    child.on("exit", (code) => {
      timers.push(setTimeout(() => {
        kill("SIGKILL");
        settle(code);
      }, 2_000));
    });
    child.on("close", (code) => settle(code));
  });
}

/** Runs async jobs with at most `limit` at a time; results in input order. */
export async function inPool(jobs, limit = 4) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, jobs.length)) }, worker));
  return results;
}

/** The text of a {script} command in the role's package.json ("" when it is not a package script). */
export function scriptText(resolved, name) {
  const cmd = resolved.stack.commands?.[name];
  const file = join(resolved.cwd, "package.json");
  if (!cmd?.script || !existsSync(file)) return "";
  try {
    return JSON.parse(readFileSync(file, "utf8")).scripts?.[cmd.script] ?? "";
  } catch {
    return "";
  }
}

/**
 * Commands a task gate can leave out because another one already covers them: an architecture check
 * that the lint script runs too (eslint && depcruise), and the production build (a task gate does not
 * build; verification does). quality.impl_build: true keeps the build in task gates.
 */
export function coveredCommands(resolved, config = {}) {
  const covered = new Set();
  const arch = resolved.stack.commands?.architecture_check;
  const archBin = arch?.exec ?? (Array.isArray(arch) ? arch[0] : null) ?? (arch?.script ? scriptText(resolved, "architecture_check").split(/\s/)[0] : null);
  if (archBin && new RegExp(`(^|[\\s;&|/])${archBin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(scriptText(resolved, "lint"))) covered.add("architecture_check");
  if (config.quality?.impl_build !== true) covered.add("build");
  return covered;
}

/**
 * Arguments that make a plain `tsc` typecheck incremental (its build info lives in .factory/cache, per
 * role), or [] when the command is anything else — a script chain, `tsc -b`, one that already sets it.
 */
export function incrementalTscArgs(resolved) {
  const cmd = resolved.stack.commands?.typecheck;
  const text = cmd?.script ? scriptText(resolved, "typecheck") : Array.isArray(cmd) ? cmd.join(" ") : cmd?.exec ? `${cmd.exec} ${(cmd.args ?? []).join(" ")}` : "";
  if (!/^\s*(npx\s+)?tsc(\s|$)/.test(text) || /&&|\|\||;|\s(-b|--build|--incremental|--tsBuildInfoFile|--composite)(\s|=|$)/.test(text)) return [];
  const cache = join(factoryPaths(resolved.projectDir ?? resolved.cwd).root, "cache");
  mkdirSync(cache, { recursive: true });
  return ["--incremental", "--tsBuildInfoFile", join(cache, `tsbuildinfo-${resolved.role ?? "app"}`)];
}
