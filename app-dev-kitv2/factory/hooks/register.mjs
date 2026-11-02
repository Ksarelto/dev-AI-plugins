// TEMPLATE: copied into every factory pack as hooks/register.mjs by scripts/build-factory.mjs.
// SessionStart hook: records this plugin's root in <project>/.factory/.registry/<name>.json so the
// engine can find the pack's manifests. Runs only in projects that use the factory (.factory/ exists).
// Dependency-free on purpose: packs ship no node_modules.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The plugin root is where this file lives (<pack>/hooks/): Cursor can set CURSOR_PLUGIN_ROOT to
// another plugin when several are loaded.
const project = process.env.CLAUDE_PROJECT_DIR || process.env.CURSOR_PROJECT_DIR || process.cwd();
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const factory = join(project, ".factory");
if (!root || !existsSync(factory)) process.exit(0);

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  // No or invalid stdin (e.g. run by hand): register without a session id.
}

const manifest = [".claude-plugin", ".cursor-plugin"].map((d) => join(root, d, "plugin.json")).find(existsSync);
if (!manifest) process.exit(0);
const plugin = JSON.parse(readFileSync(manifest, "utf8"));
const entry = {
  name: plugin.name,
  version: plugin.version ?? "0.0.0",
  root,
  session_id: input.session_id ?? input.conversation_id ?? "manual",
  ts: new Date().toISOString(),
};
const dir = join(factory, ".registry");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${plugin.name}.json`);
writeFileSync(`${file}.tmp`, `${JSON.stringify(entry, null, 2)}\n`);
renameSync(`${file}.tmp`, file);
