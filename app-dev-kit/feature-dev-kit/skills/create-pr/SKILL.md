---
name: create-pr
description: HUMAN-ONLY ship command. Run after the human approved the feature at station 12. Verifies gates are green, rebases over develop, force-with-lease pushes, and opens a PR via gh with a body templated from the feature spec. Never auto-triggers.
argument-hint: "[feature-slug]"
disable-model-invocation: true
allowed-tools: [Bash, Read]
---

# Create PR

## When to use

Only after a human sets the spec status to `done` at station 12 (human approval). No agent may invoke this skill — `disable-model-invocation: true` enforces this. This is the hard boundary between "built" and "shipped". The human runs it manually.

## Steps

1. **Verify pre-conditions** — refuse if either check fails:
   - Read the spec file: `status` must be `done`. If status is anything else, print an error and stop.
   - Confirm all gates are green: the spec's `## Gate Log` must show PASS for all gates in the most recent entry.

2. **Rebase over `develop`**:
   ```bash
   git fetch origin develop
   git rebase origin/develop
   ```
   If rebase conflicts exist, stop and report them — do not force-resolve conflicts.

3. **Push with `--force-with-lease`**:
   ```bash
   git push --force-with-lease origin <branch>
   ```
   Never use `--force` without `--lease`.

4. **Build the PR body** from the spec file:
   - `## Summary`: 2–3 sentences from the spec `## Request` section.
   - `## Acceptance Criteria`: verbatim numbered list from the spec.
   - `## FSD Impact`: the table from the spec `## FSD Impact` section.
   - `## Test Plan`: one checkbox per acceptance criterion (manual verification step) plus "All quality gates pass (typecheck, lint, fsd-boundaries, build, coverage, auto-review)".
   - `## Spec`: link to `.spec/features/<slug>.md`.

5. **Create the PR via `gh`**:
   ```bash
   gh pr create \
     --title "[<TICKET>] <feature description>" \
     --body "$(cat <<'EOF'
   ## Summary
   <from spec>

   ## Acceptance Criteria
   <from spec>

   ## FSD Impact
   <from spec>

   ## Test Plan
   - [ ] All quality gates pass
   - [ ] <AC-based manual steps>

   ## Spec
   .spec/features/<slug>.md

   🤖 Generated with Claude Code
   EOF
   )" \
     --base develop
   ```

6. **Return the PR URL** so the human can open it immediately.

## Pre-conditions

- Spec status is `done` (human approved at station 12).
- All quality gates pass (verified in spec `## Gate Log`).
- No uncommitted changes on the branch.
- `gh` CLI is authenticated and the remote is reachable.

## Outputs

- Branch rebased over `develop` and pushed.
- Pull request opened against `develop` with the body templated from the spec.
- PR URL returned.

## What this skill does NOT do

- Does not bypass the pre-condition check — if gates are not green or spec is not `done`, it refuses.
- Does not resolve rebase conflicts — it stops and reports them.
- Does not merge the PR — that is a separate human action.
- Does not trigger after the automated pipeline completes — it is always manually invoked.
