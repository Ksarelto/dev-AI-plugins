// Forked skills (`context: fork` in SKILL.md) run as a separate agent that the factory's per-dispatch write scope does
// not bind, so no agent or skill of app-dev-kitv2 may tell a dispatched agent to load one. Shared by
// scripts/check-factory-consistency.mjs and the unit tests.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", "vendor", "cursor-agents"]);

function walk(dir, keep) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, keep) : keep(full) ? [full] : [];
  });
}

const isFork = (file) => /^---\n[\s\S]*?\n---/.exec(readFileSync(file, "utf8"))?.[0].split("\n").some((l) => /^context:\s*fork\s*$/.test(l)) ?? false;

/** Every skill of every plugin folder under `root` (top level, and one level down for families): { plugin, skill, fork }. */
export function allSkills(root) {
  const plugins = [];
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (SKIP.has(name) || !statSync(dir).isDirectory()) continue;
    if (existsSync(join(dir, "skills"))) plugins.push([name, dir]);
    for (const sub of readdirSync(dir)) {
      const subDir = join(dir, sub);
      if (!SKIP.has(sub) && statSync(subDir).isDirectory() && existsSync(join(subDir, "skills"))) plugins.push([sub, subDir]);
    }
  }
  return plugins.flatMap(([plugin, dir]) =>
    readdirSync(join(dir, "skills"))
      .filter((s) => existsSync(join(dir, "skills", s, "SKILL.md")))
      .map((skill) => ({ plugin, skill, fork: isFork(join(dir, "skills", skill, "SKILL.md")) })),
  );
}

/**
 * Agent and skill texts of app-dev-kitv2 (agents/, skills/ incl. references) that name a forked skill as `plugin:skill`
 * (or as a bare `skill` when no non-forked skill has that name). A line that says why (mentions "fork") is fine.
 */
export function findForkedLoads(root) {
  const skills = allSkills(root);
  // The engine's own /factory:* commands run in the human's session (doctor is forked on purpose); only skills an agent could be told to load count.
  const forked = skills.filter((s) => s.fork && s.plugin !== "factory");
  const plainNames = new Set(skills.filter((s) => !s.fork).map((s) => s.skill));
  const family = join(root, "app-dev-kitv2");
  const files = walk(family, (f) => f.endsWith(".md") && /\/(agents|skills)\//.test(f));
  const hits = [];
  for (const file of files) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (/\bfork/i.test(line)) return;
      for (const { plugin, skill } of forked) {
        const qualified = new RegExp(`\\b${plugin}:${skill}\\b`).test(line);
        const bare = !plainNames.has(skill) && new RegExp(`\`${skill}\``).test(line);
        if (qualified || bare) hits.push({ file: relative(root, file), line: i + 1, skill: `${plugin}:${skill}` });
      }
    });
  }
  return hits;
}
