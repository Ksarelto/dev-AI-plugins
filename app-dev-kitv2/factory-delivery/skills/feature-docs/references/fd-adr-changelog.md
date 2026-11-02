# ADR promotion and the CHANGELOG entry

## Promoting ADRs

The feature's decisions live in `.factory/features/<FEAT>/03-architecture/adr-NNN-<slug>.md`
(front matter `id`, `title`, `status`, `feature`, `supersedes?`; schema `adr.schema.json`). The
application's decision log is `docs/adr/`. gate-docs fails when the text of `docs/adr/*.md` does not
contain each feature ADR's `id`.

1. For each feature ADR, write `docs/adr/<same file name>` (for example `adr-001-discount-in-total.md`).
   If a file with that name exists and belongs to another feature's ADR with another ID (the IDs
   are per app, so this means a clash), keep the existing file and name the new one after its ID
   and slug; say so in the docs report.
2. Content: replace the front matter with a heading and a status line a reader understands:

   ```markdown
   # ADR-001 — The discount is part of the order total
   Status: accepted · Feature: FEAT-001 · Date: <date of this run>

   ## Context
   …copied unchanged…
   ## Decision
   …copied unchanged…
   ## Consequences
   …copied unchanged…
   ```

3. Never change the decision, the context or the consequences. Typos stay; meaning is not yours.
4. `supersedes: ADR-00n`: add `Supersedes: [ADR-00n](<its file>)` under the status line, and in the
   superseded file's status line append `· Superseded by [ADR-00m](<new file>)` — the only edit you
   make to an older ADR.
5. `status: proposed` (never accepted at GATE-B): promote it as `Status: proposed` and list it in the
   docs report as an open decision.
6. If `docs/adr/` has an index (`README.md` or `index.md` listing ADRs) and T0 lets you write it,
   add one line per new ADR in its existing format.

## The CHANGELOG entry

gate-docs fails when `CHANGELOG.md` does not contain the feature ID.

- Format: [Keep a Changelog](https://keepachangelog.com) when the file already follows it; otherwise
  match the file's existing style. Create the file with `# Changelog` and `## Unreleased` when
  missing.
- Add the entry under the top `## Unreleased` heading (create it above the latest release when
  missing), in the right group when the file uses groups:

  | Feature shape | Group |
  |---|---|
  | new capability (greenfield, brownfield extend) | `### Added` |
  | change request modifying behaviour | `### Changed` |
  | delta-spec `removed` REQs | `### Removed` (one line per removed capability) |
  | a fix-only feature (patch tier) | `### Fixed` |
  | security-relevant change (auth, permissions) | `### Security` as well |

- One line per user-visible change, in the user's words, ending with the feature ID:
  `- Customers can apply one coupon per order at checkout (FEAT-001)`.
- Do not list tasks, files or internal refactors; do not edit released sections.

## The docs report — `08-delivery/docs-report.md`

```markdown
# Docs report — FEAT-001

## Written
- docs/features/FEAT-001-coupons-at-checkout.md (new | updated)
- docs/adr/adr-001-discount-in-total.md (promoted)
- CHANGELOG.md (entry under Unreleased → Added)

## Not documented, and why
- <anything the artifacts did not let you document, with the reason>

## Needs a human
- <stale OpenAPI export, a README section you could not write, a proposed ADR, an ADR file clash>
```

The release manager reads this file for the PR's Docs section and open items, so every file you
wrote is listed exactly once with its path.
