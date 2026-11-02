// Cartographer: a deterministic map of the app for planning and reuse checks, one adapter per stack
// (stack.yaml index_adapter), run in each enabled role's folder:
// - fsd: every slice (layer/slice with a public index.ts), what it exports, how often others import it;
// - express-layered: every routes/controllers/services/repositories/schemas/db-schema/middleware/lib
//   module, its exports and importers, and the endpoints a routes file declares;
// - langgraph: the express layers plus agents/<name> (graph, state, nodes, tools, prompts), llm/ and rag/.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { factoryPaths, listFiles, now, readText, toPosix, writeYaml } from "./core.mjs";
import { enabledRoles } from "./config.mjs";
import { validate } from "./schemas.mjs";
import { rolePath } from "./tasks.mjs";

const FSD_LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];

function fsdComponents(projectDir) {
  const src = join(projectDir, "src");
  if (!existsSync(src)) return [];
  const files = listFiles(src).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
  const sources = files.map((f) => readText(join(src, f)));
  const out = [];
  for (const layer of FSD_LAYERS.filter((l) => existsSync(join(src, l)))) {
    // shared/ui/<component> slices sit one level deeper than the other layers' slices.
    const groups = layer === "shared" ? readdirSync(join(src, layer)).map((g) => `${layer}/${g}`) : [layer];
    for (const group of groups) {
      if (!statSync(join(src, group)).isDirectory()) continue;
      for (const slice of readdirSync(join(src, group))) {
        const index = join(src, group, slice, "index.ts");
        if (!existsSync(index)) continue;
        const text = readText(index);
        const exports = [...text.matchAll(/export\s+(?:\{([^}]+)\}|(?:const|function|class|type|interface)\s+(\w+))/g)]
          .flatMap((m) => (m[1] ? m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()) : [m[2]]))
          .filter(Boolean);
        const importPath = `${group}/${slice}`;
        const used_by = sources.filter((s, i) => !files[i].startsWith(`${importPath}/`) && (s.includes(`@/${importPath}"`) || s.includes(`@/${importPath}'`))).length;
        out.push({ name: slice, path: `src/${importPath}`, layer, slice, exports, used_by });
      }
    }
  }
  return out;
}

const EXPORTS = /export\s+(?:async\s+)?(?:const|let|function|class|type|interface|enum)\s+(\w+)|export\s+\{([^}]+)\}/g;
const exportsOf = (text) =>
  [...text.matchAll(EXPORTS)].flatMap((m) => (m[2] ? m[2].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()) : [m[1]])).filter((x) => x && x !== "type");

/** Modules of the given folders under src/: exports and how many other modules import them. */
function moduleComponents(projectDir, prefix, layers) {
  const src = join(projectDir, "src");
  if (!existsSync(src)) return [];
  const files = listFiles(src).filter((f) => /\.(ts|mts)$/.test(f) && !/\.(test|spec)\.ts$/.test(f) && !f.endsWith(".d.ts"));
  const texts = new Map(files.map((f) => [f, readText(join(src, f))]));
  const out = [];
  for (const [layer, folder] of layers) {
    for (const f of files.filter((x) => x.startsWith(`${folder}/`) && !x.slice(folder.length + 1).includes("/"))) {
      const stem = basename(f).replace(/\.(ts|mts)$/, "");
      if (stem === "index" && layer !== "agent") continue;
      const importers = files.filter((g) => g !== f && new RegExp(`['"][^'"]*/${stem.replace(/[.]/g, "\\.")}(\\.js)?['"]`).test(texts.get(g))).length;
      const endpoints = layer === "route" ? [...texts.get(f).matchAll(/\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`) : [];
      out.push({
        name: stem.replace(/\.(routes|controller|service|repository|schema|middleware)$/, ""),
        path: toPosix(join(prefix, "src", f)), layer, slice: folder,
        exports: exportsOf(texts.get(f)), used_by: importers,
        ...(endpoints.length ? { endpoints } : {}),
      });
    }
  }
  return out;
}

const EXPRESS_LAYERS = [["route", "routes"], ["controller", "controllers"], ["service", "services"], ["repository", "repositories"], ["schema", "schemas"], ["db-schema", "db/schema"], ["middleware", "middleware"], ["lib", "lib"]];

function expressComponents(projectDir, prefix) {
  return moduleComponents(projectDir, prefix, EXPRESS_LAYERS);
}

/** LangGraph agent services: the HTTP layers plus each agent folder and its graph parts. */
function langgraphComponents(projectDir, prefix) {
  const agentsDir = join(projectDir, "src", "agents");
  const agentLayers = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter((a) => statSync(join(agentsDir, a)).isDirectory()).flatMap((a) => [["agent", `agents/${a}`], ["node", `agents/${a}/nodes`], ["tool", `agents/${a}/tools`]])
    : [];
  return moduleComponents(projectDir, prefix, [...EXPRESS_LAYERS, ["llm", "llm"], ["rag", "rag"], ["memory", "memory"], ["guardrail", "guardrails"], ...agentLayers]);
}

const ADAPTERS = { fsd: (dir) => fsdComponents(dir), "express-layered": expressComponents, langgraph: langgraphComponents };

export function buildIndex(projectDir, config, packs) {
  const components = [];
  const adapters = [];
  const seen = new Set();
  for (const role of enabledRoles(config)) {
    const adapter = packs[role.stack]?.stack?.index_adapter;
    const prefix = rolePath(config, role.name);
    if (!ADAPTERS[adapter] || seen.has(`${adapter}@${prefix}`)) continue;
    seen.add(`${adapter}@${prefix}`);
    if (!adapters.includes(adapter)) adapters.push(adapter);
    const found = ADAPTERS[adapter](join(projectDir, prefix), prefix);
    // FSD paths are project-relative from the role folder too.
    components.push(...(adapter === "fsd" && prefix ? found.map((x) => ({ ...x, path: `${prefix}/${x.path}` })) : found));
  }
  let sha = null;
  try {
    sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Not a git repo or no commit yet.
  }
  const inventory = { generated_by: `cartographer (${adapters.join(", ") || "no adapter"})`, index_sha: sha, generated_at: now(), components };
  const errors = validate("component-inventory", inventory);
  if (errors.length) throw new Error(`component inventory would be invalid: ${errors.join("; ")}`);
  writeYaml(join(factoryPaths(projectDir).root, "_index", "component-inventory.yaml"), inventory);
  return { adapters, components: components.length, index_sha: sha };
}
