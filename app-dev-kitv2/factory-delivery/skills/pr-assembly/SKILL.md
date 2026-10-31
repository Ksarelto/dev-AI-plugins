---
name: pr-assembly
description: Procedure for the factory release manager — assemble the PR description (the pull-request body) with summary, a spec trace row per acceptance criterion, open findings and provenance, from the template. Preloaded by the release-manager; not for direct use.
user-invocable: false
---

# PR body

Write `08-delivery/pr.md` from [fd-pr-body.md](../../templates/fd-pr-body.md). The first heading is
the PR title. Required sections (the ready gate checks them): `## Summary`, `## Spec trace`,
`## Docs`, `## Provenance`.

- **Spec trace:** one row per AC of the spec — AC, story, task, planned tests, result. Take results
  from the gates' records, not from memory.
  Add one row per REQ in the delta-spec's `removed` too (REQ, removing task, result).
- **Review and QA:** list P2/P3 findings and S3+ defects that remain, so the human sees them.
- **Human notes:** each `HD-n` and where it landed.
- **Provenance:** dispatches, models used, tokens and wall-clock from the feature's state and events.

Keep it reviewable: facts and links, no marketing. Run the exit check from T0 before you return.
