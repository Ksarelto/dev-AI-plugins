// Layered configuration: defaults → org → project → feature overrides, merged key by key.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ENGINE_ROOT, deepMerge, factoryPaths, getPath, isPlainObject, readYaml } from "./core.mjs";

export function configLayers(projectDir, featureDir) {
  const layers = [
    { name: "defaults", path: join(ENGINE_ROOT, "defaults.yaml") },
    { name: "org", path: process.env.FACTORY_ORG_CONFIG ?? join(homedir(), ".factory", "org.yaml") },
    { name: "project", path: factoryPaths(projectDir).config },
  ];
  if (featureDir) layers.push({ name: "feature", path: join(featureDir, "overrides.yaml") });
  return layers
    .filter((l) => existsSync(l.path))
    .map((l) => ({ ...l, data: readYaml(l.path) }));
}

export function loadConfig(projectDir, featureDir) {
  return configLayers(projectDir, featureDir).reduce((acc, layer) => deepMerge(acc, layer.data), {});
}

/** For `factory config explain`: the merged value plus which layer last set each leaf key. */
export function explainConfig(projectDir, key, featureDir) {
  const layers = configLayers(projectDir, featureDir);
  const origins = {};
  const walk = (obj, prefix, layer) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (isPlainObject(v) && Object.keys(v).length) walk(v, path, layer);
      else origins[path] = layer;
    }
  };
  for (const layer of layers) walk(layer.data, "", layer.name);
  const merged = layers.reduce((acc, layer) => deepMerge(acc, layer.data), {});
  const value = key ? getPath(merged, key) : merged;
  const set_by = Object.fromEntries(
    Object.entries(origins).filter(([path]) => !key || path === key || path.startsWith(`${key}.`)),
  );
  return { key: key ?? null, value, set_by, layers: layers.map((l) => ({ name: l.name, path: l.path })) };
}

export function profileStages(config, profile) {
  const name = profile ?? config.pipeline?.profile ?? "standard";
  const stages = config.pipeline?.profiles?.[name];
  if (!Array.isArray(stages)) throw new Error(`pipeline profile "${name}" is not defined`);
  return stages;
}

/** The profile a new feature runs: by tier (patch) first, then by entry mode, then the default. */
export function profileFor(config, { mode, tier } = {}) {
  const p = config.pipeline ?? {};
  return p.tier_profiles?.[tier] ?? p.mode_profiles?.[mode] ?? p.profile ?? "standard";
}

export function enabledRoles(config) {
  return Object.entries(config.roles ?? {})
    .filter(([, role]) => role?.enabled)
    .map(([name, role]) => ({ name, ...role }));
}
