// A task's base ref: what the working tree looked like when the task's first dispatch started, so a
// task gate can lint and test only what the task changed since then (vitest --changed <ref>, eslint
// <changed files>) instead of everything the feature changed so far (nothing is committed before delivery).
//
// The ref is a COMMIT OBJECT built from a throw-away copy of the index (GIT_INDEX_FILE): `git add -A` on
// the copy, `write-tree`, `commit-tree` on top of HEAD. It touches no branch, no ref, no worktree file and
// not the user's own index; the unreachable commit stays in the object store until git's normal pruning
// (two weeks), far longer than a feature run. Files under .factory/ and ignored files are not part of it.
// Outside a git repository there is no base ref: callers fall back to the unscoped run.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { toPosix } from "./core.mjs";

const run = (cwd, args, env = {}) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
const PATHSPEC = [".", ":(exclude).factory"];

/** A tree of the working tree (tracked changes and untracked files, minus .factory/ and ignored files), or null. */
function worktreeTree(projectDir) {
  const inside = run(projectDir, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0) return null;
  const tmp = mkdtempSync(join(tmpdir(), "factory-index-"));
  const index = join(tmp, "index");
  try {
    const real = run(projectDir, ["rev-parse", "--git-path", "index"]).stdout.trim();
    const realFile = isAbsolute(real) ? real : join(projectDir, real);
    if (existsSync(realFile)) copyFileSync(realFile, index); // keeps git's stat cache: only changed files are hashed
    const env = { GIT_INDEX_FILE: index };
    if (run(projectDir, ["add", "-A", "--", ...PATHSPEC], env).status !== 0) {
      // A project that git-ignores .factory/ makes the exclude pathspec an error ("paths are ignored"): add everything git
      // does not ignore, then drop .factory/ from the copy of the index.
      if (run(projectDir, ["add", "-A", "--", "."], env).status !== 0) return null;
      run(projectDir, ["rm", "-r", "--cached", "-q", "--ignore-unmatch", "--", ".factory"], env);
    }
    const tree = run(projectDir, ["write-tree"], env);
    return tree.status === 0 ? tree.stdout.trim() : null;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Records the base ref: the SHA of a commit object holding the working tree now, or null (not a git repo). */
export function recordBaseRef(projectDir) {
  const tree = worktreeTree(projectDir);
  if (!tree) return null;
  const head = run(projectDir, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const identity = { GIT_AUTHOR_NAME: "factory", GIT_AUTHOR_EMAIL: "factory@invalid", GIT_COMMITTER_NAME: "factory", GIT_COMMITTER_EMAIL: "factory@invalid" };
  const commit = run(projectDir, ["commit-tree", tree, ...(head.status === 0 ? ["-p", head.stdout.trim()] : []), "-m", "factory task base"], identity);
  return commit.status === 0 ? commit.stdout.trim() : null;
}

/** Whether the base ref still exists in the object store (git pruned it, or it is from another clone). */
export const baseRefValid = (projectDir, ref) => Boolean(ref) && run(projectDir, ["cat-file", "-e", `${ref}^{commit}`]).status === 0;

/** Files (posix, relative to projectDir) that differ between the base ref and the working tree now; null when unknown. */
export function changedSinceBase(projectDir, ref) {
  if (!baseRefValid(projectDir, ref)) return null;
  const tree = worktreeTree(projectDir);
  if (!tree) return null;
  const diff = run(projectDir, ["diff", "--name-only", "--no-renames", "--relative", "-z", ref, tree]);
  return diff.status === 0 ? diff.stdout.split("\0").filter(Boolean).map(toPosix) : null;
}
