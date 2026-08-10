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

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: node scripts/install-cursor-local.mjs [--dry-run] [--uninstall]

Symlink each kit from this repo into ~/.cursor/plugins/local/<plugin-name>
so Cursor can load skills, rules, agents, commands, and MCP servers.

Options:
  --dry-run     Print actions without changing the filesystem
  --uninstall   Remove symlinks created for kits listed in the marketplace
  --help        Show this help
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
const plugins = marketplace.plugins ?? [];

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

function installOne(entry) {
  const target = resolve(root, entry.source);
  const link = linkPath(entry.name);

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

let ok = true;

if (!uninstall) {
  ensureLocalRoot();
}

for (const entry of plugins) {
  const passed = uninstall ? uninstallOne(entry) : installOne(entry);
  ok = passed && ok;
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
  console.log("MCP secrets (set in your shell / environment as needed):");
  console.log("  CONTEXT7_API_KEY, GITLAB_PERSONAL_ACCESS_TOKEN, GITLAB_API_URL,");
  console.log("  JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN,");
  console.log("  CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_API_TOKEN");
}
