# Kit result envelope — `kit-result.json`

Canonical schema: `app-orchestrator-kit/skills/orchestrate-app/references/result-envelope.md`.

This kit writes `{dirname(SPEC_PATH)}/frontend-kit-result.json` (`kit: orchestrate-frontend`)
after Station 4 (or pause/abort). Feature-dev increment envelopes stay at
`.spec/features/{slug}.kit-result.json`.

Parent (`orchestrate-app` or a human) reads **only** the envelope — never spec or prototype bodies.
