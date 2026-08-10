---
name: git-workflow
description: Git workflow standards — commit message format, branch naming, atomic commits, PR conventions, and code review etiquette. Use when creating a commit, opening a branch/PR, or leaving code review comments.
---

# Git Workflow

## When to use

- Writing a commit message.
- Naming a new branch.
- Opening or describing a PR.
- Leaving review comments on someone else's PR.

## Commit messages

Use Conventional Commits format: `<type>(<scope>): <summary>`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`

- Summary: imperative mood, lowercase, ≤72 chars, no period.
- Body: explain WHY, not what. Reference issue numbers.

```
feat(auth): add refresh token rotation

Tokens were long-lived (7 days) which is a security risk.
Rotation limits the exposure window to 15 minutes.

Closes #142
```

## Branching model

GitHub Flow with a `develop` integration branch and rebasing, not merge commits, to stay current:

- `develop` is the trunk — always deployable, all feature branches cut from and merged back into it.
- `main` tracks releases only (tagged/promoted from `develop`); never branch feature work from `main`.
- Feature branches: `<ticket-id>-short-description`, cut from latest `develop` — e.g. `fAUTH-142-refresh-rotation`, `CORE-77-null-pointer`.
- While a feature branch is in progress, rebase it on `develop` regularly (`git fetch && git rebase origin/develop`) instead of merging `develop` in — keeps history linear and conflicts small.
- Never rebase a branch others are actively pulling from; never rewrite history already merged into `develop`/`main`.

## Branch naming

`<ticket-id>-short-description` — e.g. `AUTH-142-refresh-rotation`, `CORE-77-null-pointer`.

## Atomic commits

One logical change per commit locally. Don't worry about squashing WIP commits as you go — the entire branch is squashed into a single commit at merge time (see Pull requests below), so intermediate history doesn't need to be clean.

## Pull requests

- Base branch is `develop`, not `main`.
- PR title follows the same Conventional Commits format as the eventual squash-merge commit message.
- Description: what changed, why, how to test, screenshots for UI changes.
- Keep PRs small (< 400 lines diff) — easier to review, faster to merge.
- Link to the related ticket/issue.
- **Merge strategy: squash merge only.** The whole branch collapses into one commit on `develop` — write the PR title/description as if it were that commit's final message, since it becomes one.
- Rebase on `develop` (not merge) to resolve conflicts before merge, keeping the diff clean for review.

## Branch hygiene

- Never commit directly to `develop`/`main`.
- Delete feature branches after they're squash-merged into `develop`.
- Rebase on `develop` before requesting review and again if `develop` moves during review (keep linear history, avoid merge commits).

## Code review etiquette

- Blocking comments: prefix with `[blocking]` — must be resolved before merge.
- Non-blocking suggestions: prefix with `[nit]` or `[suggestion]`.
- Approve only when you would be comfortable shipping the change.
