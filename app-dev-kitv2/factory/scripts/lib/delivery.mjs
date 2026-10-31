// Delivery: executes the release manager's commit plan on a feature branch, opens the PR through the
// configured adapter (dry-run by default: the command is recorded, never run), and records delivered
// features in the ledger.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { factoryPaths, now, readText, readYaml, toPosix, writeJson, writeYaml } from "./core.mjs";

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The feature branch, from policy.branch_pattern; never the default branch, never an option-like name. */
export function branchName(c) {
  const pattern = c.config.policy?.branch_pattern ?? "factory/{feature}-{slug}";
  const name = pattern.replace("{feature}", c.feature.state.feature).replace("{slug}", c.feature.state.slug);
  const base = c.config.project?.default_branch ?? "main";
  const valid = !name.startsWith("-") && spawnSync("git", ["check-ref-format", "--branch", name], { cwd: c.projectDir }).status === 0;
  if (!valid || name === base) throw new Error(`policy.branch_pattern gives "${name}", which is ${valid ? "the default branch" : "not a valid branch name"}`);
  return name;
}

/** Commits the plan, then the feature's .factory artifacts; returns { branch, commits, pr }. */
export function ship(c) {
  const s = c.feature.state;
  const cwd = c.projectDir;
  const plan = readYaml(join(c.feature.dir, "08-delivery", "commits.yaml"));
  const branch = branchName(c);
  const current = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8" }).stdout.trim();
  if (current !== branch) {
    const exists = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd }).status === 0;
    git(cwd, exists ? ["checkout", branch] : ["checkout", "-b", branch]);
  }
  const commits = [];
  // Each commit takes only its own paths (`commit -- <paths>`): anything else the user staged stays staged.
  for (const commit of plan.commits) {
    git(cwd, ["add", "--all", "--", ...commit.files]);
    if (spawnSync("git", ["diff", "--cached", "--quiet", "--", ...commit.files], { cwd }).status === 0) continue; // already committed
    git(cwd, ["commit", "--quiet", "-m", commit.message, "--", ...commit.files]);
    commits.push({ sha: git(cwd, ["rev-parse", "--short", "HEAD"]), message: commit.message.split("\n")[0], task: commit.task ?? null });
  }
  // The feature's .factory record, without the task snapshots (copies of source files at red).
  const featureRel = toPosix(relative(cwd, c.feature.dir));
  const artifacts = [featureRel, ".factory/context", ".factory/app-profile.yaml", ".factory/_index", ".factory/ledger"].filter((p) => existsSync(join(cwd, p)));
  const paths = [...artifacts, `:(exclude)${featureRel}/snapshots`];
  git(cwd, ["add", "--all", "--", ...paths]);
  if (spawnSync("git", ["diff", "--cached", "--quiet", "--", ...paths], { cwd }).status !== 0) {
    git(cwd, ["commit", "--quiet", "-m", `chore(factory): ${s.feature} artifacts\n\nFactory-Feature: ${s.feature}`, "--", ...paths]);
    commits.push({ sha: git(cwd, ["rev-parse", "--short", "HEAD"]), message: `chore(factory): ${s.feature} artifacts`, task: null });
  }
  const shipFile = join(c.feature.dir, "08-delivery", "ship.json");
  const opened = existsSync(shipFile) && JSON.parse(readText(shipFile)).pr?.opened === true;
  const pr = openPr(c, branch, opened);
  const result = { branch, commits, pr, at: now() };
  s.branch = branch;
  writeJson(shipFile, result);
  return result;
}

/** Pushes and opens the PR; on a re-ship after a rejected GATE-C the PR exists, so it only pushes. */
function openPr(c, branch, alreadyOpened) {
  const s = c.feature.state;
  const adapterName = c.config.delivery?.adapter;
  const adapter = c.packs[adapterName]?.adapter;
  if (!adapter?.operations?.open_pr) return { opened: false, reason: `adapter "${adapterName}" with an open_pr operation is not installed` };
  const body = join(c.feature.dir, "08-delivery", "pr.md");
  const title = /^#\s+(.+)$/m.exec(readText(body))?.[1] ?? `feat: ${s.title} (${s.feature})`;
  const vars = { title, body, base: c.config.project?.default_branch ?? "main", head: branch, draft: c.config.delivery?.draft_pr === false ? "" : "--draft" };
  const argvOf = (op) => (adapter.operations[op] ?? []).flatMap((a) => (a === "{draft}" ? (vars.draft ? [vars.draft] : []) : [a.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "")]));
  const commands = (alreadyOpened ? ["push"] : ["push", "open_pr"]).filter((op) => adapter.operations[op]).map(argvOf);
  if (c.config.delivery?.dry_run !== false) return { opened: false, dry_run: true, commands };
  let output = "";
  for (const argv of commands) {
    const r = spawnSync(argv[0], argv.slice(1), { cwd: c.projectDir, encoding: "utf8" });
    output += `${r.stdout}${r.stderr}`;
    if (r.status !== 0) return { opened: false, dry_run: false, commands, failed: argv.slice(0, 3).join(" "), output: output.trim().slice(0, 500) };
  }
  return { opened: true, dry_run: false, commands, output: output.trim().slice(0, 500), ...(alreadyOpened ? { updated: true } : {}) };
}

/** Records a finished feature in the ledger (new entry, or a new version of a changed one). */
export function recordInLedger(c, tasks) {
  const s = c.feature.state;
  const file = join(factoryPaths(c.projectDir).root, "ledger", "feature-ledger.yaml");
  const ledger = existsSync(file) ? readYaml(file) : { features: [] };
  const shipFile = join(c.feature.dir, "08-delivery", "ship.json");
  const pr = existsSync(shipFile) ? JSON.parse(readText(shipFile)).pr : null;
  const paths = [...new Set((tasks ?? []).flatMap((t) => t.files_expected))];
  const existing = ledger.features.find((f) => f.id === s.feature);
  const entry = {
    id: s.feature, name: s.title, status: s.mode === "change-request" ? "changed" : "delivered",
    version: (existing?.version ?? 0) + 1, paths, pr: pr ? (pr.dry_run ? "dry-run" : String(pr.output ?? "")) : "none",
  };
  ledger.features = [...ledger.features.filter((f) => f.id !== s.feature), entry];
  writeYaml(file, ledger);
  return entry;
}
