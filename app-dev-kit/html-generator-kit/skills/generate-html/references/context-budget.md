# Context budget — html-generator-kit

Payload contracts for `html-orchestrator`. Paths and slices, not blobs.

## Rules

1. The orchestrator receives `SPEC_FILE` (a path), never `SPEC_CONTENT` (the spec body).
2. Only `scripts/spec-model.mjs` Reads the spec file. Downstream agents never see the full spec.
3. Persist on disk (`OUTPUT_DIR`). The next station reads the file, not a pasted report, except
   the compact contracts listed below (they exist *so* workers do not open the CSS/JS).
4. Compact contracts (pass as text because they *are* the slice):
   - `design-system-ref.md` (~95 lines)
   - `component-manifest.md` (~40 lines)
   - `ux-directives.md` — "All pages" + **this page type** only for each screen-generator

4a. `screen-generator` receives the FULL per-page object from `spec-model.json` (`id, spec_id,
    title, description, type, domain, entity, route, roles, components, states, entity_fields,
    entity_statuses, api_contract, transitions, acceptance_criteria, interactions`) as one `page`
    field — not a hand-assembled thin slice. The per-page object is itself already the budget-sized
    unit (one screen's worth of data, not the spec or other screens' data); splitting it further into
    separate `entity_fields`/`entity_statuses`/`api_contract` fields saved no context and silently
    dropped `components`/`interactions`/`roles`/`transitions`/`acceptance_criteria`/`states` — the
    fields that make a generated screen match what the spec actually asked for instead of a generic
    page-type fallback, and that make the output traceable back to the spec (see
    `agents/screen-generator.md` § Traceable markup).
5. `rules_dir` is `{KIT_DIR}/skills/generate-html/references/` — never
   `.spec/html-generator-kit/…`.
6. Review/revise cycles pass `CHANGE_REQUEST` + `pages[]` ids/titles/domains, not the spec again.

7. Cross-kit: write `{dirname(SPEC_FILE)}/html-kit-result.json` and return that path. Never paste
   HTML, CSS, or the spec body back to `orchestrate-frontend` or `orchestrate-app`.

If a spawn prompt would include the spec markdown, stop and pass `SPEC_FILE` instead.
