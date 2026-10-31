// Cartographer v1: a deterministic map of the app for planning and reuse checks. The FSD adapter
// lists every slice (layer/slice with a public index.ts), what it exports, and how often other code
// imports it. Express and LangGraph adapters arrive with their role packs.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { factoryPaths, listFiles, now, readText, writeYaml } from "./core.mjs";
import { enabledRoles } from "./config.mjs";
import { validate } from "./schemas.mjs";

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

const ADAPTERS = { fsd: fsdComponents };

export function buildIndex(projectDir, config, packs) {
  const components = [];
  const adapters = [];
  for (const role of enabledRoles(config)) {
    const adapter = packs[role.stack]?.stack?.index_adapter;
    if (ADAPTERS[adapter] && !adapters.includes(adapter)) {
      adapters.push(adapter);
      components.push(...ADAPTERS[adapter](projectDir));
    }
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
