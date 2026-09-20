# Investigation Protocol

Investigation (station 1a) runs conditionally. It is not part of every feature build — only trigger it when the discovery phase reveals an unfamiliar approach or a capability not covered by existing dependencies.

---

## When to Trigger Investigation

Trigger station 1a when ANY of the following are true:
- The feature requires a library not currently in `package.json`.
- The feature requires a pattern (e.g. virtual scrolling, PDF generation, WebSocket) not present in the codebase.
- The discovery engineer marks a "Tech investigation" section item with `[UNKNOWN]`.
- The API contract references an endpoint or auth pattern with no existing example.

Do NOT trigger for patterns already covered by existing guides (TanStack Query hooks, RHF forms, styled-components, shadcn primitives).

---

## Decision Tree

```
Does this feature require anything outside current deps or established patterns?
  NO → skip station 1a; proceed to plan (station 2)
  YES → does it only need confirmation of existing-dep API (e.g. a TanStack Query option)?
    YES → use context7 to look up the specific API; write finding to spec; no dep approval needed
    NO → full investigation + dep proposal required → station 1b (human approval)
```

---

## context7 MCP Usage

Steps (in order):

1. Call `resolve-library-id` with the library name (e.g. `react-hook-form`, `zod`, `@tanstack/react-query`).
2. Call `query-docs` with the resolved ID and a focused topic (e.g. `useForm validation resolver`).
3. Extract the relevant API details into the spec "Tech Investigation" section.
4. If context7 does not have the library or returns insufficient content, fall back to `WebSearch` with the library name + version + topic.

Always record the source URL and version in the spec so the finding is reproducible.

---

## Follow-Up Question Protocol

Do **not** call `AskUserQuestion`. Batch remaining gaps as strings on a `CLARIFY_PACKET` (intake)
or as `errors[]` on a `DEP_PACKET` / `ESCALATION_PACKET` (station 1a). The `feature-dev` skill
asks the human and writes answers into `## Clarifications`.

---

## Dependency Policy (Hard Gate)

Every new package requires human approval at station 1b before any `yarn add` is run. This is a hard gate — no exceptions.

Agents propose packages; they never install them.

Red flags that block adoption (escalate to human with warning):
- Last published > 18 months ago and no stated maintenance status
- Known CVE in the version range proposed
- License incompatible with the project (GPL, AGPL for commercial use)
- Bundle size > 50 kB gzipped with no tree-shaking support
- Requires a native/WASM binary with no web fallback

---

## Dependency Proposal Template

Write this table into the spec `## Dependencies` section for each proposed package:

```markdown
| Field | Value |
|-------|-------|
| Package | `zod` |
| Version | `^3.23.0` |
| Purpose | Schema-based form validation with RHF resolver |
| Bundle size | ~13 kB gzipped |
| License | MIT |
| Last publish | 2025-03 |
| Alternatives considered | `yup` (larger), `valibot` (smaller but less ecosystem) |
| Red flags | None |
| Install command | `yarn add zod` |
| Status | **awaiting-human-approval** |
```

Update the `Status` field to `approved` or `rejected` once the human responds. Only after `approved` may any engineer run `yarn add`.
