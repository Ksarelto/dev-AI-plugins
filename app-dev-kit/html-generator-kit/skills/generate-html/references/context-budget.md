# Context budget — html-generator-kit

Payload contracts for `html-orchestrator`. Paths and slices, not blobs.

## Rules

1. The orchestrator receives `SPEC_FILE` (a path), never `SPEC_CONTENT` (the spec body).
2. Only `spec-interpreter` Reads the spec file. Downstream agents never see the full spec.
3. Persist on disk (`OUTPUT_DIR`). The next station reads the file, not a pasted report, except
   the compact contracts listed below (they exist *so* workers do not open the CSS/JS).
4. Compact contracts (pass as text because they *are* the slice):
   - `design-system-ref.md` (~95 lines)
   - `component-manifest.md` (~40 lines)
   - `ux-directives.md` — "All pages" + **this page type** only for each screen-generator
5. `rules_dir` is `{KIT_DIR}/skills/generate-html/references/` — never
   `.spec/html-generator-kit/…`.
6. Review/revise cycles pass `CHANGE_REQUEST` + `pages[]` ids/titles/domains, not the spec again.

7. Cross-kit: write `{dirname(SPEC_FILE)}/html-kit-result.json` and return that path. Never paste
   HTML, CSS, or the spec body back to `orchestrate-app`.

If a spawn prompt would include the spec markdown, stop and pass `SPEC_FILE` instead.
