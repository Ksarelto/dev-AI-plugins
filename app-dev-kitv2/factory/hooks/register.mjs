// TEMPLATE: copied into every factory pack as hooks/register.mjs by scripts/build-factory.mjs.
// SessionStart hook: records this plugin's root in <project>/.factory/.registry/<name>.json so the
// engine can find the pack's manifests. Runs only in projects that use the factory (.factory/ exists).
// Dependency-free on purpose: packs ship no node_modules.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const root = process.env.CLAUDE_PLUGIN_ROOT;
const factory = join(project, ".factory");
if (!root || !existsSync(factory)) process.exit(0);

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  // No or invalid stdin (e.g. run by hand): register without a session id.
}

const plugin = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8"));
const entry = {
  name: plugin.name,
  version: plugin.version ?? "0.0.0",
  root,
  session_id: input.session_id ?? "manual",
  ts: new Date().toISOString(),
};
const dir = join(factory, ".registry");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${plugin.name}.json`);
writeFileSync(`${file}.tmp`, `${JSON.stringify(entry, null, 2)}\n`);
renameSync(`${file}.tmp`, file);
