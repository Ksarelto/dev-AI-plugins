# Context budget — html-generator-kit

Payload contracts for `html-orchestrator`. Paths and slices, not blobs.

## Rules

1. The orchestrator receives `SPEC_FILE` (a path), never `SPEC_CONTENT` (the spec body).
2. Only `delta-pages.mjs` reads the spec file (→ `spec-summary.json`). No agent sees the full spec.
3. Persist on disk (`OUTPUT_DIR`). The next station reads the file, not a pasted report, except
   the compact contracts listed below (they exist *so* workers do not open the CSS/JS).
4. Compact contracts (pass as text because they *are* the slice):
   - `design-system-ref.md` (~95 lines)
   - `component-manifest.md` (~40 lines)
   - `ux-directives.md` — `## All pages` + `## Do not` in the shared block; the page-type section
     as the per-page `ux_page_section`
5. **Shared text first, per-page text last.** A fan-out station (Station 4) sends one block that is
   byte-identical in every spawn, then the per-page block. The host serves a repeated leading prefix
   from cache, so N pages pay for the shared block once instead of N times. Two things break it and
   both look harmless: reordering the fields, and "helpfully" trimming the shared block per page.
   Keep the shared block byte-identical even where part of it does not apply to a given page.
6. `rules_dir` is `{KIT_DIR}/skills/generate-html/references/` — never
   `.spec/html-generator-kit/…`.
7. Review/revise cycles pass `CHANGE_REQUEST` + `pages[]` ids/titles/domains, not the spec again.

8. Cross-kit: write `{dirname(SPEC_FILE)}/html-kit-result.json` and return that path. Never paste
   HTML, CSS, or the spec body back to `orchestrate-frontend` or `orchestrate-app`.

If a spawn prompt would include the spec markdown, stop and pass `SPEC_FILE` instead.
