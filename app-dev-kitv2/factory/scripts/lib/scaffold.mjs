// Greenfield A0 Bootstrap, engine half (`factory scaffold`): every enabled role with a boilerplate
// pointer gets that starter copied into its folder (roles.<role>.path) and its dependencies installed,
// so the task gates have a real project to typecheck, lint, test and build.
//
// A pointer is { repo, ref?, path? }: repo is a local folder (its git-tracked files are copied), a git
// URL (cloned at ref), or the name of the marketplace that holds the role's stack pack
// (dev-AI-plugins → <checkout>/<path>). Runs outside the state lock — installs take minutes — and is
// resumable: per-role markers in .factory/.scaffold/ record what is copied and installed. It never
// overwrites: a folder that already holds an app is left alone, and any clash is reported.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { enabledRoles } from "./config.mjs";
import { factoryPaths, readJson, writeJson } from "./core.mjs";
import { resolveStack, runStackCommand } from "./stackexec.mjs";

const SKIP = new Set(["node_modules", ".git", ".factory", ".claude", "dist", "coverage", ".env"]);
const GIT_URL = /^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/;
const SHA = /^[0-9a-f]{7,40}$/i;
const INSTALL = { npm: ["npm", "ci"], pnpm: ["pnpm", "install", "--frozen-lockfile"], yarn: ["yarn", "install", "--frozen-lockfile"] };
const inside = (base, p) => {
  const r = relative(base, p);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

function git(args, opts = {}) {
  return spawnSync("git", args, { encoding: "utf8", timeout: 5 * 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, ...opts });
}

/** The starter folder, or { error }; `cleanup` removes a temporary clone. */
function sourceFor(c, role, bp) {
  if (GIT_URL.test(bp.repo)) {
    const tmp = mkdtempSync(join(tmpdir(), "factory-boilerplate-"));
    const cleanup = () => rmSync(tmp, { recursive: true, force: true });
    const pinned = bp.ref && SHA.test(bp.ref);
    let r = git(["clone", "--quiet", ...(pinned ? [] : ["--depth", "1", ...(bp.ref ? ["--branch", bp.ref] : [])]), bp.repo, tmp]);
    if (r.status === 0 && pinned) r = git(["-C", tmp, "checkout", "--quiet", bp.ref]);
    if (r.status !== 0) {
      cleanup();
      return { error: `git clone ${bp.repo}${bp.ref ? `@${bp.ref}` : ""} failed: ${(r.stderr || r.error?.message || "timed out").trim().split("\n")[0]}` };
    }
    const dir = join(tmp, bp.path ?? ".");
    if (!inside(tmp, dir)) return cleanup(), { error: `boilerplate path "${bp.path}" leaves the repository` };
    return { dir, cleanup, tracked: false };
  }
  // The marketplace checkout itself (a local clone, --plugin-dir or a symlinked Cursor install).
  const checkout = c.packs[role.stack]?.root ? dirname(c.packs[role.stack].root) : null;
  const market = checkout && existsSync(join(checkout, ".claude-plugin", "marketplace.json")) ? readJson(join(checkout, ".claude-plugin", "marketplace.json")).name : null;
  const base = market === bp.repo ? checkout : isAbsolute(bp.repo) ? bp.repo : resolve(c.projectDir, bp.repo);
  if (!existsSync(base)) {
    return { error: `boilerplate repo "${bp.repo}" is neither a folder nor a git URL here (an installed plugin has no checkout next to it) — set roles.${role.name}.boilerplate.repo to a git URL or a folder` };
  }
  const dir = join(base, bp.path ?? ".");
  if (!inside(base, dir)) return { error: `boilerplate path "${bp.path}" leaves ${bp.repo}` };
  return { dir, tracked: true };
}

/** Relative paths to copy: git-tracked and unignored files of a local work tree, else every file. */
function filesOf(dir, tracked) {
  if (tracked) {
    const r = git(["-C", dir, "ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
    if (r.status === 0) return r.stdout.split("\0").filter((f) => f && !f.split("/").some((p) => SKIP.has(p)) && existsSync(join(dir, f)));
  }
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(dir, rel))) {
      if (SKIP.has(name)) continue;
      const p = rel ? `${rel}/${name}` : name;
      if (statSync(join(dir, p)).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk("");
  return out;
}

function copyStarter(src, into, tracked) {
  const files = filesOf(src, tracked);
  if (!files.includes("package.json")) return `${src} has no package.json`;
  const clashes = [...new Set(files.map((f) => f.split("/")[0]))].filter((top) => existsSync(join(into, top)));
  if (clashes.length) return `the folder already has ${clashes.slice(0, 5).join(", ")}${clashes.length > 5 ? ", …" : ""} — the starter would overwrite them; move them or give the role its own path`;
  for (const f of files) {
    mkdirSync(dirname(join(into, f)), { recursive: true });
    cpSync(join(src, f), join(into, f), { force: false, errorOnExist: true });
  }
  return null;
}

/** Copies and installs each role's starter; returns { done: [...], skipped: [...], error? }. */
export function scaffoldRoles(c) {
  const done = [];
  const skipped = [];
  const markers = join(factoryPaths(c.projectDir).root, ".scaffold");
  for (const role of enabledRoles(c.config)) {
    const bp = role.boilerplate;
    const into = resolve(c.projectDir, role.path ?? ".");
    if (!inside(c.projectDir, into)) return { done, skipped, error: `role ${role.name}: roles.${role.name}.path "${role.path}" leaves the project` };
    if (!bp?.repo) {
      skipped.push({ role: role.name, reason: "no boilerplate pointer" });
      continue;
    }
    const markerFile = join(markers, `${role.name}.json`);
    const marker = existsSync(markerFile) ? readJson(markerFile) : {};
    if (!marker.copied) {
      if (existsSync(join(into, "package.json"))) {
        skipped.push({ role: role.name, reason: `${role.path ?? "."} already holds an app` });
        continue;
      }
      const src = sourceFor(c, role, bp);
      if (src.error) return { done, skipped, error: `role ${role.name}: ${src.error}` };
      let clash;
      try {
        mkdirSync(into, { recursive: true });
        clash = copyStarter(src.dir, into, src.tracked);
      } finally {
        src.cleanup?.();
      }
      if (clash) return { done, skipped, error: `role ${role.name}: ${clash}` };
      Object.assign(marker, { copied: true, from: `${bp.repo}${bp.path ? `/${bp.path}` : ""}${bp.ref ? `@${bp.ref}` : ""}` });
      writeJson(markerFile, marker);
    }
    if (!marker.installed) {
      // Dependencies come from the starter's lockfile; a stack (or a project) may override the command.
      const stack = resolveStack(c, role.name);
      if (stack.error) return { done, skipped, error: stack.error };
      const commands = { install: INSTALL[stack.stack.package_manager ?? "npm"], ...stack.stack.commands };
      const install = runStackCommand({ ...stack, stack: { ...stack.stack, commands } }, "install", { logName: `bootstrap-${role.name}-install`, timeoutMs: 20 * 60_000 });
      if (!install.ok) return { done, skipped, error: `role ${role.name}: dependency install failed (run factory scaffold again to retry) — ${install.tail}` };
      marker.installed = true;
      writeJson(markerFile, marker);
    }
    done.push({ role: role.name, from: marker.from, into: role.path ?? "." });
  }
  return { done, skipped };
}
