---
name: investigate-dependency
description: Given a capability need, resolve the library via context7, fetch version-accurate docs, and summarize integration approach + risks (bundle size, license, maintenance, alternatives). Emits a dependency proposal for human approval. NEVER runs yarn add.
argument-hint: <capability-or-package-name>
disable-model-invocation: false
allowed-tools: [Read, Grep, Glob, WebSearch, WebFetch]
---

# Investigate Dependency

## When to use

Station 1a (conditional). Invoke when Context Discovery flags an unfamiliar approach or a capability not covered by current dependencies. Used by `research-analyst`. Also use for confirming specific API usage in existing packages when documentation is unclear.

## Steps

1. **Clarify the capability need**: read the spec's FSD Impact, UI Surface, and API Contract sections to understand exactly what the library must provide. Write a one-sentence capability statement (e.g. "A client-side schema validation library that integrates with React Hook Form via a resolver").

2. **Resolve the library via context7 MCP**: call `resolve-library-id` with the library name. If context7 cannot resolve it, note the fallback and proceed to step 4.

3. **Fetch docs via context7 MCP**: call `query-docs` with the resolved ID and a focused topic (e.g. `zod resolver react-hook-form`). Read the integration pattern, required peer dependencies, and any version-specific breaking changes. Record the source URL and library version.

4. **Fallback (if context7 unavailable)**: use `WebSearch` with query `<library> <version> <topic> site:docs.npmjs.com OR site:github.com`. Use `WebFetch` to read the specific documentation page. Document the fallback in the spec.

5. **Research at least one alternative**: find the next most-commonly-used library solving the same capability. Compare both on: minified+gzipped bundle size (check bundlephobia.com), license (only permissive: MIT, Apache-2.0, BSD), last npm publish date, weekly downloads, CVE count. Prefer the library with fewer red flags.

6. **Write findings to spec `## Tech Investigation`**: structured prose covering: chosen library name + version, why it was selected over alternatives, integration pattern (code snippet if helpful), peer dependencies required, and any migration notes.

7. **Write dependency proposals to spec `## Dependencies`**: one proposal table per required new package (see `references/investigation-protocol.md` for the exact table format). Set `Status` to `awaiting-human-approval` for each.

8. **Remaining ambiguities**: write them under `## Decisions & Open Questions`. Do **not** call
   `AskUserQuestion`. The orchestrator / skill turns them into a packet if needed.

9. **Stop**: do not install anything. Do not proceed to planning. The orchestrator waits for human approval at checkpoint 1b.

## Pre-conditions

- The `investigation-needed` flag is set to `true` in the spec with a specific capability reason.
- The spec's `## Request` and `## Acceptance Criteria` are complete.

## Outputs

- `## Tech Investigation` section in the spec: research findings, chosen approach, rationale.
- `## Dependencies` section in the spec: one proposal table per new package, all with `Status: awaiting-human-approval`.
- Any new Q&A entries in `## Clarifications`.

## What this skill does NOT do

- Does not run `yarn add` or modify `package.json`.
- Does not make the final decision on which library to use — it presents findings for human review.
- Does not install peer dependencies.
- Does not approve or reject its own proposals.
