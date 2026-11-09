import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const uninstall = args.has("--uninstall");

const syncSource = args.has("--sync-source");

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: node scripts/install-cursor-local.mjs [--dry-run] [--uninstall] [--sync-source]

Symlink each kit from this repo into ~/.cursor/plugins/local/<plugin-name>
so Cursor can load skills, rules, agents, commands, and MCP servers.

Cursor only loads symlinks whose target stays inside ~/.cursor/plugins/local
(see cursor.com/docs/plugins — Test plugins locally). This script keeps a
mirror of the repo at ~/.cursor/plugins/local/.source-repo and links each
plugin into that mirror. The mirror refreshes when it is missing or a
marketplace plugin is absent from it.

Options:
  --dry-run       Print actions without changing the filesystem
  --uninstall     Remove plugin symlinks listed in the marketplace
  --sync-source   Refresh .source-repo from this checkout (run after kit edits;
                  a missing marketplace plugin refreshes the mirror anyway)
  --help          Show this help
`);
  process.exit(0);
}

const marketplacePath = join(root, ".cursor-plugin", "marketplace.json");
if (!existsSync(marketplacePath)) {
  console.error(`Missing ${marketplacePath}`);
  process.exit(1);
}

const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));

const localRoot = join(homedir(), ".cursor", "plugins", "local");
/** Mirror of the marketplace repo; symlink targets must live under localRoot. */
const sourceMirror = join(localRoot, ".source-repo");
const plugins = marketplace.plugins ?? [];

function pluginRelSource(entry) {
  return entry.source.replace(/^\.\//, "");
}

function pluginTarget(entry) {
  return resolve(sourceMirror, pluginRelSource(entry));
}

function isInsideLocal(absPath) {
  const base = localRoot.endsWith("/") ? localRoot : `${localRoot}/`;
  return absPath === localRoot || absPath.startsWith(base);
}

if (!plugins.length) {
  console.error("No plugins listed in .cursor-plugin/marketplace.json");
  process.exit(1);
}

function ensureLocalRoot() {
  if (dryRun) {
    console.log(`[dry-run] mkdir -p ${localRoot}`);
    return;
  }
  mkdirSync(localRoot, { recursive: true });
}

function linkPath(name) {
  return join(localRoot, name);
}

function mirrorMissingPlugin() {
  return plugins.some((entry) => !existsSync(pluginTarget(entry)));
}

function ensureSourceMirror() {
  const marker = join(sourceMirror, ".cursor-plugin", "marketplace.json");
  const needsCopy = syncSource || !existsSync(marker) || mirrorMissingPlugin();
  if (!needsCopy) {
    console.log(`OK: source mirror present at ${sourceMirror}`);
    return true;
  }

  if (dryRun) {
    console.log(`[dry-run] sync repo → ${sourceMirror}`);
    return true;
  }

  mkdirSync(localRoot, { recursive: true });
  const rsync = spawnSync(
    "rsync",
    [
      "-a",
      "--delete",
      "--exclude",
      "node_modules",
      "--exclude",
      ".git",
      `${root}/`,
      `${sourceMirror}/`,
    ],
    { stdio: "inherit" },
  );
  if (rsync.status === 0) {
    console.log(`OK: synced source mirror → ${sourceMirror}`);
    return true;
  }

  console.warn("WARN: rsync failed; falling back to cp -cR (macOS APFS clone when available)");
  const cp = spawnSync("cp", ["-cR", root, sourceMirror], { stdio: "inherit" });
  if (cp.status !== 0) {
    console.error(`FAIL: could not populate ${sourceMirror}`);
    return false;
  }
  console.log(`OK: copied source mirror → ${sourceMirror}`);
  return true;
}

function installOne(entry) {
  const target = pluginTarget(entry);
  const link = linkPath(entry.name);

  if (!isInsideLocal(target)) {
    console.error(`FAIL: ${entry.name} target would be outside local plugins root`);
    return false;
  }

  if (!existsSync(target)) {
    console.error(`FAIL: source missing for ${entry.name}: ${entry.source}`);
    return false;
  }

  if (!existsSync(join(target, ".cursor-plugin", "plugin.json"))) {
    console.error(`FAIL: missing .cursor-plugin/plugin.json for ${entry.name}`);
    return false;
  }

  if (existsSync(link) || isSymlink(link)) {
    if (!isSymlink(link)) {
      console.error(`FAIL: ${link} exists and is not a symlink; refusing to overwrite`);
      return false;
    }
    const current = resolve(dirname(link), readlinkSync(link));
    if (current === target) {
      console.log(`OK: ${entry.name} already linked → ${target}`);
      return true;
    }
    if (dryRun) {
      console.log(`[dry-run] relink ${link} → ${target} (was ${current})`);
      return true;
    }
    unlinkSync(link);
  }

  if (dryRun) {
    console.log(`[dry-run] ln -s ${target} ${link}`);
    return true;
  }

  symlinkSync(target, link);
  console.log(`OK: linked ${entry.name} → ${target}`);
  return true;
}

function uninstallOne(entry) {
  const link = linkPath(entry.name);
  if (!existsSync(link) && !isSymlink(link)) {
    console.log(`SKIP: ${entry.name} not installed`);
    return true;
  }
  if (!isSymlink(link)) {
    console.error(`FAIL: ${link} exists and is not a symlink; refusing to remove`);
    return false;
  }
  if (dryRun) {
    console.log(`[dry-run] rm ${link}`);
    return true;
  }
  unlinkSync(link);
  console.log(`OK: removed ${link}`);
  return true;
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function installYaml(entry) {
  const target = pluginTarget(entry);
  const pkgPath = join(target, "package.json");
  if (!existsSync(pkgPath)) return true;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!pkg.dependencies?.yaml) return true;
  if (dryRun) {
    console.log(`[dry-run] npm install --omit=dev in ${target}`);
    return true;
  }
  const result = spawnSync("npm", ["install", "--omit=dev"], {
    cwd: target,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`FAIL: npm install --omit=dev in ${target}`);
    return false;
  }
  console.log(`OK: yaml installed in ${entry.name}`);
  return true;
}

let ok = true;

if (!uninstall) {
  ensureLocalRoot();
  if (!ensureSourceMirror()) {
    process.exit(1);
  }
  if (dryRun) {
    console.log(`[dry-run] generate cursor-agents/ into ${sourceMirror}`);
  } else {
    const generated = spawnSync(process.execPath, [join(root, "scripts", "build-cursor-agents.mjs"), "--out", sourceMirror], { stdio: "inherit" });
    if (generated.status !== 0) process.exit(generated.status ?? 1);
  }
}

for (const entry of plugins) {
  const passed = uninstall ? uninstallOne(entry) : installOne(entry);
  const deps = passed && !uninstall ? installYaml(entry) : true;
  ok = passed && deps && ok;
}

if (!ok) {
  process.exit(1);
}

console.log("");
if (uninstall) {
  console.log(dryRun ? "Dry-run uninstall complete." : "Local Cursor plugins uninstalled.");
} else {
  console.log(dryRun ? "Dry-run install complete." : "Local Cursor plugins installed.");
  console.log("");
  console.log("Next steps:");
  console.log("  1. In Cursor Settings, enable third-party Plugins / Skills if prompted.");
  console.log('  2. Run "Developer: Reload Window" (or restart Cursor).');
  console.log("  3. Confirm kits appear under Customize → Plugins.");
  console.log("");
  console.log("After editing kits in this repo, re-run with --sync-source, then reload Cursor.");
  console.log("");
  console.log("MCP secrets (set in your shell / environment as needed):");
  console.log("  CONTEXT7_API_KEY, GITLAB_PERSONAL_ACCESS_TOKEN, GITLAB_API_URL,");
  console.log("  JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN,");
  console.log("  CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_API_TOKEN");
}
